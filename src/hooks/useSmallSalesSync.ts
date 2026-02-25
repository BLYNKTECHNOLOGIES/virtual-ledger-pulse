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
 */
export async function syncSmallSales(): Promise<SmallSalesSyncResult> {
  const config = await getSmallSalesConfig();
  if (!config || !config.is_enabled) {
    console.log('[SmallSalesSync] Disabled or no config.');
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
      .eq('order_status', 'COMPLETED')
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
    console.log('[SmallSalesSync] No SELL orders in lookback window.');
    return { synced: 0, duplicates: 0, batchId: null };
  }

  // Filter by amount range
  const smallOrders = allOrders.filter(o => {
    const tp = parseFloat(o.total_price || '0');
    return tp >= config.min_amount && tp <= config.max_amount;
  });

  if (smallOrders.length === 0) {
    console.log('[SmallSalesSync] No small sale orders found.');
    return { synced: 0, duplicates: 0, batchId: null };
  }

  // Check for already-synced order numbers (batch the IN query to avoid limits)
  const orderNumbers = smallOrders.map(o => o.order_number);
  const existingSet = new Set<string>();

  for (let i = 0; i < orderNumbers.length; i += 500) {
    const batch = orderNumbers.slice(i, i + 500);
    const { data: existingMaps } = await supabase
      .from('small_sales_order_map')
      .select('binance_order_number')
      .in('binance_order_number', batch);

    for (const m of (existingMaps || [])) {
      existingSet.add(m.binance_order_number);
    }
  }

  const newOrders = smallOrders.filter(o => !existingSet.has(o.order_number));
  const duplicates = smallOrders.length - newOrders.length;

  if (newOrders.length === 0) {
    console.log('[SmallSalesSync] All orders already synced.');
    return { synced: 0, duplicates, batchId: null };
  }

  console.log(`[SmallSalesSync] Found ${newOrders.length} new small sale orders (${duplicates} already synced)`);

  // Get active terminal wallet link
  const { data: activeLink } = await supabase
    .from('terminal_wallet_links')
    .select('id, wallet_id, fee_treatment')
    .eq('status', 'active')
    .eq('platform_source', 'terminal')
    .limit(1)
    .maybeSingle();

  const { data: walletInfo } = activeLink?.wallet_id
    ? await supabase.from('wallets').select('wallet_name').eq('id', activeLink.wallet_id).single()
    : { data: null };

  // Group by asset
  const assetGroups = new Map<string, typeof newOrders>();
  for (const order of newOrders) {
    const asset = order.asset || 'USDT';
    if (!assetGroups.has(asset)) assetGroups.set(asset, []);
    assetGroups.get(asset)!.push(order);
  }

  const batchId = `SM-${Date.now()}`;
  const userId = getCurrentUserId();
  const windowStart = new Date(cutoffMs).toISOString();
  const windowEnd = now.toISOString();

  let entriesCreated = 0;

  for (const [asset, group] of assetGroups) {
    const totalQty = group.reduce((s, o) => s + parseFloat(o.amount || '0'), 0);
    const totalAmount = group.reduce((s, o) => s + parseFloat(o.total_price || '0'), 0);
    const totalFee = group.reduce((s, o) => s + parseFloat(o.commission || '0'), 0);
    const avgPrice = totalQty > 0 ? totalAmount / totalQty : 0;

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
        wallet_id: activeLink?.wallet_id || null,
        wallet_name: walletInfo?.wallet_name || 'Terminal Wallet',
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

    // Insert order map entries
    const mapEntries = group.map(o => ({
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
    }));

    await supabase.from('small_sales_order_map').insert(mapEntries);
    entriesCreated++;
  }

  // Log the sync execution
  await supabase.from('small_sales_sync_log').insert({
    sync_batch_id: batchId,
    sync_started_at: now.toISOString(),
    sync_completed_at: new Date().toISOString(),
    time_window_start: windowStart,
    time_window_end: windowEnd,
    total_orders_processed: newOrders.length,
    entries_created: entriesCreated,
    synced_by: userId || null,
  });

  console.log(`[SmallSalesSync] Batch ${batchId}: ${entriesCreated} entries, ${newOrders.length} orders, ${duplicates} duplicates`);
  return { synced: entriesCreated, duplicates, batchId };
}
