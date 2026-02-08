import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, MessageSquare, Loader2, CloudDownload, Volume2, VolumeX, Bell } from 'lucide-react';
import { useOrderChats, useSendChatMessage, P2PChatMessage } from '@/hooks/useP2PTerminal';
import { useBinanceChatMessages, BinanceChatMessage, useMarkMessagesRead, useSendBinanceChatMessage } from '@/hooks/useBinanceActions';
import { ChatBubble, UnifiedMessage } from './chat/ChatBubble';
import { ChatImageUpload } from './chat/ChatImageUpload';
import { QuickReplyBar } from './chat/QuickReplyBar';
import { playMessageSound } from '@/lib/chatSound';
import { toast } from 'sonner';

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
  const sendBinanceMessage = useSendBinanceChatMessage();
  const markRead = useMarkMessagesRead();
  const [text, setText] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('terminal-chat-sound');
    return saved !== 'false';
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const prevBinanceIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  // Persist sound preference
  useEffect(() => {
    localStorage.setItem('terminal-chat-sound', String(soundEnabled));
  }, [soundEnabled]);

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

  // New message detection & sound notification
  useEffect(() => {
    const currentBinanceIds = new Set(binanceMessages.map((m) => String(m.id)));

    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      prevBinanceIdsRef.current = currentBinanceIds;
      prevCountRef.current = allMessages.length;
      return;
    }

    // Detect genuinely new Binance messages (counterparty)
    const newMessages = binanceMessages.filter(
      (m) => !prevBinanceIdsRef.current.has(String(m.id)) && m.chatMessageType !== 'system'
    );

    if (newMessages.length > 0 && soundEnabled) {
      playMessageSound('message');
      // Toast for new counterparty messages
      const latest = newMessages[newMessages.length - 1];
      if (latest.message) {
        toast.info(`New message from ${counterpartyNickname}`, {
          description: latest.message.substring(0, 80),
          duration: 4000,
        });
      }
    }

    prevBinanceIdsRef.current = currentBinanceIds;
    prevCountRef.current = allMessages.length;
  }, [binanceMessages, allMessages.length, soundEnabled, counterpartyNickname]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages]);

  const handleSend = (messageText?: string) => {
    const msg = messageText || text.trim();
    if (!msg) return;
    
    // Send via Binance API (will appear in counterparty's chat)
    sendBinanceMessage.mutate({ orderNo: orderNumber, message: msg });
    
    // Also store locally for our records
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

  const counterpartyMsgCount = allMessages.filter(
    (m) => m.senderType === 'counterparty' && m.source === 'binance'
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
          <div className="flex items-center gap-0.5 ml-1 bg-muted/30 rounded px-1 py-0.5">
            <div className="h-1.5 w-1.5 rounded-full bg-trade-buy animate-pulse" />
            <span className="text-[8px] text-muted-foreground">10s</span>
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
      <div className="p-3 border-t border-border bg-card/50">
        <div className="flex items-center gap-2">
          <ChatImageUpload
            orderNo={orderNumber}
            onImageSent={() => refetchChat()}
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
            disabled={!text.trim() || sendMessage.isPending}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[8px] text-muted-foreground/50 mt-1 px-1">
          💡 Messages are stored locally. Binance chat messages are synced via API polling.
        </p>
      </div>
    </div>
  );
}
