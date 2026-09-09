import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useExchangeAccount, ALL_ACCOUNTS } from '@/contexts/ExchangeAccountContext';

/**
 * Number of conversations with unread Binance messages, taken from the same
 * source the Chats inbox uses — so the Orders page badge matches the inbox
 * (including enquiries and older/closed orders that are not in the live list).
 */
export function useChatInboxUnread() {
  const queryClient = useQueryClient();
  const { activeAccountId } = useExchangeAccount();
  const accountFilter = activeAccountId === ALL_ACCOUNTS ? null : activeAccountId;

  const { data: count = 0 } = useQuery({
    queryKey: ['terminal-chat-inbox-unread', accountFilter],
    queryFn: async () => {
      // NOTE: Binance's per-order "chatUnreadCount" comes back as 0 for almost
      // every order on our API session even while the Binance app still shows
      // the chat as unread, so it is NOT used to auto-clear unread here.

      const { data, error } = await supabase.rpc('get_terminal_chat_inbox', {
        p_exchange_account_id: accountFilter,
        p_limit: 300,
        p_search: null,
      });
      if (error) throw error;
      return ((data || []) as { unread_count: number }[]).filter((r) => (r.unread_count || 0) > 0)
        .length;
    },
    refetchInterval: 20000,
  });

  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['terminal-chat-inbox-unread'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-chat-inbox'] });
    };
    const channel = supabase
      .channel(`chat-inbox-unread-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'binance_order_chat_messages' },
        refresh,
      )
      .subscribe();
    const resume = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('online', refresh);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [queryClient]);

  return count;
}
