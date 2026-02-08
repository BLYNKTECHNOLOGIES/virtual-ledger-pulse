import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MessageSquare, Loader2, CloudDownload, Volume2, VolumeX } from 'lucide-react';
import { useOrderChats, useSendChatMessage, P2PChatMessage } from '@/hooks/useP2PTerminal';
import { useBinanceChatMessages, BinanceChatMessage, useMarkMessagesRead } from '@/hooks/useBinanceActions';
import { ChatBubble, UnifiedMessage } from './chat/ChatBubble';
import { ChatImageUpload } from './chat/ChatImageUpload';
import { QuickReplyBar } from './chat/QuickReplyBar';

interface Props {
  orderId: string;
  orderNumber: string;
  counterpartyId: string | null;
  counterpartyNickname: string;
  tradeType?: string;
}

export function ChatPanel({ orderId, orderNumber, counterpartyId, counterpartyNickname, tradeType }: Props) {
  const { data: localMessages = [], isLoading: localLoading } = useOrderChats(orderId);
  const { data: binanceData, isLoading: binanceLoading, refetch: refetchChat } = useBinanceChatMessages(orderNumber);
  const sendMessage = useSendChatMessage();
  const markRead = useMarkMessagesRead();
  const [text, setText] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Mark messages as read when chat opens
  useEffect(() => {
    if (orderNumber) {
      markRead.mutate({ orderNo: orderNumber });
    }
  }, [orderNumber]);

  // Parse Binance chat messages
  const binanceMessages: BinanceChatMessage[] = useMemo(() => {
    if (!binanceData) return [];
    const list = binanceData?.data || binanceData?.list || [];
    return Array.isArray(list) ? list : [];
  }, [binanceData]);

  // Merge and sort all messages
  const allMessages: UnifiedMessage[] = useMemo(() => {
    const messages: UnifiedMessage[] = [];

    for (const msg of binanceMessages) {
      messages.push({
        id: `binance-${msg.id}`,
        source: 'binance',
        senderType: msg.chatMessageType === 'system' ? 'system' : 'counterparty',
        text: msg.message || null,
        imageUrl: msg.imageUrl,
        timestamp: msg.createTime || 0,
      });
    }

    for (const msg of localMessages) {
      messages.push({
        id: `local-${msg.id}`,
        source: 'local',
        senderType: msg.sender_type === 'operator' ? 'operator' : 'counterparty',
        text: msg.message_text,
        timestamp: new Date(msg.created_at).getTime(),
        isQuickReply: msg.is_quick_reply,
      });
    }

    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }, [binanceMessages, localMessages]);

  const isLoading = localLoading || binanceLoading;

  // Sound notification for new messages
  useEffect(() => {
    if (allMessages.length > prevCountRef.current && prevCountRef.current > 0 && soundEnabled) {
      // New message arrived - could play sound here
    }
    prevCountRef.current = allMessages.length;
  }, [allMessages.length, soundEnabled]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages]);

  const handleSend = (messageText?: string) => {
    const msg = messageText || text.trim();
    if (!msg) return;
    sendMessage.mutate({
      order_id: orderId,
      counterparty_id: counterpartyId || undefined,
      sender_type: 'operator',
      message_text: msg,
    });
    if (!messageText) setText('');
  };

  const handleQuickReply = (replyText: string) => {
    handleSend(replyText);
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Chat header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-card/50">
        <MessageSquare className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground">Chat</span>
        <span className="text-[10px] text-muted-foreground">— {counterpartyNickname}</span>
        <div className="ml-auto flex items-center gap-1">
          {binanceMessages.length > 0 && (
            <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded tabular-nums">
              {binanceMessages.length} msgs
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Mute notifications' : 'Enable notifications'}
          >
            {soundEnabled ? (
              <Volume2 className="h-3 w-3 text-muted-foreground" />
            ) : (
              <VolumeX className="h-3 w-3 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => refetchChat()}
            title="Refresh chat from Binance"
          >
            <CloudDownload className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
            <p className="text-xs text-muted-foreground">Loading messages...</p>
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">No messages yet</p>
            <p className="text-[10px] text-muted-foreground/60">
              Messages from Binance chat will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {allMessages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Quick replies bar */}
      <div className="px-3 py-1 border-t border-border/50 bg-card/30">
        <QuickReplyBar
          tradeType={tradeType}
          onSelect={handleQuickReply}
        />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-border flex items-center gap-2 bg-card/50">
        <ChatImageUpload
          orderNo={orderNumber}
          onImageSent={() => refetchChat()}
        />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message (local note)..."
          className="h-8 text-xs bg-secondary border-border"
        />
        <Button
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => handleSend()}
          disabled={!text.trim() || sendMessage.isPending}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
