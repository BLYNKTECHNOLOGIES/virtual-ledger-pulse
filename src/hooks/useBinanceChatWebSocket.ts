import { useState, useEffect, useRef, useCallback } from 'react';
import { callBinanceAds, BinanceChatMessage } from './useBinanceActions';
import { toast } from 'sonner';

interface ChatCredentials {
  chatWssUrl: string;
  listenKey: string;
  listenToken: string;
}

interface WebSocketMessage {
  id: string;
  uuid: string;
  type: string;
  orderNo: string;
  content: string;
  status?: string;
  createTime: number;
  self?: boolean;
  fromNickName?: string;
  senderUserId?: number;
  receiverUserId?: number;
  imageUrl?: string;
  thumbnailUrl?: string;
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
  const credentialsRef = useRef<ChatCredentials | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxReconnectAttempts = 5;

  // Fetch initial messages via REST (for history), then switch to WS for real-time
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
        const list = result?.data || result?.list || [];
        if (Array.isArray(list)) {
          setMessages(list);
        }
      } catch (err) {
        console.error('Failed to fetch chat history:', err);
      }
    };
    
    fetchHistory();
  }, [activeOrderNo]);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    setIsConnecting(true);
    setError(null);
    
    try {
      // Get credentials
      const credResult = await callBinanceAds('getChatCredential');
      const credData = credResult?.data || credResult;
      
      if (!credData?.chatWssUrl || !credData?.listenKey || !credData?.listenToken) {
        throw new Error('Invalid chat credentials received');
      }
      
      credentialsRef.current = {
        chatWssUrl: credData.chatWssUrl,
        listenKey: credData.listenKey,
        listenToken: credData.listenToken,
      };
      
      const wsUrl = `${credData.chatWssUrl}/${credData.listenKey}?token=${credData.listenToken}&clientType=web`;
      console.log('Connecting to Binance Chat WebSocket...');
      
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('✅ Binance Chat WebSocket connected');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // Start ping to keep connection alive (every 30s)
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WS message received:', data);
          
          // Handle pong
          if (data.type === 'pong' || data.e === 'pong') return;
          
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
              // Deduplicate by id
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
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        // Attempt reconnect
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

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Send message via WebSocket
  const sendMessage = useCallback((orderNo: string, content: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Chat not connected. Retrying...');
      connect();
      return;
    }
    
    const messagePayload = {
      type: 'text',
      orderNo,
      content,
      uuid: generateUUID(),
      clientType: 'web',
    };
    
    try {
      ws.send(JSON.stringify(messagePayload));
      console.log('📤 Message sent via WebSocket:', content);
      
      // Optimistically add to local messages
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
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to send message');
    }
  }, [connect]);

  return { messages, isConnected, isConnecting, sendMessage, error };
}
