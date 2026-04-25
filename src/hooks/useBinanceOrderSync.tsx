import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callBinanceAds } from './useBinanceActions';
import { toast } from 'sonner';
import { syncCompletedBuyOrders } from './useTerminalPurchaseSync';
import { syncCompletedSellOrders } from './useTerminalSalesSync';
import { captureSellerPaymentDetails } from './useSellerPaymentCapture';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const STATUS_OVERLAP_MS = 24 * 60 * 60 * 1000; // 24 hours — re-fetch recent orders for status updates (was 3h, widened to catch out-of-order Binance updates)
const GAP_FILL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — deep gap-fill scan
const GAP_FILL_INTERVAL_MS = 24 * 60 * 60 * 1000; // run gap-fill at most once per 24h
const DATA_RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
const GAP_FILL_KEY = 'binance_order_gap_fill_last_at';

type CachedOrderHistoryRange = {
  startTimestamp?: number;
  endTimestamp?: number;
};

// ---- DB Read: Get cached orders, optionally scoped to a selected analytics period ----
export function useCachedOrderHistory(range: CachedOrderHistoryRange = {}) {
  return useQuery({
    queryKey: ['cached-order-history', range.startTimestamp || null, range.endTimestamp || null],
    queryFn: async () => {
      const cutoff = range.startTimestamp || Date.now() - DATA_RETENTION_MS;
      const allRows: any[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;

      while (true) {
        let query = supabase
          .from('binance_order_history')
          .select('order_number,adv_no,trade_type,asset,fiat_unit,order_status,amount,total_price,unit_price,commission,counter_part_nick_name,create_time,pay_method_name')
          .gte('create_time', cutoff)
          .order('create_time', { ascending: false });

        if (range.endTimestamp) {
          query = query.lte('create_time', range.endTimestamp);
        }

        const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      return allRows.map(dbRowToOrder);
    },
    staleTime: 30 * 1000,
  });
}

// ---- Check if sync is needed ----
export function useSyncMetadata() {
  return useQuery({
    queryKey: ['binance-sync-metadata'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('binance_sync_metadata')
        .select('*')
        .eq('id', 'order_history')
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 1000,
  });
}

// ---- Core fetch logic (shared between incremental & full) ----
async function fetchOrdersFromBinance(
  startTimestamp: number,
  endTimestamp: number,
  maxWindows: number = 30
): Promise<any[]> {
  let windowEnd = endTimestamp;
  const allOrders: any[] = [];
  const seenOrderNumbers = new Set<string>();
  let windowCount = 0;

  while (windowEnd > startTimestamp && windowCount < maxWindows) {
    windowCount++;
    let page = 1;
    const maxPages = 20;
    let oldestInWindow = windowEnd;
    let windowOrders = 0;

    while (page <= maxPages) {
      const result = await callBinanceAds('getOrderHistory', {
        rows: 50,
        page,
        startTimestamp,
        endTimestamp: windowEnd,
      });
      const orders = result?.data || result || [];
      if (!Array.isArray(orders) || orders.length === 0) break;

      for (const o of orders) {
        if (!seenOrderNumbers.has(o.orderNumber)) {
          seenOrderNumbers.add(o.orderNumber);
          allOrders.push(o);
        }
        if (o.createTime && o.createTime < oldestInWindow) {
          oldestInWindow = o.createTime;
        }
      }
      windowOrders += orders.length;

      if (orders.length < 50) break;
      page++;
      await new Promise(r => setTimeout(r, 300));
    }

    if (windowOrders < 1000) break;
    windowEnd = oldestInWindow - 1;
  }

  return allOrders;
}

async function upsertOrdersToDB(orders: any[]) {
  const BATCH_SIZE = 200;
  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE).map(orderToDbRow);
    const { error } = await supabase
      .from('binance_order_history')
      .upsert(batch, { onConflict: 'order_number' });
    if (error) {
      console.error(`[Sync] Batch ${Math.floor(i / BATCH_SIZE)} failed:`, error);
      throw error;
    }
  }
}

async function updateSyncMetadata(count: number, duration: number) {
  await supabase
    .from('binance_sync_metadata')
    .upsert({
      id: 'order_history',
      last_sync_at: new Date().toISOString(),
      last_sync_order_count: count,
      last_sync_duration_ms: duration,
    }, { onConflict: 'id' });
}

async function getNewestOrderTimestamp(): Promise<number | null> {
  const { data } = await supabase
    .from('binance_order_history')
    .select('create_time')
    .order('create_time', { ascending: false })
    .limit(1)
    .single();
  return data?.create_time || null;
}

async function getDBOrderCount(): Promise<number> {
  const { count } = await supabase
    .from('binance_order_history')
    .select('*', { count: 'exact', head: true });
  return count || 0;
}

// ---- Incremental sync: only new orders + status refresh on recent ----
export async function syncOrderHistoryFromBinance({
  fullSync = false,
  forceGapFill = false,
}: { fullSync?: boolean; forceGapFill?: boolean } = {}) {
      const startTime = Date.now();
      const cutoff = Date.now() - DATA_RETENTION_MS;
      const dbCount = await getDBOrderCount();
      const newestTs = await getNewestOrderTimestamp();

      // Decide sync strategy
      const needsFullSync = fullSync || dbCount === 0 || !newestTs;

      if (needsFullSync) {
        const allOrders = await fetchOrdersFromBinance(cutoff, Date.now(), 365);
        await upsertOrdersToDB(allOrders);
        const duration = Date.now() - startTime;
        await updateSyncMetadata(allOrders.length, duration);
        return { count: allOrders.length, duration, type: 'full' as const };
      }

      // INCREMENTAL: fetch from (newest - overlap) to now
      // The overlap ensures we catch status changes on recent orders
      const incrementalStart = Math.max(cutoff, newestTs - STATUS_OVERLAP_MS);

      const newOrders = await fetchOrdersFromBinance(incrementalStart, Date.now(), 5);

      if (newOrders.length > 0) {
        await upsertOrdersToDB(newOrders);
      }

      // GAP-FILL: every ~24h, run a deep scan over the last 7 days to catch
      // out-of-order Binance updates (e.g. delayed completions, post-appeal status changes)
      // that fell outside the trailing incremental window.
      let gapFillCount = 0;
      try {
        const lastGapFillStr = typeof localStorage !== 'undefined' ? localStorage.getItem(GAP_FILL_KEY) : null;
        const lastGapFill = lastGapFillStr ? Number(lastGapFillStr) : 0;
        if (forceGapFill || Date.now() - lastGapFill > GAP_FILL_INTERVAL_MS) {
          const gapStart = Math.max(cutoff, Date.now() - GAP_FILL_WINDOW_MS);
          const gapOrders = await fetchOrdersFromBinance(gapStart, Date.now(), 60);
          if (gapOrders.length > 0) {
            await upsertOrdersToDB(gapOrders);
          }
          gapFillCount = gapOrders.length;
          if (typeof localStorage !== 'undefined') localStorage.setItem(GAP_FILL_KEY, String(Date.now()));
          console.log(`[Sync] Gap-fill complete: scanned 7d, upserted ${gapFillCount} orders`);
        }
      } catch (err) {
        console.warn('[Sync] Gap-fill pass failed (non-fatal):', err);
      }

      // Also clean up orders older than 30 days
      const { error: cleanupError } = await supabase
        .from('binance_order_history')
        .delete()
        .lt('create_time', cutoff);
      if (cleanupError) console.warn('[Sync] Cleanup failed:', cleanupError);

      const duration = Date.now() - startTime;
      const totalCount = newOrders.length + gapFillCount;
      await updateSyncMetadata(totalCount, duration);
      return { count: totalCount, duration, type: 'incremental' as const };
}

export function useSyncOrderHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncOrderHistoryFromBinance,
    onSuccess: async ({ count, duration, type }) => {
      const label = type === 'full' ? 'Full sync' : 'Incremental sync';
      toast.success(`${label}: ${count.toLocaleString('en-IN')} orders in ${(duration / 1000).toFixed(0)}s`);
      
      // Post-sync: capture seller payment details from active BUY orders (before they complete)
      try {
        const { captured } = await captureSellerPaymentDetails();
        if (captured > 0) {
        }
      } catch (err) {
        console.error('[PostSync] Seller payment capture failed:', err);
      }

      // Post-sync: sync completed BUY orders to terminal_purchase_sync
      try {
        const { synced, duplicates } = await syncCompletedBuyOrders();
        if (synced > 0) {
          toast.info(`${synced} new purchase(s) synced to ERP for approval`);
        }
      } catch (err) {
        console.error('[PostSync] Purchase sync failed:', err);
      }

      // Post-sync: sync completed SELL orders to terminal_sales_sync
      try {
        const { synced: sellSynced } = await syncCompletedSellOrders();
        if (sellSynced > 0) {
          toast.info(`${sellSynced} new sale(s) synced to ERP for approval`);
        }
      } catch (err) {
        console.error('[PostSync] Sales sync failed:', err);
      }

      queryClient.invalidateQueries({ queryKey: ['cached-order-history'] });
      queryClient.invalidateQueries({ queryKey: ['binance-sync-metadata'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-purchase-sync'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-sync-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
    },
    onError: (err: Error) => {
      toast.error(`Sync failed: ${err.message}`);
    },
  });
}

// ---- Auto-sync hook: triggers incremental sync if stale + every 5 minutes ----
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useAutoSyncOrders() {
  const { data: metadata, isLoading: metaLoading } = useSyncMetadata();
  const syncMutation = useSyncOrderHistory();
  const hasTriggered = useRef(false);

  const isStale = !metaLoading && (!metadata?.last_sync_at ||
    (Date.now() - new Date(metadata.last_sync_at).getTime()) > STALE_THRESHOLD_MS);

  const hasNoData = !metaLoading && (!metadata?.last_sync_order_count || metadata.last_sync_order_count === 0);

  // Initial sync on mount if stale
  useEffect(() => {
    if (isStale && !syncMutation.isPending && !hasTriggered.current) {
      hasTriggered.current = true;
      syncMutation.mutate({ fullSync: hasNoData });
    }
  }, [isStale, syncMutation.isPending, hasNoData]);

  // Recurring auto-sync every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      if (!syncMutation.isPending) {
        syncMutation.mutate({ fullSync: false });
      }
    }, AUTO_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [syncMutation]);

  return { isSyncing: syncMutation.isPending, syncMutation, isStale, metadata };
}

