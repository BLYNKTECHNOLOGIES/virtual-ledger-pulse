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
  sendImageMessage: (orderNo: string, imageUrl: string) => void;
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

  // Track the active order in a ref so WS callbacks always see the current value
  const activeOrderRef = useRef<string | null>(activeOrderNo);
  activeOrderRef.current = activeOrderNo;

  const wsRef = useRef<WebSocket | null>(null);
  const relayInfoRef = useRef<RelayInfo | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const groupIdMapRef = useRef<Map<string, string>>(new Map()); // orderNo → groupId
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef(5000);
  const maxReconnectAttempts = 5;

  // Helper to capture sessionId and groupId from any frame
  const captureMetadata = useCallback((data: any) => {
    if (data.sessionId && !sessionIdRef.current) {
      sessionIdRef.current = data.sessionId;
      console.log('✅ Captured sessionId:', sessionIdRef.current);
    }
    // Capture groupId from any field that might contain it
    const gid = data.groupId || data.chatGroupId || data.threadId;
    const orderKey = data.orderNo || data.topicId;
    if (gid && orderKey) {
      if (!groupIdMapRef.current.has(orderKey)) {
        console.log('✅ Captured groupId:', gid, 'for order:', orderKey);
      }
      groupIdMapRef.current.set(orderKey, gid);
    }
  }, []);

  // ---- Pre-fetch groupId for an order (so we can send before receiving) ----
  const fetchGroupId = useCallback(async (orderNo: string) => {
    if (groupIdMapRef.current.has(orderNo)) return; // Already have it
    try {
      console.log('🔍 Pre-fetching groupId for order:', orderNo);
      const result = await callBinanceAds('getChatGroupId', { orderNo });
      const data = result?.data?.data || result?.data || result;
      // Try to extract groupId from response
      const gid = data?.groupId || data?.chatGroupId;
      if (gid) {
        groupIdMapRef.current.set(orderNo, gid);
        console.log('✅ Pre-fetched groupId:', gid, 'for order:', orderNo);
      } else {
        // Try from group list if returned as array
        const groups = data?.groups || data?.list || (Array.isArray(data) ? data : []);
        for (const g of groups) {
          const id = g?.groupId || g?.chatGroupId;
          const topic = g?.topicId || g?.orderNo;
          if (id && (!topic || topic === orderNo)) {
            groupIdMapRef.current.set(orderNo, id);
            console.log('✅ Pre-fetched groupId from list:', id, 'for order:', orderNo);
            break;
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not pre-fetch groupId:', err);
    }
  }, []);

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
      // Capture groupId from REST response metadata or individual messages
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
        // CRITICAL: Only update messages if this order is still the active one
        if (activeOrderRef.current === orderNo) {
          setMessages(() => [...list]);
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
    // Immediately clear stale messages from previous order
    setMessages([]);

    if (!activeOrderNo) return;

    // Pre-fetch groupId so we can send messages even before receiving any
    fetchGroupId(activeOrderNo);
    fetchChatHistory(activeOrderNo);

    const poll = async () => {
      // Guard: only poll if this order is still active
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

        // Use WebSocket protocol-level ping instead of text frame
        // The relay already handles WS pings/pongs natively
        // No manual ping needed - relay.js bridges protocol pings
      };

      ws.onmessage = async (event) => {
        try {
          const rawData = await wsDataToString(event.data);

          if (!rawData || rawData.trim() === '{}' || rawData.trim() === '' || rawData === 'pong') return;

          const data = JSON.parse(rawData);

          if (typeof data === 'object' && data !== null && Object.keys(data).length === 0) return;
          if (data.type === 'pong' || data.e === 'pong') return;

          // Always try to capture metadata from ANY frame
          captureMetadata(data);

          // Log all frames with full detail for debugging
          console.log('WS message received:', JSON.stringify(data).substring(0, 500));
          
          // Skip error frames (don't add to messages list)
          if (data.type === 'error') {
            console.error('❌ Binance WS error:', data.content, '| Full frame:', JSON.stringify(data));
            return;
          }

          // Handle new chat message
          const isChatMessage = data.e === 'chat' || data.msgType === 'U_TEXT' || data.msgType === 'U_IMAGE' || data.type === 'text' || data.type === 'image' || data.type === 'system' || data.type === 'card' || (data.content && (data.orderNo || data.order?.orderNo) && (data.id || data.msgId));
          if (isChatMessage) {
            // CRITICAL: Only process messages belonging to the currently active order
            const msgOrderNo = data.orderNo || data.topicId || data.order?.orderNo;
            if (msgOrderNo && msgOrderNo !== activeOrderRef.current) {
              console.log('⏭️ Skipping WS message for different order:', msgOrderNo, '(active:', activeOrderRef.current, ')');
              return;
            }

            const isSelfEcho = data.self === true || data.self === 'true';

            // Skip WS echoes of our own messages — the poll already covers it
            if (isSelfEcho) {
              pollIntervalRef.current = 2000;
              return;
            }

            const msgId = Number(data.id || data.msgId || data.E) || Date.now();
            const newMsg: TrackedMessage = {
              id: msgId,
              type: data.type || data.msgType === 'U_TEXT' ? 'text' : data.msgType === 'U_IMAGE' ? 'image' : (data.chatMessageType || 'text'),
              content: data.content || data.message || '',
              message: data.content || data.message || '',
              createTime: data.createTime || data.timestamp || data.E || Date.now(),
              self: false,
              fromNickName: data.fromNickName || data.senderNickName || '',
              imageUrl: data.imageUrl,
              thumbnailUrl: data.thumbnailUrl,
            };

            setMessages((prev) => {
              const exists = prev.some((m) => m.id === newMsg.id);
              if (exists) return prev;
              return [...prev, newMsg];
            });

            pollIntervalRef.current = 3000;
          }

          // Capture sessionId from confirmation frames
          if (data.scenario !== undefined && data.localId) {
            console.log('📨 Message confirmed by Binance, msgId:', data.msgId);
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
  }, [captureMetadata]);

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

  // ---- Send message via WebSocket ----
  const sendMessage = useCallback(async (orderNo: string, content: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Chat not connected');
      return;
    }

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
      console.log('📤 WS sent:', content.substring(0, 50));

      // Fast poll to pick up confirmed message from server
      pollIntervalRef.current = 1500;
      setTimeout(() => fetchChatHistory(orderNo), 1500);
    } catch (err) {
      console.error('WS send error:', err);
      toast.error('Message may not have been delivered');
    }
  }, [fetchChatHistory]);

  // ---- Send image message via WebSocket ----
  const sendImageMessage = useCallback(async (orderNo: string, imageUrl: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Chat not connected');
      return;
    }

    try {
      const now = Date.now();
      const groupId = groupIdMapRef.current.get(orderNo);
      const imgPayload: Record<string, any> = {
        type: 'text',
        uuid: String(now),
        orderNo,
        content: imageUrl,
        self: true,
        clientType: 'web',
        createTime: now,
        sendStatus: 0,
        topicId: orderNo,
        topicType: 'ORDER',
      };
      if (groupId) imgPayload.groupId = groupId;

      ws.send(JSON.stringify(imgPayload));
      console.log('📤 WS sent image link');

      pollIntervalRef.current = 1500;
      setTimeout(() => fetchChatHistory(orderNo), 1500);
    } catch (err) {
      console.error('WS image send error:', err);
      toast.error('Image may not have been delivered');
    }
  }, [fetchChatHistory]);

  return { messages, isConnected, isConnecting, sendMessage, sendImageMessage, error };
}
