import { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Calculator, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { CbtCurrentSection } from '@/lib/cbt/types';

type Props = {
  section: CbtCurrentSection;
  drafts: Record<string, Record<string, any> | null>;
  setDraft: (itemId: string, response: Record<string, any> | null) => void;
  flushDraft: (itemId: string) => Promise<void>;
  savingItems: Record<string, boolean>;
  busy: boolean;
  onSubmit: () => void;
  onPasteBlocked: () => void;
};

// Skill Box drills: one item at a time, answers land on the server as you go.
// Nothing is scored in the browser — the on-screen counters are progress only.
export function CbtSkillDrill({
  section,
  drafts,
  setDraft,
  flushDraft,
  savingItems,
  busy,
  onSubmit,
  onPasteBlocked,
}: Props) {
  const items = section.items ?? [];
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [countdown, setCountdown] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const item = items[Math.min(index, Math.max(0, items.length - 1))];
  const isMemory = section.section_type === 'memory_recall';

  const attempted = useMemo(
    () =>
      items.filter((i) => {
        const d = drafts[i.id] ?? i.response;
        return d != null && String((d as any).value ?? '').trim() !== '';
      }).length,
    [items, drafts],
  );

  // memorise window countdown for the current sequence
  useEffect(() => {
    if (!item || !isMemory) return;
    if (!revealed[item.id] || hidden[item.id]) return;
    const total = Number((item.content as any)?.show_seconds ?? 5);
    setCountdown(total);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const left = Math.max(0, total - Math.round((Date.now() - started) / 1000));
      setCountdown(left);
      if (left <= 0) {
        window.clearInterval(timer);
        setHidden((h) => ({ ...h, [item.id]: true }));
        setCountdown(null);
        window.setTimeout(() => inputRef.current?.focus(), 50);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [item?.id, isMemory, revealed, hidden]);

  useEffect(() => {
    if (!isMemory) inputRef.current?.focus();
  }, [index, isMemory]);

  if (!item) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nothing to attempt here</CardTitle>
          <CardDescription>Please tell HR — this drill has no items.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onSubmit}>Continue</Button>
        </CardContent>
      </Card>
    );
  }

  const value = String(((drafts[item.id] ?? item.response) as any)?.value ?? '');
  const setValue = (v: string) => setDraft(item.id, v.trim() === '' ? null : { value: v });

  const go = async (n: number) => {
    await flushDraft(item.id);
    setIndex(Math.max(0, Math.min(items.length - 1, n)));
  };

  const last = index >= items.length - 1;
  const sequence: string[] = Array.isArray((item.content as any)?.sequence) ? (item.content as any).sequence : [];
  const showSequence = isMemory && revealed[item.id] && !hidden[item.id];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-medium">
          {isMemory ? <Brain className="h-3.5 w-3.5 text-primary" /> : <Calculator className="h-3.5 w-3.5 text-primary" />}
          {isMemory ? 'Memory recall drill' : 'Mental maths drill'}
        </span>
        <span className="rounded-md bg-muted px-2 py-1 font-medium tabular-nums">
          {index + 1} / {items.length}
        </span>
        <span className="rounded-md bg-primary/10 px-2 py-1 font-medium text-primary tabular-nums">
          {attempted} attempted
        </span>
        {savingItems[item.id] && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving
          </span>
        )}
      </div>

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-8">
          {isMemory ? (
            <div className="space-y-4 text-center">
              {!revealed[item.id] ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    You will see a sequence of {(item.content as any)?.sequence?.length ?? 0} characters for{' '}
                    {(item.content as any)?.show_seconds ?? 5} seconds. Memorise it, then type it back in the same order.
                  </p>
                  <Button size="lg" onClick={() => setRevealed((r) => ({ ...r, [item.id]: true }))}>
                    <Eye className="mr-2 h-4 w-4" /> Show the sequence
                  </Button>
                </>
              ) : showSequence ? (
                <>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Memorise · hides in {countdown ?? 0}s
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {sequence.map((ch, i) => (
                      <span
                        key={`${ch}-${i}`}
                        className="flex h-14 w-11 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 font-mono text-2xl font-bold"
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    <EyeOff className="h-3.5 w-3.5" /> Type the sequence in order
                  </p>
                  <Input
                    ref={inputRef}
                    value={value}
                    inputMode="text"
                    autoComplete="off"
                    onPaste={(e) => {
                      e.preventDefault();
                      onPasteBlocked();
                    }}
                    onChange={(e) => setValue(e.target.value.toUpperCase())}
                    placeholder="e.g. 4 K 9 T"
                    className="mx-auto max-w-sm text-center font-mono text-xl tracking-[0.3em] text-foreground"
                  />
                  <p className="text-xs text-muted-foreground">Spaces are optional. Order matters.</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-5 text-center">
              <p className="font-mono text-4xl font-bold tabular-nums sm:text-5xl">
                {String((item.content as any)?.prompt ?? '')}
              </p>
              <Input
                ref={inputRef}
                value={value}
                inputMode="decimal"
                autoComplete="off"
                onPaste={(e) => {
                  e.preventDefault();
                  onPasteBlocked();
                }}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !last) void go(index + 1);
                }}
                placeholder="Your answer"
                className="mx-auto max-w-xs text-center text-xl text-foreground"
              />
              <p className="text-xs text-muted-foreground">Press Enter for the next question.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-border bg-card/95 px-3 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button
          variant="outline"
          className="flex-1 sm:flex-none"
          disabled={index === 0 || isMemory}
          onClick={() => void go(index - 1)}
        >
          Previous
        </Button>
        {last ? (
          <Button size="lg" className="flex-1 sm:flex-none" disabled={busy} onClick={onSubmit}>
            Submit this drill
          </Button>
        ) : (
          <Button className="flex-1 sm:flex-none" onClick={() => void go(index + 1)}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
