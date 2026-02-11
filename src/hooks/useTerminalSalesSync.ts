import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";

/**
 * Fetch verified buyer name from Binance order detail API.
 * Returns the real name or null if unavailable.
 */
async function fetchVerifiedBuyerName(orderNumber: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('binance-ads', {
      body: { action: 'getOrderDetail', orderNumber },
    });
    if (error) return null;
    // The response structure: data.data.buyerRealName or data.data.sellerRealName
    const detail = data?.data;
    if (!detail) return null;
    // For SELL orders, we are the seller – the counterparty is the buyer
    return detail.buyerRealName || detail.buyerNickName || null;
  } catch {
    return null;
  }
}

/**
 * Syncs completed SELL orders from binance_order_history to terminal_sales_sync.
 * Called after the order sync completes (alongside purchase sync).
 */
export async function syncCompletedSellOrders(): Promise<{ synced: number; duplicates: number }> {
  let synced = 0;
  let duplicates = 0;

  try {
    // 1. Get the active terminal wallet link
    const { data: activeLink } = await supabase
      .from('terminal_wallet_links')
      .select('id, wallet_id, fee_treatment')
      .eq('status', 'active')
      .eq('platform_source', 'terminal')
      .limit(1)
      .maybeSingle();

    if (!activeLink) {
      console.log('[SalesSync] No active terminal wallet link found, skipping.');
      return { synced: 0, duplicates: 0 };
    }

    // Get wallet name
    const { data: walletInfo } = await supabase
      .from('wallets')
      .select('wallet_name')
      .eq('id', activeLink.wallet_id)
      .single();

    // 2. Get completed SELL orders from binance_order_history — only recent ones (last 24 hours)
    // This prevents syncing old historical orders; only newly completed orders get picked up
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago in epoch ms
    const { data: completedSells, error: fetchErr } = await supabase
      .from('binance_order_history')
      .select('*')
      .eq('trade_type', 'SELL')
      .eq('order_status', 'COMPLETED')
      .gte('create_time', cutoffTime);

    if (fetchErr || !completedSells || completedSells.length === 0) {
      console.log('[SalesSync] No recent completed SELL orders found.');
      return { synced: 0, duplicates: 0 };
    }

    // 3. Get existing sync records to check duplicates AND rejected orders (never re-sync rejected)
    const orderNumbers = completedSells.map(o => o.order_number);
    const { data: existingSyncs } = await supabase
      .from('terminal_sales_sync')
      .select('binance_order_number, sync_status')
      .in('binance_order_number', orderNumbers);

    const existingSet = new Set((existingSyncs || []).map(s => s.binance_order_number));

    // 4. Get contact records for counterparties
    const nicknames = [...new Set(completedSells.map(o => o.counter_part_nick_name).filter(Boolean))];
    const { data: contactRecords } = await supabase
      .from('counterparty_contact_records')
      .select('counterparty_nickname, contact_number, state')
      .in('counterparty_nickname', nicknames.length > 0 ? nicknames : ['__none__']);

    const contactMap = new Map((contactRecords || []).map(c => [c.counterparty_nickname, c]));

    // 5. Try to match clients
    const verifiedNames = [...new Set(completedSells.map(o => o.verified_name || o.counter_part_nick_name).filter(Boolean))];
    const { data: matchedClients } = await supabase
      .from('clients')
      .select('id, name')
      .in('name', verifiedNames.length > 0 ? verifiedNames : ['__none__']);

    const clientMap = new Map((matchedClients || []).map(c => [c.name.toLowerCase(), c.id]));

    const userId = getCurrentUserId();

    // 6. Process each order
    const toInsert: any[] = [];
    for (const order of completedSells) {
      if (existingSet.has(order.order_number)) {
        duplicates++;
        continue;
      }

      // Enrich: fetch verified buyer name from order detail API
      let verifiedName = order.verified_name || null;
      if (!verifiedName || verifiedName === order.counter_part_nick_name) {
        const fetched = await fetchVerifiedBuyerName(order.order_number);
        if (fetched) verifiedName = fetched;
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      }

      const counterpartyName = verifiedName || order.counter_part_nick_name || 'Unknown';
      const contact = contactMap.get(order.counter_part_nick_name || '') || null;
      const clientId = clientMap.get(counterpartyName.toLowerCase()) || null;
      const syncStatus = clientId ? 'synced_pending_approval' : 'client_mapping_pending';

      toInsert.push({
        binance_order_number: order.order_number,
        sync_status: syncStatus,
        order_data: {
          order_number: order.order_number,
          asset: order.asset || 'USDT',
          amount: order.amount,
          total_price: order.total_price,
          unit_price: order.unit_price,
          commission: order.commission,
          counterparty_name: counterpartyName,
          counterparty_nickname: order.counter_part_nick_name,
          verified_name: verifiedName,
          create_time: order.create_time,
          pay_method: order.pay_method_name,
          wallet_id: activeLink.wallet_id,
          wallet_name: walletInfo?.wallet_name || 'Terminal Wallet',
          fee_treatment: activeLink.fee_treatment,
        },
        client_id: clientId,
        counterparty_name: counterpartyName,
        contact_number: contact?.contact_number || null,
        state: contact?.state || null,
        synced_by: userId || null,
        synced_at: new Date().toISOString(),
      });
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('terminal_sales_sync')
        .insert(toInsert);
      if (insertErr) {
        console.error('[SalesSync] Insert error:', insertErr);
        throw insertErr;
      }
      synced = toInsert.length;
    }

    console.log(`[SalesSync] Synced: ${synced}, Duplicates: ${duplicates}`);
  } catch (err) {
    console.error('[SalesSync] Error:', err);
  }

  return { synced, duplicates };
}
