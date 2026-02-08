import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Image as ImageIcon, MessageSquare } from 'lucide-react';
import { useOrderChats, useSendChatMessage, P2PChatMessage } from '@/hooks/useP2PTerminal';
import { format } from 'date-fns';

interface Props {
  orderId: string;
  counterpartyId: string | null;
  counterpartyNickname: string;
}

export function ChatPanel({ orderId, counterpartyId, counterpartyNickname }: Props) {
  const { data: messages = [], isLoading } = useOrderChats(orderId);
  const sendMessage = useSendChatMessage();
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-muted-foreground">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No messages yet</p>
            <p className="text-[10px] text-muted-foreground/60">
              ⚠ Binance C2C SAPI does not expose chat history. Messages here are locally stored.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
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
          placeholder="Type a message..."
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

function ChatBubble({ message }: { message: P2PChatMessage }) {
  const isOperator = message.sender_type === 'operator';

  return (
    <div className={`flex ${isOperator ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 ${
          isOperator
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-foreground'
        }`}
      >
        <p className="text-xs whitespace-pre-wrap">{message.message_text}</p>
        <p className={`text-[9px] mt-1 ${isOperator ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          {format(new Date(message.created_at), 'HH:mm')}
          {message.is_quick_reply && ' • Quick Reply'}
        </p>
      </div>
    </div>
  );
}
