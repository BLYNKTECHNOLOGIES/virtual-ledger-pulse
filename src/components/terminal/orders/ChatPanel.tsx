import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Image as ImageIcon, MessageSquare, Loader2, CloudDownload } from 'lucide-react';
import { useOrderChats, useSendChatMessage, P2PChatMessage } from '@/hooks/useP2PTerminal';
import { useBinanceChatMessages, BinanceChatMessage, useMarkMessagesRead } from '@/hooks/useBinanceActions';
import { format } from 'date-fns';

interface Props {
  orderId: string;
  orderNumber: string;
  counterpartyId: string | null;
  counterpartyNickname: string;
}

interface UnifiedMessage {
  id: string;
  source: 'binance' | 'local';
  senderType: 'operator' | 'counterparty' | 'system';
  text: string | null;
  imageUrl?: string;
  timestamp: number;
  isQuickReply?: boolean;
}

export function ChatPanel({ orderId, orderNumber, counterpartyId, counterpartyNickname }: Props) {
  const { data: localMessages = [], isLoading: localLoading } = useOrderChats(orderId);
  const { data: binanceData, isLoading: binanceLoading, refetch: refetchChat } = useBinanceChatMessages(orderNumber);
  const sendMessage = useSendChatMessage();
  const markRead = useMarkMessagesRead();
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

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

    // Binance messages
    for (const msg of binanceMessages) {
      messages.push({
        id: `binance-${msg.id}`,
        source: 'binance',
        senderType: msg.chatMessageType === 'system' ? 'system' : 'counterparty', // Binance chat messages from counterparty perspective
        text: msg.message || null,
        imageUrl: msg.imageUrl,
        timestamp: msg.createTime || 0,
      });
    }

    // Local messages
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages]);

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage.mutate({
      order_id: orderId,
      counterparty_id: counterpartyId || undefined,
      sender_type: 'operator',
      message_text: text.trim(),
    });
    setText('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Chat</span>
        <span className="text-xs text-muted-foreground">— {counterpartyNickname}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {binanceMessages.length > 0 && (
            <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              {binanceMessages.length} from Binance
            </span>
          )}
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

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
            <p className="text-xs text-muted-foreground">Loading messages...</p>
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {allMessages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0" disabled>
          <ImageIcon className="h-4 w-4" />
        </Button>
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
          onClick={handleSend}
          disabled={!text.trim() || sendMessage.isPending}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: UnifiedMessage }) {
  const isOperator = message.senderType === 'operator';
  const isSystem = message.senderType === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="bg-muted/50 rounded px-3 py-1.5 max-w-[90%]">
          <p className="text-[10px] text-muted-foreground text-center">{message.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOperator ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 ${
          isOperator
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-foreground'
        }`}
      >
        {message.imageUrl && (
          <img 
            src={message.imageUrl} 
            alt="Chat image" 
            className="max-w-full rounded mb-1.5 max-h-48 object-contain"
          />
        )}
        {message.text && (
          <p className="text-xs whitespace-pre-wrap">{message.text}</p>
        )}
        <div className={`flex items-center gap-1.5 mt-1 ${isOperator ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          <p className="text-[9px]">
            {message.timestamp ? format(new Date(message.timestamp), 'HH:mm') : ''}
          </p>
          {message.source === 'binance' && (
            <span className="text-[8px] bg-primary/20 px-1 rounded">Binance</span>
          )}
          {message.isQuickReply && (
            <span className="text-[8px]">• Quick Reply</span>
          )}
        </div>
      </div>
    </div>
  );
}
