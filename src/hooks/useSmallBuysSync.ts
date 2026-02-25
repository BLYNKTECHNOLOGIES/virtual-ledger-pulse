import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";

interface SmallBuysConfig {
  is_enabled: boolean;
  min_amount: number;
  max_amount: number;
}

interface SmallBuysSyncResult {
  synced: number;
  duplicates: number;
  batchId: string | null;
}

/**
 * Fetch the small buys config from DB.
 */
export async function getSmallBuysConfig(): Promise<SmallBuysConfig | null> {
  const { data, error } = await supabase
    .from('small_buys_config' as any)
    .select('is_enabled, min_amount, max_amount')
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    is_enabled: (data as any).is_enabled,
    min_amount: Number((data as any).min_amount),
    max_amount: Number((data as any).max_amount),
  };
}

/**
 * Sync small buys orders from binance_order_history.
 * Uses deduplication-based approach (NOT time-window) to catch late-arriving orders.
 * Looks back LOOKBACK_DAYS and picks up any COMPLETED BUY order in the small range
 * that hasn't already been mapped in small_buys_order_map.
 */
export async function syncSmallBuys(): Promise<SmallBuysSyncResult> {
  const config = await getSmallBuysConfig();
  if (!config || !config.is_enabled) {
    console.log('[SmallBuysSync] Disabled or no config.');
    return { synced: 0, duplicates: 0, batchId: null };
  }

  const now = new Date();
  const LOOKBACK_DAYS = 7;
  const cutoffMs = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  // Fetch ALL completed BUY orders in the lookback window with pagination
  const PAGE_SIZE = 1000;
  let allOrders: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('binance_order_history')
      .select('*')
      .eq('trade_type', 'BUY')
      .eq('order_status', 'COMPLETED')
      .gte('create_time', cutoffMs)
      .order('create_time', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('[SmallBuysSync] Fetch error:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allOrders.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (allOrders.length === 0) {
    console.log('[SmallBuysSync] No BUY orders in lookback window.');
    return { synced: 0, duplicates: 0, batchId: null };
  }

  // Filter by amount range
  const smallOrders = allOrders.filter(o => {
    const tp = parseFloat(o.total_price || '0');
    return tp >= config.min_amount && tp <= config.max_amount;
  });

  if (smallOrders.length === 0) {
    console.log('[SmallBuysSync] No small buy orders found.');
    return { synced: 0, duplicates: 0, batchId: null };
  }

  // Check for already-synced order numbers (batch the IN query to avoid limits)
  const orderNumbers = smallOrders.map(o => o.order_number);
  const existingSet = new Set<string>();

  for (let i = 0; i < orderNumbers.length; i += 500) {
    const batch = orderNumbers.slice(i, i + 500);
    const { data: existingMaps } = await supabase
      .from('small_buys_order_map' as any)
      .select('binance_order_number')
      .in('binance_order_number', batch);

    for (const m of (existingMaps || [])) {
      existingSet.add((m as any).binance_order_number);
    }
  }

  const newOrders = smallOrders.filter(o => !existingSet.has(o.order_number));
  const duplicates = smallOrders.length - newOrders.length;

  if (newOrders.length === 0) {
    console.log('[SmallBuysSync] All orders already synced.');
    return { synced: 0, duplicates, batchId: null };
  }

  console.log(`[SmallBuysSync] Found ${newOrders.length} new small buy orders (${duplicates} already synced)`);

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

  const batchId = `SB-${Date.now()}`;
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
      .from('small_buys_sync' as any)
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
      console.error('[SmallBuysSync] Insert error:', insertErr);
      continue;
    }

    // Insert order map entries
    const mapEntries = group.map(o => ({
      small_buys_sync_id: (syncRecord as any).id,
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

    await supabase.from('small_buys_order_map' as any).insert(mapEntries);
    entriesCreated++;
  }

  // Log the sync execution
  await supabase.from('small_buys_sync_log' as any).insert({
    sync_batch_id: batchId,
    sync_started_at: now.toISOString(),
    sync_completed_at: new Date().toISOString(),
    time_window_start: windowStart,
    time_window_end: windowEnd,
    total_orders_processed: newOrders.length,
    entries_created: entriesCreated,
    synced_by: userId || null,
  });

  console.log(`[SmallBuysSync] Batch ${batchId}: ${entriesCreated} entries, ${newOrders.length} orders, ${duplicates} duplicates`);
  return { synced: entriesCreated, duplicates, batchId };
}
