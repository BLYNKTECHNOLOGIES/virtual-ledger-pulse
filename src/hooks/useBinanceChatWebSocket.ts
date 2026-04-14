import { useState, useEffect, useRef, useCallback } from 'react';
import { callBinanceAds, BinanceChatMessage } from './useBinanceActions';
import { toast } from 'sonner';

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
        const list = result?.data?.data || result?.data || result?.list || [];
        const restGroupId = result?.data?.groupId || result?.groupId;
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
        const seen = new Set<number>();
        const deduped = allMessages.filter((msg) => {
          if (seen.has(msg.id)) return false;
          seen.add(msg.id);
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
      const payload: Record<string, any> = {
        type: 'text',
        uuid: String(now),
        orderNo,
        content,
        self: true,
        clientType: 'web',
        createTime: now,
        sendStatus: 0,
        topicId: orderNo,
        topicType: 'ORDER',
      };
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
        if (!sent) {
          remaining.push({ ...msg, retries: msg.retries + 1 });
        }
        // If sent, it'll be removed once confirmed via REST poll
      } else {
        remaining.push(msg); // Keep messages for other orders
      }
    }
    setQueuedMessages(remaining);

    if (queue.length > remaining.length) {
      toast.success(`${queue.length - remaining.length} queued message(s) sent`);
    }
  }, [doWsSend]);

  // ---- Connect to WebSocket via relay ----
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

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

      const connectTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          setError('Connection timed out. Check relay server.');
          setIsConnecting(false);
          ws.close();
        }
      }, 10000);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
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
        setIsConnected(false);
        isConnectedRef.current = false;
        setIsConnecting(false);

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Mark all sending messages as queued since connection dropped
        setQueuedMessages(prev => [...prev]);

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectTimerRef.current = setTimeout(() => connect(), delay);
        } else {
          setError('Max reconnection attempts reached. Please refresh.');
          // Mark remaining queued messages as failed
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
    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Reset sessionId when order changes
  useEffect(() => {
    sessionIdRef.current = null;
  }, [activeOrderNo]);

  // ---- Send message (with queue fallback) ----
  const sendMessage = useCallback((orderNo: string, content: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const sent = doWsSend(orderNo, content, 'text');
      if (!sent) {
        // WS open but send failed — queue it
        const id = tempIdCounter++;
        setQueuedMessages(prev => [...prev, { tempId: id, orderNo, content, type: 'text', createdAt: Date.now(), retries: 0 }]);
        toast.warning('Message queued — will retry when connection stabilizes');
      }
    } else {
      // WS not connected — queue the message
      const id = tempIdCounter++;
      setQueuedMessages(prev => [...prev, { tempId: id, orderNo, content, type: 'text', createdAt: Date.now(), retries: 0 }]);
      toast.warning('Chat not connected — message queued for delivery');
    }
  }, [doWsSend]);

  // ---- Send image (with queue fallback) ----
  const sendImageMessage = useCallback((orderNo: string, imageUrl: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const sent = doWsSend(orderNo, imageUrl, 'image');
      if (!sent) {
        const id = tempIdCounter++;
        setQueuedMessages(prev => [...prev, { tempId: id, orderNo, content: imageUrl, type: 'image', createdAt: Date.now(), retries: 0 }]);
        toast.warning('Image queued — will retry when connection stabilizes');
      }
    } else {
      const id = tempIdCounter++;
      setQueuedMessages(prev => [...prev, { tempId: id, orderNo, content: imageUrl, type: 'image', createdAt: Date.now(), retries: 0 }]);
      toast.warning('Chat not connected — image queued for delivery');
    }
  }, [doWsSend]);

  // ---- Manual retry for a failed message ----
  const retryMessage = useCallback((tempId: number) => {
    const msg = queueRef.current.find(m => m.tempId === tempId);
    if (!msg) return;

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const sent = doWsSend(msg.orderNo, msg.content, msg.type);
      if (sent) {
        setQueuedMessages(prev => prev.filter(m => m.tempId !== tempId));
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
