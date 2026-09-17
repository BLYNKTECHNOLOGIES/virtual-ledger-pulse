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

  return (
    <div className="space-y-4">
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
            else void sync(committed);
          }}
        >
          Save my progress
        </Button>
      </div>
    </div>
  );
}
