import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";

/**
 * Fetch order detail from Binance API.
 * Returns { status, sellerRealName } or null on failure.
 */
async function fetchOrderDetail(orderNumber: string): Promise<{ status: string | null; sellerName: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('binance-ads', {
      body: { action: 'getOrderDetail', orderNumber },
    });
    if (error) return { status: null, sellerName: null };
    const apiResult = data?.data;
    const detail = apiResult?.data || apiResult;
    if (!detail) return { status: null, sellerName: null };

    // Map Binance numeric/string statuses to our string statuses
    const rawStatus = detail.orderStatus ?? detail.status ?? null;
    let status: string | null = null;
    if (rawStatus !== null && rawStatus !== undefined) {
      const numStatus = Number(rawStatus);
      if (!isNaN(numStatus)) {
        // Binance numeric: 0=pending, 1=paying, 2=buyer_paid, 3=distributing, 4=completed, 5=cancelled, 6=cancelled_by_system, 7=appeal
        const statusMap: Record<number, string> = {
          0: 'PENDING', 1: 'TRADING', 2: 'BUYER_PAYED',
          3: 'DISTRIBUTING', 4: 'COMPLETED', 5: 'CANCELLED',
          6: 'CANCELLED_BY_SYSTEM', 7: 'IN_APPEAL',
        };
        status = statusMap[numStatus] ?? String(rawStatus);
      } else {
        status = String(rawStatus);
      }
    }

    const sellerName = detail.sellerRealName || detail.sellerName || detail.sellerNickName || null;
    return { status, sellerName };
  } catch {
    return { status: null, sellerName: null };
  }
}

/**
 * Syncs completed BUY orders from binance_order_history to terminal_purchase_sync.
 * Also resolves IN_APPEAL orders by checking their live status from Binance API.
 * Called after the order sync completes or manually via "Sync Now" button.
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

    // 2. Look back 7 days to catch cross-day and appeal-resolved orders
    const LOOKBACK_DAYS = 7;
    const cutoffTime = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    console.log('[PurchaseSync] Cutoff (7-day lookback):', new Date(cutoffTime).toISOString());

    // 2a. Fetch COMPLETED BUY orders
    const { data: completedBuys, error: fetchErr } = await supabase
      .from('binance_order_history')
      .select('*')
      .eq('trade_type', 'BUY')
      .eq('order_status', 'COMPLETED')
      .gte('create_time', cutoffTime);

    // 2b. Fetch IN_APPEAL BUY orders — these may have been resolved since last sync
    const { data: appealBuys } = await supabase
      .from('binance_order_history')
      .select('*')
      .eq('trade_type', 'BUY')
      .eq('order_status', 'IN_APPEAL')
      .gte('create_time', cutoffTime);

    console.log(`[PurchaseSync] COMPLETED: ${completedBuys?.length || 0}, IN_APPEAL to recheck: ${appealBuys?.length || 0}`);

    // 2c. For each IN_APPEAL order, check live status from Binance API
    //     If now COMPLETED, update binance_order_history and include in sync
    const resolvedAppealOrders: any[] = [];
    for (const order of (appealBuys || [])) {
      const { status, sellerName } = await fetchOrderDetail(order.order_number);
      console.log(`[PurchaseSync] IN_APPEAL order ${order.order_number} live status: ${status}`);

      if (status === 'COMPLETED') {
        // Update DB status so future syncs don't re-check
        const updatePayload: any = { order_status: 'COMPLETED' };
        if (sellerName && !order.verified_name) updatePayload.verified_name = sellerName;

        await supabase
          .from('binance_order_history')
          .update(updatePayload)
          .eq('order_number', order.order_number);

        resolvedAppealOrders.push({
          ...order,
          order_status: 'COMPLETED',
          verified_name: sellerName || order.verified_name,
        });
        console.log(`[PurchaseSync] Order ${order.order_number} resolved from IN_APPEAL → COMPLETED`);
      }
      // Rate limit protection
      await new Promise(r => setTimeout(r, 300));
    }

    // Combine all orders eligible for syncing
    const allEligible = [...(completedBuys || []), ...resolvedAppealOrders];

    if (allEligible.length === 0) {
      console.log('[PurchaseSync] No eligible completed BUY orders found.');
      return { synced: 0, duplicates: 0 };
    }

    // 3. Get existing sync records to avoid duplicates (including rejected — never re-sync)
    const orderNumbers = allEligible.map(o => o.order_number);
    const { data: existingSyncs } = await supabase
      .from('terminal_purchase_sync')
      .select('binance_order_number, sync_status')
      .in('binance_order_number', orderNumbers);

    const existingSet = new Set((existingSyncs || []).map(s => s.binance_order_number));

    // 4. Get PAN records
    const nicknames = [...new Set(allEligible.map(o => o.counter_part_nick_name).filter(Boolean))];
    const { data: panRecords } = await supabase
      .from('counterparty_pan_records')
      .select('counterparty_nickname, pan_number')
      .in('counterparty_nickname', nicknames.length > 0 ? nicknames : ['__none__']);

    const panMap = new Map((panRecords || []).map(p => [p.counterparty_nickname, p.pan_number]));

    // 5. Cross-reference existing client mappings from sales sync
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
    for (const order of allEligible) {
      if (existingSet.has(order.order_number)) {
        duplicates++;
        continue;
      }

      // Enrich: fetch verified seller name if not already available
      let verifiedName = order.verified_name || null;
      if (!verifiedName || verifiedName === order.counter_part_nick_name) {
        const { sellerName } = await fetchOrderDetail(order.order_number);
        if (sellerName) {
          verifiedName = sellerName;
          await supabase
            .from('binance_order_history')
            .update({ verified_name: sellerName })
            .eq('order_number', order.order_number);
        }
        await new Promise(r => setTimeout(r, 200));
      }

      const counterpartyName = verifiedName || order.counter_part_nick_name || 'Unknown';
      const pan = panMap.get(order.counter_part_nick_name || '') || null;

      // Try to match client
      let clientId: string | null = null;
      if (verifiedName) {
        const { data: clientMatch } = await supabase
          .from('clients')
          .select('id')
          .ilike('name', verifiedName)
          .limit(1)
          .maybeSingle();
        if (clientMatch) clientId = clientMatch.id;
      }
      if (!clientId && verifiedName) {
        clientId = salesClientMap.get(verifiedName.toLowerCase()) || null;
      }
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


/**
 * Syncs completed BUY orders from binance_order_history to terminal_purchase_sync.
 * Called after the order sync completes.
 */
