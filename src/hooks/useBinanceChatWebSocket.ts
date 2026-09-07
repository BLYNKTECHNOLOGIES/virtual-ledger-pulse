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
  type: 'text' | 'image' | 'card';
  createdAt: number;
  retries: number;
  // 'sending' = handed to WS, awaiting server echo (optimistic bubble with spinner)
  // 'queued'  = retained for compatibility with messages queued by older sessions
  // 'failed'  = server/Binance did not verify delivery; requires manual retry
  status: 'sending' | 'queued' | 'failed';
}

interface UseBinanceChatWebSocketReturn {
  messages: TrackedMessage[];
  isConnected: boolean;
  isConnecting: boolean;
  sendMessage: (orderNo: string, content: string) => void;
  sendImageMessage: (orderNo: string, imageUrl: string) => void;
  sendAdCardMessage: (orderNo: string, cardJson: string) => void;
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

// ---- Module-level chat credential cache ----
// Reuse the getChatCredential result across opens/reconnects within its TTL to
// avoid a full round-trip (browser -> edge -> relay -> Binance) on every open.
// Binance listenKeys are valid ~60m; we refresh conservatively at 25m.
interface CachedCredential {
  credData: any;
  relay: RelayInfo;
  fetchedAt: number;
}
const CREDENTIAL_TTL_MS = 25 * 60 * 1000;
const credentialCache = new Map<string, CachedCredential>();

async function getCachedChatCredential(accountId: string | null): Promise<CachedCredential> {
  const cacheKey = accountId ?? '__default__';
  const cached = credentialCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CREDENTIAL_TTL_MS) {
    return cached;
  }

  const credResult = await callBinanceAds('getChatCredential', {}, accountId ?? undefined);
  const credData = credResult?.data?.data || credResult?.data || credResult;
  const relay: RelayInfo | undefined = credResult?.data?._relay || credResult?._relay;

  if (!credData?.chatWssUrl || !credData?.listenKey || !credData?.listenToken) {
    throw new Error('Invalid chat credentials received');
  }
  if (!relay?.relayUrl || !relay?.relayToken) {
    throw new Error('Relay info missing from getChatCredential response');
  }

  const entry: CachedCredential = { credData, relay, fetchedAt: Date.now() };
  credentialCache.set(cacheKey, entry);
  return entry;
}

/** Drop a cached credential so the next connect re-fetches (e.g. after a rejected listenKey). */
function invalidateChatCredential(accountId: string | null) {
  credentialCache.delete(accountId ?? '__default__');
}

/**
 * Prewarm chat credentials for the given accounts (call when the Orders page
 * loads). Fetches getChatCredential in the background and populates the module
 * cache, so opening a chat connects instantly instead of waiting on the
 * browser -> edge -> relay -> Binance round-trip. Failures are swallowed.
 */
export function prewarmChatCredentials(accountIds: (string | null)[]): void {
  for (const id of accountIds) {
    void getCachedChatCredential(id)
      .then(() => {
        // Open (and keep) the shared socket right away so the first chat click
        // finds a live connection instead of showing "Connecting…".
        acquireSocket(id);
      })
      .catch((err) => {
        console.warn('[Chat] credential prewarm failed:', err);
      });
  }
}

// ---- Module-level shared chat sockets (one per Binance account) ----
// The socket must OUTLIVE the chat panel: previously each open/close created and
// destroyed its own WebSocket, so every chat click paid a full
// credential + relay + Binance handshake ("Connecting…"). Now the socket is
// shared, reference-counted and kept warm after the last chat closes.
type FrameListener = (data: any) => void;
type StatusListener = (s: { isConnected: boolean; isConnecting: boolean; error: string | null }) => void;

interface SharedSocket {
  key: string;
  accountId: string | null;
  ws: WebSocket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  frameListeners: Set<FrameListener>;
  statusListeners: Set<StatusListener>;
  refs: number;
  reconnectAttempts: number;
  shouldReconnect: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connectTimeout: ReturnType<typeof setTimeout> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  onOpenHooks: Set<() => void>;
}

