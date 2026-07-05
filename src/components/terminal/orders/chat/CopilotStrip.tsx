import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw, X } from 'lucide-react';
import {
  fetchCopilotSuggestions,
  type CopilotSuggestInput,
  type CopilotSuggestResult,
} from '@/hooks/useCopilot';

interface Props {
  /** Lazily builds the fully client-side context (order + messages + profile). */
  buildInput: () => CopilotSuggestInput;
  /** Same insertion path as quick replies (fillTemplate applies upstream). */
  onInsert: (text: string) => void;
  /** Stable key per order + message count — used to cache the last response. */
  cacheKey: string;
}

const SITUATION_LABELS: Record<string, string> = {
  payment_claim: 'Payment claim',
  utr_request: 'UTR / proof request',
  delay: 'Delay',
  wrong_amount: 'Wrong amount',
  release_pressure: 'Release pressure',
  appeal: 'Appeal',
  greeting: 'Greeting',
  closing: 'Closing',
  other: 'General',
};

export function CopilotStrip({ buildInput, onInsert, cacheKey }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<CopilotSuggestResult | null>(null);
  const cache = useRef<Map<string, CopilotSuggestResult>>(new Map());

  const run = useCallback(async (force = false) => {
    setFailed(false);
    if (!force && cache.current.has(cacheKey)) {
      setResult(cache.current.get(cacheKey)!);
      setOpen(true);
      return;
    }
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetchCopilotSuggestions(buildInput());
      if (!res.suggestions.length) {
        setFailed(true); // collapse silently to quick replies
        setOpen(false);
        return;
      }
      cache.current.set(cacheKey, res);
      setResult(res);
    } catch {
      setFailed(true); // any error → collapse silently
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [buildInput, cacheKey]);

  // Error state: render nothing so only quick replies remain visible.
  if (failed && !open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => run(true)}
        className="h-7 rounded-full bg-secondary border border-border text-xs gap-1 text-muted-foreground hover:text-foreground px-3"
      >
        <Sparkles className="h-3 w-3 text-primary" />
        AI
      </Button>
    );
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => run(false)}
        className="h-7 rounded-full bg-secondary border border-border text-xs gap-1 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors px-3"
      >
        <Sparkles className="h-3 w-3 text-primary" />
        AI Copilot
      </Button>
    );
  }

  return (
    <div className="flex-1 min-w-0 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Sparkles className="h-3 w-3 text-primary shrink-0" />
        {loading ? (
          <span className="text-[10px] text-muted-foreground animate-pulse">Thinking…</span>
        ) : (
          <span className="text-[10px] font-medium text-primary">
            {SITUATION_LABELS[result?.situation || 'other'] || result?.situation}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost" size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            disabled={loading}
            onClick={() => run(true)}
            title="Regenerate"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
            title="Close"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-1">
          <div className="h-5 rounded bg-muted/60 animate-pulse" />
          <div className="h-5 rounded bg-muted/40 animate-pulse w-4/5" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {(result?.suggestions || []).map((s, i) => (
            <button
              key={i}
              onClick={() => onInsert(s)}
              className="text-left text-[10px] leading-snug rounded-full bg-card border border-border px-2 py-1 hover:border-primary/50 hover:bg-secondary/80 transition-colors max-w-full"
              title="Insert into input (review before sending)"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
