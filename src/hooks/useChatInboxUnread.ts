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
      // Clear threads Binance itself reports as read (operator answered in the
      // Binance app) before counting, so the badge matches the app.
      await supabase.rpc('reconcile_binance_app_chat_reads', { p_limit: 500 }).catch(() => null);
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
    const channel = supabase
      .channel(`chat-inbox-unread-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'binance_order_chat_messages' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['terminal-chat-inbox-unread'] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return count;
}
