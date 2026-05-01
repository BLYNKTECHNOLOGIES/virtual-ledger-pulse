import { useState, useEffect, useRef, useCallback } from 'react';
import { callBinanceAds, BinanceChatMessage } from './useBinanceActions';
import { toast } from 'sonner';
import { extractBinanceChatMessages, getBinanceChatGroupId } from '@/lib/binance-chat';

interface RelayInfo {
  relayUrl: string;
  relayToken: string;
}

export type MessageStatus = 'sending' | 'sent' | 'failed' | 'queued';

export interface TrackedMessage extends BinanceChatMessage {
  _status?: MessageStatus;
  _tempId?: number;
}

interface QueuedMessage {
  tempId: number;
  orderNo: string;
  content: string;
  type: 'text' | 'image';
  createdAt: number;
  retries: number;
  // 'sending' = handed to WS, awaiting server echo (optimistic bubble with spinner)
  // 'queued'  = WS not connected, will retry on reconnect
  // 'failed'  = exceeded retry budget, requires manual retry
  status: 'sending' | 'queued' | 'failed';
}

interface UseBinanceChatWebSocketReturn {
  messages: TrackedMessage[];
  isConnected: boolean;
  isConnecting: boolean;
  sendMessage: (orderNo: string, content: string) => void;
  sendImageMessage: (orderNo: string, imageUrl: string) => void;
  retryMessage: (tempId: number) => void;
  error: string | null;
  queuedMessages: QueuedMessage[];
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Safely convert WS event.data to string (handles Blob, ArrayBuffer, string) */
async function wsDataToString(data: any): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof Blob) return await data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  return String(data);
}

let tempIdCounter = 1;

