// Playbook inbox (approvers): conflicts to resolve and tentative replies to review. Nothing here calls the AI.
// Keyboard: A approve · E edit · R reject · S skip (tentative); N keep new · O keep existing · B keep both (conflicts);
// ↑/↓ or J/K move. Shortcuts are ignored while typing, holding Ctrl, Cmd or Alt, while any dialog or menu is open,
// and as the second key of the Terminal's "g then letter" go-to shortcuts; A/R/N/O/B wait about a second.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/EmptyState';
import { CheckCircle2, ChevronDown, ChevronUp, GitCompareArrows, Inbox, Loader2, Pencil, SkipForward, Trash2, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { isReviewShortcut } from '@/lib/cbt/reviewQueue';
import { expiryText, isExpired, istShort, replyLabel, scopeSummary, type EntryStatus, type Scope } from '@/lib/copilot/playbookAdmin';
import { stagesSummary } from '@/lib/copilot/situations';
import {
  copilotAdmin, useCopilotInbox, useCopilotSituations, useRefreshCopilot, useUserNames, userLabel, type EntryRow, type InboxRow, type QuestionRow,
} from '@/hooks/useCopilotAdmin';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import { Kbd, MiniChat, Pill, ReplyText, StatusPill } from './PlaybookBits';

type Busy = { id: string; what: string } | null;

/** Same test the Terminal's global shortcuts use: any Radix dialog, sheet, alert or popover open. */
const overlayOpen = () => !!document.querySelector(
  '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[data-radix-popper-content-wrapper]',
);

function Questions({ rows, max = 4 }: { rows: QuestionRow[]; max?: number }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className="text-[11px] text-muted-foreground">No client phrasings — offered only from the Playbook, not matched in chats.</p>;
  const shown = all ? rows : rows.slice(0, max);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((q) => (
        <span key={q.id} className="rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 text-[11px] text-foreground">“{q.question_text}”</span>
      ))}
      {rows.length > max && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-[11px] text-primary hover:underline">
          {all ? 'Show fewer' : `+${rows.length - max} more`}
        </button>
      )}
    </div>
  );
}

function EntryBlock({ e, label, scopeText }: { e: EntryRow | undefined; label: string; scopeText: (e: EntryRow) => string }) {
  if (!e) return <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">{label}: this reply no longer exists.</div>;
  return (
    <div className="min-w-0 space-y-1.5 rounded-md border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <StatusPill status={e.status as EntryStatus} />
        <Pill tone="primary">{scopeText(e)}</Pill>
      </div>
      <ReplyText text={e.reply_en} />
      {e.reply_hi && <div className="border-t border-border/60 pt-1.5"><span className="mr-1 text-[10px] text-muted-foreground">Hindi</span><ReplyText text={e.reply_hi} className="text-muted-foreground" /></div>}
      <p className="text-[10px] text-muted-foreground">
        Used {e.use_count} {e.use_count === 1 ? 'time' : 'times'} · version {e.version}{e.approved_at ? ` · approved ${istShort(e.approved_at)}` : ''}
      </p>
    </div>
  );
}

