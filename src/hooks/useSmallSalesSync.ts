import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";

interface SmallSalesConfig {
  is_enabled: boolean;
  min_amount: number;
  max_amount: number;
}

interface SmallSalesSyncResult {
  synced: number;
  duplicates: number;
  batchId: string | null;
}

interface SmallSalesSyncOptions {
  operatorInitiated: true;
  source: 'erp_entry_small_menu' | 'sales_small_sales_tab';
}

/**
 * Fetch the small sales config from DB.
 */
export async function getSmallSalesConfig(): Promise<SmallSalesConfig | null> {
  const { data, error } = await supabase
    .from('small_sales_config')
    .select('is_enabled, min_amount, max_amount')
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    is_enabled: data.is_enabled,
    min_amount: Number(data.min_amount),
    max_amount: Number(data.max_amount),
  };
}

/**
 * Sync small sales orders from binance_order_history.
 * Uses deduplication-based approach (NOT time-window) to catch late-arriving orders.
 * Looks back LOOKBACK_DAYS and picks up any COMPLETED SELL order in the small range
 * that hasn't already been mapped in small_sales_order_map.
 *
 * Mirrors the Small Buys sync logic including:
 * - Belt-and-suspenders dedup via order_numbers array on sync records
 * - Actual order timestamp windows (not lookback window)
 * - Conflict-safe map inserts
 * - Rejected batch re-sync support
 */
