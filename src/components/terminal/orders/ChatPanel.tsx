import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Badge } from '@/components/ui/badge';
import { Send, MessageSquare, Loader2, Volume2, VolumeX, Wifi, WifiOff, History } from 'lucide-react';
import { useBinanceChatWebSocket } from '@/hooks/useBinanceChatWebSocket';
import { useCounterpartyChatHistory } from '@/hooks/useCounterpartyChatHistory';
import { ChatBubble, UnifiedMessage } from './chat/ChatBubble';
import { ChatImageUpload } from './chat/ChatImageUpload';
import { QuickReplyBar } from './chat/QuickReplyBar';
import { OrderChatSeparator } from './chat/OrderChatSeparator';
import { playMessageSound } from '@/lib/chatSound';
import { toast } from 'sonner';

interface Props {
  orderId: string;
  orderNumber: string;
  counterpartyId: string | null;
  counterpartyNickname: string;
  tradeType?: string;
  counterpartyVerifiedName?: string;
}

export function ChatPanel({ orderId, orderNumber, counterpartyId, counterpartyNickname, tradeType, counterpartyVerifiedName }: Props) {
  const { messages: wsMessages, isConnected, isConnecting, sendMessage: wsSendMessage, sendImageMessage: wsSendImage, error: wsError } = useBinanceChatWebSocket(orderNumber);
  const { historicalChats, isLoading: historyLoading, hasMore, loadMore } = useCounterpartyChatHistory(counterpartyNickname, orderNumber, counterpartyVerifiedName);
  const [text, setText] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('terminal-chat-sound');
    return saved !== 'false';
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const prevBinanceIdsRef = useRef<Set<number>>(new Set());
  const isInitialLoadRef = useRef(true);
  const shouldAutoScrollRef = useRef(true);
  const prevScrollHeightRef = useRef(0);

  // Persist sound preference
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

  // Build unified messages from WebSocket data (current order)
  const currentOrderMessages: UnifiedMessage[] = useMemo(() => {
    const messages: UnifiedMessage[] = [];
    for (const msg of wsMessages) {
      const msgType = msg.type || msg.chatMessageType || 'text';
      const isSelf = msg.self === true;
      const content = msg.content || msg.message || '';
      const isImage = msgType === 'image' || isImageUrl(content);
      const imgUrl = msg.imageUrl || msg.thumbnailUrl || undefined;
      messages.push({
        id: `binance-${msg.id}`,
        source: 'binance',
        senderType: msgType === 'system' ? 'system' : (isSelf ? 'operator' : 'counterparty'),
        text: isImage ? null : (content || null),
        imageUrl: isImage ? (imgUrl || content || undefined) : imgUrl,
        timestamp: msg.createTime || 0,
      });
    }
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }, [wsMessages, isImageUrl]);

  // Build historical messages from past orders
  const historicalSections = useMemo(() => {
    return historicalChats.map((order) => {
      const messages: UnifiedMessage[] = order.messages.map((msg) => {
        const msgType = msg.type || 'text';
        const isSelf = msg.self === true;
        const isImage = msgType === 'image';
        const imgUrl = msg.imageUrl || msg.thumbnailUrl || undefined;

        // Check if image might be expired (order older than 7 days)
        const isOldOrder = Date.now() - order.orderDate > 7 * 24 * 60 * 60 * 1000;
        const effectiveImgUrl = isImage && isOldOrder ? undefined : (isImage ? (imgUrl || msg.content || msg.message || undefined) : imgUrl);

        return {
          id: `hist-${order.orderNumber}-${msg.id}`,
          source: 'binance' as const,
          senderType: msgType === 'system' ? 'system' as const : (isSelf ? 'operator' as const : 'counterparty' as const),
          text: isImage
            ? (isOldOrder ? '🖼️ Image expired (older than 7 days)' : null)
            : (msg.content || msg.message || null),
          imageUrl: effectiveImgUrl,
          timestamp: msg.createTime || 0,
        };
      });
      return { order, messages: messages.sort((a, b) => a.timestamp - b.timestamp) };
    });
  }, [historicalChats]);

  // All messages for counting
  const allMessages = useMemo(() => {
    const hist = historicalSections.flatMap((s) => s.messages);
    return [...hist, ...currentOrderMessages];
  }, [historicalSections, currentOrderMessages]);

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
    } catch (err) {
      // Error handled by WS hook
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickReply = (replyText: string) => {
    handleSend(replyText);
  };

  const counterpartyMsgCount = currentOrderMessages.filter(
    (m) => m.senderType === 'counterparty'
  ).length;

  return (
    <div className="flex flex-col h-full relative">
      {/* Chat header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-card/50">
        <MessageSquare className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground">Chat</span>
        <span className="text-[10px] text-muted-foreground">— {counterpartyNickname}</span>
        <div className="ml-auto flex items-center gap-1">
          {counterpartyMsgCount > 0 && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 tabular-nums bg-primary/10 text-primary border-none">
              {counterpartyMsgCount} msgs
            </Badge>
          )}
          {/* WebSocket status indicator */}
          <div className="flex items-center gap-0.5 ml-1 bg-muted/30 rounded px-1.5 py-0.5" title={isConnected ? 'WebSocket connected' : isConnecting ? 'Connecting...' : 'Disconnected'}>
            {isConnected ? (
              <>
                <Wifi className="h-2.5 w-2.5 text-trade-buy" />
                <span className="text-[8px] text-trade-buy font-medium">Live</span>
              </>
            ) : isConnecting ? (
              <>
                <Loader2 className="h-2.5 w-2.5 text-warning animate-spin" />
                <span className="text-[8px] text-warning">Connecting</span>
              </>
            ) : (
              <>
                <WifiOff className="h-2.5 w-2.5 text-destructive" />
                <span className="text-[8px] text-destructive">Offline</span>
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

      {/* Connection error banner */}
      {wsError && (
        <div className="px-3 py-1.5 bg-destructive/10 border-b border-destructive/20">
          <p className="text-[10px] text-destructive">{wsError}</p>
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

          {/* Historical order chats */}
          {historicalSections.map((section) => (
            <div key={section.order.orderNumber}>
              <OrderChatSeparator
                orderNumber={section.order.orderNumber}
                tradeType={section.order.tradeType}
                asset={section.order.asset}
                totalPrice={section.order.totalPrice}
                fiatUnit={section.order.fiatUnit}
                orderDate={section.order.orderDate}
              />
              {section.messages.length === 0 ? (
                <div className="flex justify-center py-1">
                  <span className="text-[9px] text-muted-foreground/50">No chat messages in this order</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {section.messages.map((msg) => (
                    <ChatBubble key={msg.id} message={msg} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Current order separator (only if history is loaded) */}
          {historicalChats.length > 0 && (
            <div className="flex items-center gap-2 py-3 my-2">
              <div className="flex-1 h-px bg-primary/30" />
              <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                <span className="text-[9px] text-primary font-semibold">
                  Current Order #{orderNumber.slice(-8)}
                </span>
                {tradeType && (
                  <span className={`text-[9px] font-semibold ${tradeType === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
                    {tradeType}
                  </span>
                )}
              </div>
              <div className="flex-1 h-px bg-primary/30" />
            </div>
          )}

          {/* Current order messages */}
          {wsMessages.length === 0 && isConnecting ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
              <p className="text-xs text-muted-foreground">Loading messages...</p>
            </div>
          ) : currentOrderMessages.length === 0 && historicalChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <MessageSquare className="h-8 w-8 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground">No messages yet</p>
              <p className="text-[10px] text-muted-foreground/60">
                Messages will appear here in real-time via WebSocket
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {currentOrderMessages.map((msg) => (
                <ChatBubble key={msg.id} message={msg} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
      </div>

      {/* Quick replies bar */}
      <div className="px-3 py-1 border-t border-border/50 bg-card/30">
        <QuickReplyBar
          tradeType={tradeType}
          onSelect={handleQuickReply}
        />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-border bg-card/50">
        <div className="flex items-center gap-2">
          <ChatImageUpload
            orderNo={orderNumber}
            onImageSent={(imageUrl) => wsSendImage(orderNumber, imageUrl)}
          />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="h-8 text-xs bg-background text-foreground border-border placeholder:text-muted-foreground"
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => handleSend()}
            disabled={!text.trim() || isSending}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[8px] text-muted-foreground/50 mt-1 px-1">
          {!isConnected 
            ? '⏳ Connecting to Binance chat...' 
            : isConnecting 
              ? '🟡 Reconnecting...' 
              : '🟢 Real-time chat active'
          }
        </p>
      </div>
    </div>
  );
}
