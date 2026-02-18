import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";

/**
 * Fetch verified seller name from Binance order detail API.
 * For BUY orders, the counterparty is the seller.
 */
async function fetchVerifiedSellerName(orderNumber: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('binance-ads', {
      body: { action: 'getOrderDetail', orderNumber },
    });
    if (error) return null;
    const apiResult = data?.data;
    const detail = apiResult?.data || apiResult;
    if (!detail) return null;
    // For BUY orders, we are the buyer – the counterparty is the seller
    return detail.sellerRealName || detail.sellerName || detail.sellerNickName || null;
  } catch {
    return null;
  }
}

/**
 * Syncs completed BUY orders from binance_order_history to terminal_purchase_sync.
 * Called after the order sync completes.
 */
export async function syncCompletedBuyOrders(): Promise<{ synced: number; duplicates: number }> {
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
      console.log('[PurchaseSync] No active terminal wallet link found, skipping.');
      return { synced: 0, duplicates: 0 };
    }

    // Get wallet name
    const { data: walletInfo } = await supabase
      .from('wallets')
      .select('wallet_name')
      .eq('id', activeLink.wallet_id)
      .single();

    // 2. Get completed BUY orders from binance_order_history
    // Look back 7 days to catch orders that:
    //   - Were created yesterday but completed/resolved today (cross-day)
    //   - Were IN_APPEAL and later resolved to COMPLETED
    // We filter by create_time going back 7 days but only pick COMPLETED status.
    // Orders that were IN_APPEAL at sync time but later marked COMPLETED will be caught
    // on the next sync run since order_history status gets updated on re-sync.
    const LOOKBACK_DAYS = 7;
    const cutoffTime = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    console.log('[PurchaseSync] Cutoff (7-day lookback):', new Date(cutoffTime).toISOString());

    const { data: completedBuys, error: fetchErr } = await supabase
      .from('binance_order_history')
      .select('*')
      .eq('trade_type', 'BUY')
      .eq('order_status', 'COMPLETED')
      .gte('create_time', cutoffTime);

    if (fetchErr || !completedBuys || completedBuys.length === 0) {
      console.log('[PurchaseSync] No recent completed BUY orders found.');
      return { synced: 0, duplicates: 0 };
    }

    // 3. Get existing sync records to check duplicates AND rejected orders (never re-sync rejected)
    const orderNumbers = completedBuys.map(o => o.order_number);
    const { data: existingSyncs } = await supabase
      .from('terminal_purchase_sync')
      .select('binance_order_number, sync_status')
      .in('binance_order_number', orderNumbers);

    const existingSet = new Set((existingSyncs || []).map(s => s.binance_order_number));

    // 4. Get PAN records
    const nicknames = [...new Set(completedBuys.map(o => o.counter_part_nick_name).filter(Boolean))];
    const { data: panRecords } = await supabase
      .from('counterparty_pan_records')
      .select('counterparty_nickname, pan_number')
      .in('counterparty_nickname', nicknames.length > 0 ? nicknames : ['__none__']);

    const panMap = new Map((panRecords || []).map(p => [p.counterparty_nickname, p.pan_number]));

    // 5. Pre-fetch existing client mappings from terminal_sales_sync for same counterparties
    // This enables cross-referencing: if a seller was already mapped as a client via sales, reuse that mapping
    const { data: existingSalesMappings } = await supabase
      .from('terminal_sales_sync')
      .select('counterparty_name, client_id')
      .in('counterparty_name', nicknames.length > 0 ? nicknames : ['__none__'])
      .not('client_id', 'is', null);

    const salesClientMap = new Map(
      (existingSalesMappings || []).map(s => [s.counterparty_name?.toLowerCase(), s.client_id])
    );

    const userId = getCurrentUserId();

    // 6. Process each order — enrich verified names from Binance API
    const toInsert: any[] = [];
    for (const order of completedBuys) {
      if (existingSet.has(order.order_number)) {
        duplicates++;
        continue;
      }

      // Enrich: fetch verified seller name from order detail API
      let verifiedName = order.verified_name || null;
      if (!verifiedName || verifiedName === order.counter_part_nick_name) {
        const fetched = await fetchVerifiedSellerName(order.order_number);
        if (fetched) {
          verifiedName = fetched;
          // Also update binance_order_history for future reference
          await supabase
            .from('binance_order_history')
            .update({ verified_name: fetched })
            .eq('order_number', order.order_number);
        }
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      }

      const counterpartyName = verifiedName || order.counter_part_nick_name || 'Unknown';
      const pan = panMap.get(order.counter_part_nick_name || '') || null;

      // Try to match client: first by verified name, then by nickname, then cross-reference sales mappings
      let clientId: string | null = null;

      // Look up by verified name in clients table
      if (verifiedName) {
        const { data: clientMatch } = await supabase
          .from('clients')
          .select('id')
          .ilike('name', verifiedName)
          .limit(1)
          .maybeSingle();
        if (clientMatch) clientId = clientMatch.id;
      }

      // Fallback: check sales sync mappings by verified name
      if (!clientId && verifiedName) {
        clientId = salesClientMap.get(verifiedName.toLowerCase()) || null;
      }

      // Fallback: check sales sync mappings by masked nickname
      if (!clientId) {
        clientId = salesClientMap.get((order.counter_part_nick_name || '').toLowerCase()) || null;
      }

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
        pan_number: pan,
        synced_by: userId || null,
        synced_at: new Date().toISOString(),
      });
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('terminal_purchase_sync')
        .insert(toInsert);
      if (insertErr) {
        console.error('[PurchaseSync] Insert error:', insertErr);
        throw insertErr;
      }
      synced = toInsert.length;
    }

    console.log(`[PurchaseSync] Synced: ${synced}, Duplicates: ${duplicates}`);
  } catch (err) {
    console.error('[PurchaseSync] Error:', err);
  }

  return { synced, duplicates };
}
