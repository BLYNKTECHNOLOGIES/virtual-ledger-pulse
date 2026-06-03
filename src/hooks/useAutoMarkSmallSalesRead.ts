import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callBinanceAds, useBinanceActiveOrders } from '@/hooks/useBinanceActions';
import { isOrderChatRead, markOrderChatRead } from '@/lib/chat-read-state';

/**
 * Background automation: continuously marks the chat of ACTIVE small SELL orders
 * as read on Binance, so that big-buyer conversations stand out as unread.
 *
 * Scope (Binance API validated):
 * - Only SELL orders (we never touch buy-side chats).
 * - Only orders whose total fiat price falls inside the configured
 *   small_sales_config [min_amount, max_amount] range.
 * - Only orders that currently have unread messages.
 * - Gated behind the dedicated `auto_mark_chat_read` settings toggle.
 *
 * Marking is done via the existing `markOrderMessagesRead` action which proxies
 * to POST /sapi/v1/c2c/chat/markOrderMessagesAsRead. We also mirror the read
 * state locally (chat-read-state) so the terminal inbox reflects it instantly.
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

  useEffect(() => {
    const autoEnabled = (config as any)?.auto_mark_chat_read === true;
    if (!autoEnabled || !config) return;

    const min = Number(config.min_amount);
    const max = Number(config.max_amount);

    const orders: any[] = Array.isArray(activeOrdersData)
      ? activeOrdersData
      : (activeOrdersData as any)?.data || (activeOrdersData as any)?.rows || [];

    if (!orders.length) return;

    for (const o of orders) {
      const orderNumber = String(o.orderNumber || o.orderNo || '');
      if (!orderNumber) continue;

      // SELL only
      if ((o.tradeType || '').toUpperCase() !== 'SELL') continue;

      // Small range only
      const totalPrice = parseFloat(o.totalPrice || o.total_price || '0');
      if (!(totalPrice >= min && totalPrice <= max)) continue;

      // Only if there are unread messages
      const unread = Number(o.chatUnreadCount || 0);
      if (unread <= 0) continue;

      // Skip if already marked locally or currently in-flight
      if (isOrderChatRead(orderNumber) || inFlightRef.current.has(orderNumber)) continue;

      inFlightRef.current.add(orderNumber);
      callBinanceAds('markOrderMessagesRead', { orderNo: orderNumber })
        .then(() => {
          markOrderChatRead(orderNumber);
        })
        .catch((err) => {
          console.warn('[AutoMarkSmallSales] Failed to mark chat read:', orderNumber, err);
        })
        .finally(() => {
          inFlightRef.current.delete(orderNumber);
        });
    }
  }, [activeOrdersData, config]);
}