export function useBinanceChatWebSocket(
  activeOrderNo: string | null
): UseBinanceChatWebSocketReturn {
  const [messages, setMessages] = useState<TrackedMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);

  // Track the active order in a ref so WS callbacks always see the current value
  const activeOrderRef = useRef<string | null>(activeOrderNo);
  activeOrderRef.current = activeOrderNo;

  const wsRef = useRef<WebSocket | null>(null);
  const relayInfoRef = useRef<RelayInfo | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const groupIdMapRef = useRef<Map<string, string>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef(5000);
  const maxReconnectAttempts = 5;
  const queueRef = useRef<QueuedMessage[]>([]);
  const shouldReconnectRef = useRef(true);

  // Keep refs in sync
  useEffect(() => {
    queueRef.current = queuedMessages;
  }, [queuedMessages]);

  // Watchdog: if a 'sending' bubble doesn't get echoed by the server within
  // 30s, flip it to 'failed' so the user can manually retry. Prevents a
  // permanently spinning bubble on silent network/relay drops.
  useEffect(() => {
    const hasSending = queuedMessages.some(q => q.status === 'sending');
    if (!hasSending) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setQueuedMessages(prev => prev.map(q =>
        q.status === 'sending' && now - q.createdAt > 30000
          ? { ...q, status: 'failed' as const }
          : q
      ));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [queuedMessages]);

  // Helper to capture sessionId and groupId from any frame
  const captureMetadata = useCallback((data: any) => {
    if (data.sessionId && !sessionIdRef.current) {
      sessionIdRef.current = data.sessionId;
    }
    const gid = data.groupId || data.chatGroupId || data.threadId;
    const orderKey = data.orderNo || data.topicId;
    if (gid && orderKey) {
      groupIdMapRef.current.set(orderKey, gid);
    }
  }, []);

  // ---- Pre-fetch groupId for an order ----
  const fetchGroupId = useCallback(async (orderNo: string) => {
    if (groupIdMapRef.current.has(orderNo)) return;
    try {
      const result = await callBinanceAds('getChatGroupId', { orderNo });
      const data = result?.data?.data || result?.data || result;
      const gid = data?.groupId || data?.chatGroupId;
      if (gid) {
        groupIdMapRef.current.set(orderNo, gid);
      } else {
        const groups = data?.groups || data?.list || (Array.isArray(data) ? data : []);
        for (const g of groups) {
          const id = g?.groupId || g?.chatGroupId;
          const topic = g?.topicId || g?.orderNo;
          if (id && (!topic || topic === orderNo)) {
            groupIdMapRef.current.set(orderNo, id);
            break;
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not pre-fetch groupId:', err);
    }
  }, []);

  // ---- Fetch chat history via REST (all pages) ----
  const fetchChatHistory = useCallback(async (orderNo: string) => {
    try {
      const allMessages: any[] = [];
      let page = 1;
      const maxPages = 5;

      while (page <= maxPages) {
        const result = await callBinanceAds('getChatMessages', {
          orderNo,
          page,
          rows: 50,
          sort: 'asc',
        });
        const list = extractBinanceChatMessages(result);
        const restGroupId = getBinanceChatGroupId(result);
        if (restGroupId && orderNo) {
          groupIdMapRef.current.set(orderNo, restGroupId);
        }
        if (Array.isArray(list) && list.length > 0) {
          for (const msg of list) {
            if (msg.groupId && orderNo && !groupIdMapRef.current.has(orderNo)) {
              groupIdMapRef.current.set(orderNo, msg.groupId);
              break;
            }
          }
          allMessages.push(...list);
          if (list.length < 50) break;
          page++;
        } else {
          break;
        }
      }

      if (allMessages.length > 0) {
        const seen = new Set<string>();
        const deduped = allMessages.filter((msg) => {
          const key = String(msg.id || msg.uuid || `${msg.createTime}-${msg.type}-${msg.content || msg.message || ''}`);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        deduped.sort((a, b) => (a.createTime || 0) - (b.createTime || 0));

        if (activeOrderRef.current === orderNo) {
          setMessages(() => deduped);

          // Check if any queued messages now appear in server response (delivered)
          const serverContents = new Set(deduped.filter(m => m.self).map(m => (m.content || m.message || '').trim()));
          setQueuedMessages(prev => {
            const remaining = prev.filter(q => !serverContents.has(q.content.trim()));
            return remaining.length !== prev.length ? remaining : prev;
          });
        }
        pollIntervalRef.current = 5000;
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to fetch chat history:', err);
      return false;
    }
  }, []);

  // ---- Clear messages and restart polling when order changes ----
  useEffect(() => {
    setMessages([]);

    if (!activeOrderNo) return;

    fetchGroupId(activeOrderNo);
    fetchChatHistory(activeOrderNo);

    const poll = async () => {
      if (activeOrderRef.current !== activeOrderNo) return;
      await fetchChatHistory(activeOrderNo);
      pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.3, 30000);
      pollTimerRef.current = setTimeout(poll, pollIntervalRef.current);
    };

    pollTimerRef.current = setTimeout(poll, pollIntervalRef.current);

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollIntervalRef.current = 5000;
    };
  }, [activeOrderNo, fetchChatHistory, fetchGroupId]);

  // ---- Internal send (actual WS send) ----
  const doWsSend = useCallback((orderNo: string, content: string, type: 'text' | 'image') => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    try {
      const now = Date.now();
      const groupId = groupIdMapRef.current.get(orderNo);
      const isImage = type === 'image';
      const payload: Record<string, any> = {
        type,
        uuid: String(now),
        orderNo,
        content,
        contentType: isImage ? 'IMAGE' : 'TEXT',
        msgType: isImage ? 'U_IMAGE' : 'U_TEXT',
        self: true,
        clientType: 'web',
        createTime: now,
        sendStatus: 0,
        topicId: orderNo,
        topicType: 'ORDER',
      };
      if (isImage) {
        payload.imageUrl = content;
        payload.thumbnailUrl = content;
      }
      if (groupId) payload.groupId = groupId;

      ws.send(JSON.stringify(payload));

      pollIntervalRef.current = 1500;
      setTimeout(() => fetchChatHistory(orderNo), 1500);
      return true;
    } catch (err) {
      console.error('WS send error:', err);
      return false;
    }
  }, [fetchChatHistory]);

  // ---- Flush queued messages when WS connects ----
  const flushQueue = useCallback(() => {
    const queue = [...queueRef.current];
    if (queue.length === 0) return;

    const remaining: QueuedMessage[] = [];
    for (const msg of queue) {
      if (msg.orderNo === activeOrderRef.current) {
        const sent = doWsSend(msg.orderNo, msg.content, msg.type);
        if (sent) {
          // Sent over WS — keep optimistic bubble visible as 'sending'
          // until the server echo arrives via the chat history poll, which
          // removes it via the dedupe logic in fetchChatHistory.
          remaining.push({ ...msg, status: 'sending' });
        } else {
          remaining.push({ ...msg, retries: msg.retries + 1, status: 'queued' });
        }
      } else {
        remaining.push(msg); // Keep messages for other orders
      }
    }
    setQueuedMessages(remaining);

    const flushed = queue.filter(q =>
      q.orderNo === activeOrderRef.current &&
      remaining.find(r => r.tempId === q.tempId)?.status === 'sending'
    ).length - queue.filter(q => q.status === 'sending').length;
    if (flushed > 0) {
      toast.success(`${flushed} queued message(s) sent`);
    }
  }, [doWsSend]);

  // ---- Connect to WebSocket via relay ----
  const connect = useCallback(async () => {
    if (!shouldReconnectRef.current) return;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const credResult = await callBinanceAds('getChatCredential');
      const credData = credResult?.data?.data || credResult?.data || credResult;
      const relay: RelayInfo | undefined = credResult?.data?._relay || credResult?._relay;

      if (!credData?.chatWssUrl || !credData?.listenKey || !credData?.listenToken) {
        throw new Error('Invalid chat credentials received');
      }
      if (!relay?.relayUrl || !relay?.relayToken) {
        throw new Error('Relay info missing from getChatCredential response');
      }

      relayInfoRef.current = relay;

      const binanceTarget = `${credData.chatWssUrl}/${credData.listenKey}?token=${credData.listenToken}&clientType=web`;
      const wsUrl = `${relay.relayUrl}/?key=${encodeURIComponent(relay.relayToken)}&target=${encodeURIComponent(binanceTarget)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      connectTimeoutRef.current = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          setError('Connection timed out. Check relay server.');
          setIsConnecting(false);
          ws.close();
        }
      }, 10000);

      ws.onopen = () => {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Flush any queued messages
        setTimeout(() => flushQueue(), 500);
      };

      ws.onmessage = async (event) => {
        try {
          const rawData = await wsDataToString(event.data);

          if (!rawData || rawData.trim() === '{}' || rawData.trim() === '' || rawData === 'pong') return;

          const data = JSON.parse(rawData);

          if (typeof data === 'object' && data !== null && Object.keys(data).length === 0) return;
          if (data.type === 'pong' || data.e === 'pong') return;

          captureMetadata(data);

          if (data.type === 'error') {
            console.error('❌ Binance WS error:', data.content, '| Full frame:', JSON.stringify(data));
            return;
          }

          const isChatMessage = data.e === 'chat' || data.msgType === 'U_TEXT' || data.msgType === 'U_IMAGE' || data.type === 'text' || data.type === 'image' || data.type === 'system' || data.type === 'card' || (data.content && (data.orderNo || data.order?.orderNo) && (data.id || data.msgId));
          if (isChatMessage) {
            const msgOrderNo = data.orderNo || data.topicId || data.order?.orderNo;
            if (msgOrderNo && msgOrderNo !== activeOrderRef.current) {
              return;
            }

            const isSelfEcho = data.self === true || data.self === 'true';

            if (isSelfEcho) {
              pollIntervalRef.current = 2000;
              return;
            }

            pollIntervalRef.current = 500;
            if (activeOrderRef.current) {
              fetchChatHistory(activeOrderRef.current);
            }
          }

          if (data.scenario !== undefined && data.localId) {
            // confirmation frame
          }

          if (data.e === 'orderStatus' || data.type === 'orderStatusUpdate') {
            // order status update
          }
        } catch {
          // Unparseable — ignore
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection error');
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        setIsConnected(false);
        setIsConnecting(false);

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }

        if (!shouldReconnectRef.current) {
          return;
        }

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, delay);
        } else {
          setError('Max reconnection attempts reached. Please refresh.');
          setQueuedMessages(prev => prev.map(m => ({ ...m, retries: 99 })));
        }
      };


      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to connect WebSocket:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
      setIsConnecting(false);
    }
  }, [captureMetadata, flushQueue]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.close(1000, 'Component unmounted');
      }
    };
  }, [connect]);

  // Reset sessionId when order changes
  useEffect(() => {
    sessionIdRef.current = null;
  }, [activeOrderNo]);

  // ---- Send message (always optimistic; queue tracks delivery) ----
  // The message is ALWAYS added to `queuedMessages` first so the UI can show
  // an immediate optimistic bubble (with a small spinner). The bubble is
  // removed automatically once Binance echoes the message back via the
  // chat history poll (see dedupe logic in fetchChatHistory).
  const sendMessage = useCallback((orderNo: string, content: string) => {
    const id = tempIdCounter++;
    const ws = wsRef.current;
    const wsOpen = !!ws && ws.readyState === WebSocket.OPEN;
    let status: QueuedMessage['status'] = 'sending';
    if (wsOpen) {
      const sent = doWsSend(orderNo, content, 'text');
      if (!sent) {
        status = 'queued';
        toast.warning('Message queued — will retry when connection stabilizes');
      }
    } else {
      status = 'queued';
      toast.warning('Chat not connected — message queued for delivery');
    }
    setQueuedMessages(prev => [...prev, {
      tempId: id, orderNo, content, type: 'text', createdAt: Date.now(), retries: 0, status,
    }]);
  }, [doWsSend]);

  // ---- Send image (same optimistic pattern as text) ----
  const sendImageMessage = useCallback((orderNo: string, imageUrl: string) => {
    const id = tempIdCounter++;
    const ws = wsRef.current;
    const wsOpen = !!ws && ws.readyState === WebSocket.OPEN;
    let status: QueuedMessage['status'] = 'sending';
    if (wsOpen) {
      const sent = doWsSend(orderNo, imageUrl, 'image');
      if (!sent) {
        status = 'queued';
        toast.warning('Image queued — will retry when connection stabilizes');
      }
    } else {
      status = 'queued';
      toast.warning('Chat not connected — image queued for delivery');
    }
    setQueuedMessages(prev => [...prev, {
      tempId: id, orderNo, content: imageUrl, type: 'image', createdAt: Date.now(), retries: 0, status,
    }]);
  }, [doWsSend]);

  // ---- Manual retry for a failed message ----
  const retryMessage = useCallback((tempId: number) => {
    const msg = queueRef.current.find(m => m.tempId === tempId);
    if (!msg) return;

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const sent = doWsSend(msg.orderNo, msg.content, msg.type);
      if (sent) {
        // Move bubble to 'sending' — chat-history dedupe purges it once echoed.
        setQueuedMessages(prev => prev.map(m => m.tempId === tempId ? { ...m, status: 'sending' } : m));
        toast.success('Message resent');
      } else {
        toast.error('Still unable to send — will retry on reconnect');
      }
    } else {
      toast.error('Chat still not connected — message remains queued');
    }
  }, [doWsSend]);

  return { messages, isConnected, isConnecting, sendMessage, sendImageMessage, retryMessage, error, queuedMessages };
}
