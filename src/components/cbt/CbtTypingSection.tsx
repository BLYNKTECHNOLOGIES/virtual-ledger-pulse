import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cbtCall, noteServerNow } from '@/lib/cbt/api';
import type { CbtCurrentSection } from '@/lib/cbt/types';

// The typing test is word-committed: a word is locked in as soon as the candidate
// presses space/enter, and committed words are synced to the server, which is the
// only place net WPM and accuracy are computed.
export function CbtTypingSection({
  section,
  onBurst,
  onPasteBlocked,
  onSessionError,
}: {
  section: CbtCurrentSection;
  onBurst: () => void;
  onPasteBlocked: () => void;
  onSessionError: (code: string, message: string) => void;
}) {
  const passage: string = useMemo(() => {
    const item = section.items?.[0];
    return String(item?.content?.passage ?? '');
  }, [section.items]);
  const passageWords = useMemo(() => passage.trim().split(/\s+/).filter(Boolean), [passage]);

  const [committed, setCommitted] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const keystrokes = useRef(0);
  const backspaces = useRef(0);
  const syncing = useRef(false);
  const dirty = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // the newest set of locked words, so a sync that had to wait always sends the latest list
  const latest = useRef<string[]>([]);

  const sync = useCallback(async () => {
    if (syncing.current) {
      dirty.current = true;
      return;
    }
    syncing.current = true;
    try {
      // keep sending until nothing new arrived while the last call was in flight
      while (true) {
        dirty.current = false;
        const words = latest.current.slice(0, 1000);
        const res = await cbtCall<any>('cbt-typing-sync', {
          section_id: section.id,
          committed_words: words,
          keystrokes: keystrokes.current,
          backspaces: backspaces.current,
        });
        noteServerNow(res.server_now);
        if (!dirty.current) break;
      }
    } catch (e: any) {
      dirty.current = true;
      if (e?.code === 'second_session' || e?.code === 'no_token' || e?.code === 'expired') {
        onSessionError(e.code, e.message);
      }
    } finally {
      syncing.current = false;
    }
  }, [section.id, onSessionError]);

  // periodic sync (every 5s while there is something new)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (dirty.current) void sync();
    }, 5000);
    return () => window.clearInterval(id);
  }, [sync]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commitWord = (word: string) => {
    if (!word) return;
    keystrokes.current += 1;
    setCommitted((prev) => {
      const next = prev.length >= 1000 ? prev : [...prev, word];
      latest.current = next;
      return next;
    });
    setCurrent('');
    dirty.current = true;
    void sync();
  };

  const lastBurstCheck = useRef({ at: Date.now(), count: 0 });
  const noteKeystroke = () => {
    keystrokes.current += 1;
    const now = Date.now();
    lastBurstCheck.current.count += 1;
    if (now - lastBurstCheck.current.at > 3000) {
      const cps = lastBurstCheck.current.count / ((now - lastBurstCheck.current.at) / 1000);
      if (cps > 18) onBurst();
      lastBurstCheck.current = { at: now, count: 0 };
    }
  };

  const typedIndex = committed.length;

  // Display-only live speed — the score itself is always computed on the server.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const liveStats = useMemo(() => {
    const started = section.started_at ? new Date(section.started_at).getTime() : Date.now();
    const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
    const minutes = Math.max(1 / 60, seconds / 60);
    let correctWords = 0;
    let correctChars = 0;
    let typedChars = 0;
    committed.forEach((w, i) => {
      typedChars += w.length + 1;
      if (w === passageWords[i]) {
        correctWords += 1;
        correctChars += w.length + 1;
      }
    });
    const errors = committed.length - correctWords;
    return {
      net: Math.round(correctChars / 5 / minutes),
      gross: Math.round(typedChars / 5 / minutes),
      accuracy: committed.length ? Math.round((correctWords / committed.length) * 100) : 100,
      errors,
      typedChars,
      seconds,
      backspaces: backspaces.current,
      keystrokes: keystrokes.current,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed, passageWords, section.started_at, tick]);

  const targetWpm = Number((section as any).full_marks_wpm ?? 0) || null;
  const progress = passageWords.length ? Math.min(100, (typedIndex / passageWords.length) * 100) : 0;
  const mmss = `${String(Math.floor(liveStats.seconds / 60)).padStart(2, '0')}:${String(liveStats.seconds % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        {[
          { label: 'Net WPM', value: liveStats.net, hint: targetWpm ? `target ${targetWpm}` : undefined },
          { label: 'Gross WPM', value: liveStats.gross },
          { label: 'Accuracy', value: `${liveStats.accuracy}%` },
          { label: 'Errors', value: liveStats.errors },
          { label: 'Characters', value: liveStats.typedChars },
          { label: 'Time on test', value: mmss },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card px-3 py-2 text-center">
            <p className="font-mono text-xl font-bold tabular-nums">{s.value}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
            {s.hint && <p className="text-[10px] text-muted-foreground">{s.hint}</p>}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex flex-wrap justify-between gap-x-4 text-[11px] text-muted-foreground">
          <span>{typedIndex} of {passageWords.length} words · {Math.round(progress)}% of the passage</span>
          <span>Keystrokes {liveStats.keystrokes} · corrections {liveStats.backspaces}</span>
        </div>
      </div>


      <div className="rounded-lg border border-border bg-muted/40 p-4 text-base leading-relaxed">

        {passageWords.map((w, i) => {
          const done = i < typedIndex;
          const ok = done && committed[i] === w;
          return (
            <span
              key={`${w}-${i}`}
              className={
                i === typedIndex
                  ? 'rounded bg-primary/20 px-1 font-semibold text-foreground'
                  : done
                    ? ok
                      ? 'text-muted-foreground'
                      : 'rounded bg-destructive/15 px-1 text-destructive'
                    : 'text-foreground'
              }
            >
              {w}{' '}
            </span>
          );
        })}
      </div>

      <input
        ref={inputRef}
        aria-label="Type the passage here"
        value={current}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onPaste={(e) => {
          e.preventDefault();
          onPasteBlocked();
        }}
        onCopy={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Backspace') backspaces.current += 1;
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            commitWord(current.trim());
          }
        }}
        onChange={(e) => {
          noteKeystroke();
          setCurrent(e.target.value.replace(/\s+/g, '').slice(0, 80));
        }}
        className="w-full rounded-lg border border-border bg-background px-4 py-3 font-mono text-lg text-foreground outline-none focus:ring-2 focus:ring-primary"
        placeholder="Start typing… press space to lock each word"
      />

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {typedIndex} of {passageWords.length} words locked
        </span>
        <span>Backspace only fixes the word you are typing — locked words cannot be changed.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (current.trim()) commitWord(current.trim());
            else void sync();
          }}
        >
          Save my progress
        </Button>
      </div>
    </div>
  );
}
