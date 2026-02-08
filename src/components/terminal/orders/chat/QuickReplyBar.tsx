import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Zap, ChevronDown } from 'lucide-react';
import { useQuickReplies } from '@/hooks/useP2PTerminal';

interface Props {
  tradeType?: string | null;
  orderType?: string | null;
  onSelect: (text: string) => void;
}

export function QuickReplyBar({ tradeType, orderType, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const { data: replies = [] } = useQuickReplies(orderType, tradeType);

  if (replies.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground px-2"
        >
          <Zap className="h-3 w-3 text-trade-pending" />
          Quick Replies
          <ChevronDown className="h-2.5 w-2.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 bg-card border-border"
        align="start"
        side="top"
      >
        <div className="px-3 py-2 border-b border-border">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Quick Replies
          </span>
        </div>
        <ScrollArea className="max-h-60">
          <div className="p-1">
            {replies.map((reply: any) => (
              <button
                key={reply.id}
                onClick={() => {
                  onSelect(reply.message_text);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded hover:bg-secondary/80 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-primary">{reply.label}</span>
                  {reply.trade_type && (
                    <span className={`text-[8px] px-1 rounded ${
                      reply.trade_type === 'BUY' ? 'text-trade-buy bg-trade-buy/10' : 'text-trade-sell bg-trade-sell/10'
                    }`}>
                      {reply.trade_type}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                  {reply.message_text}
                </p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
