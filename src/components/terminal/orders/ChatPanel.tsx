import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, MessageSquare, Loader2, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { useBinanceChatWebSocket } from '@/hooks/useBinanceChatWebSocket';
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
  const { messages: wsMessages, isConnected, isConnecting, sendMessage: wsSendMessage, sendImageMessage: wsSendImage, error: wsError } = useBinanceChatWebSocket(orderNumber);
  const [text, setText] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('terminal-chat-sound');
    return saved !== 'false';
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const prevBinanceIdsRef = useRef<Set<number>>(new Set());
  const isInitialLoadRef = useRef(true);

  // Persist sound preference
  useEffect(() => {
    localStorage.setItem('terminal-chat-sound', String(soundEnabled));
  }, [soundEnabled]);

  // Build unified messages from WebSocket data
  const allMessages: UnifiedMessage[] = useMemo(() => {
    const messages: UnifiedMessage[] = [];

    for (const msg of wsMessages) {
      const msgType = msg.type || msg.chatMessageType || 'text';
      const isSelf = msg.self === true;
      const isImage = msgType === 'image';
      const imgUrl = msg.imageUrl || msg.thumbnailUrl || undefined;
      messages.push({
        id: `binance-${msg.id}`,
        source: 'binance',
        senderType: msgType === 'system' ? 'system' : (isSelf ? 'operator' : 'counterparty'),
        // For image messages, don't show the URL as text content
        text: isImage ? null : (msg.content || msg.message || null),
        imageUrl: isImage ? (imgUrl || msg.content || msg.message || undefined) : imgUrl,
        timestamp: msg.createTime || 0,
      });
    }

    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }, [wsMessages]);

  // New message detection & sound notification
  useEffect(() => {
    const currentIds = new Set(wsMessages.map((m) => m.id));

    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      prevBinanceIdsRef.current = currentIds;
      prevCountRef.current = allMessages.length;
      return;
    }

    // Detect genuinely new counterparty messages
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
    prevCountRef.current = allMessages.length;
  }, [wsMessages, allMessages.length, soundEnabled, counterpartyNickname]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages]);

  const [isSending, setIsSending] = useState(false);

  const handleSend = async (messageText?: string) => {
    const msg = messageText || text.trim();
    if (!msg || isSending) return;
    if (!messageText) setText('');
    setIsSending(true);
    
    try {
      // Send via WebSocket through relay → Binance WS
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

  const counterpartyMsgCount = allMessages.filter(
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
      <ScrollArea className="flex-1 px-4 py-3">
        {wsMessages.length === 0 && isConnecting ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
            <p className="text-xs text-muted-foreground">Loading messages...</p>
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">No messages yet</p>
            <p className="text-[10px] text-muted-foreground/60">
              Messages will appear here in real-time via WebSocket
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {allMessages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
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
