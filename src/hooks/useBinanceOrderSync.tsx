import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callBinanceAds } from './useBinanceActions';
import { toast } from 'sonner';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ---- DB Read: Get all cached orders for last 30 days ----
export function useCachedOrderHistory() {
  return useQuery({
    queryKey: ['cached-order-history'],
    queryFn: async () => {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const allRows: any[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('binance_order_history')
          .select('*')
          .gte('create_time', thirtyDaysAgo)
          .order('create_time', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
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

// ---- Sync mutation: fetch from Binance API and upsert to DB ----
export function useSyncOrderHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const startTime = Date.now();
      const startTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000;
      let windowEnd = Date.now();
      const allOrders: any[] = [];
      const seenOrderNumbers = new Set<string>();
      const maxWindows = 30; // supports up to ~30,000 orders
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
          console.log(`[Sync] window=${windowCount}, page=${page}, received=${orders.length}, total=${allOrders.length}`);

          if (orders.length < 50) break;
          page++;
          await new Promise(r => setTimeout(r, 300));
        }

        if (windowOrders < 1000) break;
        windowEnd = oldestInWindow - 1;
      }

      console.log(`[Sync] Fetched ${allOrders.length} orders in ${windowCount} windows. Upserting to DB...`);

      // Batch upsert to Supabase
      const BATCH_SIZE = 200;
      for (let i = 0; i < allOrders.length; i += BATCH_SIZE) {
        const batch = allOrders.slice(i, i + BATCH_SIZE).map(orderToDbRow);
        const { error } = await supabase
          .from('binance_order_history')
          .upsert(batch, { onConflict: 'order_number' });
        if (error) {
          console.error(`[Sync] Batch ${Math.floor(i / BATCH_SIZE)} failed:`, error);
          throw error;
        }
      }

      // Update sync metadata
      const duration = Date.now() - startTime;
      await supabase
        .from('binance_sync_metadata')
        .upsert({
          id: 'order_history',
          last_sync_at: new Date().toISOString(),
          last_sync_order_count: allOrders.length,
          last_sync_duration_ms: duration,
        }, { onConflict: 'id' });

      console.log(`[Sync] Complete. ${allOrders.length} orders synced in ${(duration / 1000).toFixed(1)}s`);
      return { count: allOrders.length, duration };
    },
    onSuccess: ({ count, duration }) => {
      toast.success(`Synced ${count.toLocaleString()} orders in ${(duration / 1000).toFixed(0)}s`);
      queryClient.invalidateQueries({ queryKey: ['cached-order-history'] });
      queryClient.invalidateQueries({ queryKey: ['binance-sync-metadata'] });
    },
    onError: (err: Error) => {
      toast.error(`Sync failed: ${err.message}`);
    },
  });
}

// ---- Auto-sync hook: triggers sync if data is stale ----
export function useAutoSyncOrders() {
  const { data: metadata, isLoading: metaLoading } = useSyncMetadata();
  const syncMutation = useSyncOrderHistory();
  const hasTriggered = useRef(false);

  const isStale = !metaLoading && (!metadata?.last_sync_at || 
    (Date.now() - new Date(metadata.last_sync_at).getTime()) > STALE_THRESHOLD_MS);

  useEffect(() => {
    if (isStale && !syncMutation.isPending && !hasTriggered.current) {
      hasTriggered.current = true;
      syncMutation.mutate();
    }
  }, [isStale, syncMutation.isPending]);

  return { isSyncing: syncMutation.isPending, syncMutation, isStale, metadata };
}

// ---- Mapping helpers ----
function orderToDbRow(o: any) {
  return {
    order_number: o.orderNumber || '',
    adv_no: o.advNo || '',
    trade_type: o.tradeType || '',
    asset: o.asset || 'USDT',
    fiat_unit: o.fiat || o.fiatUnit || 'INR',
    order_status: String(o.orderStatus || ''),
    amount: String(o.amount || '0'),
    total_price: String(o.totalPrice || '0'),
    unit_price: String(o.unitPrice || '0'),
    commission: String(o.commission || '0'),
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