export async function syncSmallSales(options: SmallSalesSyncOptions): Promise<SmallSalesSyncResult> {
  if (options?.operatorInitiated !== true) {
    throw new Error('Small Sales sync is restricted to the dedicated operator button.');
  }

  const config = await getSmallSalesConfig();
  if (!config || !config.is_enabled) {
    return { synced: 0, duplicates: 0, batchId: null };
  }

  const now = new Date();
  const LOOKBACK_DAYS = 7;
  const cutoffMs = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  // Fetch ALL completed SELL orders in the lookback window with pagination
  const PAGE_SIZE = 1000;
  let allOrders: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('binance_order_history')
      .select('*')
      .eq('trade_type', 'SELL')
      .in('order_status', ['COMPLETED', 'APPEAL'])
      .gte('create_time', cutoffMs)
      .order('create_time', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('[SmallSalesSync] Fetch error:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allOrders.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (allOrders.length === 0) {
    return { synced: 0, duplicates: 0, batchId: null };
  }

  // Filter by amount range
  const smallOrders = allOrders.filter(o => {
    const tp = parseFloat(o.total_price || '0');
    return tp >= config.min_amount && tp <= config.max_amount;
  });

  if (smallOrders.length === 0) {
    return { synced: 0, duplicates: 0, batchId: null };
  }

  // Get rejected sync IDs so their orders can be re-synced
  const { data: rejectedSyncs } = await supabase
    .from('small_sales_sync')
    .select('id')
    .eq('sync_status', 'rejected');
  const rejectedSyncIds = new Set((rejectedSyncs || []).map((s: any) => s.id));

  // Belt-and-suspenders: also check order_numbers array on non-rejected sync records
  const { data: existingSyncRecords } = await supabase
    .from('small_sales_sync')
    .select('order_numbers, sync_status')
    .neq('sync_status', 'rejected');
  const syncLevelExistingOrders = new Set<string>();
  for (const sr of (existingSyncRecords || [])) {
    for (const on of (sr.order_numbers || [])) {
      syncLevelExistingOrders.add(on);
    }
  }

  // Check for already-synced order numbers via order_map (batch the IN query)
  // Exclude orders belonging to rejected batches — they should be re-synced
  const orderNumbers = smallOrders.map(o => o.order_number);
  const existingSet = new Set<string>(syncLevelExistingOrders);

  for (let i = 0; i < orderNumbers.length; i += 500) {
    const batch = orderNumbers.slice(i, i + 500);
    const { data: existingMaps } = await supabase
      .from('small_sales_order_map')
      .select('binance_order_number, small_sales_sync_id')
      .in('binance_order_number', batch);

    for (const m of (existingMaps || [])) {
      // Skip orders from rejected batches — allow them to be re-synced
      if (rejectedSyncIds.has(m.small_sales_sync_id)) continue;
      existingSet.add(m.binance_order_number);
    }
  }

  const newOrders = smallOrders.filter(o => !existingSet.has(o.order_number));
  const duplicates = smallOrders.length - newOrders.length;

  if (newOrders.length === 0) {
    return { synced: 0, duplicates, batchId: null };
  }

  // Clean up old map entries from rejected syncs so UNIQUE constraint won't block re-inserts
  if (rejectedSyncIds.size > 0) {
    const rejectedArr = Array.from(rejectedSyncIds);
    for (let i = 0; i < rejectedArr.length; i += 100) {
      const batch = rejectedArr.slice(i, i + 100);
      await supabase
        .from('small_sales_order_map')
        .delete()
        .in('small_sales_sync_id', batch);
    }
    
  }

  // Get active terminal wallet link
  // Get all active terminal wallet links, mapped per exchange account
  const { data: allLinks } = await supabase
    .from('terminal_wallet_links')
    .select('id, wallet_id, fee_treatment, exchange_account_id')
    .eq('status', 'active')
    .eq('platform_source', 'terminal');

  const linkByAccount = new Map<string, any>();
  let fallbackLink: any = null;
  for (const l of (allLinks || [])) {
    if (l.exchange_account_id) linkByAccount.set(l.exchange_account_id, l);
    else if (!fallbackLink) fallbackLink = l;
  }
  if (!fallbackLink && allLinks && allLinks.length > 0) fallbackLink = allLinks[0];
  const resolveLink = (accId: string | null | undefined) =>
    (accId && linkByAccount.get(accId)) || fallbackLink || null;

  const { data: walletRows } = await supabase
    .from('wallets')
    .select('id, wallet_name')
    .in('id', (allLinks || []).map((l) => l.wallet_id));
  const walletNameById = new Map<string, string>((walletRows || []).map((w: any) => [w.id, w.wallet_name]));

  // Group by asset AND exchange account so each batch maps to one wallet
  const assetGroups = new Map<string, typeof newOrders>();
  for (const order of newOrders) {
    const asset = order.asset || 'USDT';
    const accId = order.exchange_account_id || 'none';
    const key = `${asset}::${accId}`;
    if (!assetGroups.has(key)) assetGroups.set(key, []);
    assetGroups.get(key)!.push(order);
  }

  const batchId = `SM-${Date.now()}`;
  const userId = getCurrentUserId();

  let entriesCreated = 0;

  for (const [groupKey, group] of assetGroups) {
    const [asset, accIdRaw] = groupKey.split('::');
    const accId = accIdRaw === 'none' ? null : accIdRaw;
    const link = resolveLink(accId);
    const totalQty = group.reduce((s, o) => s + parseFloat(o.amount || '0'), 0);
    const totalAmount = group.reduce((s, o) => s + parseFloat(o.total_price || '0'), 0);
    const totalFee = group.reduce((s, o) => s + parseFloat(o.commission || '0'), 0);
    const avgPrice = totalQty > 0 ? totalAmount / totalQty : 0;

    // Use actual order date range instead of lookback window
    const orderTimes = group.map(o => Number(o.create_time)).filter(t => t > 0);
    const minTime = Math.min(...orderTimes);
    const maxTime = Math.max(...orderTimes);
    const windowStart = new Date(minTime).toISOString();
    const windowEnd = new Date(maxTime).toISOString();

    const { data: syncRecord, error: insertErr } = await supabase
      .from('small_sales_sync')
      .insert({
        sync_batch_id: batchId,
        asset_code: asset,
        order_count: group.length,
        total_quantity: totalQty,
        total_amount: totalAmount,
        avg_price: avgPrice,
        total_fee: totalFee,
        exchange_account_id: accId || link?.exchange_account_id || null,
        wallet_id: link?.wallet_id || null,
        wallet_name: (link?.wallet_id ? walletNameById.get(link.wallet_id) : null) || 'Terminal Wallet',
        sync_status: 'pending_approval',
        order_numbers: group.map(o => o.order_number),
        time_window_start: windowStart,
        time_window_end: windowEnd,
        synced_by: userId || null,
      })
      .select('id')
      .single();

    if (insertErr || !syncRecord) {
      console.error('[SmallSalesSync] Insert error:', insertErr);
      continue;
    }

    // Insert order map entries one by one to handle UNIQUE constraint gracefully
    let mapInsertCount = 0;
    for (const o of group) {
      const { error: mapErr } = await supabase
        .from('small_sales_order_map')
        .upsert(
          {
            small_sales_sync_id: syncRecord.id,
            binance_order_number: o.order_number,
            order_data: {
              order_number: o.order_number,
              asset: o.asset,
              amount: o.amount,
              total_price: o.total_price,
              unit_price: o.unit_price,
              commission: o.commission,
              counter_part_nick_name: o.counter_part_nick_name,
              create_time: o.create_time,
              pay_method_name: o.pay_method_name,
            },
          },
          { onConflict: 'binance_order_number' }
        );

      if (mapErr) {
        console.warn(`[SmallSalesSync] Map upsert warning for ${o.order_number}:`, mapErr.message);
      } else {
        mapInsertCount++;
      }
    }

    
    entriesCreated++;
  }

  // Log the sync execution
  await supabase.from('small_sales_sync_log').insert({
    sync_batch_id: batchId,
    sync_started_at: now.toISOString(),
    sync_completed_at: new Date().toISOString(),
    time_window_start: new Date(cutoffMs).toISOString(),
    time_window_end: now.toISOString(),
    total_orders_processed: newOrders.length,
    entries_created: entriesCreated,
    synced_by: userId || null,
  });

  
  return { synced: entriesCreated, duplicates, batchId };
}
