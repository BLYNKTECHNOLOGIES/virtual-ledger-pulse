import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";

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

    // 2. Get completed BUY orders from binance_order_history — only recent ones (last 24 hours)
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
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

    // 3. Get existing sync records to check duplicates
    const orderNumbers = completedBuys.map(o => o.order_number);
    const { data: existingSyncs } = await supabase
      .from('terminal_purchase_sync')
      .select('binance_order_number')
      .in('binance_order_number', orderNumbers);

    const existingSet = new Set((existingSyncs || []).map(s => s.binance_order_number));

    // 4. Get PAN records
    const nicknames = [...new Set(completedBuys.map(o => o.counter_part_nick_name).filter(Boolean))];
    const { data: panRecords } = await supabase
      .from('counterparty_pan_records')
      .select('counterparty_nickname, pan_number')
      .in('counterparty_nickname', nicknames.length > 0 ? nicknames : ['__none__']);

    const panMap = new Map((panRecords || []).map(p => [p.counterparty_nickname, p.pan_number]));

    // 5. Try to match clients
    const verifiedNames = [...new Set(completedBuys.map(o => o.verified_name || o.counter_part_nick_name).filter(Boolean))];
    const { data: matchedClients } = await supabase
      .from('clients')
      .select('id, name')
      .in('name', verifiedNames.length > 0 ? verifiedNames : ['__none__']);

    const clientMap = new Map((matchedClients || []).map(c => [c.name.toLowerCase(), c.id]));

    const userId = getCurrentUserId();

    // 6. Process each order
    const toInsert: any[] = [];
    for (const order of completedBuys) {
      if (existingSet.has(order.order_number)) {
        duplicates++;
        continue;
      }

      const counterpartyName = order.verified_name || order.counter_part_nick_name || 'Unknown';
      const pan = panMap.get(order.counter_part_nick_name || '') || null;
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
