import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';

export interface InternalMessage {
  id: string;
  order_number: string;
  sender_id: string;
  sender_name: string;
  message_text: string | null;
  file_url: string | null;
  file_name: string | null;
  message_type: string;
  created_at: string;
}

export function useInternalMessages(orderNumber: string | null) {
  const [realtimeMessages, setRealtimeMessages] = useState<InternalMessage[]>([]);
  const queryClient = useQueryClient();

  const { data: initialMessages = [], isLoading } = useQuery({
    queryKey: ['internal-messages', orderNumber],
    queryFn: async () => {
      if (!orderNumber) return [];
      const { data, error } = await supabase
        .from('terminal_internal_messages')
        .select('*')
        .eq('order_number', orderNumber)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as InternalMessage[];
    },
    enabled: !!orderNumber,
  });

  useEffect(() => {
    if (!orderNumber) return;
    setRealtimeMessages([]);

    const channel = supabase
      .channel(`internal-chat-${orderNumber}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'terminal_internal_messages',
          filter: `order_number=eq.${orderNumber}`,
        },
        (payload) => {
          const newMsg = payload.new as InternalMessage;
          setRealtimeMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderNumber]);

  // Merge initial + realtime, deduplicate
  const messages = [...initialMessages];
  for (const rm of realtimeMessages) {
    if (!messages.some((m) => m.id === rm.id)) {
      messages.push(rm);
    }
  }
  messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return { messages, isLoading };
}

export function useSendInternalMessage() {
  const { userId, username } = useTerminalAuth();
  const queryClient = useQueryClient();

  const send = useCallback(
    async (params: {
      orderNumber: string;
      text?: string;
      fileUrl?: string;
      fileName?: string;
      messageType?: string;
    }) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase.from('terminal_internal_messages').insert({
        order_number: params.orderNumber,
        sender_id: userId,
        sender_name: username || 'Unknown',
        message_text: params.text || null,
        file_url: params.fileUrl || null,
        file_name: params.fileName || null,
        message_type: params.messageType || 'text',
      });
      if (error) throw error;
      // Invalidate the messages query so the new message appears immediately
      queryClient.invalidateQueries({ queryKey: ['internal-messages', params.orderNumber] });
    },
    [userId, username, queryClient]
  );

  return { send };
}

export function useInternalUnreadCounts(orderNumbers: string[]) {
  const { userId } = useTerminalAuth();

  return useQuery({
    queryKey: ['internal-unread-counts', orderNumbers.join(','), userId],
    queryFn: async () => {
      if (!userId || orderNumbers.length === 0) return {} as Record<string, number>;

      // Get read timestamps for this user
      const { data: reads } = await supabase
        .from('terminal_internal_chat_reads')
        .select('order_number, last_read_at')
        .eq('user_id', userId)
        .in('order_number', orderNumbers);

      const readMap = new Map<string, string>();
      (reads || []).forEach((r: any) => readMap.set(r.order_number, r.last_read_at));

      // Count unread per order
      const counts: Record<string, number> = {};
      await Promise.all(
        orderNumbers.map(async (on) => {
          const lastRead = readMap.get(on);
          let query = supabase
            .from('terminal_internal_messages')
            .select('id', { count: 'exact', head: true })
            .eq('order_number', on)
            .neq('sender_id', userId);
          if (lastRead) {
            query = query.gt('created_at', lastRead);
          }
          const { count } = await query;
          counts[on] = count || 0;
        })
      );

      return counts;
    },
    enabled: !!userId && orderNumbers.length > 0,
    refetchInterval: 30000,
  });
}

export function useMarkInternalChatRead(orderNumber: string | null) {
  const { userId } = useTerminalAuth();
  const queryClient = useQueryClient();

  const markRead = useCallback(async () => {
    if (!userId || !orderNumber) return;
    await supabase.from('terminal_internal_chat_reads').upsert(
      {
        order_number: orderNumber,
        user_id: userId,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'order_number,user_id' }
    );
    // Invalidate unread counts
    queryClient.invalidateQueries({ queryKey: ['internal-unread-counts'] });
  }, [userId, orderNumber, queryClient]);

  return { markRead };
}
