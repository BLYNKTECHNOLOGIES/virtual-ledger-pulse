import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callBinanceAds, useBinanceActiveOrders } from '@/hooks/useBinanceActions';
import { markOrderChatRead } from '@/lib/chat-read-state';

/** Do not re-mark the same order more often than this, even if new messages keep arriving. */
const MARK_READ_MIN_INTERVAL_MS = 30_000;
/** How often the sweep may look at the candidate set (active orders refresh every ~5s). */
const SWEEP_INTERVAL_MS = 20_000;

/**
 * Background automation: continuously marks the chat of ACTIVE small SELL orders
 * as read on Binance, so that big-buyer conversations stand out as unread.
 *
 * Scope (Binance API validated):
 * - Only SELL orders (we never touch buy-side chats).
 * - Only orders whose total fiat price falls inside the configured
 *   small_sales_config [min_amount, max_amount] range.
 * - Gated behind the dedicated `auto_mark_chat_read` settings toggle.
 *
 * Marking is done via the existing `markOrderMessagesRead` action, ALWAYS scoped
 * to the order's own exchange account (active orders are merged across accounts,
 * so calling with the currently selected account's credentials would fail or
 * target the wrong merchant). The Binance proxy supports userId=0 as "current
 * merchant for this order", which is required because active-order rows only
 * expose alphanumeric userNo values that the mark-read endpoint rejects.
 *
 * The read state is mirrored BOTH locally (instant badge update in this browser)
 * and into the shared terminal_binance_chat_reads table, so every operator's
 * inbox reflects it. An order is only re-marked when a newer chat message has
 * arrived since the last successful mark, which stops the old behaviour of
 * hitting Binance for every small order every 15 seconds forever.
 */
export function useAutoMarkSmallSalesRead() {
  // Reuse the shared active-orders poll (every 5s) instead of adding a new timer.
  const { data: activeOrdersData } = useBinanceActiveOrders();

  const { data: config } = useQuery({
    queryKey: ['small_sales_config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('small_sales_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as
        | { is_enabled: boolean; min_amount: number; max_amount: number; auto_mark_chat_read?: boolean }
        | null;
    },
    staleTime: 60 * 1000,
  });

  // Track orders currently being marked to avoid duplicate in-flight calls.
  const inFlightRef = useRef<Set<string>>(new Set());
  const lastAttemptRef = useRef<Map<string, number>>(new Map());
  /** Newest chat message timestamp covered by the last successful mark, per order. */
  const markedThroughRef = useRef<Map<string, number>>(new Map());
  const lastSweepRef = useRef(0);
  const sweepingRef = useRef(false);

  useEffect(() => {
    const autoEnabled = (config as any)?.auto_mark_chat_read === true;
    if (!autoEnabled || !config) return;
    if (sweepingRef.current) return;
    if (Date.now() - lastSweepRef.current < SWEEP_INTERVAL_MS) return;

    const min = Number(config.min_amount);
    const max = Number(config.max_amount);

    const orders: any[] = Array.isArray(activeOrdersData)
      ? activeOrdersData
      : (activeOrdersData as any)?.data || (activeOrdersData as any)?.rows || [];

    if (!orders.length) return;

    const candidates: Array<{ orderNumber: string; accountId?: string }> = [];
    for (const o of orders) {
      const orderNumber = String(o.orderNumber || o.orderNo || '');
      if (!orderNumber) continue;
      if ((o.tradeType || '').toUpperCase() !== 'SELL') continue;

      const totalPrice = parseFloat(o.totalPrice || o.total_price || '0');
      if (!(totalPrice >= min && totalPrice <= max)) continue;

      if (inFlightRef.current.has(orderNumber)) continue;
      const lastAttemptAt = lastAttemptRef.current.get(orderNumber) || 0;
      if (Date.now() - lastAttemptAt < MARK_READ_MIN_INTERVAL_MS) continue;

      candidates.push({ orderNumber, accountId: o._exchangeAccountId || o.exchange_account_id || undefined });
    }

    if (!candidates.length) return;

    lastSweepRef.current = Date.now();
    sweepingRef.current = true;

    (async () => {
      try {
        // Latest stored message per candidate order — used to skip orders that
        // have had nothing new since we last marked them read.
        const latestByOrder = new Map<string, number>();
        const { data: rows } = await supabase
          .from('binance_order_chat_messages')
          .select('order_number, binance_create_time, captured_at')
          .in('order_number', candidates.map((c) => c.orderNumber).slice(0, 200))
          .order('captured_at', { ascending: false })
          .limit(500);
        for (const row of rows || []) {
          const ts = Number(row.binance_create_time || 0) || new Date(row.captured_at as string).getTime();
          const prev = latestByOrder.get(row.order_number) || 0;
          if (ts > prev) latestByOrder.set(row.order_number, ts);
        }

        for (const { orderNumber, accountId } of candidates) {
          const latest = latestByOrder.get(orderNumber) || 0;
          const markedThrough = markedThroughRef.current.get(orderNumber);
          // Already marked and nothing newer arrived since — nothing to do.
          if (markedThrough !== undefined && latest <= markedThrough) continue;
          if (inFlightRef.current.has(orderNumber)) continue;

          inFlightRef.current.add(orderNumber);
          lastAttemptRef.current.set(orderNumber, Date.now());
          try {
            await callBinanceAds('markOrderMessagesRead', { orderNo: orderNumber, userId: 0 }, accountId);
            markedThroughRef.current.set(orderNumber, latest);
            markOrderChatRead(orderNumber);
            const { error } = await supabase.rpc('mark_terminal_binance_chat_read', {
              p_order_number: orderNumber,
              p_source: 'auto_small_sales',
            });
            if (error) console.warn('[AutoMarkSmallSales] Shared read state not saved:', orderNumber, error.message);
          } catch (err) {
            console.warn('[AutoMarkSmallSales] Failed to mark chat read:', orderNumber, err);
          } finally {
            inFlightRef.current.delete(orderNumber);
          }
        }
      } finally {
        sweepingRef.current = false;
      }
    })();
  }, [activeOrdersData, config]);
}
