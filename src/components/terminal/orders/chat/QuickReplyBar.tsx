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
          className="h-7 rounded-full bg-secondary border border-border text-xs gap-1.5 text-muted-foreground hover:text-foreground hover:bg-accent hover:border-primary/30 transition-colors duration-150 px-3"
        >
          <Zap className="h-3.5 w-3.5 text-trade-pending" />
          Quick Replies
          <ChevronDown className="h-3 w-3" />
        </Button>

      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 bg-popover border-border"
        align="start"
        side="top"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Quick Replies
          </span>
          <span className="text-[10px] text-muted-foreground">Inserts into the message box</span>
        </div>
        <ScrollArea className="max-h-60">
          <div className="p-1">
            {replies.map((reply: any, index: number) => (
              <button
                key={reply.id}
                onClick={() => {
                  onSelect(reply.message_text);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary/80 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{reply.label}</span>
                  {reply.trade_type && (
                    <span className={`text-[10px] font-medium px-1 rounded ${
                      reply.trade_type === 'BUY' ? 'text-trade-buy bg-[hsl(var(--trade-buy,var(--success))/0.1)]' : 'text-trade-sell bg-[hsl(var(--trade-sell,var(--destructive))/0.1)]'
                    }`}>
                      {reply.trade_type}
                    </span>
                  )}
                  {index < 9 && (
                    <span className="ml-auto text-[10px] px-1 rounded border border-border text-muted-foreground bg-secondary/60 t-mono">
                      Alt+{index + 1}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
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