export function PlaybookInbox({ onEditEntry, paused }: { onEditEntry: (entryId: string) => void; paused: boolean }) {
  const { data, isLoading, error } = useCopilotInbox(true);
  const { data: situations } = useCopilotSituations();
  const refresh = useRefreshCopilot();
  const { data: users = [] } = useUserNames();
  const { nameFor } = useExchangeAccount();
  const names = useCallback((codes: string[]) => stagesSummary(codes, situations), [situations]);
  const scopeText = useCallback((e: EntryRow) => scopeSummary(e.scope as Scope, nameFor, names), [nameFor, names]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const [pos, setPos] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  const shownAt = useRef(0);
  const gAt = useRef(0);

  const queue = useMemo(() => {
    const items = data?.items ?? [];
    const rank = (i: InboxRow) => (i.kind === 'conflict' ? 0 : i.kind === 'seed' ? 1 : 2);
    return [...items].sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  }, [data?.items]);
  const current = queue[Math.min(pos, Math.max(0, queue.length - 1))];
  useEffect(() => { if (pos > 0 && pos >= queue.length) setPos(Math.max(0, queue.length - 1)); }, [pos, queue.length]);
  useEffect(() => { shownAt.current = Date.now(); }, [current?.id]);
  // Coming back from the edit sheet counts as showing the item again (no instant approve on close).
  useEffect(() => { if (!paused) shownAt.current = Date.now(); }, [paused]);

  const entry = (id: string | null | undefined) => (id ? data?.entries.get(id) : undefined);
  const counts = useMemo(() => ({
    conflict: queue.filter((i) => i.kind === 'conflict').length,
    seed: queue.filter((i) => i.kind === 'seed').length,
    operator: queue.filter((i) => i.kind === 'operator_question').length,
  }), [queue]);

  const run = useCallback(async (item: InboxRow, what: string, fn: () => Promise<unknown>, done: string) => {
    setBusy({ id: item.id, what });
    try {
      await fn();
      toast.success(done);
      refresh();
    } catch (e) {
      toast.error((e as Error).message || 'Not changed');
      refresh();
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const decideSeed = useCallback(async (item: InboxRow, decision: 'approve' | 'reject') => {
    setBusy({ id: item.id, what: decision });
    try {
      const r = await copilotAdmin.decideSeed(item.id, decision);
      const status = r?.entry_status;
      if (decision === 'approve') {
        if (status === 'approved') toast.success('Approved — offered as an approved reply from now on');
        else toast('Closed', { description: 'This reply was already retired, so it stays retired.' });
      } else if (status === 'retired') toast.success('Rejected — it will not be offered again');
      else toast('Closed', { description: 'This reply was already approved, so it stays approved. Retire it on the Entries tab if needed.' });
    } catch (e) {
      toast.error((e as Error).message || 'Not changed');
    } finally {
      setBusy(null);
      refresh();
    }
  }, [refresh]);
  const resolve = useCallback((item: InboxRow, keep: 'new' | 'old' | 'both') => run(item, keep,
    () => copilotAdmin.resolveConflict(item.id, keep),
    keep === 'both' ? 'Both answers kept' : keep === 'new' ? 'New answer kept; the old one is retired' : 'Existing answer kept; the new one is retired'), [run]);
  const skip = useCallback(() => setPos((p) => (queue.length ? (p + 1) % queue.length : 0)), [queue.length]);

  useEffect(() => {
    if (!current || paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || busy || !isReviewShortcut(e) || overlayOpen()) return;
      const k = e.key.toLowerCase();
      // "g" starts a Terminal go-to shortcut (g then a letter); its second key must not act here.
      if (k === 'g') { gAt.current = Date.now(); return; }
      if (Date.now() - gAt.current < 800) { gAt.current = 0; return; }
      const early = Date.now() - shownAt.current < 1000;
      if (k === 'arrowdown' || k === 'j') { e.preventDefault(); setPos((p) => Math.min(queue.length - 1, p + 1)); return; }
      if (k === 'arrowup' || k === 'k') { e.preventDefault(); setPos((p) => Math.max(0, p - 1)); return; }
      if (k === 's') { e.preventDefault(); skip(); return; }
      if (current.kind === 'seed') {
        if (k === 'e' && current.entry_id) { e.preventDefault(); onEditEntry(current.entry_id); }
        else if ((k === 'a' || k === 'r') && !early) { e.preventDefault(); void decideSeed(current, k === 'a' ? 'approve' : 'reject'); }
      } else if (current.kind === 'conflict') {
        if ((k === 'n' || k === 'o') && !early) { e.preventDefault(); void resolve(current, k === 'n' ? 'new' : 'old'); }
        else if (k === 'b' && !early) { e.preventDefault(); void resolve(current, 'both'); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, paused, busy, queue.length, skip, decideSeed, resolve, onEditEntry]);

  if (isLoading) return <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (error) return <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>;
  if (!queue.length) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="py-2">
          <EmptyState icon={Inbox} title="Nothing to review"
            description="Conflicts between two approved answers and tentative replies appear here. Operators' unanswered questions will appear here too once approved replies are switched on for operators." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {[counts.conflict && `${counts.conflict} conflict${counts.conflict === 1 ? '' : 's'}`,
            counts.seed && `${counts.seed} tentative ${counts.seed === 1 ? 'reply' : 'replies'}`,
            counts.operator && `${counts.operator} operator question${counts.operator === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
        </p>
        <p className="hidden text-[11px] text-muted-foreground md:block">
          Keys: A approve · E edit · R reject · S skip · N / O / B for conflicts · ↑ ↓ move
        </p>
      </div>
      {counts.seed > 0 && (
        <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] leading-relaxed text-foreground">
          Tentative replies come from the starter set, one per situation (“When”), each with a typical chat. They are offered
          only to you and Abhishek, marked “Tentative”, and sending one in a chat approves it. Approve or reject them here
          when you have a moment; unused ones stop being offered when their trial ends.
        </p>
      )}

      <ol className="space-y-2" aria-label="Inbox items">
        {queue.map((item, i) => {
          const open = item.id === current?.id;
          const e = entry(item.entry_id);
          const other = entry(item.other_entry_id);
          const working = busy?.id === item.id;
          const topicTitle = (x: EntryRow | undefined) => (x ? data?.topics.get(x.topic_id)?.title ?? x.title : undefined);
          const title = item.kind === 'conflict' ? (topicTitle(other) ?? topicTitle(e) ?? 'Conflict') : (topicTitle(e) ?? 'Removed reply');
          const example = e ? data?.examples.get(e.id)?.[0] : undefined;
          const siblings = e ? (data?.siblings.get(e.topic_id) ?? []).filter((x) => x.id !== e.id) : [];
          const chat = Array.isArray((item.context as { chat?: unknown } | null)?.chat) ? ((item.context as { chat: Array<{ from: string; text: string; at?: string }> }).chat) : [];
          return (
            <li key={item.id}>
              <div className={`rounded-lg border bg-card transition-colors ${open ? 'border-primary/50 ring-1 ring-primary/30' : 'border-border hover:border-primary/30'}`}>
                <button type="button" onClick={() => setPos(i)} aria-expanded={open}
                  className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left">
                  {item.kind === 'conflict' ? <Pill tone="red"><GitCompareArrows className="h-2.5 w-2.5" />Conflict</Pill>
                    : item.kind === 'seed' ? <StatusPill status={(e?.status ?? 'tentative') as EntryStatus} expired={e ? isExpired(e) : false} />
                    : <Pill tone="primary">Operator question</Pill>}
                  <span className="min-w-0 max-w-full flex-1 truncate text-sm font-medium text-foreground">{title}</span>
                  {item.kind === 'seed' && e && <span className="max-w-full shrink-0 truncate text-[11px] text-muted-foreground">When: {replyLabel(e.scope as Scope, names)}</span>}
                  {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>

                {open && item.kind === 'seed' && (
                  <div className="space-y-3 border-t border-border px-3 pb-3 pt-2.5">
                    {!e ? <p className="text-xs text-muted-foreground">This reply was removed. Reject to close the item.</p> : (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">When:</span>
                          <Pill tone="primary">{scopeText(e)}</Pill>
                          {e.status === 'tentative' && <span>{expiryText(e.expires_at)}</span>}
                          {e.risk === 'red' && <Pill tone="red">Risk topic</Pill>}
                          {e.status !== 'tentative' && <span>Already {e.status} — approving or rejecting only closes this item.</span>}
                        </div>
                        {example && <MiniChat lines={example.chat} label={example.source === 'seed' ? 'A typical chat for this reply' : 'The chat it was used in'} />}
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-muted-foreground">Ways clients ask this question</p>
                          <Questions rows={data?.questions.get(e.topic_id) ?? []} />
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="rounded-md border border-border bg-background/40 p-2.5"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">English</p><ReplyText text={e.reply_en} /></div>
                          <div className="rounded-md border border-border bg-background/40 p-2.5"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Hindi (English letters)</p><ReplyText text={e.reply_hi} /></div>
                        </div>
                        {e.internal_note && <p className="text-[11px] text-muted-foreground">Note: {e.internal_note}</p>}
                        {siblings.length > 0 && (
                          <div className="space-y-1 rounded-md border border-dashed border-border p-2.5">
                            <p className="text-[11px] font-medium text-muted-foreground">The same question in other situations</p>
                            <ul className="space-y-1">
                              {siblings.map((x) => (
                                <li key={x.id} className="text-[11px] leading-snug">
                                  <span className="font-medium text-foreground">{replyLabel(x.scope as Scope, names)}</span>
                                  <span className="text-muted-foreground"> ({x.status}) — </span>
                                  <span className="text-muted-foreground">{x.reply_en ?? x.reply_hi}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" className="h-8" loading={working && busy?.what === 'approve'} disabled={!!busy || !e} onClick={() => void decideSeed(item, 'approve')}>
                        <CheckCircle2 className="h-3.5 w-3.5" />Approve<Kbd>A</Kbd>
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" disabled={!!busy || !e} onClick={() => e && onEditEntry(e.id)}>
                        <Pencil className="h-3.5 w-3.5" />Edit<Kbd>E</Kbd>
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-destructive hover:text-destructive" loading={working && busy?.what === 'reject'} disabled={!!busy} onClick={() => void decideSeed(item, 'reject')}>
                        <Trash2 className="h-3.5 w-3.5" />Reject<Kbd>R</Kbd>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" disabled={!!busy || queue.length < 2} onClick={skip}>
                        <SkipForward className="h-3.5 w-3.5" />Skip<Kbd>S</Kbd>
                      </Button>
                    </div>
                  </div>
                )}

                {open && item.kind === 'conflict' && (
                  <div className="space-y-3 border-t border-border px-3 pb-3 pt-2.5">
                    <p className="text-xs text-foreground">
                      {item.question_text ? <>Client asked: “{item.question_text}”</> : 'Two approved answers disagree.'}
                      <span className="text-muted-foreground"> · saved {istShort(item.created_at)} by {userLabel(userById.get(item.created_by ?? ''), item.created_by)}{item.order_number ? ` · order ${item.order_number}` : ''}</span>
                    </p>
                    {chat.length > 0 && <MiniChat lines={chat} label="The chat" />}
                    <div className="grid gap-2 md:grid-cols-2">
                      <EntryBlock e={other} label="Existing answer" scopeText={scopeText} />
                      <EntryBlock e={e} label="New answer" scopeText={scopeText} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Keep one answer per situation. Keep both only if the chats differ in a way that changes the answer — then set each one's situation on the Questions tab.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" className="h-8" loading={working && busy?.what === 'new'} disabled={!!busy} onClick={() => void resolve(item, 'new')}>
                        <ThumbsUp className="h-3.5 w-3.5" />Keep new<Kbd>N</Kbd>
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" loading={working && busy?.what === 'old'} disabled={!!busy} onClick={() => void resolve(item, 'old')}>
                        Keep existing<Kbd>O</Kbd>
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" loading={working && busy?.what === 'both'} disabled={!!busy} onClick={() => void resolve(item, 'both')}>
                        Keep both<Kbd>B</Kbd>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" disabled={!!busy || queue.length < 2} onClick={skip}>
                        <SkipForward className="h-3.5 w-3.5" />Skip<Kbd>S</Kbd>
                      </Button>
                    </div>
                  </div>
                )}

                {open && item.kind === 'operator_question' && (
                  <div className="border-t border-border px-3 pb-3 pt-2.5 text-xs text-muted-foreground">
                    {item.question_text ? `“${item.question_text}”` : 'Operator question'} — answering operators' questions arrives with the operator step.
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
