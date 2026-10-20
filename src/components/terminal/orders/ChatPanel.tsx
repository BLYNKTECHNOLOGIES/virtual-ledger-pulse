import { useState, useRef, useEffect, useMemo, useCallback, useId, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

import { Badge } from '@/components/ui/badge';
import { Send, MessageSquare, Loader2, Volume2, VolumeX, Cloud, History, BookmarkPlus, Sparkles } from 'lucide-react';
import { useBinanceChatWebSocket } from '@/hooks/useBinanceChatWebSocket';
import { useArchivedBinanceChatMessages } from '@/hooks/useBinanceActions';
import { useChatMessageSenders } from '@/hooks/useChatMessageSenders';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { ChatBubble, UnifiedMessage } from './chat/ChatBubble';
import { DaySeparator, istDayKey } from './chat/DaySeparator';
import { isCardPayload } from './chat/ChatAdCard';
import { ChatImageUpload } from './chat/ChatImageUpload';
import { AttachAdPicker } from './chat/AttachAdPicker';
import { QuickReplyBar } from './chat/QuickReplyBar';
import { CopilotPanel, type CopilotPick } from './chat/CopilotPanel';
import { CopilotEntryDialog } from './chat/CopilotEntryDialog';
import { RephraseStrip } from './chat/RephraseStrip';
import { useCopilotAccess, copilotLearn, copilotRephraseUsed, copilotUndo, type CopilotError, type LearnBody } from '@/hooks/useCopilotPlaybook';
import { useRephrase } from '@/hooks/useRephrase';
import { chainRewrite, rewriteSent, type BoxRewrite } from '@/lib/copilot/rephrase';
import { composerKeyAction } from '@/lib/copilot/composerKeys';
import { copilotAdmin } from '@/hooks/useCopilotAdmin';
import { cycleIndex, latestUnanswered, learnToast, pickKey, sameText, unfilledTokens } from '@/lib/copilot/copilotText';
import { useQuickReplies } from '@/hooks/useP2PTerminal';
import { subscribeQuickReplyHotkey } from '@/hooks/useTerminalHotkeys';
import { playMessageSound } from '@/lib/chatSound';
import { toast } from 'sonner';
import { callBinanceAds } from '@/hooks/useBinanceActions';
import { markOrderChatRead } from '@/lib/chat-read-state';
import { supabase } from '@/integrations/supabase/client';
import { useChatSeenSnapshot, seenLabel } from '@/hooks/useChatSeenBy';
import { fillTemplate, type TemplateOrderValues } from '@/lib/fill-template';
import { isChatListenerHealthy, useTerminalChatListenerState } from '@/hooks/useTerminalCollector';
import { useCounterpartyChatHistory, type HistoricalChatMessage } from '@/hooks/useCounterpartyChatHistory';
import { format } from 'date-fns';
import { initialsOf } from './initials';

/**
 * The same Binance frame can reach us twice (live socket + history sweep) with
 * different ids and, for auto-replies, a missing `self` flag. Timestamps from
 * the two paths can differ by a few seconds (e.g. 411ms apart straddling a
 * second boundary), so dedupe on a 5-second bucket rather than the exact
 * second. Collapse those into one bubble, keeping the richer/operator-
 * attributed copy. Genuinely repeated messages (different 5s bucket) are
 * preserved.
 */
function dedupeMessages(messages: UnifiedMessage[]): UnifiedMessage[] {
  const byKey = new Map<string, UnifiedMessage>();
  const out: UnifiedMessage[] = [];
  for (const msg of messages) {
    if (msg.source === 'local') { out.push(msg); continue; }
    const body = (msg.text || msg.imageUrl || '').trim();
    if (!body) { out.push(msg); continue; }
    const key = `${String(msg.messageType || '').toLowerCase()}|${body}|${Math.floor((msg.timestamp || 0) / 5000)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, msg);
      out.push(msg);
      continue;
    }
    // Prefer the copy attributed to the operator (auto-replies are ours).
    if (existing.senderType !== 'operator' && msg.senderType === 'operator') {
      const idx = out.indexOf(existing);
      if (idx >= 0) out[idx] = msg;
      byKey.set(key, msg);
    }
  }
  return out;
}

/**
 * Render a transcript with WhatsApp/Binance-style day dividers: whenever the
 * IST calendar day changes between two consecutive messages, a centered
 * "Today" / "Yesterday" / full-date pill is inserted before the newer message.
 */
function withDaySeparators(messages: UnifiedMessage[], renderMessage: (m: UnifiedMessage) => ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let lastDay: string | null = null;
  for (const m of messages) {
    const ts = m.timestamp || 0;
    const day = istDayKey(ts);
    if (day && day !== lastDay) {
      out.push(<DaySeparator key={`day-${m.id}`} ts={ts} />);
      lastDay = day;
    }
    out.push(renderMessage(m));
  }
  return out;
}




interface Props {
  orderId: string;
  orderNumber: string;
  counterpartyId: string | null;
  counterpartyNickname: string;
  tradeType?: string;
  counterpartyVerifiedName?: string;
  exchangeAccountId?: string | null;
  /** Current order status (numeric code or text) — Copilot suggestions refresh when it changes. */
  orderStatus?: string | null;
  orderAsset?: string | null;
  /** orderFiat, orderQuantity, orderPrice, orderType: no longer read here (old Copilot); kept so callers need no change. */
  orderFiat?: string | null;
  orderQuantity?: number | string | null;
  orderPrice?: number | string | null;
  orderType?: string | null;
  paymentMethod?: string | null;
  /** Live order values used to fill quick-reply template tokens at insert time. */
  templateValues?: TemplateOrderValues;
  /** From Binance's live order detail (when the screen has it): extra-KYC field and deadlines, for the Copilot. */
  binanceKycVerify?: unknown;
  binancePayBy?: unknown;
  binanceReleaseBy?: unknown;
  /** The screen is still loading Binance's live order detail (the Copilot's first request waits a moment for it). */
  binanceDetailLoading?: boolean;
}

// Binance timestamps can arrive as either epoch seconds or milliseconds.
// Normalize before combining messages from different order threads so one
// source cannot be sorted into the wrong position in the merged timeline.
function normalizeChatTimestamp(value: unknown): number {
  const timestamp = Number(value || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

export function ChatPanel({ orderId, orderNumber: openedOrderNumber, counterpartyId, counterpartyNickname, tradeType, counterpartyVerifiedName, exchangeAccountId, orderStatus, orderAsset, paymentMethod, templateValues, binanceKycVerify, binancePayBy, binanceReleaseBy, binanceDetailLoading = false }: Props) {
  // Sending and read state stay strictly attached to the opened order. Earlier
  // verified threads are rendered below as read-only, order-separated context.
  const orderNumber = openedOrderNumber;
  const queryClient = useQueryClient();
  // Chats Binance delivers without an order behind them (ad enquiries).
  // Binance's documented send endpoint requires an order number, so replying
  // to these from the terminal is not supported.
  const isEnquiryThread = orderNumber.startsWith('INQ-');
  // Copilot: a reply picked for another step ("If: Checking KYC") sets the chat to that step once Binance has the
  // message, so the mark is newer than it (a mark older than our last step message would be ignored). Not when a newer
  // message of ours went out in the meantime, or when delivery came much later (a retry): the chat has moved on.
  const copilotStepOnDeliveryRef = useRef(new Map<string, { step: NonNullable<CopilotPick['situation']>; sentAt: number }>());
  const copilotLastSendRef = useRef(new Map<string, number>());
  const [copilotRefresh, setCopilotRefresh] = useState(0);
  const openOrderRef = useRef(orderNumber);
  openOrderRef.current = orderNumber;
  // After Binance confirms a send, pull the stored copy straight away so the
  // bubble is replaced by a durable message instead of disappearing.
  const handleDelivered = useCallback((deliveredOrderNo: string, content?: string) => {
    const stepKey = `${deliveredOrderNo}\n${content ?? ''}`;
    const pending = copilotStepOnDeliveryRef.current.get(stepKey);
    if (pending) {
      copilotStepOnDeliveryRef.current.delete(stepKey);
      const newerSend = (copilotLastSendRef.current.get(deliveredOrderNo) ?? 0) > pending.sentAt;
      if (!newerSend && Date.now() - pending.sentAt < 60_000) {
        const { step } = pending;
        // The chat itself shows that step (an earlier correction is being undone): back to what the chat shows.
        copilotAdmin.setSituation(deliveredOrderNo, step.side, step.code === step.detected ? null : step.code, step.detected)
          .then(() => { if (openOrderRef.current === deliveredOrderNo) setCopilotRefresh((n) => n + 1); })
          .catch((e) => toast.warning('The step was not saved for this chat', { description: (e as Error)?.message }));
      }
    }
    callBinanceAds('syncOrderChatMessages', { orderNo: deliveredOrderNo, rows: 50, maxPages: 1, sort: 'desc' }, exchangeAccountId ?? undefined)
      .catch((err) => console.warn('Post-send chat sync failed:', err))
      .finally(() => {
        queryClient.invalidateQueries({ queryKey: ['archived-binance-chat-messages', deliveredOrderNo, exchangeAccountId ?? null] });
        queryClient.invalidateQueries({ queryKey: ['terminal-chat-inbox'] });
      });
  }, [exchangeAccountId, queryClient]);

  const { messages: wsMessages, sendMessage: wsSendMessage, sendImageMessage: wsSendImage, sendAdCardMessage: wsSendAdCard, retryMessage, clearQueuedMessage, queuedMessages } = useBinanceChatWebSocket(orderNumber, exchangeAccountId, handleDelivered);
  const { data: archivedMessages = [], isLoading: archivedLoading } = useArchivedBinanceChatMessages(orderNumber, exchangeAccountId);
  // While a reply is in flight, re-read the stored transcript every second. The
  // always-on listener stores our own echo within ~1–2s of Binance accepting it,
  // so the bubble flips to delivered immediately instead of waiting for the
  // slower server-side confirmation round-trip.
  const hasInFlight = queuedMessages.some((q) => q.orderNo === orderNumber && (q.status === 'sending' || q.status === 'sent'));
  useEffect(() => {
    if (!hasInFlight) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['archived-binance-chat-messages', orderNumber, exchangeAccountId ?? null] });
    }, 1000);
    return () => clearInterval(id);
  }, [hasInFlight, orderNumber, exchangeAccountId, queryClient]);
  const {
    historicalChats,
    isLoading: historyLoading,
    isDiscovering: historyDiscovering,
    isUnavailable: historyUnavailable,
    hasMore: hasMoreHistory,
    pastThreadCount,
    loadMore: loadMoreHistory,
  } = useCounterpartyChatHistory(counterpartyNickname, orderNumber, counterpartyVerifiedName, exchangeAccountId, tradeType);

  const { data: chatListenerState } = useTerminalChatListenerState();
  const chatListenerHealthy = isChatListenerHealthy(chatListenerState);
  const { logSender, prefetchSenders, getSenderName } = useChatMessageSenders();
  const { userId, username } = useTerminalAuth();
  const [text, setText] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('terminal-chat-sound');
    return saved !== 'false';
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const prevBinanceIdsRef = useRef<Set<number>>(new Set());
  const isInitialLoadRef = useRef(true);
  const shouldAutoScrollRef = useRef(true);
  // While a chat opens, keep the view pinned to the newest message (instant
  // jumps) until archived messages + history discovery settle — otherwise the
  // smooth scroll lands mid-thread once prepended history/images shift layout.
  const initialPinRef = useRef(true);

  // Helper: detect if text content is actually an image URL
  const isImageUrl = useCallback((messageText: string | undefined | null): boolean => {
    if (!messageText) return false;
    const trimmed = messageText.trim();
    return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(trimmed) ||
           /^https?:\/\/.*bnbstatic\.com\/.*\/(client_upload|chat)\//i.test(trimmed);
  }, []);

  // Earlier chats are loaded lazily — only when the operator scrolls up to the
  // top of the thread (see handleScroll). Nothing is fetched on open.
  const pendingScrollRestoreRef = useRef<number | null>(null);


  const historicalSections = useMemo(() => historicalChats.map((chat) => ({
    ...chat,
    messages: dedupeMessages(chat.messages.map((msg: HistoricalChatMessage): UnifiedMessage => {
      const msgType = String(msg.type || 'text').toLowerCase();
      const content = msg.content || msg.message || '';
      const isImage = msgType === 'image' || isImageUrl(content);
      const isSharedAd = isCardPayload(content);
      const isSystemLike = !isSharedAd && ['system', 'recall', 'mark', 'card', 'video', 'translate', 'error'].includes(msgType);
      return {
        id: `history-${chat.orderNumber}-${msg.id}`,
        source: 'binance',
        senderType: isSystemLike ? 'system' : (msg.self ? 'operator' : 'counterparty'),
        text: isImage ? null : content || null,
        imageUrl: isImage ? (msg.imageUrl || msg.thumbnailUrl || content || undefined) : (msg.imageUrl || msg.thumbnailUrl),
        timestamp: normalizeChatTimestamp(msg.createTime),
        senderName: msg.self ? getSenderName(chat.orderNumber, content) : msg.fromNickName,
        messageType: msgType,
        isRecall: msgType === 'recall',
        isComplianceRelevant: isSystemLike,
      };
    }).sort((a, b) => a.timestamp - b.timestamp)),
  })), [historicalChats, isImageUrl, getSenderName]);

  useEffect(() => {
    const historicalOrderNumbers = historicalChats.map((chat) => chat.orderNumber);
    if (historicalOrderNumbers.length > 0) prefetchSenders(historicalOrderNumbers);
  }, [historicalChats, prefetchSenders]);

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
      supabase.rpc('mark_terminal_binance_chat_read', {
        p_order_number: orderNumber,
        p_source: 'operator',
      }).then(({ error }) => {
        if (error) console.warn('Failed to record team chat read:', error.message);
      });
      callBinanceAds('markOrderMessagesRead', { orderNo: orderNumber }, exchangeAccountId ?? undefined).catch((err) => {
        console.warn('Failed to mark Binance chat read:', err);
      });
      callBinanceAds('syncOrderChatMessages', { orderNo: orderNumber, rows: 50, maxPages: 5, sort: 'asc' }, exchangeAccountId ?? undefined)
        .then(() => Promise.all([
          queryClient.invalidateQueries({ queryKey: ['archived-binance-chat-messages', orderNumber, exchangeAccountId ?? null] }),
          queryClient.invalidateQueries({ queryKey: ['terminal-chat-inbox'] }),
          queryClient.invalidateQueries({ queryKey: ['terminal-chat-inbox-unread'] }),
        ]))
        .catch((err) => {
          if (!cancelled) console.warn('Binance chat archive sync failed:', err);
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderNumber, exchangeAccountId, queryClient]);

  // Who on the team last opened this chat (captured before our own read is written).
  const previousSeen = useChatSeenSnapshot(orderNumber);
  const previousSeenLabel = seenLabel(previousSeen);


  useEffect(() => {
    localStorage.setItem('terminal-chat-sound', String(soundEnabled));
  }, [soundEnabled]);

  // Prefetch sender records for the current order only.
  useEffect(() => {
    prefetchSenders([orderNumber]);
  }, [orderNumber, prefetchSenders]);

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
        senderType: isSystemLike ? 'system' : ((msg.sender_is_self || msgType === 'auto_reply') ? 'operator' : 'counterparty'),
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
        senderType: isSystemLike ? 'system' : ((isSelf || String(msgType).toLowerCase() === 'auto_reply') ? 'operator' : 'counterparty'),
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
    //         'sent'    = Binance confirmed it; shown as a normal bubble until
    //                     the stored copy lands, so it never blinks out
    const MAX_QUEUE_RETRIES = 3;
    // Whatever already arrived from Binance (live echo or stored copy) wins: the
    // local bubble is dropped in the same render, so a sent message never appears
    // twice while the queue entry is being retired. Matching is one-to-one and
    // timestamp-scoped, so re-sending the same canned text is never hidden by an
    // older identical message.
    const ECHO_SKEW_MS = 20_000;
    const deliveredSelfByBody = new Map<string, number[]>();
    for (const m of messages) {
      if (m.senderType !== 'operator') continue;
      const body = String(m.imageUrl || m.text || '').trim();
      if (!body) continue;
      const list = deliveredSelfByBody.get(body) ?? [];
      list.push(m.timestamp);
      deliveredSelfByBody.set(body, list);
    }
    for (const list of deliveredSelfByBody.values()) list.sort((a, b) => a - b);

    const sortedQueue = [...queuedMessages].sort((a, b) => a.createdAt - b.createdAt);
    for (const qm of sortedQueue) {
      if (qm.orderNo !== orderNumber) continue;
      const isFailed = qm.status === 'failed' || qm.retries >= MAX_QUEUE_RETRIES;
      if (!isFailed) {
        const body = qm.content.trim();
        const list = deliveredSelfByBody.get(body);
        const idx = list?.findIndex((ts) => ts >= qm.createdAt - ECHO_SKEW_MS) ?? -1;
        if (list && idx >= 0) {
          list.splice(idx, 1);
          continue;
        }
      }

      const deliveryStatus: 'sending' | 'queued' | 'failed' | undefined = isFailed
        ? 'failed'
        : qm.status === 'sent'
          ? undefined
          : (qm.status === 'sending' ? 'sending' : 'queued');
      messages.push({
        id: `queued-${qm.tempId}`,
        source: 'local',
        senderType: 'operator',
        text: qm.type === 'image' ? null : qm.content,
        imageUrl: qm.type === 'image' ? qm.content : undefined,
        timestamp: normalizeChatTimestamp(qm.createdAt),
        senderName: username || 'Operations Associate',
        _deliveryStatus: deliveryStatus,
        _tempId: qm.tempId,
        _onRetry: retryMessage,
      });
    }

    return dedupeMessages(messages.sort((a, b) => a.timestamp - b.timestamp));
  }, [wsMessages, archivedMessages, isImageUrl, orderNumber, getSenderName, queuedMessages, username, retryMessage]);

  // Retire a delivered bubble only once ITS OWN stored copy is on screen (or after
  // a grace period). Matching is timestamp-scoped and one-to-one, so re-sending the
  // same canned text ("Done", "Please pay") is never retired against an older
  // identical message — which used to make the new reply vanish from the transcript.
  useEffect(() => {
    const delivered = queuedMessages
      .filter((qm) => qm.orderNo === orderNumber && qm.status === 'sent')
      .sort((a, b) => a.createdAt - b.createdAt);
    if (delivered.length === 0) return;

    const ECHO_SKEW_MS = 20_000;
    const storedSelfByBody = new Map<string, number[]>();
    const addStored = (body: string, ts: number) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      const list = storedSelfByBody.get(trimmed) ?? [];
      list.push(ts);
      storedSelfByBody.set(trimmed, list);
    };
    for (const msg of archivedMessages as any[]) {
      if (!msg.sender_is_self && String(msg.message_type || '').toLowerCase() !== 'auto_reply') continue;
      addStored(String(msg.image_url || msg.message_text || ''), normalizeChatTimestamp(msg.binance_create_time));
    }
    for (const msg of wsMessages as any[]) {
      if (msg.self !== true) continue;
      addStored(String(msg.imageUrl || msg.content || msg.message || ''), normalizeChatTimestamp(msg.createTime));
    }
    for (const list of storedSelfByBody.values()) list.sort((a, b) => a - b);

    let stillWaiting = false;
    for (const qm of delivered) {
      const body = qm.content.trim();
      const list = storedSelfByBody.get(body);
      const idx = list?.findIndex((ts) => ts >= qm.createdAt - ECHO_SKEW_MS) ?? -1;
      if (list && idx >= 0) {
        list.splice(idx, 1);
        clearQueuedMessage(qm.tempId);
      } else if (Date.now() - qm.createdAt > 120_000) {
        clearQueuedMessage(qm.tempId);
      } else {
        stillWaiting = true;
      }
    }
    if (!stillWaiting) return;
    const timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['archived-binance-chat-messages', orderNumber, exchangeAccountId ?? null] });
    }, 4000);
    return () => clearTimeout(timer);
  }, [archivedMessages, wsMessages, queuedMessages, orderNumber, exchangeAccountId, clearQueuedMessage, queryClient]);




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

  // While this chat stays open and visible, messages that arrive are seen by the
  // operator, so mark them read too (debounced). The open-time mark above only
  // covers messages that existed when the chat was opened.
  const seenCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!orderNumber || orderNumber.startsWith('INQ-')) return;
    const count = currentOrderMessages.length;
    if (seenCountRef.current === null) { seenCountRef.current = count; return; }
    if (count <= seenCountRef.current) return;
    const t = setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      seenCountRef.current = count;
      markOrderChatRead(orderNumber);
      supabase.rpc('mark_terminal_binance_chat_read', { p_order_number: orderNumber, p_source: 'operator' })
        .then(({ error }) => { if (error) console.warn('Failed to record team chat read:', error.message); });
      callBinanceAds('markOrderMessagesRead', { orderNo: orderNumber }, exchangeAccountId ?? undefined).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['terminal-chat-inbox-unread'] });
    }, 1500);
    return () => clearTimeout(t);
  }, [currentOrderMessages.length, orderNumber, exchangeAccountId, queryClient]);
  useEffect(() => { seenCountRef.current = null; }, [orderNumber]);

  // Initial open: instant-pin to the newest message while anything about the
  // initial content changes (archived fetch, history discovery, prepends).
  const initialContentReady = !archivedLoading && !historyDiscovering && !historyLoading;
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (initialPinRef.current && container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [currentOrderMessages, historicalSections, initialContentReady]);

  // Release the initial pin shortly after the content settles, so the
  // operator regains free scrolling (and lazy history loading) right after.
  useEffect(() => {
    if (!initialContentReady) return;
    const t = setTimeout(() => { initialPinRef.current = false; }, 1200);
    return () => clearTimeout(t);
  }, [initialContentReady]);

  // Auto-scroll only when a NEW message arrives (count grows) and the operator
  // is already at the bottom. Polls/refetches that return the same messages as
  // a new array must never yank the view back down.
  const lastAutoCountRef = useRef(0);
  useEffect(() => {
    const container = scrollContainerRef.current;
    const count = currentOrderMessages.length;
    const grew = count > lastAutoCountRef.current;
    lastAutoCountRef.current = count;
    if (!container) return;
    if (initialPinRef.current) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    if (grew && shouldAutoScrollRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [currentOrderMessages]);

  // The moment the operator touches / wheels / drags the thread, hand control
  // back to them: end the initial pin immediately.
  const releasePin = useCallback(() => {
    initialPinRef.current = false;
  }, []);

  // Late-loading images grow the content above; stay at the bottom when the
  // operator was already there (or while the initial pin is active).
  const handleContentLoad = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container && (initialPinRef.current || shouldAutoScrollRef.current)) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // Track whether the operator is near the bottom for auto-scroll, and load the
  // next page of earlier chats once they scroll up to the top of the thread.
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Track if user is near bottom for auto-scroll
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distFromBottom < 80;

    // Lazy history: fetch the next batch only when the top comes into view.
    if (container.scrollTop <= 120 && hasMoreHistory && !historyLoading && !historyUnavailable) {
      pendingScrollRestoreRef.current = container.scrollHeight - container.scrollTop;
      void loadMoreHistory();
    }
  }, [hasMoreHistory, historyLoading, historyUnavailable, loadMoreHistory]);

  // The composer grew (a rewrite strip, a longer message) and the thread got shorter: stay at the bottom when the operator
  // was there, so the latest message does not slip out of view.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let lastH = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      if (h < lastH && (initialPinRef.current || shouldAutoScrollRef.current)) el.scrollTop = el.scrollHeight;
      lastH = h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the operator's reading position stable when older chats are prepended.
  useEffect(() => {
    const container = scrollContainerRef.current;
    const anchor = pendingScrollRestoreRef.current;
    if (!container || anchor == null) return;
    pendingScrollRestoreRef.current = null;
    container.scrollTop = container.scrollHeight - anchor;
  }, [historicalChats]);


  // ── Copilot v2 (Playbook): approvers only. copilot_my_access gates the screen; the server checks again. ──
  const { data: copilotAccess } = useCopilotAccess();
  const isCopilotApprover = !!copilotAccess?.is_approver && !isEnquiryThread;
  const copilotTrigger = useMemo(
    () => (isCopilotApprover ? latestUnanswered(currentOrderMessages) : null),
    [isCopilotApprover, currentOrderMessages],
  );
  // The suggestion currently in the composer; sending it saves it to the Playbook ("use = approve").
  const copilotPickRef = useRef<CopilotPick | null>(null);
  // The step of a reply picked for another step, shown under the composer while that reply is in it.
  const [copilotPickStep, setCopilotPickStep] = useState<string | null>(null);
  const setCopilotPick = useCallback((pick: CopilotPick | null) => {
    copilotPickRef.current = pick;
    setCopilotPickStep(pick?.situation?.label ?? null);
  }, []);
  const copilotStateRef = useRef<{ requestId: string | null; picks: CopilotPick[] }>({ requestId: null, picks: [] });
  const [copilotSaveOwn, setCopilotSaveOwn] = useState(false);
  const [copilotEntryId, setCopilotEntryId] = useState<string | null>(null);
  const [copilotRequestId, setCopilotRequestId] = useState<string | null>(null);
  const handleCopilotState = useCallback((s: { requestId: string | null; picks: CopilotPick[] }) => {
    copilotStateRef.current = s;
    setCopilotRequestId(s.requestId);
    // A reply for another step that is no longer offered (the chat moved on) sets no step when sent: drop the note.
    const cur = copilotPickRef.current;
    setCopilotPickStep(cur?.situation && s.picks.some((p) => pickKey(p) === pickKey(cur)) ? cur.situation.label : null);
  }, []);
  useEffect(() => { setCopilotPick(null); setCopilotSaveOwn(false); }, [orderNumber, setCopilotPick]);
  // Binance's live extra-KYC field and deadlines (numbers or null): fresher than the stored order on the server.
  const liveNumber = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v
    : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : null);
  const kycLive = liveNumber(binanceKycVerify), payByLive = liveNumber(binancePayBy), releaseByLive = liveNumber(binanceReleaseBy);
  const copilotBinance = useMemo(() => ({ kycVerify: kycLive, payBy: payByLive, releaseBy: releaseByLive }), [kycLive, payByLive, releaseByLive]);
  const copilotHint = useMemo(() => ({
    tradeType: tradeType ?? null,
    status: orderStatus ?? null,
    totalPrice: templateValues?.amount ?? null,
    asset: orderAsset ?? null,
    payMethod: paymentMethod ?? null,
    ...copilotBinance,
  }), [tradeType, orderStatus, templateValues?.amount, orderAsset, paymentMethod, copilotBinance]);

  // One approval per reply per order: repeated Approve / Send / Ctrl+Enter taps on the same text are ignored.
  const copilotTaughtRef = useRef<Set<string>>(new Set());
  const teachCopilot = useCallback(async (
    cause: LearnBody['cause'], finalText: string, picked: CopilotPick | null, beforeAt?: number,
    rewrite?: { callId: string | null; text: string; rough: string } | null,
  ) => {
    const dedupeKey = beforeAt ? null : `${orderNumber}\n${finalText.trim().replace(/\s+/g, ' ').toLowerCase()}`;
    if (dedupeKey) {
      if (copilotTaughtRef.current.has(dedupeKey)) {
        toast('Already approved', { description: 'This reply was already saved for this chat.' });
        return;
      }
      copilotTaughtRef.current.add(dedupeKey);
    }
    try {
      const res = await copilotLearn({
        cause,
        orderNumber,
        exchangeAccountId: exchangeAccountId ?? null,
        requestId: beforeAt ? null : (picked?.requestId ?? copilotStateRef.current.requestId),
        sourceEntryId: picked?.kind === 'entry' ? picked.entryId ?? null : null,
        // A rewrite of the approver's own words counts like a draft they used; their typed words are its reason.
        sourceCallId: picked?.kind === 'draft' ? picked.callId ?? null : (!picked ? rewrite?.callId ?? null : null),
        insertedText: picked?.text ?? rewrite?.text ?? null,
        note: !picked ? rewrite?.rough ?? null : null,
        finalText,
        templateValues,
        hint: copilotHint,
        beforeAt: beforeAt ?? null,
        // A reply picked for another step ("If: Checking KYC") is saved under that step.
        situation: beforeAt ? null : (picked?.situation?.code ?? null),
      });
      const t = learnToast(res);
      (t.tone === 'warning' ? toast.warning : toast.success)(t.title, {
        description: t.description,
        duration: 9000,
        action: res.eventId ? {
          label: 'Undo',
          onClick: () => {
            copilotUndo(res.eventId!)
              .then((u) => toast(u.undone ? 'Removed from the Playbook' : 'Already undone'))
              .catch((e) => toast.error(e?.message || 'Could not undo'));
          },
        } : undefined,
        cancel: res.entryId ? { label: 'Edit', onClick: () => setCopilotEntryId(res.entryId!) } : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['copilot-access'] });
    } catch (e) {
      if (dedupeKey) copilotTaughtRef.current.delete(dedupeKey);
      const err = e as CopilotError;
      if (err?.code === 'no_question') toast('Not saved to the Playbook', { description: 'There was no client question to attach it to.' });
      else toast.error('Could not save to the Playbook', { description: err?.message });
    }
  }, [orderNumber, exchangeAccountId, templateValues, copilotHint, queryClient]);

  // ── Copilot · Rephrase: approvers and the operators an approver picked (the server checks again). ──
  const canRephrase = !!copilotAccess?.can_rephrase && !isEnquiryThread;
  // A rewrite is checked for the chat as it stands: a new message, the order's status or KYC, or the panel's request (an
  // approver changing the step) makes the rewrites kept so far be asked again.
  const lastMessageId = currentOrderMessages.length ? currentOrderMessages[currentOrderMessages.length - 1].id : '';
  const rephraseContext = [orderStatus ?? '', kycLive ?? '', lastMessageId, copilotRequestId ?? ''].join('|');
  const rephrase = useRephrase({
    enabled: canRephrase, auto: copilotAccess?.rephrase_auto !== false, orderNumber, exchangeAccountId, hint: copilotHint, text,
    context: rephraseContext,
  });
  const markPlaced = rephrase.markPlaced;
  const takeRewrite = rephrase.take;
  const untakeRewrite = rephrase.untake;
  const focusInput = useCallback((caretToEnd = false) => {
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (caretToEnd) el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);
  // The rewrite in the box (with the words first typed), until the box is cleared or a suggestion replaces it.
  const rewriteRef = useRef<BoxRewrite | null>(null);
  const [rewriteInBox, setRewriteInBox] = useState<string | null>(null);
  const setRewrite = useCallback((r: BoxRewrite | null) => {
    rewriteRef.current = r;
    setRewriteInBox(r?.text ?? null);
  }, []);
  useEffect(() => { setRewrite(null); }, [orderNumber, setRewrite]);
  const rephraseTextId = useId();
  const applyRewrite = useCallback(() => {
    const r = takeRewrite();
    if (!r) return false;
    // A Copilot suggestion stays attached however it was edited or reworded: sending it saves it as that suggestion.
    setRewrite(chainRewrite(r, rewriteRef.current, !!copilotPickRef.current));
    setText(r.text);
    focusInput(true);
    return true;
  }, [takeRewrite, setRewrite, focusInput]);
  // Esc (or "Bring back my words") while the box still holds the rewrite: the typed words come back. They are the
  // person's own again; a suggestion's text stays the screen's (not reworded on its own).
  const undoRewrite = useCallback(() => {
    const r = rewriteRef.current;
    if (!r) return false;
    setRewrite(null);
    if (r.ofPick) markPlaced(r.rough);
    else untakeRewrite(r.rough);
    setText(r.rough);
    focusInput(true);
    return true;
  }, [setRewrite, markPlaced, untakeRewrite, focusInput]);

  const insertCopilotPick = useCallback((pick: CopilotPick) => {
    setCopilotPick(pick);
    setRewrite(null);
    markPlaced(pick.text);
    setText(pick.text);
    focusInput(true);
  }, [setCopilotPick, setRewrite, markPlaced, focusInput]);
  // Approve sends the reply to the client too; handleSend then saves it to the Playbook once.
  const approveRef = useRef<(pick: CopilotPick) => void>(() => {});
  const approveCopilotPick = useCallback((pick: CopilotPick) => { approveRef.current(pick); }, []);
  const saveBubbleToPlaybook = useCallback((m: UnifiedMessage) => {
    if (m.text) void teachCopilot('saved', m.text, null, (m.timestamp || Date.now()) + 1000);
  }, [teachCopilot]);

  const [isSending, setIsSending] = useState(false);

  // Auto-grow the composer between 1 and ~5 lines; it scrolls beyond that (max-h).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 104)}px`;
  }, [text]);

  // Returns true only when the reply actually went out; a blocked send (placeholder left unfilled,
  // or a send already in flight) reports false so the Approve guard below is not armed by it.
  const handleSend = async (messageText?: string): Promise<boolean> => {
    const msg = messageText || text.trim();
    if (!msg || isSending) return false;
    // A placeholder such as {contact:kyc} or {amount} (no value filled in) must never reach the client, however it got
    // into the box (a suggestion, a quick reply, a rewrite, pasted).
    const left = unfilledTokens(msg);
    if (left.length) {
      toast.error('Fill in the placeholder before sending', { description: `Replace ${left.join(', ')} with the real value.` });
      return false;
    }
    if (!messageText) setText('');
    setIsSending(true);
    shouldAutoScrollRef.current = true;
    // Copilot: a sent suggestion is saved to the Playbook; an own reply only when Save is switched on.
    const picked = copilotPickRef.current;
    const saveOwn = copilotSaveOwn;
    // A rewrite counts only for a send from the box (Approve sends the suggestion, not the box), and only while what is
    // sent is still mostly it (not another reply typed over it).
    const fromBox = !messageText;
    const rewrite = rewriteSent(msg, fromBox, rewriteRef.current);
    if (fromBox) setRewrite(null);
    setCopilotPick(null);
    setCopilotSaveOwn(false);
    // A reply picked for another step, sent unchanged while it is still offered, tells the Copilot the client's real
    // step: the chat is set to it once Binance has the message.
    const sentAt = Date.now();
    copilotLastSendRef.current.set(orderNumber, sentAt);
    if (isCopilotApprover && picked?.situation && sameText(msg, picked.text)
      && copilotStateRef.current.picks.some((p) => pickKey(p) === pickKey(picked))) {
      copilotStepOnDeliveryRef.current.set(`${orderNumber}\n${msg}`, { step: picked.situation, sentAt });
    }

    try {
      wsSendMessage(orderNumber, msg);
      if (userId && username) {
        logSender(orderNumber, msg, userId, username);
      }
    } finally {
      setIsSending(false);
    }
    if (isCopilotApprover && (picked || saveOwn || rewrite)) {
      // A sent rewrite is approved like a sent suggestion ("use = approve"), with the typed words as its reason.
      void teachCopilot(picked || rewrite ? 'sent' : 'saved', msg, picked, undefined, rewrite);
    } else if (!isCopilotApprover && rewrite?.callId) {
      // An operator's sent rewrite waits in the Playbook inbox for an approver; nothing to show if that fails.
      copilotRephraseUsed({
        callId: rewrite.callId, roughCallId: rewrite.roughCallId && rewrite.roughCallId !== rewrite.callId ? rewrite.roughCallId : null,
        orderNumber, exchangeAccountId: exchangeAccountId ?? null, finalText: msg, sentAt, templateValues,
      }).catch((e) => console.warn('[copilot] the sent rewrite did not reach the Playbook inbox:', (e as Error)?.message ?? e));
    }
    return true;
  };

  const lastApproveRef = useRef<{ key: string; at: number } | null>(null);
  approveRef.current = (pick: CopilotPick) => {
    if (isSending) return;
    const key = `${orderNumber}\n${pick.text.trim()}`;
    const now = Date.now();
    if (lastApproveRef.current?.key === key) {
      toast('Already sent', { description: 'This reply was already approved and sent.' });
      return;
    }
    // The guard is armed only once the reply has actually gone out; a blocked send (placeholder left
    // unfilled) keeps Approve usable, so the next press fills in and sends instead of saying "Already sent".
    setCopilotPick(pick);
    void handleSend(pick.text).then((sent) => {
      if (sent) lastApproveRef.current = { key, at: now };
    });
  };

  // Insert (not send) the quick reply into the input with template tokens filled,
  // so the operator can review/adjust before sending. Tap-shaving per T1.
  const handleQuickReply = (replyText: string) => {
    const prev = inputRef.current?.value ?? '';
    if (!prev.trim()) setCopilotPick(null);
    const filled = fillTemplate(replyText, templateValues || {});
    const next = prev.trim() ? `${prev.trim()} ${filled}` : filled;
    setText(next);
    markPlaced(next);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Number-key (1–9) hotkey → insert the matching per-user quick reply.
  const { data: hotkeyReplies = [] } = useQuickReplies(null, tradeType);
  useEffect(() => subscribeQuickReplyHotkey((idx) => {
    const reply = (hotkeyReplies as any[])[idx];
    if (reply?.message_text) handleQuickReply(reply.message_text);
  }), [hotkeyReplies, templateValues]);

  const counterpartyMsgCount = currentOrderMessages.filter(
    (m) => m.senderType === 'counterparty'
  ).length;

  const headerName = counterpartyNickname || 'Counterparty';
  const headerInitials = initialsOf(headerName);

  return (
    <div className="flex flex-col h-full relative">
      {/* Chat header */}
      <div className="h-12 shrink-0 px-3 sm:px-4 border-b border-border flex items-center gap-2.5 bg-card/60">
        <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          {headerInitials ? (
            <span className="text-[11px] font-semibold text-primary">{headerInitials}</span>
          ) : (
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight text-foreground">
            {headerName}
            {counterpartyVerifiedName && (
              <span className="font-normal text-muted-foreground"> · {counterpartyVerifiedName}</span>
            )}
          </p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground" title={previousSeenLabel || undefined}>
            {counterpartyMsgCount > 0 && (
              <span className="sm:hidden">{counterpartyMsgCount} {counterpartyMsgCount === 1 ? 'msg' : 'msgs'} · </span>
            )}
            {previousSeenLabel || (isEnquiryThread ? 'Binance enquiry chat — no order' : 'Binance order chat')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {counterpartyMsgCount > 0 && (
            <Badge variant="secondary" className="hidden sm:inline-flex h-5 px-2 text-[10px] tabular-nums bg-primary/10 text-primary border-none">
              {counterpartyMsgCount} {counterpartyMsgCount === 1 ? 'msg' : 'msgs'}
            </Badge>
          )}
          {/* Delivery status — messages always flow through the server, so a
              missing browser stream is never presented as a failure. */}
          <div
            className={`flex h-5 items-center gap-1 rounded-full border px-2 ${chatListenerHealthy ? 'border-[hsl(var(--trade-buy,var(--success))/0.25)] bg-[hsl(var(--trade-buy,var(--success))/0.1)]' : 'border-warning/30 bg-warning/10'}`}
            title={chatListenerHealthy ? 'Both Binance accounts are synchronized by the server' : 'Server listener is reconnecting; stored messages continue to refresh'}
          >
            <Cloud className={`h-3 w-3 ${chatListenerHealthy ? 'text-trade-buy' : 'text-warning'}`} />
            <span className={`text-[10px] font-medium ${chatListenerHealthy ? 'text-trade-buy' : 'text-warning'}`}>
              {chatListenerHealthy ? 'Server live' : 'Sync delayed'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${soundEnabled ? 'text-primary' : 'text-muted-foreground'}`}
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Mute notifications' : 'Enable notifications'}
            aria-label={soundEnabled ? 'Mute notifications' : 'Enable notifications'}
          >
            {soundEnabled ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>




      {/* Messages area */}
      <div ref={scrollContainerRef} onScroll={handleScroll} onLoadCapture={handleContentLoad} onTouchStart={releasePin} onWheel={releasePin} onPointerDown={releasePin} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-3">
          {/* Lazy history control — sits at the very top, so scrolling up loads more */}
          {historyDiscovering && (
            <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking earlier chats…
            </div>
          )}
          {!historyDiscovering && hasMoreHistory && !historyUnavailable && (
            <div className="flex justify-center pb-3">
              <Button variant="outline" size="sm" className="h-7 rounded-full border-border bg-secondary/60 px-3 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => void loadMoreHistory()} disabled={historyLoading}>
                {historyLoading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <History className="mr-1.5 h-3 w-3" />}
                {historyLoading
                  ? 'Loading earlier chats…'
                  : historicalSections.length > 0
                    ? 'Load earlier chats'
                    : `Scroll up to load earlier chats${pastThreadCount > 0 ? ` (${pastThreadCount})` : ''}`}
              </Button>
            </div>
          )}
          {!historyDiscovering && !hasMoreHistory && historicalSections.length === 0 && !historyUnavailable && (
            <p className="py-2 text-center text-[11px] text-muted-foreground">No earlier chats found</p>
          )}

          {historicalSections.length > 0 && (
            <div className="space-y-4 mb-4">
              {historicalSections.map((chat) => (
                <section key={chat.orderNumber} className="space-y-2.5" aria-label={`Earlier order ${chat.orderNumber}`}>
                  <div className="sticky top-0 z-10 -mx-3 sm:-mx-4 flex items-center gap-2 px-3 sm:px-4 py-1.5 bg-background/95 backdrop-blur border-y border-border/60">
                    <History className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-foreground">Earlier order •••{chat.orderNumber.slice(-4)}</span>
                    <span className="text-[10px] text-muted-foreground">{chat.orderDate ? format(new Date(normalizeChatTimestamp(chat.orderDate)), 'dd MMM yyyy, HH:mm') : ''}</span>
                    <Badge variant="outline" className="ml-auto h-5 px-2 text-[10px] font-medium">{chat.orderStatus || 'Previous'}</Badge>
                  </div>
                  {chat.messages.length > 0 ? withDaySeparators(chat.messages, (message) => (
                    <ChatBubble key={message.id} message={message} />
                  )) : (
                    <p className="py-2 text-center text-[11px] text-muted-foreground">No stored messages for this order</p>
                  )}
                </section>
              ))}
            </div>
          )}
          {historyUnavailable && historicalSections.length === 0 && (
            <div className="flex flex-col items-center gap-1 py-2">
              <p className="text-center text-[11px] text-muted-foreground">Earlier chat history is temporarily unavailable</p>
              <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => void loadMoreHistory()} disabled={historyLoading}>
                {historyLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <History className="mr-1 h-3 w-3" />}
                Retry earlier chats
              </Button>
            </div>
          )}

          {currentOrderMessages.length > 0 ? (
            <div className="space-y-2.5">
              {historicalSections.length > 0 && (
                <div className="-mx-3 sm:-mx-4 flex items-center gap-2 px-3 sm:px-4 py-1.5 border-y border-primary/25 bg-primary/5">
                  <MessageSquare className="h-3 w-3 text-primary" />
                  <span className="text-[11px] font-semibold text-foreground">Current order •••{orderNumber.slice(-4)}</span>
                  <Badge variant="outline" className="ml-auto h-5 px-2 text-[10px] font-medium border-primary/30 text-primary">Active chat</Badge>
                </div>
              )}
              {withDaySeparators(currentOrderMessages, (message) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  onSaveToPlaybook={isCopilotApprover ? saveBubbleToPlaybook : undefined}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          ) : archivedLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
              <p className="text-xs text-muted-foreground">Loading messages...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 py-8 text-center">
              <div className="h-11 w-11 rounded-full bg-secondary flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-xs font-medium text-foreground">No messages yet</p>
              <p className="text-[11px] text-muted-foreground">
                New messages from the counterparty appear here as they arrive
              </p>
            </div>
          )}
      </div>


      {/* Composer: Copilot (approvers), quick replies, then the message box */}
      <div className="relative shrink-0 border-t border-border bg-card/60 px-3 pt-2 pb-3">
        {isCopilotApprover && (
          <div className="mb-2">
            <CopilotPanel
              orderNumber={orderNumber}
              exchangeAccountId={exchangeAccountId}
              tradeType={tradeType}
              orderStatus={orderStatus}
              totalPrice={templateValues?.amount ?? null}
              asset={orderAsset}
              payMethod={paymentMethod}
              trigger={copilotTrigger}
              templateValues={templateValues}
              onInsert={insertCopilotPick}
              onApprove={approveCopilotPick}
              onState={handleCopilotState}
              refreshKey={copilotRefresh}
              binance={copilotBinance}
              binanceLoading={binanceDetailLoading}
            />
          </div>
        )}
        <div className="mb-2 flex items-start gap-2 empty:hidden">
          <QuickReplyBar
            tradeType={tradeType}
            onSelect={handleQuickReply}
          />
        </div>

        {canRephrase && (
          <RephraseStrip
            view={rephrase.view}
            textId={rephraseTextId}
            onUse={() => { applyRewrite(); }}
            onAnother={() => { rephrase.another(); focusInput(); }}
            onLang={(to) => { rephrase.switchLang(to); focusInput(); }}
            onDismiss={() => { rephrase.dismiss(); focusInput(); }}
            onRetry={() => { rephrase.ask(); focusInput(); }}
          />
        )}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-input p-1 transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
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
            onInsert={(adText) => {
              const prev = inputRef.current?.value ?? '';
              const next = prev.trim() ? `${prev.trim()}\n${adText}` : adText;
              setText(next);
              markPlaced(next);
            }}
          />

          <textarea
            ref={inputRef}
            data-terminal-chat-input
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (!e.target.value.trim()) { setCopilotPick(null); setRewrite(null); }
            }}
            aria-describedby={canRephrase && rephrase.view.status === 'ready' ? rephraseTextId : undefined}
            onKeyDown={(e) => {
              // Which key does what is decided in composerKeys.ts (tested): Ctrl/Cmd+Enter approves without sending (not the
              // rough words while their rewrite is on show), Tab uses the rewrite or cycles the suggestions, Esc hides the
              // strip, brings back the typed words, or leaves the box, one at a time: each Esc stops here, so the Terminal's
              // own Esc (back to the list) waits for a press made outside the box.
              const { picks } = copilotStateRef.current;
              const current = text.trim();
              const last = copilotPickRef.current;
              const rw = rewriteRef.current;
              const action = composerKeyAction({
                key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey,
                composing: e.nativeEvent.isComposing || e.keyCode === 229,
                isApprover: isCopilotApprover, canRephrase,
                strip: rephrase.view.status === 'idle' ? 'idle' : rephrase.view.status === 'ready' ? 'ready' : 'other',
                rewriteInBox: !!rw && sameText(text, rw.text),
                canCyclePicks: picks.length > 0 && (!current || (!!last && current === last.text.trim())),
              });
              switch (action) {
                case 'approve': {
                  e.preventDefault();
                  if (!current) return;
                  const rewrite = rewriteSent(current, true, rw);
                  setCopilotPick(null);
                  setRewrite(null);
                  void teachCopilot(last || rewrite ? 'approved' : 'saved', current, last, undefined, rewrite);
                  return;
                }
                case 'approve-refused':
                  e.preventDefault();
                  toast('Use the rewrite or hide it first', { description: 'Tab puts the rewrite in the box, Esc hides it; then Ctrl+Enter approves what the box holds.' });
                  return;
                case 'use-rewrite':
                  if (applyRewrite()) e.preventDefault();
                  return;
                case 'cycle-picks': {
                  e.preventDefault();
                  const idx = last ? picks.findIndex((p) => pickKey(p) === pickKey(last)) : -1;
                  const next = picks[cycleIndex(picks.length, idx, e.shiftKey ? -1 : 1)];
                  if (next) insertCopilotPick(next);
                  return;
                }
                case 'hide-strip': e.preventDefault(); e.stopPropagation(); rephrase.dismiss(); return;
                case 'undo-rewrite': e.preventDefault(); e.stopPropagation(); undoRewrite(); return;
                case 'leave-box': e.stopPropagation(); e.currentTarget.blur(); return;
                case 'ime': e.stopPropagation(); return;
                case 'send': e.preventDefault(); handleSend(); return;
                default: return;
              }
            }}
            placeholder={isEnquiryThread ? 'Reply on the Binance app — this chat has no order' : 'Type a message...'}
            disabled={isEnquiryThread}
            aria-label="Message"
            className="flex-1 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-2 py-[7px] leading-[18px] min-h-8 max-h-[104px] text-[13px] text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          {canRephrase && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`h-8 w-8 shrink-0 rounded-md ${rephrase.view.status === 'loading' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                // Not disabled while rewording (a disabled button drops the focus): a second press just waits.
                if (rephrase.view.status === 'loading') return;
                const r = rephrase.ask();
                if (r === 'short') toast('Type a few words first', { description: 'The Copilot rewords what you typed: same meaning, nothing added.' });
                else if (r === 'long') toast('Too long to reword', { description: 'The Copilot rewords up to 600 characters. Shorten it, or send it as it is.' });
                focusInput();
              }}
              disabled={!text.trim()}
              aria-disabled={rephrase.view.status === 'loading'}
              aria-busy={rephrase.view.status === 'loading'}
              aria-label={rephrase.view.status === 'loading' ? 'Rewording what you typed' : 'Reword what I typed'}
              title={isCopilotApprover
                ? 'Reword what you typed: same meaning, nothing added. A rewrite you send is saved to the Playbook.'
                : 'Reword what you typed: same meaning, nothing added. Approvers see the rewrites you send, to improve the Playbook.'}
            >
              {rephrase.view.status === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
            </Button>
          )}
          {isCopilotApprover && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`h-8 w-8 shrink-0 rounded-md ${copilotSaveOwn ? 'bg-primary/15 text-primary hover:bg-primary/20' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setCopilotSaveOwn((v) => !v)}
              aria-pressed={copilotSaveOwn}
              aria-label="Save this reply to the Playbook when sent"
              title={copilotSaveOwn ? 'Will be saved to the Playbook when sent' : 'Save this reply to the Playbook when sent'}
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => handleSend()}
            disabled={!text.trim() || isSending || isEnquiryThread}
            aria-label="Send message"
            title="Send (Enter)"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>

        </div>
        {canRephrase && rewriteInBox && sameText(text, rewriteInBox) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1 px-1 text-[11px] text-muted-foreground">
            <span>Reworded by the Copilot ·</span>
            <button type="button" className="text-primary hover:underline" onMouseDown={(e) => e.preventDefault()} onClick={() => { undoRewrite(); }}>
              Bring back my words
            </button>
            <span className="hidden [@media(pointer:fine)]:inline">(Esc)</span>
          </p>
        )}
        {isCopilotApprover && copilotPickStep && (
          <p className="mt-1.5 px-1 text-[11px] text-primary">
            Reply for “{copilotPickStep}”: sending it unchanged sets this chat to that step.
          </p>
        )}
        {isEnquiryThread && (
          <p className="text-[11px] text-warning mt-1.5 px-1">
            Enquiry chat with no order — Binance only accepts replies inside an order, so reply from the Binance app
          </p>
        )}

      </div>

      <CopilotEntryDialog entryId={copilotEntryId} onOpenChange={(open) => { if (!open) setCopilotEntryId(null); }} />
    </div>
  );
}
