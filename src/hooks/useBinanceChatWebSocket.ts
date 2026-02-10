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
        console.log('✅ Captured groupId from REST:', restGroupId, 'for order:', orderNo);
      }
      if (Array.isArray(list) && list.length > 0) {
        // Try to capture groupId from any message in the list
        for (const msg of list) {
          if (msg.groupId && orderNo && !groupIdMapRef.current.has(orderNo)) {
            groupIdMapRef.current.set(orderNo, msg.groupId);
            console.log('✅ Captured groupId from chat message:', msg.groupId, 'for order:', orderNo);
            break;
          }
        }
        setMessages((prev) => {
          // Keep optimistic messages that haven't been confirmed by server yet
          const pendingMsgs = prev.filter((m) => m._status === 'sending' || m._status === 'sent');
          const serverIds = new Set(list.map((m: BinanceChatMessage) => m.id));
          const remainingPending = pendingMsgs.filter((m) => !serverIds.has(m.id));
          return [...list, ...remainingPending];
        });
        pollIntervalRef.current = 5000;
        return true;
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

    fetchChatHistory(activeOrderNo);

    const poll = async () => {
      await fetchChatHistory(activeOrderNo);
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
            const msgId = Number(data.id || data.msgId || data.E) || Date.now();
            const newMsg: TrackedMessage = {
              id: msgId,
              type: data.type || data.msgType === 'U_TEXT' ? 'text' : data.msgType === 'U_IMAGE' ? 'image' : (data.chatMessageType || 'text'),
              content: data.content || data.message || '',
              message: data.content || data.message || '',
              createTime: data.createTime || data.timestamp || data.E || Date.now(),
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

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      markStatus('failed');
      toast.error('Chat not connected');
      return;
    }

    try {
      const now = Date.now();

      // Payload per Binance doc: type, uuid, orderNo, content, self, clientType, createTime, sendStatus
      const payload = {
        type: 'text',
        uuid: String(now),
        orderNo,
        content,
        self: true,
        clientType: 'web',
        createTime: now,
        sendStatus: 0,
      };

      const payloadStr = JSON.stringify(payload);
      console.log('📤 WS send payload:', payloadStr);
      ws.send(payloadStr);
      markStatus('sent');

      // Immediately poll to verify delivery after 2s
      pollIntervalRef.current = 2000;
      setTimeout(() => {
        fetchChatHistory(orderNo).then((found) => {
          if (found) {
            console.log('✅ Post-send poll: chat history refreshed');
          }
        });
      }, 2000);
    } catch (err) {
      console.error('WS send error:', err);
      markStatus('failed');
      toast.error('Message may not have been delivered');
    }
  }, [fetchChatHistory]);

  // ---- Send image message via WebSocket ----
  const sendImageMessage = useCallback(async (orderNo: string, imageUrl: string) => {
    const tempId = Date.now();
    const optimisticMsg: TrackedMessage = {
      id: tempId,
      type: 'image',
      content: imageUrl,
      message: imageUrl,
      createTime: Date.now(),
      self: true,
      fromNickName: 'You',
      imageUrl,
      _status: 'sending',
      _tempId: tempId,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const markStatus = (status: MessageStatus) => {
      setMessages((prev) =>
        prev.map((m) => (m._tempId === tempId ? { ...m, _status: status } : m))
      );
    };

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      markStatus('failed');
      toast.error('Chat not connected');
      return;
    }

    try {
      const now = Date.now();

      // Per Binance doc: "send the corresponding imageUrl in p2p chat"
      // Use exact same format as text messages — doc only shows this format
      // The imageUrl goes in the "content" field
      const imgPayload = {
        type: 'text',
        uuid: String(now),
        orderNo,
        content: imageUrl,
        self: true,
        clientType: 'web',
        createTime: now,
        sendStatus: 0,
      };

      const payloadStr = JSON.stringify(imgPayload);
      console.log('📤 WS send image payload (as text):', payloadStr);
      ws.send(payloadStr);
      markStatus('sent');

      pollIntervalRef.current = 2000;
      setTimeout(() => {
        fetchChatHistory(orderNo);
      }, 2000);
    } catch (err) {
      console.error('WS image send error:', err);
      markStatus('failed');
      toast.error('Image may not have been delivered');
    }
  }, [fetchChatHistory]);

  return { messages, isConnected, isConnecting, sendMessage, sendImageMessage, error };
}
