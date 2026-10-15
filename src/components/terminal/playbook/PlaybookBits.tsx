// Small shared pieces for the Copilot Playbook page.
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { EntryStatus } from '@/lib/copilot/playbookAdmin';
import { STATUS_LABEL } from '@/lib/copilot/playbookAdmin';

export function Pill({ tone = 'muted', children, title, className }: { tone?: 'muted' | 'green' | 'amber' | 'red' | 'primary'; children: ReactNode; title?: string; className?: string }) {
  const cls = {
    muted: 'border-border bg-secondary/60 text-muted-foreground',
    green: 'border-trade-buy/30 bg-trade-buy/10 text-trade-buy',
    amber: 'border-warning/40 bg-warning/10 text-warning',
    red: 'border-destructive/40 bg-destructive/10 text-destructive',
    primary: 'border-primary/30 bg-primary/10 text-primary',
  }[tone];
  return (
    <span title={title} className={cn('inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[10px] font-medium leading-none', cls, className)}>
      {children}
    </span>
  );
}

export function StatusPill({ status, conflict, expired }: { status: EntryStatus; conflict?: boolean; expired?: boolean }) {
  if (conflict) return <Pill tone="red">Conflict</Pill>;
  if (status === 'tentative' && expired) return <Pill tone="muted" title="Its trial period ended without being used; it is no longer offered">Trial ended</Pill>;
  return <Pill tone={status === 'approved' ? 'green' : status === 'tentative' ? 'amber' : 'muted'}>{STATUS_LABEL[status]}</Pill>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ml-1 hidden rounded border border-current/30 px-1 font-sans text-[10px] leading-4 opacity-70 sm:inline">{children}</kbd>;
}

/** A reply as the client would read it: wraps, keeps line breaks, and marks placeholders. */
export function ReplyText({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return <span className="text-xs italic text-muted-foreground">Not written yet</span>;
  const parts = text.split(/(\{(?:amount|orderNo|name|upi|contact:[a-z][a-z0-9_]{0,23})\})/g);
  return (
    <span className={cn('whitespace-pre-wrap break-words text-xs leading-relaxed text-card-foreground', className)}>
      {parts.map((p, i) => (/^\{.+\}$/.test(p)
        ? <span key={i} className="rounded bg-primary/10 px-1 font-mono text-[11px] text-primary" title="Filled in automatically when inserted">{p}</span>
        : <span key={i}>{p}</span>))}
    </span>
  );
}

/**
 * A short chat as it happened (personal numbers already masked): the client on the left, us on the right,
 * Binance's notices in the middle. Used for a reply's example chats and an inbox item's chat.
 */
export function MiniChat({ lines, className, label }: { lines: Array<{ from: string; text: string; at?: string }>; className?: string; label?: string }) {
  if (!lines.length) return null;
  return (
    <div className={cn('space-y-1 rounded-md border border-border bg-background/50 p-2', className)}>
      {label && <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>}
      {lines.map((l, i) => {
        if (l.from === 'system') {
          return <p key={i} className="px-2 text-center text-[10px] italic leading-snug text-muted-foreground">{l.text}</p>;
        }
        const us = l.from === 'us';
        return (
          <div key={i} className={cn('flex', us ? 'justify-end' : 'justify-start')}>
            <span className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-2 py-1 text-[11px] leading-snug',
              us ? 'rounded-br-sm bg-primary/10 text-foreground' : 'rounded-bl-sm bg-secondary text-foreground')}>
              {l.text}
              {l.at && <span className="ml-1.5 whitespace-nowrap text-[9px] text-muted-foreground">{l.at}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
