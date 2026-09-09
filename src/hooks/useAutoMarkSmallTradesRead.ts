import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callBinanceAds } from '@/hooks/useBinanceActions';
import { markOrderChatRead } from '@/lib/chat-read-state';
import { useSmallTradeBands } from '@/hooks/useSmallTradeBands';
import { selectSmallTradeTargets, type SmallTradeThread } from '@/lib/small-trade-targets';

export interface SmallTradeAutoReadSettings {
  auto_mark_chat_read: boolean;
  auto_mark_interval_seconds: number;
  auto_mark_include_buys: boolean;
}

export const DEFAULT_AUTO_MARK_INTERVAL_SECONDS = 60;
export const MIN_AUTO_MARK_INTERVAL_SECONDS = 10;
export const MAX_AUTO_MARK_INTERVAL_SECONDS = 3600;

export function useSmallTradeAutoReadSettings() {
  return useQuery<SmallTradeAutoReadSettings>({
    queryKey: ['small-trade-auto-read-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('small_sales_config')
        .select('auto_mark_chat_read, auto_mark_interval_seconds, auto_mark_include_buys')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const row = (data || {}) as Partial<SmallTradeAutoReadSettings>;
      return {
        auto_mark_chat_read: row.auto_mark_chat_read === true,
        auto_mark_interval_seconds: Number(row.auto_mark_interval_seconds) || DEFAULT_AUTO_MARK_INTERVAL_SECONDS,
        auto_mark_include_buys: row.auto_mark_include_buys !== false,
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Background automation: on a configurable interval, marks the Binance chat of
 * UNREAD small-order threads as read, so big-value client messages stay visible.
 *
 * Targeting is identical to the manual "Mark small chats read" button
 * (see selectSmallTradeTargets): enquiry threads, unknown sides/amounts and any
 * counterparty with a non-small order are never touched. Each order is marked
 * on Binance through its own exchange account, using the documented
 * markOrderMessagesRead action.
 */
export function useAutoMarkSmallTradesRead() {
  const queryClient = useQueryClient();
  const { data: settings } = useSmallTradeAutoReadSettings();
  const { data: bands } = useSmallTradeBands();

  const runningRef = useRef(false);
  const bandsRef = useRef(bands);
  const settingsRef = useRef(settings);
  bandsRef.current = bands;
  settingsRef.current = settings;

  const enabled = settings?.auto_mark_chat_read === true;
  const intervalSeconds = Math.min(
    MAX_AUTO_MARK_INTERVAL_SECONDS,
    Math.max(MIN_AUTO_MARK_INTERVAL_SECONDS, settings?.auto_mark_interval_seconds || DEFAULT_AUTO_MARK_INTERVAL_SECONDS)
  );

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const sweep = async () => {
      if (cancelled || runningRef.current) return;
      const currentBands = bandsRef.current;
      const currentSettings = settingsRef.current;
      if (!currentBands || currentSettings?.auto_mark_chat_read !== true) return;

      runningRef.current = true;
      try {
        const { data, error } = await supabase.rpc('get_terminal_chat_inbox', {
          p_exchange_account_id: null,
          p_limit: 300,
          p_search: null,
        });
        if (error) throw error;

        const threads: SmallTradeThread[] = ((data || []) as any[]).map((r) => ({
          orderNumber: r.order_number,
          counterpartyNickname: r.counterparty_nickname,
          verifiedName: r.verified_name,
          tradeType: r.trade_type,
          totalPrice: r.total_price,
          chatUnreadCount: r.unread_count,
          exchangeAccountId: r.exchange_account_id,
        }));

        const sides: Array<'BUY' | 'SELL'> = currentSettings.auto_mark_include_buys ? ['BUY', 'SELL'] : ['SELL'];
        const targets = selectSmallTradeTargets(threads, currentBands, sides);
        if (!targets.length) return;

        const orderNumbers = targets.map((t) => t.orderNumber);
        const { error: rpcError } = await supabase.rpc('mark_terminal_binance_chats_read', {
          p_order_numbers: orderNumbers,
          p_source: 'auto_small_trades',
        });
        if (rpcError) throw rpcError;
        orderNumbers.forEach((n) => markOrderChatRead(n));

        await Promise.allSettled(
          targets.map((t) =>
            callBinanceAds('markOrderMessagesRead', { orderNo: t.orderNumber, userId: 0 }, t.accountId || undefined)
          )
        );

        queryClient.invalidateQueries({ queryKey: ['terminal-chat-inbox'] });
        queryClient.invalidateQueries({ queryKey: ['terminal-chat-inbox-unread'] });
        queryClient.invalidateQueries({ queryKey: ['terminal-chat-seen-map'] });
      } catch (err) {
        console.warn('[AutoMarkSmallTrades] sweep failed:', err);
      } finally {
        runningRef.current = false;
      }
    };

    void sweep();
    const id = window.setInterval(sweep, intervalSeconds * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, intervalSeconds, queryClient]);
}
