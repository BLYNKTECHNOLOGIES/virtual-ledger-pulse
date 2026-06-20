import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callBinanceAds } from './useBinanceActions';
import { toast } from 'sonner';
import { syncCompletedBuyOrders } from './useTerminalPurchaseSync';
import { syncCompletedSellOrders } from './useTerminalSalesSync';
import { captureSellerPaymentDetails } from './useSellerPaymentCapture';
import { hasActiveBinanceComplaint } from '@/lib/orderStatusMapper';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';

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
  const { accountsToQuery } = useExchangeAccount();
  return useQuery({
    queryKey: ['cached-order-history', accountsToQuery.join(','), range.startTimestamp || null, range.endTimestamp || null],
    queryFn: async () => {
      const cutoff = range.startTimestamp || Date.now() - DATA_RETENTION_MS;
      const allRows: any[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;

      while (true) {
        let query = supabase
          .from('binance_order_history')
          .select('order_number,adv_no,trade_type,asset,fiat_unit,order_status,amount,total_price,unit_price,commission,counter_part_nick_name,create_time,pay_method_name,complaint_status,has_active_complaint,exchange_account_id')
          .in('exchange_account_id', accountsToQuery)
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
// IMPORTANT: every order is fetched from a SPECIFIC exchange account's API.
// We pass `accountId` explicitly so the edge function uses that account's
// credentials, and we stamp every resulting row with that same account id.
// This is the single source of truth for which Binance account an order
// belongs to — downstream (purchase/sales sync, conversions) inherit it.
async function fetchOrdersFromBinance(
  startTimestamp: number,
  endTimestamp: number,
  maxWindows: number = 30,
  accountId?: string,
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
      }, accountId);
      const orders = result?.data || result || [];
      if (!Array.isArray(orders) || orders.length === 0) break;

      for (const o of orders) {
        if (!seenOrderNumbers.has(o.orderNumber)) {
          seenOrderNumbers.add(o.orderNumber);
          // Tag with the account whose API actually returned this order.
          if (accountId) o.__exchange_account_id = accountId;
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

async function upsertOrdersToDB(orders: any[], accountId?: string) {
  const BATCH_SIZE = 200;
  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE).map((o) => orderToDbRow(o, accountId));
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

async function getNewestOrderTimestamp(accountId?: string): Promise<number | null> {
  let query = supabase
    .from('binance_order_history')
    .select('create_time')
    .order('create_time', { ascending: false })
    .limit(1);
  if (accountId) query = query.eq('exchange_account_id', accountId);
  const { data } = await query.maybeSingle();
  return data?.create_time || null;
}

async function getDBOrderCount(accountId?: string): Promise<number> {
  let query = supabase
    .from('binance_order_history')
    .select('*', { count: 'exact', head: true });
  if (accountId) query = query.eq('exchange_account_id', accountId);
  const { count } = await query;
  return count || 0;
}

// Resolve every active exchange account so the sync can fetch each account's
// orders with its own credentials and stamp them correctly.
async function getActiveAccountIds(): Promise<string[]> {
  const { data } = await supabase
    .from('terminal_exchange_accounts')
    .select('id')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  const ids = (data || []).map((a: any) => a.id).filter(Boolean);
  return ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000001'];
}

// ---- Incremental sync: only new orders + status refresh on recent ----
// Runs per active exchange account so every order is fetched with the correct
// credentials AND stamped with the account it actually belongs to.
export async function syncOrderHistoryFromBinance({
  fullSync = false,
  forceGapFill = false,
}: { fullSync?: boolean; forceGapFill?: boolean } = {}) {
      const startTime = Date.now();
      const cutoff = Date.now() - DATA_RETENTION_MS;
      const accountIds = await getActiveAccountIds();

      let grandTotal = 0;
      let anyFull = false;

      for (const accountId of accountIds) {
        const dbCount = await getDBOrderCount(accountId);
        const newestTs = await getNewestOrderTimestamp(accountId);

        // Decide sync strategy (per account)
        const needsFullSync = fullSync || dbCount === 0 || !newestTs;

        if (needsFullSync) {
          anyFull = true;
          const allOrders = await fetchOrdersFromBinance(cutoff, Date.now(), 365, accountId);
          await upsertOrdersToDB(allOrders, accountId);
          grandTotal += allOrders.length;
          continue;
        }

        // INCREMENTAL: fetch from (newest - overlap) to now
        // The overlap ensures we catch status changes on recent orders
        const incrementalStart = Math.max(cutoff, newestTs - STATUS_OVERLAP_MS);
        const newOrders = await fetchOrdersFromBinance(incrementalStart, Date.now(), 5, accountId);
        if (newOrders.length > 0) {
          await upsertOrdersToDB(newOrders, accountId);
        }
        grandTotal += newOrders.length;

        // GAP-FILL: every ~24h, run a deep scan over the last 7 days to catch
        // out-of-order Binance updates (e.g. delayed completions, post-appeal status changes)
        // that fell outside the trailing incremental window.
        try {
          const gapKey = `${GAP_FILL_KEY}:${accountId}`;
          const lastGapFillStr = typeof localStorage !== 'undefined' ? localStorage.getItem(gapKey) : null;
          const lastGapFill = lastGapFillStr ? Number(lastGapFillStr) : 0;
          if (forceGapFill || Date.now() - lastGapFill > GAP_FILL_INTERVAL_MS) {
            const gapStart = Math.max(cutoff, Date.now() - GAP_FILL_WINDOW_MS);
            const gapOrders = await fetchOrdersFromBinance(gapStart, Date.now(), 60, accountId);
            if (gapOrders.length > 0) {
              await upsertOrdersToDB(gapOrders, accountId);
            }
            grandTotal += gapOrders.length;
            if (typeof localStorage !== 'undefined') localStorage.setItem(gapKey, String(Date.now()));
            console.log(`[Sync] Gap-fill complete for ${accountId}: upserted ${gapOrders.length} orders`);
          }
        } catch (err) {
          console.warn('[Sync] Gap-fill pass failed (non-fatal):', err);
        }
      }

      // Clean up orders older than the retention window (across all accounts)
      const { error: cleanupError } = await supabase
        .from('binance_order_history')
        .delete()
        .lt('create_time', cutoff);
      if (cleanupError) console.warn('[Sync] Cleanup failed:', cleanupError);

      const duration = Date.now() - startTime;
      await updateSyncMetadata(grandTotal, duration);
      return { count: grandTotal, duration, type: (anyFull ? 'full' : 'incremental') as 'full' | 'incremental' };
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
  6: 'CANCELLED_BY_SYSTEM',
  7: 'CANCELLED_BY_SYSTEM',
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
function orderToDbRow(o: any, accountId?: string) {
  const amount = String(o.amount ?? o.quantity ?? '0');
  const totalPrice = String(o.totalPrice ?? o.total_price ?? o.fiatAmount ?? '0');
  const computedUnitPrice = Number(amount) > 0 && Number(totalPrice) > 0 ? String(Number(totalPrice) / Number(amount)) : '0';
  const unitPrice = String(o.unitPrice ?? o.price ?? o.unit_price ?? computedUnitPrice);

  const complaintStatusRaw = o.complaintStatus ?? o.complainStatus ?? o.appealStatus ?? null;
  const complaintStatus = complaintStatusRaw !== null && complaintStatusRaw !== undefined && complaintStatusRaw !== ''
    ? String(complaintStatusRaw)
    : null;
  const hasActiveComplaint = hasActiveBinanceComplaint(o);

  // Resolve the owning account: explicit arg → tag set during fetch → existing on payload.
  const resolvedAccountId = accountId || o.__exchange_account_id || undefined;

  const row: Record<string, any> = {
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
    complaint_status: complaintStatus,
    has_active_complaint: hasActiveComplaint,
    raw_data: o,
    synced_at: new Date().toISOString(),
  };
  // Only set the account when known, so upserts never wipe an existing value with null.
  if (resolvedAccountId) row.exchange_account_id = resolvedAccountId;
  return row;
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
    complaintStatus: row.complaint_status,
    hasActiveComplaint: !!row.has_active_complaint,
  };
}