const MAX_RECONNECT_ATTEMPTS = 5;
// Keep an unused socket warm for a while so navigating between chats/orders
// never re-handshakes.
const IDLE_KEEPALIVE_MS = 15 * 60 * 1000;

const sharedSockets = new Map<string, SharedSocket>();

function socketKey(accountId: string | null) {
  return accountId ?? '__default__';
}

function getShared(accountId: string | null): SharedSocket {
  const key = socketKey(accountId);
  let s = sharedSockets.get(key);
  if (!s) {
    s = {
      key,
      accountId,
      ws: null,
      isConnected: false,
      isConnecting: false,
      error: null,
      frameListeners: new Set(),
      statusListeners: new Set(),
      refs: 0,
      reconnectAttempts: 0,
      shouldReconnect: true,
      reconnectTimer: null,
      connectTimeout: null,
      idleTimer: null,
      onOpenHooks: new Set(),
    };
    sharedSockets.set(key, s);
  }
  return s;
}

function emitStatus(s: SharedSocket) {
  const snapshot = { isConnected: s.isConnected, isConnecting: s.isConnecting, error: s.error };
  s.statusListeners.forEach((fn) => fn(snapshot));
}

async function openShared(s: SharedSocket) {
  if (!s.shouldReconnect) return;
  if (s.ws && (s.ws.readyState === WebSocket.OPEN || s.ws.readyState === WebSocket.CONNECTING)) return;
  if (s.reconnectTimer) {
    clearTimeout(s.reconnectTimer);
    s.reconnectTimer = null;
  }

  s.isConnecting = true;
  s.error = null;
  emitStatus(s);

  try {
    const { credData, relay } = await getCachedChatCredential(s.accountId);
    const binanceTarget = `${credData.chatWssUrl}/${credData.listenKey}?token=${credData.listenToken}&clientType=web`;
    const wsUrl = `${relay.relayUrl}/?key=${encodeURIComponent(relay.relayToken)}&target=${encodeURIComponent(binanceTarget)}`;

    const ws = new WebSocket(wsUrl);
    s.ws = ws;

    s.connectTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        s.error = 'Connection timed out. Check relay server.';
        s.isConnecting = false;
        emitStatus(s);
        ws.close();
      }
    }, 10000);

    ws.onopen = () => {
      if (s.connectTimeout) {
        clearTimeout(s.connectTimeout);
        s.connectTimeout = null;
      }
      s.isConnected = true;
      s.isConnecting = false;
      s.error = null;
      s.reconnectAttempts = 0;
      emitStatus(s);
      s.onOpenHooks.forEach((fn) => setTimeout(fn, 500));
    };

    ws.onmessage = async (event) => {
      try {
        const rawData = await wsDataToString(event.data);
        if (!rawData || rawData.trim() === '{}' || rawData.trim() === '' || rawData === 'pong') return;
        const data = JSON.parse(rawData);
        if (typeof data === 'object' && data !== null && Object.keys(data).length === 0) return;
        if (data.type === 'pong' || data.e === 'pong') return;
        s.frameListeners.forEach((fn) => fn(data));
      } catch {
        // Unparseable — ignore
      }
    };

    ws.onerror = () => {
      s.error = 'WebSocket connection error';
      s.isConnecting = false;
      emitStatus(s);
    };

    ws.onclose = () => {
      if (s.ws === ws) s.ws = null;
      s.isConnected = false;
      s.isConnecting = false;
      emitStatus(s);

      if (s.connectTimeout) {
        clearTimeout(s.connectTimeout);
        s.connectTimeout = null;
      }
      if (!s.shouldReconnect) return;

      if (s.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        s.reconnectAttempts++;
        invalidateChatCredential(s.accountId);
        const delay = Math.min(1000 * Math.pow(2, s.reconnectAttempts), 30000);
        s.reconnectTimer = setTimeout(() => {
          s.reconnectTimer = null;
          void openShared(s);
        }, delay);
      } else {
        s.error = 'Max reconnection attempts reached. Please refresh.';
        emitStatus(s);
      }
    };
  } catch (err) {
    console.error('Failed to connect chat WebSocket:', err);
    s.error = err instanceof Error ? err.message : 'Connection failed';
    s.isConnecting = false;
    emitStatus(s);
  }
}

