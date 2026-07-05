import { useRef, useState, useCallback } from 'react';
import { Sparkles, RefreshCw, AlertTriangle, ShieldAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CopilotResponse {
  situation: string;
  risk: 'none' | 'caution' | 'high';
  risk_reason: string;
  suggestions: string[];
  next_action: string;
}

interface Props {
  orderId: string;
  /** Total number of messages in this order — used to key the response cache. */
  messageCount: number;
  /** Insert a suggestion into the chat input (same insertion path as quick replies). */
  onInsert: (text: string) => void;
}

export function CopilotStrip({ orderId, messageCount, onInsert }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CopilotResponse | null>(null);
  // Cache last response per orderId+messageCount to avoid duplicate calls.
  const cacheRef = useRef<{ key: string; value: CopilotResponse } | null>(null);
  const inFlightRef = useRef(false);

  const run = useCallback(async (force = false) => {
    if (inFlightRef.current) return;
    const key = `${orderId}:${messageCount}`;
    if (!force && cacheRef.current?.key === key) {
      setData(cacheRef.current.value);
      setExpanded(true);
      return;
    }

    inFlightRef.current = true;
    setLoading(true);
    setExpanded(true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const { data: resp, error } = await supabase.functions.invoke('order-copilot', {
        body: { orderId },
      });
      if (error) throw error;
      if ((resp as any)?.error) throw new Error((resp as any).error);

      const value = resp as CopilotResponse;
      cacheRef.current = { key, value };
      setData(value);
    } catch (err: any) {
      toast.error(err?.message || 'Copilot unavailable — use quick replies');
      setExpanded(false);
    } finally {
      clearTimeout(timer);
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [orderId, messageCount]);

  if (!expanded) {
    return (
      <div className="px-3 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded-full"
          onClick={() => run(false)}
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI Copilot
        </Button>
      </div>
    );
  }

  return (
    <div className="px-3 pt-1.5 pb-1 border-t border-border/40 bg-card/20">
      <div className="flex items-center gap-2 mb-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold text-foreground">AI Copilot</span>
        {data?.risk === 'caution' && (
          <Badge variant="outline" className="text-[9px] gap-1 bg-warning/10 text-warning border-warning/30">
            <AlertTriangle className="h-2.5 w-2.5" /> Caution
          </Badge>
        )}
        {data?.risk === 'high' && (
          <Badge variant="outline" className="text-[9px] gap-1 bg-destructive/10 text-destructive border-destructive/30">
            <ShieldAlert className="h-2.5 w-2.5" /> High risk
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Regenerate"
            disabled={loading}
            onClick={() => run(true)}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(false)}
          >
            Hide
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="t-shimmer h-12 rounded-md" />
      ) : data ? (
        <div className="space-y-1.5">
          {data.situation && (
            <p className="text-xs text-muted-foreground leading-snug">{data.situation}</p>
          )}
          {data.risk !== 'none' && data.risk_reason && (
            <p className="text-[10px] text-warning/90 leading-snug">{data.risk_reason}</p>
          )}
          {data.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {data.suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => onInsert(s)}
                  className="text-left text-[11px] leading-snug px-2.5 py-1 rounded-full bg-secondary border border-border text-foreground hover:border-primary/40 hover:bg-accent transition-colors max-w-full"
                  title="Insert into chat (review before sending)"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {data.next_action && (
            <p className="text-[10px] text-muted-foreground/80 italic pt-0.5">→ {data.next_action}</p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Analyzing…
        </div>
      )}
    </div>
  );
}
