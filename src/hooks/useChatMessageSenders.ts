import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SenderRecord {
  username: string;
  user_id: string;
}

/**
 * Hook to persistently track which terminal operator sent each chat message.
 * Keyed by (order_number, message_content, approximate time) for matching.
 */
export function useChatMessageSenders() {
  // In-memory cache: Map<`${orderNumber}::${content}`  → SenderRecord[]>
  const cacheRef = useRef<Map<string, SenderRecord[]>>(new Map());
  const fetchedOrdersRef = useRef<Set<string>>(new Set());

  /** Log that the current user sent a message */
  const logSender = useCallback(async (
    orderNumber: string,
    content: string,
    userId: string,
    username: string
  ) => {
    const now = Date.now();

    // Update local cache immediately
    const key = `${orderNumber}::${content}`;
    const existing = cacheRef.current.get(key) || [];
    existing.push({ username, user_id: userId });
    cacheRef.current.set(key, existing);

    // Persist to DB (fire-and-forget)
    try {
      await supabase.from('chat_message_senders').insert({
        order_number: orderNumber,
        message_content: content,
        sent_at_ms: now,
        user_id: userId,
        username,
      });
    } catch (err) {
      console.warn('Failed to log chat sender:', err);
    }
  }, []);

  /** Fetch all sender records for given order numbers and cache them */
  const prefetchSenders = useCallback(async (orderNumbers: string[]) => {
    const toFetch = orderNumbers.filter(o => !fetchedOrdersRef.current.has(o));
    if (toFetch.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('chat_message_senders')
        .select('order_number, message_content, username, user_id')
        .in('order_number', toFetch);

      if (error) throw error;

      for (const row of (data || [])) {
        const key = `${row.order_number}::${row.message_content}`;
        const existing = cacheRef.current.get(key) || [];
        // Avoid duplicates
        if (!existing.some(e => e.user_id === row.user_id && e.username === row.username)) {
          existing.push({ username: row.username, user_id: row.user_id });
          cacheRef.current.set(key, existing);
        }
      }

      toFetch.forEach(o => fetchedOrdersRef.current.add(o));
    } catch (err) {
      console.warn('Failed to prefetch chat senders:', err);
    }
  }, []);

  /** Look up the sender username for a self message */
  const getSenderName = useCallback((orderNumber: string, content: string): string | null => {
    const key = `${orderNumber}::${content}`;
    const records = cacheRef.current.get(key);
    if (records && records.length > 0) {
      return records[0].username;
    }
    return null;
  }, []);

  return { logSender, prefetchSenders, getSenderName };
}
