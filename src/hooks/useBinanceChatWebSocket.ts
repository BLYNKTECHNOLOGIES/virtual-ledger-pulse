import { useState, useEffect, useRef, useCallback } from 'react';
import { callBinanceAds, BinanceChatMessage } from './useBinanceActions';
import { toast } from 'sonner';

interface RelayInfo {
  relayUrl: string;
  relayToken: string;
}

interface UseBinanceChatWebSocketReturn {
  messages: BinanceChatMessage[];
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

export function useBinanceChatWebSocket(
  activeOrderNo: string | null
): UseBinanceChatWebSocketReturn {
  const [messages, setMessages] = useState<BinanceChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const relayInfoRef = useRef<RelayInfo | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxReconnectAttempts = 5;

  // Fetch chat history via REST on order change
  useEffect(() => {
    if (!activeOrderNo) return;

    const fetchHistory = async () => {
      try {
        const result = await callBinanceAds('getChatMessages', {
          orderNo: activeOrderNo,
          page: 1,
          rows: 50,
          sort: 'asc',
        });
        // Response shape: { data: { code, data: [...messages], ... } }
        const list = result?.data?.data || result?.data || result?.list || [];
        if (Array.isArray(list)) {
          setMessages(list);
        }
      } catch (err) {
        console.error('Failed to fetch chat history:', err);
      }
    };

    fetchHistory();
  }, [activeOrderNo]);

  // Connect to WebSocket via relay
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setIsConnecting(true);
    setError(null);

    try {
      // Get credentials + relay info from edge function
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

      // Build the Binance target URL
      const binanceTarget = `${credData.chatWssUrl}/${credData.listenKey}?token=${credData.listenToken}&clientType=web`;

      // Connect through relay instead of directly to Binance
      const wsUrl = `${relay.relayUrl}/?key=${encodeURIComponent(relay.relayToken)}&target=${encodeURIComponent(binanceTarget)}`;
      console.log('Connecting to Binance Chat via relay...');

      const ws = new WebSocket(wsUrl);

      // Timeout if connection doesn't open within 10s
      const connectTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.error('WebSocket connection timed out after 10s');
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

        // Keepalive ping every 30s
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const rawData = event.data;
          // Silently ignore empty or heartbeat frames
          if (!rawData || rawData === '{}' || rawData === 'pong') return;
          
          const data = JSON.parse(rawData);
          
          // Ignore empty objects (heartbeat frames forwarded by relay)
          if (typeof data === 'object' && data !== null && Object.keys(data).length === 0) return;

          // Handle pong
          if (data.type === 'pong' || data.e === 'pong') return;

          console.log('WS message received:', data);

          // Handle new chat message
          if (data.e === 'chat' || data.type === 'text' || data.type === 'image' || data.type === 'system' || data.type === 'card') {
            const msgId = Number(data.id || data.E) || Date.now();
            const newMsg: BinanceChatMessage = {
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
          }

          // Handle order status updates
          if (data.e === 'orderStatus' || data.type === 'orderStatusUpdate') {
            console.log('Order status update via WS:', data);
          }
        } catch (err) {
          console.warn('Failed to parse WS message:', event.data);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
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

        // Reconnect with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})...`);
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

  // Send message via REST API (Binance WS is receive-only for chat)
  const sendMessage = useCallback(async (orderNo: string, content: string) => {
    // Optimistically add to local messages immediately
    const optimisticMsg: BinanceChatMessage = {
      id: Date.now(),
      type: 'text',
      content,
      message: content,
      createTime: Date.now(),
      self: true,
      fromNickName: 'You',
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const result = await callBinanceAds('sendChatMessage', {
        orderNo,
        message: content,
        chatMessageType: 'text',
      });
      const code = result?.data?.code || result?.code;
      if (code && code !== '000000') {
        console.error('sendChatMessage failed:', result);
        toast.error('Message may not have been delivered');
      } else {
        console.log('📤 Message sent via REST API:', content);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to send message');
    }
  }, []);

  return { messages, isConnected, isConnecting, sendMessage, error };
}
