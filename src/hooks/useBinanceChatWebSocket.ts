import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { callBinanceAds, type BinanceChatMessage } from './useBinanceActions';

export type MessageStatus = 'sending' | 'sent' | 'failed' | 'queued';

export interface TrackedMessage extends BinanceChatMessage {
  _status?: MessageStatus;
  _tempId?: number;
}

interface QueuedMessage {
  tempId: number;
  orderNo: string;
  content: string;
  type: 'text' | 'image' | 'card';
  createdAt: number;
  retries: number;
  status: 'sending' | 'queued' | 'failed' | 'sent';
}

interface UseBinanceChatWebSocketReturn {
  messages: TrackedMessage[];
  isConnected: boolean;
  isConnecting: boolean;
  sendMessage: (orderNo: string, content: string) => void;
  sendImageMessage: (orderNo: string, imageUrl: string) => void;
  sendAdCardMessage: (orderNo: string, cardJson: string) => void;
  retryMessage: (tempId: number) => void;
  /** Drop a delivered bubble once its durable stored copy is on screen. */
  clearQueuedMessage: (tempId: number) => void;
  error: string | null;
  queuedMessages: QueuedMessage[];
}

let tempIdCounter = 1;

/**
 * Compatibility no-op. The always-on server listener is the sole Binance chat
 * socket owner; browsers must never request credentials or open a competing
 * session for the same exchange account.
 */
export function prewarmChatCredentials(_accountIds: (string | null)[]): void {}
export function prewarmChatSockets(_accountIds: (string | null)[]): void {}

/**
 * Server-backed chat transport.
 *
 * Incoming messages are read from binance_order_chat_messages by ChatPanel's
 * archived-message query and delivered through Supabase Realtime. Outgoing
 * messages use the existing server action, which verifies the Binance history
 * echo before reporting success. No browser Binance WebSocket is opened.
 */
export function useBinanceChatWebSocket(
  _activeOrderNo: string | null,
  accountId?: string | null,
  onDelivered?: (orderNo: string) => void,
): UseBinanceChatWebSocketReturn {
  const accountIdRef = useRef<string | null>(accountId ?? null);
  accountIdRef.current = accountId ?? null;
  const onDeliveredRef = useRef(onDelivered);
  onDeliveredRef.current = onDelivered;
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const queueRef = useRef<QueuedMessage[]>([]);

  useEffect(() => {
    queueRef.current = queuedMessages;
  }, [queuedMessages]);

  const doServerSend = useCallback(
    async (tempId: number, orderNo: string, content: string, type: 'text' | 'image' | 'card') => {
      try {
        setError(null);
        const payload = type === 'image'
          ? { orderNo, imageUrl: content }
          : { orderNo, content, contentType: type === 'card' ? 'CARD' : 'TEXT' };
        const response: any = await callBinanceAds('sendChatMessage', payload, accountIdRef.current ?? undefined);
        const body = response?.data ?? response;
        const delivered = body?.success === true || body?.code === '000000';
        if (!delivered) throw new Error(body?.error || body?.message || 'Binance rejected the message');

        // The server action returns success only after finding the exact echo in
        // Binance history. Keep the bubble on screen (as delivered) until the
        // durable stored copy is rendered, otherwise the reply visibly vanishes
        // and operators re-send it.
        setQueuedMessages((current) => current.map((item) =>
          item.tempId === tempId ? { ...item, status: 'sent' as const } : item
        ));
        onDeliveredRef.current?.(orderNo);
        return true;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Binance did not confirm delivery';
        setError(message);
        setQueuedMessages((current) => current.map((item) =>
          item.tempId === tempId ? { ...item, status: 'failed' as const } : item
        ));
        toast.error(`${message} — tap retry.`);
        return false;
      }
    },
    [],
  );

  const enqueue = useCallback((orderNo: string, content: string, type: 'text' | 'image' | 'card') => {
    const tempId = tempIdCounter++;
    setQueuedMessages((current) => [...current, {
      tempId,
      orderNo,
      content,
      type,
      createdAt: Date.now(),
      retries: 0,
      status: 'sending',
    }]);
    void doServerSend(tempId, orderNo, content, type);
  }, [doServerSend]);

  const retryMessage = useCallback((tempId: number) => {
    const pending = queueRef.current.find((item) => item.tempId === tempId);
    if (!pending) return;
    setQueuedMessages((current) => current.map((item) =>
      item.tempId === tempId
        ? { ...item, status: 'sending' as const, retries: item.retries + 1, createdAt: Date.now() }
        : item
    ));
    void doServerSend(tempId, pending.orderNo, pending.content, pending.type);
  }, [doServerSend]);

  const clearQueuedMessage = useCallback((tempId: number) => {
    setQueuedMessages((current) => current.filter((item) => item.tempId !== tempId));
  }, []);

  return {
    messages: [],
    isConnected: false,
    isConnecting: false,
    sendMessage: (orderNo, content) => enqueue(orderNo, content, 'text'),
    sendImageMessage: (orderNo, imageUrl) => enqueue(orderNo, imageUrl, 'image'),
    sendAdCardMessage: (orderNo, cardJson) => enqueue(orderNo, cardJson, 'card'),
    retryMessage,
    error,
    queuedMessages,
  };
}