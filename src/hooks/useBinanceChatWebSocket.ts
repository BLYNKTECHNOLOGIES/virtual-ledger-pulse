import { useState, useEffect, useRef, useCallback } from 'react';
import { callBinanceAds, BinanceChatMessage } from './useBinanceActions';
import { toast } from 'sonner';

interface RelayInfo {
  relayUrl: string;
  relayToken: string;
}

type MessageStatus = 'sending' | 'sent' | 'failed';

interface TrackedMessage extends BinanceChatMessage {
  _status?: MessageStatus;
  _tempId?: number;
}

interface UseBinanceChatWebSocketReturn {
  messages: TrackedMessage[];
  isConnected: boolean;
  isConnecting: boolean;
  sendMessage: (orderNo: string, content: string) => void;
  error: string | null;
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

export function useBinanceChatWebSocket(
  activeOrderNo: string | null
): UseBinanceChatWebSocketReturn {
  const [messages, setMessages] = useState<TrackedMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const relayInfoRef = useRef<RelayInfo | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef(5000); // Start at 5s
  const maxReconnectAttempts = 5;

  // ---- Fetch chat history via REST ----
  const fetchChatHistory = useCallback(async (orderNo: string) => {
    try {
      const result = await callBinanceAds('getChatMessages', {
        orderNo,
        page: 1,
        rows: 50,
        sort: 'asc',
      });
      const list = result?.data?.data || result?.data || result?.list || [];
      if (Array.isArray(list) && list.length > 0) {
        setMessages((prev) => {
          // Merge server messages with any pending optimistic messages
          const pendingMsgs = prev.filter((m) => m._status === 'sending');
          const serverIds = new Set(list.map((m: BinanceChatMessage) => m.id));
          // Remove optimistic messages that now exist on server
          const remainingPending = pendingMsgs.filter((m) => !serverIds.has(m.id));
          return [...list, ...remainingPending];
        });
        pollIntervalRef.current = 5000; // Reset interval on new data
        return true; // had data
      }
      return false;
    } catch (err) {
      console.error('Failed to fetch chat history:', err);
      return false;
    }
  }, []);

  // ---- Polling loop for live updates ----
  useEffect(() => {
    if (!activeOrderNo) return;

    // Initial fetch
    fetchChatHistory(activeOrderNo);

    const poll = async () => {
      await fetchChatHistory(activeOrderNo);
      // Exponential backoff up to 30s
      pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.3, 30000);
      pollTimerRef.current = setTimeout(poll, pollIntervalRef.current);
    };

    pollTimerRef.current = setTimeout(poll, pollIntervalRef.current);

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollIntervalRef.current = 5000;
    };
  }, [activeOrderNo, fetchChatHistory]);

  // ---- Connect to WebSocket via relay (for real-time push) ----
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
      console.log('Connecting to Binance Chat via relay...');

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
        console.log('✅ Chat WebSocket connected via relay');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = async (event) => {
        try {
          const rawData = await wsDataToString(event.data);

          // Silently ignore heartbeat / empty / pong frames
          if (!rawData || rawData.trim() === '{}' || rawData.trim() === '' || rawData === 'pong') return;

          const data = JSON.parse(rawData);

          // Ignore empty objects (heartbeat frames forwarded by relay)
          if (typeof data === 'object' && data !== null && Object.keys(data).length === 0) return;
          if (data.type === 'pong' || data.e === 'pong') return;

          console.log('WS message received:', data);

          // Handle new chat message — also trigger a fast poll
          if (data.e === 'chat' || data.type === 'text' || data.type === 'image' || data.type === 'system' || data.type === 'card') {
            const msgId = Number(data.id || data.E) || Date.now();
            const newMsg: TrackedMessage = {
              id: msgId,
              type: data.type || data.chatMessageType || 'text',
              content: data.content || data.message || '',
              message: data.content || data.message || '',
              createTime: data.createTime || data.E || Date.now(),
              self: data.self === true || data.self === 'true',
              fromNickName: data.fromNickName || data.senderNickName || '',
              imageUrl: data.imageUrl,
              thumbnailUrl: data.thumbnailUrl,
            };

            setMessages((prev) => {
              const exists = prev.some((m) => m.id === newMsg.id);
              if (exists) return prev;
              return [...prev, newMsg];
            });

            // Reset poll interval for fast refresh after WS event
            pollIntervalRef.current = 3000;
          }

          if (data.e === 'orderStatus' || data.type === 'orderStatusUpdate') {
            console.log('Order status update via WS:', data);
          }
        } catch {
          // Truly unparseable — ignore silently
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection error');
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectTimerRef.current = setTimeout(() => connect(), delay);
        } else {
          setError('Max reconnection attempts reached. Please refresh.');
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to connect WebSocket:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
      setIsConnecting(false);
    }
  }, []);

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

  // ---- Send message: WS primary, REST fallback, with delivery tracking ----
  const sendMessage = useCallback(async (orderNo: string, content: string) => {
    const tempId = Date.now();
    const optimisticMsg: TrackedMessage = {
      id: tempId,
      type: 'text',
      content,
      message: content,
      createTime: Date.now(),
      self: true,
      fromNickName: 'You',
      _status: 'sending',
      _tempId: tempId,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const markStatus = (status: MessageStatus) => {
      setMessages((prev) =>
        prev.map((m) => (m._tempId === tempId ? { ...m, _status: status } : m))
      );
    };

    const markFailed = () => {
      markStatus('failed');
      toast.error('Message may not have been delivered');
    };

    const ws = wsRef.current;

    // Primary: send via WebSocket if connected
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        const messagePayload = {
          type: 'text',
          orderNo,
          content,
          uuid: generateUUID(),
          clientType: 'web',
        };
        ws.send(JSON.stringify(messagePayload));
        console.log('📤 Message sent via WebSocket:', content);
        markStatus('sent');

        // Trigger fast poll to confirm delivery
        pollIntervalRef.current = 2000;
        return;
      } catch (wsErr) {
        console.warn('WebSocket send failed, falling back to REST:', wsErr);
      }
    }

    // Fallback: send via REST API
    try {
      const result = await callBinanceAds('sendChatMessage', {
        orderNo,
        message: content,
        chatMessageType: 'text',
      });
      const code = result?.data?.code || result?.code;
      if (code && code !== '000000') {
        console.error('sendChatMessage REST fallback failed:', result);
        markFailed();
      } else {
        console.log('📤 Message sent via REST fallback:', content);
        markStatus('sent');
        pollIntervalRef.current = 2000;
      }
    } catch (err) {
      console.error('Failed to send message (REST fallback):', err);
      markFailed();
    }
  }, []);

  return { messages, isConnected, isConnecting, sendMessage, error };
}
