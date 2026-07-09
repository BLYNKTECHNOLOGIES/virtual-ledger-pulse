import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw, X } from 'lucide-react';
import {
  fetchCopilotSuggestions,
  logSuggestionsShown,
  markSuggestionInserted,
  type CopilotSuggestInput,
  type CopilotSuggestResult,
} from '@/hooks/useCopilot';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';

interface Props {
  /** Lazily builds the fully client-side context (order + messages + profile). */
  buildInput: () => CopilotSuggestInput;
  /** Same insertion path as quick replies (fillTemplate applies upstream). */
  onInsert: (text: string) => void;
  /** Stable key per order + message count — used to cache the last response. */
  cacheKey: string;
  /** When true, silently prefetch on new counterparty messages (item 7). */
  prefetch?: boolean;
  /** Changes when a new counterparty message arrives — drives the prefetch debounce. */
  prefetchSignal?: number;
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

interface CachedEntry extends CopilotSuggestResult {
  logIds: string[];
}

export function CopilotStrip({ buildInput, onInsert, cacheKey, prefetch, prefetchSignal }: Props) {
  const { userId } = useTerminalAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<CachedEntry | null>(null);
  const [ready, setReady] = useState(false); // subtle dot when a prefetch is available
  const cache = useRef<Map<string, CachedEntry>>(new Map());

  // Fetch + cache + log 'shown'. Returns the cached entry (or null on empty/failure).
  const fetchAndCache = useCallback(async (): Promise<CachedEntry | null> => {
    const input = buildInput();
    const res = await fetchCopilotSuggestions(input);
    if (!res.suggestions.length) return null;
    const logIds = await logSuggestionsShown({
      orderNumber: input.order?.number,
      exchangeAccountId: input.exchangeAccountId,
      operatorId: userId,
      situation: res.situation,
      suggestions: res.suggestions,
      exemplarIds: res.exemplarIds,
    });
    const entry: CachedEntry = { ...res, logIds };
    cache.current.set(cacheKey, entry);
    return entry;
  }, [buildInput, cacheKey, userId]);

  const run = useCallback(async (force = false) => {
    setFailed(false);
    if (!force && cache.current.has(cacheKey)) {
      setResult(cache.current.get(cacheKey)!);
      setReady(false);
      setOpen(true);
      return;
    }
    setOpen(true);
    setLoading(true);
    try {
      const entry = await fetchAndCache();
      if (!entry) { setFailed(true); setOpen(false); return; }
      setResult(entry);
      setReady(false);
    } catch {
      setFailed(true); // any error → collapse silently
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, fetchAndCache]);

  // Prefetch on a new counterparty message (debounced). Never when tab unfocused.
  useEffect(() => {
    if (!prefetch) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (cache.current.has(cacheKey)) { setReady(true); return; }
    const t = setTimeout(async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (cache.current.has(cacheKey)) { setReady(true); return; }
      try {
        const entry = await fetchAndCache();
        if (entry) setReady(true);
      } catch { /* silent */ }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetch, prefetchSignal, cacheKey]);

  const handleClick = (text: string, idx: number) => {
    const logId = result?.logIds?.[idx];
    if (logId) markSuggestionInserted(logId);
    onInsert(text);
  };

  // Error state: render nothing so only quick replies remain visible.
  if (failed && !open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => run(true)}
        className="h-7 rounded-full bg-secondary border border-border text-xs gap-1 text-foreground hover:text-foreground px-3"
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
        className="relative h-7 rounded-full bg-secondary border border-border text-xs gap-1 text-foreground hover:text-foreground hover:border-primary/40 transition-colors px-3"
      >
        <Sparkles className="h-3 w-3 text-primary" />
        AI Copilot
        {ready && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" title="Suggestions ready" />
        )}
      </Button>
    );
  }

  return (
    <div className="flex-1 min-w-0 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Sparkles className="h-3 w-3 text-primary shrink-0" />
        {loading ? (
          <span className="text-[10px] text-foreground animate-pulse">Thinking…</span>
        ) : (
          <span className="text-[10px] font-medium text-foreground">
            {SITUATION_LABELS[result?.situation || 'other'] || result?.situation}
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost" size="icon"
            className="h-5 w-5 text-foreground/80 hover:text-foreground"
            disabled={loading}
            onClick={() => run(true)}
            title="Regenerate"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-5 w-5 text-foreground/80 hover:text-foreground"
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
        <div className="flex flex-wrap gap-1.5">
          {(result?.suggestions || []).map((s, i) => (
            <button
              key={i}
              onClick={() => handleClick(s, i)}
              className="text-left text-[11px] leading-snug rounded-full bg-card border border-border text-card-foreground px-2.5 py-1.5 hover:border-primary/50 hover:bg-secondary/80 active:bg-secondary transition-colors max-w-full"
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
