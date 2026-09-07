import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Badge } from '@/components/ui/badge';
import { Send, MessageSquare, Loader2, Volume2, VolumeX, Wifi, Cloud, History } from 'lucide-react';
import { useBinanceChatWebSocket } from '@/hooks/useBinanceChatWebSocket';
import { useArchivedBinanceChatMessages } from '@/hooks/useBinanceActions';
import { useCounterpartyChatHistory } from '@/hooks/useCounterpartyChatHistory';
import { useChatMessageSenders } from '@/hooks/useChatMessageSenders';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { ChatBubble, UnifiedMessage } from './chat/ChatBubble';
import { isCardPayload } from './chat/ChatAdCard';
import { ChatImageUpload } from './chat/ChatImageUpload';
import { AttachAdPicker } from './chat/AttachAdPicker';
import { QuickReplyBar } from './chat/QuickReplyBar';
import { CopilotStrip } from './chat/CopilotStrip';
import {
  useCopilotVisible, useCopilotPrefetch, useCopilotIsTrainer, copilotTeach,
  type CopilotSuggestInput,
} from '@/hooks/useCopilot';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import { useQuickReplies } from '@/hooks/useP2PTerminal';
import { subscribeQuickReplyHotkey } from '@/hooks/useTerminalHotkeys';
import { OrderChatSeparator } from './chat/OrderChatSeparator';
import { playMessageSound } from '@/lib/chatSound';
import { toast } from 'sonner';
import { callBinanceAds } from '@/hooks/useBinanceActions';
import { markOrderChatRead } from '@/lib/chat-read-state';
import { supabase } from '@/integrations/supabase/client';
import { useChatSeenSnapshot, seenLabel } from '@/hooks/useChatSeenBy';
import { fillTemplate, type TemplateOrderValues } from '@/lib/fill-template';
import { useNewerCounterpartyOrder } from '@/hooks/useNewerCounterpartyOrder';


interface Props {
  orderId: string;
  orderNumber: string;
  counterpartyId: string | null;
  counterpartyNickname: string;
  tradeType?: string;
  counterpartyVerifiedName?: string;
  exchangeAccountId?: string | null;
  /** Current order status (numeric code or text) — drives copilot goal conditioning. */
  orderStatus?: string | null;
  /** Live order values used to fill quick-reply template tokens at insert time. */
  templateValues?: TemplateOrderValues;
}

