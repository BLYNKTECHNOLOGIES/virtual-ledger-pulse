import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Per-operator pinned terminal chats. The stored key is the inbox row's stable
 * identity key (counterparty identity when known, otherwise the order number),
 * so a pin survives the counterparty starting a new order.
 */
export function useChatPins() {
  const queryClient = useQueryClient();

  const { data: pinned = new Set<string>() } = useQuery({
    queryKey: ['terminal-chat-pins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_chat_pins' as any)
        .select('order_number');
      if (error) throw error;
      return new Set<string>(((data as any[]) || []).map((r) => r.order_number as string));
    },
    staleTime: 60_000,
  });

  const togglePin = useCallback(
    async (key: string) => {
      const isPinned = pinned.has(key);
      try {
        if (isPinned) {
          const { error } = await supabase
            .from('terminal_chat_pins' as any)
            .delete()
            .eq('order_number', key);
          if (error) throw error;
        } else {
          const { data: auth } = await supabase.auth.getUser();
          const userId = auth?.user?.id;
          if (!userId) throw new Error('Not signed in');
          const { error } = await supabase
            .from('terminal_chat_pins' as any)
            .insert({ order_number: key, user_id: userId } as any);
          if (error) throw error;
        }
        await queryClient.invalidateQueries({ queryKey: ['terminal-chat-pins'] });
      } catch (err: any) {
        toast.error(err?.message || 'Could not update pin');
      }
    },
    [pinned, queryClient]
  );

  return { pinned, togglePin };
}