// ---- Status mapping: Binance numeric → string ----
const BINANCE_STATUS_MAP: Record<number, string> = {
  1: 'TRADING',
  2: 'BUYER_PAYED',
  3: 'BUYER_PAYED',
  4: 'BUYER_PAYED',
  5: 'COMPLETED',
  6: 'CANCELLED',
  7: 'CANCELLED',
  8: 'APPEAL',
};

function mapOrderStatus(raw: any): string {
  if (raw === null || raw === undefined || raw === '') return '';
  const num = Number(raw);
  if (!isNaN(num) && BINANCE_STATUS_MAP[num]) {
    return BINANCE_STATUS_MAP[num];
  }
  return String(raw);
}

// ---- Mapping helpers ----
function orderToDbRow(o: any) {
  const amount = String(o.amount ?? o.quantity ?? '0');
  const totalPrice = String(o.totalPrice ?? o.total_price ?? o.fiatAmount ?? '0');
  const computedUnitPrice = Number(amount) > 0 && Number(totalPrice) > 0 ? String(Number(totalPrice) / Number(amount)) : '0';
  const unitPrice = String(o.unitPrice ?? o.price ?? o.unit_price ?? computedUnitPrice);

  return {
    order_number: o.orderNumber || '',
    adv_no: o.advNo || '',
    trade_type: o.tradeType || '',
    asset: o.asset || 'USDT',
    fiat_unit: o.fiat || o.fiatUnit || 'INR',
    order_status: mapOrderStatus(o.orderStatus),
    amount,
    total_price: totalPrice,
    unit_price: unitPrice,
    commission: String(o.commission ?? '0'),
    counter_part_nick_name: o.counterPartNickName || o.buyerNickname || o.sellerNickname || '',
    create_time: o.createTime || 0,
    pay_method_name: o.payMethodName || null,
    raw_data: o,
    synced_at: new Date().toISOString(),
  };
}

function dbRowToOrder(row: any) {
  return {
    orderNumber: row.order_number,
    advNo: row.adv_no,
    tradeType: row.trade_type,
    asset: row.asset,
    fiatUnit: row.fiat_unit,
    orderStatus: row.order_status,
    amount: row.amount,
    totalPrice: row.total_price,
    unitPrice: row.unit_price,
    commission: row.commission,
    counterPartNickName: row.counter_part_nick_name,
    createTime: row.create_time,
    payMethodName: row.pay_method_name,
  };
}