// Binance timestamps can arrive as either epoch seconds or milliseconds.
// Normalize before combining messages from different order threads so one
// source cannot be sorted into the wrong position in the merged timeline.
function normalizeChatTimestamp(value: unknown): number {
  const timestamp = Number(value || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

export function ChatPanel({ orderId, orderNumber: openedOrderNumber, counterpartyId, counterpartyNickname, tradeType, counterpartyVerifiedName, exchangeAccountId, orderStatus, templateValues }: Props) {
  // ONE THREAD PER COUNTERPARTY.
  // Binance chat is order-scoped: a counterparty's newest messages land in
  // their newest order. When the operator opens an older order we silently
  // anchor the live thread to that newest order, so incoming messages and
  // replies stay in a single conversation; the older order's chat still shows
  // above it as history.
  const { data: newerOrder } = useNewerCounterpartyOrder(openedOrderNumber, exchangeAccountId);
  const orderNumber = newerOrder?.orderNumber ?? openedOrderNumber;
  // Chats Binance delivers without an order behind them (ad enquiries).
  // Binance's documented send endpoint requires an order number, so replying
  // to these from the terminal is not supported.
  const isEnquiryThread = orderNumber.startsWith('INQ-');
  const { messages: wsMessages, isConnected, isConnecting, sendMessage: wsSendMessage, sendImageMessage: wsSendImage, sendAdCardMessage: wsSendAdCard, retryMessage, error: wsError, queuedMessages } = useBinanceChatWebSocket(orderNumber, exchangeAccountId);
  const { data: archivedMessages = [], isLoading: archivedLoading } = useArchivedBinanceChatMessages(orderNumber, exchangeAccountId);
  const { historicalChats, isLoading: historyLoading, hasMore, loadMore } = useCounterpartyChatHistory(counterpartyNickname, orderNumber, counterpartyVerifiedName, exchangeAccountId);
  const { logSender, prefetchSenders, getSenderName } = useChatMessageSenders();
  const { userId, username } = useTerminalAuth();
  const [text, setText] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('terminal-chat-sound');
    return saved !== 'false';
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const prevBinanceIdsRef = useRef<Set<number>>(new Set());
  const isInitialLoadRef = useRef(true);
  const shouldAutoScrollRef = useRef(true);
  const prevScrollHeightRef = useRef(0);

  // Mark this order's chat as read locally so ChatInbox clears the unread badge.
  // The local mark is instant; the Binance write and archive sync are deferred
  // ~500ms after paint so they don't compete with the initial message fetch for
  // the browser's connection pool.
  useEffect(() => {
    if (!orderNumber) return;
    markOrderChatRead(orderNumber);

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      // Shared team read state: records who opened this chat and when (IST shown in UI).
      supabase.rpc('mark_terminal_binance_chat_read', { p_order_number: orderNumber }).then(({ error }) => {
        if (error) console.warn('Failed to record team chat read:', error.message);
      });
      callBinanceAds('markOrderMessagesRead', { orderNo: orderNumber }, exchangeAccountId ?? undefined).catch((err) => {
        console.warn('Failed to mark Binance chat read:', err);
      });
      // Also mark ALL chats with this counterparty user as read (Binance API §38)
      // so stale unread badges on their other orders clear too.
      callBinanceAds('markUserMessagesRead', { orderNo: orderNumber }, exchangeAccountId ?? undefined).catch((err) => {
        console.warn('Failed to mark counterparty user chats read:', err);
      });
      callBinanceAds('syncOrderChatMessages', { orderNo: orderNumber, rows: 50, maxPages: 5, sort: 'asc' }, exchangeAccountId ?? undefined)
        .catch((err) => {
          if (!cancelled) console.warn('Binance chat archive sync failed:', err);
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderNumber, exchangeAccountId]);

  // Who on the team last opened this chat (captured before our own read is written).
  const previousSeen = useChatSeenSnapshot(orderNumber);
  const previousSeenLabel = seenLabel(previousSeen);


  useEffect(() => {
    localStorage.setItem('terminal-chat-sound', String(soundEnabled));
  }, [soundEnabled]);

  // Helper: detect if text content is actually an image URL
  const isImageUrl = useCallback((text: string | undefined | null): boolean => {
    if (!text) return false;
    const trimmed = text.trim();
    return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(trimmed) ||
           /^https?:\/\/.*bnbstatic\.com\/.*\/(client_upload|chat)\//i.test(trimmed);
  }, []);

  // Prefetch sender records for current order + historical orders
  useEffect(() => {
    const orderNos = [orderNumber, ...historicalChats.map(h => h.orderNumber)];
    prefetchSenders(orderNos);
  }, [orderNumber, historicalChats, prefetchSenders]);

  // Build unified messages from WebSocket data (current order)
  const currentOrderMessages: UnifiedMessage[] = useMemo(() => {
    const messages: UnifiedMessage[] = [];
    const liveIds = new Set(wsMessages.map((msg) => String(msg.id || msg.uuid || '')));
    for (const msg of archivedMessages) {
      const archivedId = String(msg.binance_message_id || msg.binance_uuid || msg.dedupe_key || msg.id);
      if (liveIds.has(archivedId)) continue;
      const msgType = String(msg.message_type || msg.chat_message_type || msg.content_type || 'unknown').toLowerCase();
      const isImage = msgType === 'image' || isImageUrl(msg.message_text);
      const isSharedAd = isCardPayload(msg.message_text);
      const isSystemLike = !isSharedAd && (msg.is_system_message || msg.is_recall || msg.is_compliance_relevant || ['system', 'recall', 'mark', 'card', 'video', 'translate', 'error'].includes(msgType));
      messages.push({
        id: `archive-${msg.id}`,
        source: 'binance',
        senderType: isSystemLike ? 'system' : (msg.sender_is_self ? 'operator' : 'counterparty'),
        text: isImage ? null : (msg.message_text || null),
        imageUrl: isImage ? (msg.image_url || msg.thumbnail_url || msg.message_text || undefined) : (msg.image_url || msg.thumbnail_url || undefined),
        timestamp: normalizeChatTimestamp(msg.binance_create_time),
        senderName: msg.sender_is_self ? getSenderName(orderNumber, msg.message_text || '') : msg.sender_nickname,
        messageType: msgType,
        isRecall: msg.is_recall,
        isComplianceRelevant: msg.is_compliance_relevant,
      });
    }
    for (const msg of wsMessages) {
      const msgType = msg.type || msg.chatMessageType || 'text';
      const isSelf = msg.self === true;
      const content = msg.content || msg.message || '';
      const isImage = msgType === 'image' || isImageUrl(content);
      const isSharedAd = isCardPayload(content);
      const isSystemLike = !isSharedAd && (msgType === 'system' || ['recall', 'mark', 'card', 'video', 'translate', 'error'].includes(String(msgType).toLowerCase()));
      const imgUrl = msg.imageUrl || msg.thumbnailUrl || undefined;
      messages.push({
        id: `binance-${msg.id}`,
        source: 'binance',
        senderType: isSystemLike ? 'system' : (isSelf ? 'operator' : 'counterparty'),
        text: isImage ? null : (content || null),
        imageUrl: isImage ? (imgUrl || content || undefined) : imgUrl,
        timestamp: normalizeChatTimestamp(msg.createTime),
        senderName: isSelf ? getSenderName(orderNumber, content) : null,
        messageType: msgType,
        isRecall: String(msgType).toLowerCase() === 'recall',
        isComplianceRelevant: ['system', 'recall', 'mark', 'card', 'video', 'translate', 'error'].includes(String(msgType).toLowerCase()),
      });
    }

    // Append queued messages (not yet confirmed by server)
    // status: 'sending' = handed to WS, awaiting echo (spinner)
    //         'queued'  = WS down, will retry on reconnect (clock icon)
    //         'failed'  = retry budget exceeded, manual retry button
    const MAX_QUEUE_RETRIES = 3;
    for (const qm of queuedMessages) {
      if (qm.orderNo !== orderNumber) continue;
      const isFailed = qm.status === 'failed' || qm.retries >= MAX_QUEUE_RETRIES;
      const deliveryStatus: 'sending' | 'queued' | 'failed' =
        isFailed ? 'failed' : (qm.status === 'sending' ? 'sending' : 'queued');
      messages.push({
        id: `queued-${qm.tempId}`,
        source: 'local',
        senderType: 'operator',
        text: qm.type === 'image' ? null : qm.content,
        imageUrl: qm.type === 'image' ? qm.content : undefined,
        timestamp: normalizeChatTimestamp(qm.createdAt),
        senderName: username || 'Operator',
        _deliveryStatus: deliveryStatus,
        _tempId: qm.tempId,
        _onRetry: retryMessage,
      });
    }

    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }, [wsMessages, archivedMessages, isImageUrl, orderNumber, getSenderName, queuedMessages, username, retryMessage]);

  // Build historical messages from past orders
  const historicalSections = useMemo(() => {
    return historicalChats.map((order) => {
      const messages: UnifiedMessage[] = order.messages.map((msg) => {
        const msgType = msg.type || 'text';
        const isSelf = msg.self === true;
        const isImage = msgType === 'image';
        const normalizedType = String(msgType).toLowerCase();
        const imgUrl = msg.imageUrl || msg.thumbnailUrl || undefined;
        const content = msg.content || msg.message || '';
        const isSystemLike = !isCardPayload(content) &&
          (normalizedType === 'system' || ['recall', 'mark', 'card', 'video', 'translate', 'error'].includes(normalizedType));

        const effectiveImgUrl = isImage ? (imgUrl || content || undefined) : imgUrl;

        return {
          id: `hist-${order.orderNumber}-${msg.id}`,
          source: 'binance' as const,
          senderType: isSystemLike ? 'system' as const : (isSelf ? 'operator' as const : 'counterparty' as const),
          text: isImage ? null : (content || null),
          imageUrl: effectiveImgUrl,
          timestamp: normalizeChatTimestamp(msg.createTime),
          senderName: isSelf ? getSenderName(order.orderNumber, content) : null,
          messageType: normalizedType,
          isRecall: normalizedType === 'recall',
          isComplianceRelevant: isSystemLike,
        };
      });
      return { order, messages: messages.sort((a, b) => a.timestamp - b.timestamp) };
    });
  }, [historicalChats, getSenderName]);

  // All messages for counting
  const allMessages = useMemo(() => {
    const hist = historicalSections.flatMap((s) => s.messages);
    return [...hist, ...currentOrderMessages];
  }, [historicalSections, currentOrderMessages]);

  // A counterparty can continue an older Binance order chat after opening a
  // newer order. Rendering whole orders one after another therefore breaks the
  // real chronology. Flatten every order into one timeline and insert an order
  // separator only when the chronological stream changes order.
  const mergedTimeline = useMemo(() => {
    const entries = historicalSections.flatMap(({ order, messages }) =>
      messages.map((message) => ({ order, message, isCurrent: false })),
    );
    const currentOrder = {
      orderNumber,
      tradeType: newerOrder?.tradeType || tradeType || 'UNKNOWN',
      asset: newerOrder?.asset ?? null,
      totalPrice: newerOrder?.totalPrice ?? null,
      fiatUnit: newerOrder?.fiatUnit ?? null,
      orderDate: newerOrder?.createTime || 0,
      orderStatus: newerOrder?.orderStatus ?? orderStatus ?? null,
      messages: [],
    };
    entries.push(...currentOrderMessages.map((message) => ({ order: currentOrder, message, isCurrent: true })));

    return entries.sort((a, b) => {
      const aTime = a.message.timestamp || a.order.orderDate || 0;
      const bTime = b.message.timestamp || b.order.orderDate || 0;
      if (aTime !== bTime) return aTime - bTime;
      return a.message.id.localeCompare(b.message.id);
    });
  }, [historicalSections, currentOrderMessages, orderNumber, newerOrder, tradeType, orderStatus]);

  // New message detection & sound notification
  useEffect(() => {
    const currentIds = new Set(wsMessages.map((m) => m.id));

    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      prevBinanceIdsRef.current = currentIds;
      prevCountRef.current = currentOrderMessages.length;
      return;
    }

    const newMessages = wsMessages.filter(
      (m) => !prevBinanceIdsRef.current.has(m.id) && m.type !== 'system' && !m.self
    );

    if (newMessages.length > 0 && soundEnabled) {
      playMessageSound('message');
      const latest = newMessages[newMessages.length - 1];
      const latestText = latest.content || latest.message;
      if (latestText) {
        toast.info(`New message from ${counterpartyNickname}`, {
          description: latestText.substring(0, 80),
          duration: 4000,
        });
      }
    }

    prevBinanceIdsRef.current = currentIds;
    prevCountRef.current = currentOrderMessages.length;
  }, [wsMessages, currentOrderMessages.length, soundEnabled, counterpartyNickname]);

  // Auto-scroll on new current-order messages (only if user is at bottom)
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentOrderMessages]);

  // Maintain scroll position when historical chats are prepended
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && historicalChats.length > 0) {
      const newHeight = container.scrollHeight;
      const heightDiff = newHeight - prevScrollHeightRef.current;
      if (heightDiff > 0 && prevScrollHeightRef.current > 0) {
        container.scrollTop += heightDiff;
      }
      prevScrollHeightRef.current = newHeight;
    }
  }, [historicalChats]);

  // Scroll-to-top detection for loading history
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Track if user is near bottom for auto-scroll
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distFromBottom < 80;

    // Load more history when scrolled near top
    if (container.scrollTop < 60 && hasMore && !historyLoading) {
      prevScrollHeightRef.current = container.scrollHeight;
      loadMore();
    }
  }, [hasMore, historyLoading, loadMore]);

  const [isSending, setIsSending] = useState(false);

  const handleSend = async (messageText?: string) => {
    const msg = messageText || text.trim();
    if (!msg || isSending) return;
    if (!messageText) setText('');
    setIsSending(true);
    shouldAutoScrollRef.current = true;

    try {
      wsSendMessage(orderNumber, msg);
      if (userId && username) {
        logSender(orderNumber, msg, userId, username);
      }
    } finally {
      setIsSending(false);
    }
  };

  // Insert (not send) the quick reply into the input with template tokens filled,
  // so the operator can review/adjust before sending. Tap-shaving per T1.
  const handleQuickReply = (replyText: string) => {
    const filled = fillTemplate(replyText, templateValues || {});
    setText((prev) => (prev.trim() ? `${prev.trim()} ${filled}` : filled));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Number-key (1–9) hotkey → insert the matching per-user quick reply.
  const { data: hotkeyReplies = [] } = useQuickReplies(null, tradeType);
  useEffect(() => subscribeQuickReplyHotkey((idx) => {
    const reply = (hotkeyReplies as any[])[idx];
    if (reply?.message_text) handleQuickReply(reply.message_text);
  }), [hotkeyReplies, templateValues]);

  // AI Copilot — only visible for allowlisted operators when enabled.
  const copilotVisible = useCopilotVisible();
  const copilotPrefetch = useCopilotPrefetch();
  const isTrainer = useCopilotIsTrainer();
  const { nameFor } = useExchangeAccount();
  // Build the ENTIRE suggestion context client-side (no server order lookups).
  const buildCopilotInput = useCallback((): CopilotSuggestInput => ({
    order: {
      number: orderNumber,
      side: tradeType || null,
      status: orderStatus ?? null,
      amount: templateValues?.amount ?? null,
    },
    clientProfile: {
      name: counterpartyVerifiedName || counterpartyNickname || null,
    },
    messages: currentOrderMessages
      .filter((m) => m.senderType !== 'system' && m.text)
      .slice(-10)
      .map((m) => ({ isSelf: m.senderType === 'operator', text: m.text as string })),
    exchangeAccountId: exchangeAccountId ?? null,
    accountLabel: exchangeAccountId ? nameFor(exchangeAccountId) : null,
    counterpartyNickname: counterpartyNickname || null,
  }), [orderNumber, tradeType, orderStatus, templateValues, counterpartyVerifiedName, counterpartyNickname, currentOrderMessages, exchangeAccountId, nameFor]);

  const counterpartyMsgCount = currentOrderMessages.filter(
    (m) => m.senderType === 'counterparty'
  ).length;

  // Teach controls (trainers only): pin a golden reply / blacklist a phrase.
  const [blacklistTarget, setBlacklistTarget] = useState<UnifiedMessage | null>(null);
  const buildContextFor = useCallback((msg: UnifiedMessage): string => {
    const idx = currentOrderMessages.findIndex((m) => m.id === msg.id);
    const preceding = (idx > 0 ? currentOrderMessages.slice(0, idx) : [])
      .filter((m) => m.senderType !== 'system' && m.text)
      .slice(-6);
    return preceding.map((m) => `${m.senderType === 'operator' ? 'Operator' : 'Counterparty'}: ${m.text}`).join('\n');
  }, [currentOrderMessages]);

  const handlePin = useCallback(async (msg: UnifiedMessage) => {
    if (!msg.text) return;
    try {
      await copilotTeach('pin', {
        replyText: msg.text,
        contextText: buildContextFor(msg),
        side: tradeType || null,
        orderNumber,
        exchangeAccountId: exchangeAccountId ?? null,
      });
      toast.success('Pinned as golden reply');
    } catch (e: any) {
      toast.error(e.message || 'Failed to pin');
    }
  }, [buildContextFor, tradeType, orderNumber, exchangeAccountId]);

  const confirmBlacklist = useCallback(async () => {
    const msg = blacklistTarget;
    setBlacklistTarget(null);
    if (!msg?.text) return;
    try {
      await copilotTeach('blacklist', {
        patternText: msg.text,
        exchangeAccountId: exchangeAccountId ?? null,
      });
      toast.success('Pattern blacklisted');
    } catch (e: any) {
      toast.error(e.message || 'Failed to blacklist');
    }
  }, [blacklistTarget, exchangeAccountId]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Chat header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-card/50">
        <MessageSquare className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground">Chat</span>
        <span className="text-[10px] text-muted-foreground">— {counterpartyNickname}</span>
        {previousSeenLabel && (
          <span
            className="hidden sm:inline text-[9px] text-muted-foreground/80 truncate max-w-[220px]"
            title={previousSeenLabel}
          >
            {previousSeenLabel}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {counterpartyMsgCount > 0 && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 tabular-nums bg-primary/10 text-primary border-none">
              {counterpartyMsgCount} msgs
            </Badge>
          )}
          {/* Delivery status — messages always flow through the server, so a
              missing browser stream is never presented as a failure. */}
          <div
            className="flex items-center gap-0.5 ml-1 bg-muted/30 rounded px-1.5 py-0.5"
            title={isConnected ? 'Live updates on' : 'Messages are sent and received through the server'}
          >
            {isConnected ? (
              <>
                <Wifi className="h-2.5 w-2.5 text-trade-buy" />
                <span className="text-[8px] text-trade-buy font-medium">Live</span>
              </>
            ) : (
              <>
                <Cloud className="h-2.5 w-2.5 text-muted-foreground" />
                <span className="text-[8px] text-muted-foreground">Server sync</span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 ${soundEnabled ? 'text-primary' : 'text-muted-foreground'}`}
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Mute notifications' : 'Enable notifications'}
          >
            {soundEnabled ? (
              <Volume2 className="h-3 w-3" />
            ) : (
              <VolumeX className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>




      {newerOrder && (
        <div className="px-4 py-1.5 bg-primary/5 border-b border-primary/20">
          <span className="text-[10px] text-primary">
            Merged thread — live chat and replies are on their latest order #{newerOrder.orderNumber.slice(-8)}
          </span>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3">
          {/* Load more indicator */}
          {historyLoading && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mr-1.5" />
              <span className="text-[10px] text-muted-foreground">Loading older chats...</span>
            </div>
          )}

          {hasMore && !historyLoading && historicalChats.length === 0 && currentOrderMessages.length > 0 && (
            <div className="flex justify-center py-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  prevScrollHeightRef.current = scrollContainerRef.current?.scrollHeight || 0;
                  loadMore();
                }}
              >
                <History className="h-3 w-3" />
                Load past order chats
              </Button>
            </div>
          )}

          {!hasMore && historicalChats.length === 0 && currentOrderMessages.length > 0 && (
            <div className="flex justify-center py-2">
              <span className="text-[9px] text-muted-foreground/50">No previous orders with this counterparty</span>
            </div>
          )}

          {/* One true chronology across all of this counterparty's orders. */}
          {mergedTimeline.length > 0 ? (
            <div className="space-y-2.5">
              {mergedTimeline.map((entry, index) => {
                const previousOrder = index > 0 ? mergedTimeline[index - 1].order.orderNumber : null;
                const showSeparator = historicalChats.length > 0 && previousOrder !== entry.order.orderNumber;
                return (
                  <div key={`${entry.order.orderNumber}-${entry.message.id}`}>
                    {showSeparator && (
                      <OrderChatSeparator
                        orderNumber={entry.order.orderNumber}
                        tradeType={entry.order.tradeType}
                        asset={entry.order.asset}
                        totalPrice={entry.order.totalPrice}
                        fiatUnit={entry.order.fiatUnit}
                        orderDate={entry.order.orderDate}
                        orderStatus={entry.order.orderStatus}
                      />
                    )}
                    <ChatBubble
                      message={entry.message}
                      teachEnabled={entry.isCurrent && isTrainer}
                      onPin={entry.isCurrent ? handlePin : undefined}
                      onBlacklist={entry.isCurrent ? (m) => setBlacklistTarget(m) : undefined}
                    />
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          ) : (archivedLoading || isConnecting) ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
              <p className="text-xs text-muted-foreground">Loading messages...</p>
            </div>
          ) : historicalChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <MessageSquare className="h-8 w-8 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground">No messages yet</p>
              <p className="text-[10px] text-muted-foreground/60">
                Messages will appear here in real-time via WebSocket
              </p>
            </div>
          ) : null}
      </div>


      {/* Quick replies + AI Copilot bar (coexist) */}
      <div className="px-3 py-1 border-t border-border/50 bg-card/30 flex items-start gap-2">
        <QuickReplyBar
          tradeType={tradeType}
          onSelect={handleQuickReply}
        />
        {copilotVisible && (
          <CopilotStrip
            cacheKey={`${orderNumber}:${currentOrderMessages.length}`}
            onInsert={handleQuickReply}
            buildInput={buildCopilotInput}
            prefetch={copilotPrefetch}
            prefetchSignal={counterpartyMsgCount}
          />
        )}
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-border bg-card/50">
        <div className="flex items-center gap-2">
          <ChatImageUpload
            orderNo={orderNumber}
            onImageSent={(imageUrl) => {
              wsSendImage(orderNumber, imageUrl);
              if (userId && username) {
                logSender(orderNumber, imageUrl, userId, username);
              }
            }}
          />
          <AttachAdPicker
            exchangeAccountId={exchangeAccountId}
            onSendCard={(cardJson) => wsSendAdCard(orderNumber, cardJson)}
            onInsert={(adText) =>
              setText((prev) => (prev.trim() ? `${prev.trim()}\n${adText}` : adText))
            }
          />

          <Input
            ref={inputRef}
            data-terminal-chat-input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) handleSend();
              else if (e.key === 'Escape') e.currentTarget.blur();
            }}
            placeholder={isEnquiryThread ? 'Reply on the Binance app — this chat has no order' : 'Type a message...'}
            disabled={isEnquiryThread}
            className="h-8 text-xs bg-input text-foreground border-border rounded-md placeholder:text-muted-foreground focus-visible:ring-primary"
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => handleSend()}
            disabled={!text.trim() || isSending || isEnquiryThread}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>

        </div>
        <p className="text-[8px] text-muted-foreground/50 mt-1 px-1">
          {isEnquiryThread
            ? 'Enquiry chat with no order — Binance only accepts replies inside an order, so reply from the Binance app'
            : isConnected ? 'Live updates on' : 'Messages send instantly; updates refresh from the server'}
        </p>

      </div>

      <AlertDialog open={!!blacklistTarget} onOpenChange={(o) => { if (!o) setBlacklistTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Blacklist this phrase?</AlertDialogTitle>
            <AlertDialogDescription>
              The copilot will stop suggesting replies similar to:
              <span className="mt-2 block rounded bg-secondary/60 border border-border px-2 py-1 text-xs text-foreground">
                {blacklistTarget?.text}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBlacklist}>Blacklist</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