/** Open (or keep) the shared socket for an account without subscribing. */
function acquireSocket(accountId: string | null): SharedSocket {
  const s = getShared(accountId);
  s.shouldReconnect = true;
  if (s.idleTimer) {
    clearTimeout(s.idleTimer);
    s.idleTimer = null;
  }
  if (!s.ws || s.ws.readyState > WebSocket.OPEN) {
    s.reconnectAttempts = 0;
    void openShared(s);
  }
  return s;
}

/** Prewarm the live chat socket for the given accounts (Orders page load). */
export function prewarmChatSockets(accountIds: (string | null)[]): void {
  for (const id of accountIds) acquireSocket(id);
}


// ---- Module-level per-order message cache ----
// Survives component unmount so reopening a chat paints the last-loaded
// messages instantly while the WS/REST refresh happens in the background.
const messageCache = new Map<string, TrackedMessage[]>();
const messageCacheKey = (orderNo: string, accountId: string | null) =>
  `${accountId ?? '__default__'}::${orderNo}`;

export function useBinanceChatWebSocket(
  activeOrderNo: string | null,
  accountId?: string | null
): UseBinanceChatWebSocketReturn {
  // The chat WebSocket + REST credentials MUST be scoped to the order's owning
  // Binance account. In multi-account / "All accounts" mode, omitting this makes
  // the proxy fall back to the primary account and stream a DIFFERENT order's chat.
  const accountIdRef = useRef<string | null>(accountId ?? null);
  accountIdRef.current = accountId ?? null;
  const [messages, setMessages] = useState<TrackedMessage[]>(
    () => (activeOrderNo ? messageCache.get(messageCacheKey(activeOrderNo, accountId ?? null)) ?? [] : [])
  );
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
      const result = await callBinanceAds('getChatGroupId', { orderNo }, accountIdRef.current ?? undefined);
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
        }, accountIdRef.current ?? undefined);
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

      // Defensive: the Binance getChatMessages endpoint occasionally returns
      // messages for a DIFFERENT (usually the most recent active) order. Drop
      // any message that explicitly carries a mismatching order number so a
      // foreign order's chat (and PAN/bank docs) can never render here.
      const belongsToOrder = allMessages.filter((msg) => {
        const msgOrderNo = msg.orderNo || msg.topicId || msg.order?.orderNo || null;
        return !msgOrderNo || String(msgOrderNo) === String(orderNo);
      });

      if (belongsToOrder.length > 0) {
        const seen = new Set<string>();
        const deduped = belongsToOrder.filter((msg) => {
          const key = String(msg.id || msg.uuid || `${msg.createTime}-${msg.type}-${msg.content || msg.message || ''}`);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        deduped.sort((a, b) => (a.createTime || 0) - (b.createTime || 0));

        if (activeOrderRef.current === orderNo) {
          setMessages(() => deduped);
          messageCache.set(messageCacheKey(orderNo, accountIdRef.current ?? null), deduped);

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
    // Restore instantly from the module cache (survives unmount) instead of
    // blanking the panel and waiting for the WS/REST refresh to arrive.
    setMessages(
      activeOrderNo ? messageCache.get(messageCacheKey(activeOrderNo, accountIdRef.current ?? null)) ?? [] : []
    );

    if (!activeOrderNo) return;


    // Let the fast cached/archived DB read (used by ChatPanel) win the browser's
    // limited connection pool and paint first. The slow Binance REST/credential
    // calls below would otherwise saturate the pool and delay the cached paint
    // by 1-2s. We start them a tick later as a pure background refresh.
    const kickoff = setTimeout(() => {
      if (activeOrderRef.current !== activeOrderNo) return;
      fetchGroupId(activeOrderNo);
      fetchChatHistory(activeOrderNo);
    }, 250);

    const poll = async () => {
      if (activeOrderRef.current !== activeOrderNo) return;
      // While the WebSocket is healthy it delivers new messages in real time;
      // the REST poll then only reconciles occasionally (30s) instead of
      // hammering Binance every few seconds per open chat.
      const wsHealthy = wsRef.current?.readyState === WebSocket.OPEN;
      if (wsHealthy) {
        pollIntervalRef.current = 30000;
      } else {
        await fetchChatHistory(activeOrderNo);
        pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.3, 30000);
      }
      pollTimerRef.current = setTimeout(poll, pollIntervalRef.current);
    };

    pollTimerRef.current = setTimeout(poll, pollIntervalRef.current + 250);

    return () => {
      clearTimeout(kickoff);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollIntervalRef.current = 5000;
    };
  }, [activeOrderNo, fetchChatHistory, fetchGroupId]);

  // ---- Server-side send (the only delivery path) ----
  // Binance allows one chat session per account and the always-on server
  // listener holds it, so the browser socket can be refused at any time.
  // Every send therefore goes through the edge function / proxy, which works
  // for any number of operators at once.
  const doServerSend = useCallback(
    async (tempId: number, orderNo: string, content: string, type: 'text' | 'image' | 'card') => {
      try {
        const payload = type === 'image'
          ? { orderNo, imageUrl: content }
          : { orderNo, content, contentType: type === 'card' ? 'CARD' : 'TEXT' };
        const res: any = await callBinanceAds('sendChatMessage', payload, accountIdRef.current ?? undefined);
        const body = res?.data ?? res;
        const ok = body?.success === true || body?.code === '000000';
        if (!ok) throw new Error(body?.error || body?.message || 'Binance rejected the message');
        setQueuedMessages(prev => prev.map(q => (q.tempId === tempId ? { ...q, status: 'sending' as const } : q)));
        pollIntervalRef.current = 1500;
        setTimeout(() => fetchChatHistory(orderNo), 1500);
        return true;
      } catch (err) {
        console.error('Server send failed:', err);
        setQueuedMessages(prev => prev.map(q => (q.tempId === tempId ? { ...q, status: 'failed' as const } : q)));
        toast.error(err instanceof Error ? err.message : 'Binance did not confirm delivery — tap retry.');
        return false;
      }
    },
    [fetchChatHistory],
  );

  // ---- Retry anything still undelivered when the socket (re)connects ----
  const flushQueue = useCallback(() => {
    const queue = [...queueRef.current];
    if (queue.length === 0) return;
    for (const msg of queue) {
      if (msg.orderNo === activeOrderRef.current && msg.status === 'queued') {
        void doServerSend(msg.tempId, msg.orderNo, msg.content, msg.type);
      }
    }
  }, [doServerSend]);



  // ---- Subscribe to the shared, always-warm socket for this account ----
  useEffect(() => {
    const s = acquireSocket(accountIdRef.current ?? null);
    s.refs++;

    const onStatus: StatusListener = (st) => {
      setIsConnected(st.isConnected);
      setIsConnecting(st.isConnecting);
      setError(st.error);
      wsRef.current = s.ws;
    };
    const onFrame: FrameListener = (data) => {
      captureMetadata(data);

      if (data.type === 'error') {
        console.error('❌ Binance WS error:', data.content, '| Full frame:', JSON.stringify(data));
        return;
      }

      const isChatMessage =
        data.e === 'chat' || data.msgType === 'U_TEXT' || data.msgType === 'U_IMAGE' ||
        data.type === 'text' || data.type === 'image' || data.type === 'system' || data.type === 'card' ||
        (data.content && (data.orderNo || data.order?.orderNo) && (data.id || data.msgId));
      if (!isChatMessage) return;

      const msgOrderNo = data.orderNo || data.topicId || data.order?.orderNo;
      if (msgOrderNo && msgOrderNo !== activeOrderRef.current) return;

      const isSelfEcho = data.self === true || data.self === 'true';
      if (isSelfEcho) {
        pollIntervalRef.current = 2000;
        return;
      }

      pollIntervalRef.current = 500;
      if (activeOrderRef.current) fetchChatHistory(activeOrderRef.current);
    };
    const onOpen = () => flushQueue();

    s.statusListeners.add(onStatus);
    s.frameListeners.add(onFrame);
    s.onOpenHooks.add(onOpen);

    // Paint the current shared state immediately (usually already connected).
    onStatus({ isConnected: s.isConnected, isConnecting: s.isConnecting, error: s.error });

    return () => {
      s.statusListeners.delete(onStatus);
      s.frameListeners.delete(onFrame);
      s.onOpenHooks.delete(onOpen);
      s.refs = Math.max(0, s.refs - 1);
      wsRef.current = null;
      // Keep the socket warm so reopening a chat is instant; close only after a
      // long idle period with nobody listening.
      if (s.refs === 0 && !s.idleTimer) {
        s.idleTimer = setTimeout(() => {
          s.idleTimer = null;
          if (s.refs > 0) return;
          s.shouldReconnect = false;
          if (s.reconnectTimer) clearTimeout(s.reconnectTimer);
          if (s.connectTimeout) clearTimeout(s.connectTimeout);
          s.ws?.close(1000, 'idle');
          s.ws = null;
          s.isConnected = false;
        }, IDLE_KEEPALIVE_MS);
      }
    };
  }, [accountId, captureMetadata, fetchChatHistory, flushQueue]);



  // Reset sessionId when order changes
  useEffect(() => {
    sessionIdRef.current = null;
  }, [activeOrderNo]);


  // ---- Send message (always optimistic; queue tracks delivery) ----
  // The message is ALWAYS added to `queuedMessages` first so the UI can show
  // an immediate optimistic bubble (with a small spinner). The bubble is
  // removed automatically once Binance echoes the message back via the
  // chat history poll (see dedupe logic in fetchChatHistory).
  // Delivery ALWAYS goes through the server (edge function -> proxy). Binance
  // allows one chat session per account, and the always-on server listener
  // holds it, so a browser socket can be refused at any moment and cannot be
  // trusted for delivery when several operators work in parallel. The socket
  // is used for live receive only.
  const sendMessage = useCallback((orderNo: string, content: string) => {
    const id = tempIdCounter++;
    setQueuedMessages(prev => [...prev, {
      tempId: id, orderNo, content, type: 'text', createdAt: Date.now(), retries: 0,
      status: 'sending' as const,
    }]);
    void doServerSend(id, orderNo, content, 'text');
  }, [doServerSend]);

  // ---- Send image (same optimistic pattern as text) ----
  const sendImageMessage = useCallback((orderNo: string, imageUrl: string) => {
    const id = tempIdCounter++;
    setQueuedMessages(prev => [...prev, {
      tempId: id, orderNo, content: imageUrl, type: 'image', createdAt: Date.now(), retries: 0,
      status: 'sending' as const,
    }]);
    void doServerSend(id, orderNo, imageUrl, 'image');
  }, [doServerSend]);



  // ---- Send a native Binance ad card ----
  // Mirrors Binance's own share-ad frame (type 'card', subType 'advertisement'),
  // so the counterparty receives the real tappable ad card, not text.
  const sendAdCardMessage = useCallback((orderNo: string, cardJson: string) => {
    const id = tempIdCounter++;
    setQueuedMessages(prev => [...prev, {
      tempId: id, orderNo, content: cardJson, type: 'card' as const, createdAt: Date.now(), retries: 0,
      status: 'sending' as const,
    }]);
    void doServerSend(id, orderNo, cardJson, 'card');
  }, [doServerSend]);

  // ---- Manual retry for a failed message ----
  const retryMessage = useCallback((tempId: number) => {
    const msg = queueRef.current.find(m => m.tempId === tempId);
    if (!msg) return;
    setQueuedMessages(prev => prev.map(m => m.tempId === tempId ? { ...m, status: 'sending' } : m));
    void doServerSend(tempId, msg.orderNo, msg.content, msg.type);

  }, [doServerSend]);


  return { messages, isConnected, isConnecting, sendMessage, sendImageMessage, sendAdCardMessage, retryMessage, error, queuedMessages };
}
