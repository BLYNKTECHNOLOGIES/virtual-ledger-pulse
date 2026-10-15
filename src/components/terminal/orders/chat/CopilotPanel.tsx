// Copilot v2 panel for approvers (Shubham, Abhishek) in the Terminal order chat.
// Approved Playbook replies come first (no AI). AI drafts are made only for this open chat, only when no
// approved reply fits or the approver asks. Nothing is ever sent from here: Insert puts text in the composer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertTriangle, BookCheck, Check, ChevronDown, ChevronUp, CornerDownLeft, History, Languages, Loader2, MapPin, Phone, RefreshCw,
  ShieldAlert, Sparkles, Wand2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  copilotDraft, copilotReject, CopilotError, type AiDraft, type DraftResponse, type PlaybookSuggestion,
} from '@/hooks/useCopilotPlaybook';
import { copilotAdmin, useCopilotSituations, useCopilotTeams, useUserNames, userLabel } from '@/hooks/useCopilotAdmin';
import {
  FLAG_LABEL, REJECT_REASONS, contactsUsed, fillCopilotText, modelLabel, statusLabel, teamLabel, type ContactPurpose,
} from '@/lib/copilot/copilotText';
import { markableSituations, STATUS_SITUATIONS } from '@/lib/copilot/situations';
import type { TemplateOrderValues } from '@/lib/fill-template';

export interface CopilotPick {
  kind: 'entry' | 'draft';
  entryId?: string | null;
  callId?: string | null;
  requestId: string | null;
  /** Text as inserted into the composer (order values and contact numbers filled in). */
  text: string;
  title?: string;
}

interface Props {
  orderNumber: string;
  exchangeAccountId?: string | null;
  tradeType?: string | null;
  orderStatus?: string | null;
  totalPrice?: number | string | null;
  asset?: string | null;
  payMethod?: string | null;
  /** The client message that still needs an answer (null when we spoke last). */
  trigger: { key: string; hint: { id: string; text: string } | null } | null;
  templateValues?: TemplateOrderValues;
  onInsert: (pick: CopilotPick) => void;
  onApprove: (pick: CopilotPick) => void;
  /** Lets the composer cycle suggestions with Tab and attach the request to what gets saved. */
  onState: (s: { requestId: string | null; picks: CopilotPick[] }) => void;
}

const COLLAPSE_KEY = 'terminal-copilot-collapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };
const writeCollapsed = (v: boolean) => { try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ } };

const INSTRUCTION_CHIPS: Array<{ key: string; label: string }> = [
  { key: 'shorter', label: 'Shorter' },
  { key: 'formal', label: 'More formal' },
  { key: 'detail', label: 'Add detail' },
];

function Chip({ tone = 'muted', children, title }: { tone?: 'muted' | 'green' | 'amber' | 'red' | 'primary'; children: React.ReactNode; title?: string }) {
  const cls = {
    muted: 'border-border bg-secondary/60 text-muted-foreground',
    green: 'border-trade-buy/30 bg-trade-buy/10 text-trade-buy',
    amber: 'border-warning/40 bg-warning/10 text-warning',
    red: 'border-destructive/40 bg-destructive/10 text-destructive',
    primary: 'border-primary/30 bg-primary/10 text-primary',
  }[tone];
  return (
    <span title={title} className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-medium leading-none ${cls}`}>
      {children}
    </span>
  );
}

function RejectButton({ onReject, disabled }: { onReject: (reason: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState('');
  const pick = (reason: string) => { setOpen(false); setOther(''); onReject(reason); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" disabled={disabled} aria-label="Reject draft" title="Reject (kept as an example to avoid)">
          <X className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-60 p-2">
        <p className="px-1 pb-1.5 text-[11px] font-medium text-foreground">Why reject it?</p>
        <div className="flex flex-col gap-0.5">
          {REJECT_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => pick(r)} className="rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary">
              {r}
            </button>
          ))}
        </div>
        <form className="mt-1.5 flex gap-1" onSubmit={(e) => { e.preventDefault(); if (other.trim()) pick(other.trim()); }}>
          <Input value={other} onChange={(e) => setOther(e.target.value.slice(0, 200))} placeholder="Other reason" className="h-7 text-xs" aria-label="Other reason" />
          <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={!other.trim()}>Reject</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** What the client is waiting for, as the Copilot worked it out; an approver can change it for this chat. */
function SituationMenu({ side, current, detected, detectedLabel, marked, disabled, onPick }: {
  side: 'BUY' | 'SELL' | null; current: string | null; detected: string | null; detectedLabel: string | null; marked: boolean;
  disabled?: boolean; onPick: (code: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: rows } = useCopilotSituations();
  const options = markableSituations(rows, side);
  const label = rows?.find((r) => r.code === current)?.label ?? current ?? 'Unknown';
  // Binance's own status (paid, completed, cancelled, appeal) decides these; nothing to change by hand.
  if (!side || !options.length || (current && STATUS_SITUATIONS.has(current))) return <span className="font-medium text-foreground">{label}</span>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} title="Change the situation for this chat"
          className="inline-flex items-center gap-0.5 rounded px-1 font-medium text-foreground underline decoration-dotted underline-offset-2 hover:bg-secondary disabled:opacity-60">
          {label}<ChevronDown className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 p-1.5">
        <p className="px-1.5 pb-1 text-[11px] font-medium text-foreground">What is the client waiting for?</p>
        <div className="flex flex-col gap-0.5">
          {options.map((o) => (
            <button key={o.code} type="button" onClick={() => { setOpen(false); if (o.code !== current) onPick(o.code); }}
              className={`rounded px-2 py-1.5 text-left text-xs hover:bg-secondary ${o.code === current ? 'bg-primary/10 text-primary' : 'text-foreground'}`}>
              <span className="block font-medium">{o.label}</span>
              <span className="block text-[10px] leading-snug text-muted-foreground">{o.description}</span>
            </button>
          ))}
          {marked && detected && (
            <button type="button" onClick={() => { setOpen(false); onPick(null); }} className="mt-0.5 rounded border-t border-border px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-secondary">
              Back to what the chat shows: {detectedLabel ?? detected}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CopilotPanel({
  orderNumber, exchangeAccountId, tradeType, orderStatus, totalPrice, asset, payMethod, trigger, templateValues, onInsert, onApprove, onState,
}: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [data, setData] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [custom, setCustom] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const seq = useRef(0);

  const triggerKey = trigger?.key ?? null;
  const triggerRef = useRef(trigger);
  triggerRef.current = trigger;
  const { data: teams } = useCopilotTeams();
  const { data: users = [] } = useUserNames();

  const load = useCallback(async (mode: 'suggest' | 'redraft' | 'force', instruction: string | null = null) => {
    const mine = ++seq.current;
    if (mode === 'suggest') setLoading(true); else setBusy(instruction ?? mode);
    setError(null);
    try {
      const res = await copilotDraft({
        orderNumber, exchangeAccountId: exchangeAccountId ?? null, mode, instruction,
        hint: { tradeType, status: orderStatus, totalPrice, asset, payMethod, latest: triggerRef.current?.hint ?? null },
      }, () => mine !== seq.current);
      if (mine !== seq.current) return;
      setData(res);
      setHidden(new Set());
    } catch (e) {
      if (mine !== seq.current) return;
      const err = e as CopilotError;
      if (err.code === 'cancelled') return;
      setError(err.code === 'too_many_requests' ? 'Too many requests — wait a moment and try again.' : err.message || 'Could not load suggestions.');
    } finally {
      if (mine === seq.current) { setLoading(false); setBusy(null); }
    }
  }, [orderNumber, exchangeAccountId, tradeType, orderStatus, totalPrice, asset, payMethod]);

  // New client message (or a new order status) → suggestions for it. Closing the chat stops everything.
  useEffect(() => {
    seq.current++;
    setData(null);
    setError(null);
    setLoading(false);
    setBusy(null);
    if (!triggerKey) return;
    const t = setTimeout(() => { void load('suggest'); }, 600);
    // Bumping the sequence on cleanup drops any answer that arrives after the chat changed or closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { clearTimeout(t); seq.current++; };
  }, [orderNumber, triggerKey, orderStatus, load]);

  const fill = useCallback((text: string) => fillCopilotText(text, templateValues, data?.contacts), [templateValues, data?.contacts]);
  const requestId = data?.requestId ?? null;
  const drafts = useMemo(() => (data?.drafts ?? []).filter((d) => !(d.callId && hidden.has(d.callId))), [data?.drafts, hidden]);
  const playbook = useMemo(() => data?.playbook ?? [], [data?.playbook]);
  const related = useMemo(() => data?.related ?? [], [data?.related]);

  const picks = useMemo<CopilotPick[]>(() => [
    ...playbook.filter((p) => !p.conflict).map((p) => ({ kind: 'entry' as const, entryId: p.entryId, requestId, text: fill(p.text), title: p.title })),
    ...drafts.filter((d) => !d.blocked).map((d) => ({ kind: 'draft' as const, callId: d.callId, requestId, text: fill(d.text) })),
  ], [playbook, drafts, requestId, fill]);

  useEffect(() => { onState({ requestId, picks }); }, [requestId, picks, onState]);

  const toggleCollapsed = () => setCollapsed((c) => { writeCollapsed(!c); return !c; });

  const changeSituation = async (code: string | null) => {
    const side = data?.context?.side;
    if (!side) return;
    setBusy('situation');
    try {
      await copilotAdmin.setSituation(orderNumber, side, code, data?.context?.situation_detected ?? null);
      toast.success(code ? 'Situation changed for this chat' : 'Back to the situation the chat shows', { description: 'Suggestions updated for it.' });
      setBusy(null);
      await load('suggest');
    } catch (e) {
      setBusy(null);
      toast.error((e as Error).message || 'Could not change the situation');
    }
  };

  const reject = async (d: AiDraft, reason: string) => {
    if (!d.callId) return;
    setHidden((h) => new Set(h).add(d.callId!));
    try {
      await copilotReject(d.callId, reason);
      toast('Draft rejected', { description: 'Kept as an example to avoid — never used as a reply.' });
    } catch (e) {
      setHidden((h) => { const n = new Set(h); n.delete(d.callId!); return n; });
      toast.error((e as Error).message || 'Could not reject the draft');
    }
  };

  const ctx = data?.context;
  const markedBy = ctx?.situation_marked ? userLabel(users.find((u) => u.id === ctx.situation_marked?.by), ctx.situation_marked.by) : null;
  const risks = ctx?.risks ?? [];
  const redRisks = risks.filter((r) => r.level === 'red');
  const lang = ctx?.language === 'hi' ? 'Hindi' : 'English';
  const address = ctx?.address === 'maam' ? "ma'am" : 'sir';
  const budget = data?.budget;
  const working = loading || !!busy;
  const approvedFound = data?.skippedReason === 'approved_reply_found';
  const conflictFound = data?.skippedReason === 'conflict_found';
  const aiFailed = data?.aiFailed ?? 0;
  const missing = (data?.missingContacts ?? []) as ContactPurpose[];

  const statusLine = (() => {
    if (loading) return <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Reading the chat…</span>;
    if (error) return <span className="text-destructive">{error}</span>;
    if (!triggerKey && !data) return <span className="text-muted-foreground">No new client message.</span>;
    if (!data) return null;
    if (data.status === 'nothing_to_answer') return <span className="text-muted-foreground">No new client message.</span>;
    if (data.status === 'capped') return <span className="text-warning">AI drafting paused: this month's AI budget is used up. Approved replies still work.</span>;
    if (approvedFound) return <span className="text-trade-buy">Approved reply found — no AI used.</span>;
    if (conflictFound) return <span className="text-destructive">Two approved answers disagree — pick one in the <Link to="/terminal/playbook?tab=inbox" className="underline underline-offset-2">Playbook inbox</Link>.</span>;
    if (aiFailed && !drafts.length) return <span className="text-warning">The AI did not answer this time{playbook.length ? ' — Playbook replies are below' : ''}.</span>;
    if (playbook.length && drafts.length) return <span className="text-foreground">From the Playbook, plus AI drafts</span>;
    if (drafts.length) return <span className="text-foreground">New — not in the Playbook yet.</span>;
    if (playbook.length) return <span className="text-foreground">From the Playbook</span>;
    return <span className="text-muted-foreground">No suggestion this time.</span>;
  })();

  const contactLine = (text: string) => {
    const used = contactsUsed(text);
    if (!used.length || !data?.contacts) return null;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        {used.map((p) => {
          const c = data.contacts?.[p];
          return c ? (
            <span key={p} className="inline-flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{teamLabel(p, teams)}: {c.name}{c.availableNow ? '' : ' (outside hours)'}</span>
          ) : null;
        })}
      </div>
    );
  };

  const playbookCard = (p: PlaybookSuggestion, compact = false) => {
    const tone = p.conflict ? 'red' : p.status === 'approved' ? 'green' : 'amber';
    const label = p.conflict ? 'Conflict' : p.status === 'approved' ? 'Approved' : 'Tentative';
    const text = fill(p.text);
    const pick: CopilotPick = { kind: 'entry', entryId: p.entryId, requestId, text, title: p.title };
    return (
      <div key={p.entryId} className={`rounded-md border bg-card px-2.5 py-2 ${p.conflict ? 'border-destructive/30' : p.status === 'approved' ? 'border-trade-buy/25' : 'border-warning/30'}`}>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <Chip tone={tone}>{label}</Chip>
          <span className="min-w-0 max-w-full truncate text-[11px] font-medium text-foreground" title={p.title}>{p.title}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground" title="How closely the client's question matches">{Math.round(p.similarity * 100)}%</span>
          {p.specific && !!p.situations?.length && <Chip tone="primary" title="This reply is for this situation">For: {p.situations.join(', ')}</Chip>}
          {p.contextSimilarity != null && p.contextSimilarity >= 0.75 && (
            <Chip title={`Used before in a chat like this one (${Math.round(p.contextSimilarity * 100)}% alike)`}><History className="h-2.5 w-2.5" />Like an earlier chat</Chip>
          )}
          {p.machineTranslated && <span className="shrink-0 text-[10px] text-muted-foreground" title="This language version was written by the AI">· AI-written copy</span>}
          {p.languageNote?.endsWith('_outdated') && <span className="shrink-0 text-[10px] text-warning">· {lang} copy out of date — {p.language === 'en' ? 'English' : 'Hindi'} shown</span>}
          {p.missingLanguage && !p.languageNote?.endsWith('_outdated') && <span className="shrink-0 text-[10px] text-warning">· {lang} version not saved yet</span>}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {p.status === 'tentative' && !p.conflict && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-muted-foreground hover:text-trade-buy" onClick={() => onApprove(pick)} title="Approve without sending">
                <Check className="mr-1 h-3 w-3" />Confirm
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onInsert(pick)}>
              <CornerDownLeft className="mr-1 h-3 w-3" />Insert
            </Button>
          </div>
        </div>
        {!compact && <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-snug text-card-foreground">{text}</div>}
        {compact && <div className="mt-1 line-clamp-2 break-words text-[11px] leading-snug text-muted-foreground">{text}</div>}
        {p.note && !compact && <div className="mt-1 text-[10px] text-muted-foreground">Note: {p.note}</div>}
        {p.status === 'tentative' && !p.conflict && !compact && <div className="mt-1 text-[10px] text-warning">Tentative — sending it, or Confirm, makes it approved.</div>}
        {!compact && contactLine(p.text)}
      </div>
    );
  };

  const draftCard = (d: AiDraft) => {
    const text = fill(d.text);
    const pick: CopilotPick = { kind: 'draft', callId: d.callId, requestId, text };
    const soft = d.flags.filter((f) => !['release_promise', 'outside_binance', 'typed_number', 'empty'].includes(f));
    return (
      <div key={d.callId ?? d.label} className={`rounded-md border bg-card px-2.5 py-2 ${d.blocked ? 'border-destructive/30' : 'border-border'}`}>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <Chip tone="primary">{d.label}</Chip>
          <span className="shrink-0 text-[11px] font-medium text-foreground">{modelLabel(d.model)}</span>
          {d.newPolicy && <Chip tone="amber" title="States a rule or time frame that is not in the Playbook">New policy — your call</Chip>}
          {soft.map((f) => <Chip key={f} tone="amber">{FLAG_LABEL[f] ?? f}</Chip>)}
          {d.blocked && <Chip tone="red"><ShieldAlert className="h-2.5 w-2.5" />Held back</Chip>}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {!d.blocked && (
              <>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-muted-foreground hover:text-trade-buy" onClick={() => onApprove(pick)} title="Approve without sending (saves it to the Playbook)">
                  <Check className="mr-1 h-3 w-3" />Approve
                </Button>
                <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onInsert(pick)}>
                  <CornerDownLeft className="mr-1 h-3 w-3" />Insert
                </Button>
              </>
            )}
            <RejectButton onReject={(r) => void reject(d, r)} disabled={!d.callId} />
          </div>
        </div>
        <div className={`mt-1 whitespace-pre-wrap break-words text-xs leading-snug ${d.blocked ? 'text-muted-foreground line-through decoration-destructive/50' : 'text-card-foreground'}`}>{text}</div>
        {d.blocked && <div className="mt-1 text-[10px] text-destructive">{d.blockedReasons.join('. ')}. Redraft or write your own.</div>}
        {d.note && !d.blocked && <div className="mt-1 text-[10px] text-muted-foreground">{d.note}</div>}
        {!d.blocked && contactLine(d.text)}
      </div>
    );
  };

  return (
    <div className="w-full min-w-0 rounded-lg border border-primary/25 bg-primary/[0.04]">
      {/* Header: what the Copilot assumed about this chat */}
      <div className="flex min-w-0 items-center gap-1.5 px-2.5 py-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="shrink-0 text-[11px] font-semibold text-foreground">Copilot</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {ctx && <Chip title={ctx.language_reason}><Languages className="h-2.5 w-2.5" />{lang} · {address}</Chip>}
          {/* Red risks get a banner below; the header keeps them visible while the panel is collapsed. */}
          {risks.filter((r) => collapsed || r.level !== 'red').map((r) => (
            <Chip key={r.code} tone={r.level === 'red' ? 'red' : 'amber'} title={r.label}><AlertTriangle className="h-2.5 w-2.5" />{r.label}</Chip>
          ))}
          {budget?.alertPct != null && (
            <Chip tone={budget.alertPct >= 80 ? 'red' : 'amber'} title="AI spend this month">AI ₹{Math.round(budget.spentInr).toLocaleString('en-IN')} / ₹{Math.round(budget.limitInr).toLocaleString('en-IN')}</Chip>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => void load(data && data.status !== 'nothing_to_answer' ? 'redraft' : 'force')} disabled={working} title="Draft again" aria-label="Draft again">
          <RefreshCw className={`h-3.5 w-3.5 ${working ? 'animate-spin' : ''}`} />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={toggleCollapsed} title={collapsed ? 'Show suggestions' : 'Hide suggestions'} aria-label={collapsed ? 'Show suggestions' : 'Hide suggestions'} aria-expanded={!collapsed}>
          {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {!collapsed && (
        <div className="max-h-[32vh] space-y-1.5 overflow-y-auto overscroll-contain border-t border-primary/15 px-2.5 pb-2 pt-1.5 sm:max-h-[38vh]">
          {redRisks.length > 0 && (
            <div className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] font-medium leading-snug text-destructive" aria-live="polite">
              <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{redRisks.map((r) => r.label).join(' · ')} — read the chat carefully before replying.</span>
            </div>
          )}
          {ctx && (
            <div className="text-[10px] leading-snug text-muted-foreground" title="What the Copilot knows about this order">
              {[ctx.side, ctx.category === 'small' ? 'small order' : 'regular order', ctx.account, statusLabel(ctx.status, ctx.side),
                ctx.client_state === 'approved' ? 'approved client' : ctx.client_state === 'linked' ? 'known client, not approved for this side' : 'new client',
                ctx.kyc_status ? `KYC ${ctx.kyc_status.toLowerCase()}` : null].filter(Boolean).join(' · ')}
            </div>
          )}
          {ctx?.situation && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] leading-snug" aria-label="Situation">
              <MapPin className="h-2.5 w-2.5 shrink-0 text-primary" />
              <span className="text-muted-foreground">Waiting for:</span>
              <SituationMenu side={ctx.side} current={ctx.situation ?? null} detected={ctx.situation_detected ?? null}
                detectedLabel={ctx.situation_detected_label ?? null} marked={!!ctx.situation_marked} disabled={working} onPick={(c) => void changeSituation(c)} />
              {ctx.situation_marked
                ? <span className="text-muted-foreground">· set by {markedBy}{ctx.situation_detected_label ? ` (chat shows ${ctx.situation_detected_label})` : ''}</span>
                : ctx.situation_evidence ? <span className="min-w-0 truncate text-muted-foreground" title={ctx.situation_evidence}>· {ctx.situation_evidence}</span> : null}
            </div>
          )}
          {data?.question?.text && (
            <div className="break-words text-[11px] leading-snug text-foreground">
              <span className="text-muted-foreground">Client: </span>“{data.question.text}”
            </div>
          )}
          <div className="flex items-center justify-between gap-2 text-[11px]">
            {statusLine}
            {(!triggerKey || data?.status === 'nothing_to_answer') && !working && (
              <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-[11px] text-primary" onClick={() => void load('force')}>
                <Wand2 className="mr-1 h-3 w-3" />Draft a next message
              </Button>
            )}
            {error && !working && (
              <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-[11px]" onClick={() => void load(data ? 'redraft' : 'suggest')}>Retry</Button>
            )}
          </div>

          {loading && (
            <div className="space-y-1.5" aria-hidden>
              <div className="h-12 animate-pulse rounded-md bg-muted/50" />
              <div className="h-12 animate-pulse rounded-md bg-muted/30" />
            </div>
          )}

          {!loading && (data?.heldBack ?? []).map((h) => (
            <div key={h.entryId} className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-[10px] leading-snug text-warning">
              <ShieldAlert className="mt-px h-3 w-3 shrink-0" /><span>Held back “{h.title}”: {h.reason}</span>
            </div>
          ))}
          {!loading && playbook.map((p) => playbookCard(p))}
          {!loading && (data?.otherSituations ?? []).map((o) => (
            <div key={o.topicId} className="text-[10px] leading-snug text-muted-foreground">
              “{o.title}” has replies only for {o.situations.join(', ')}, not for this situation{drafts.length ? ' — the drafts below are for this one. Sending one saves it for this situation' : ''}.
            </div>
          ))}
          {!loading && drafts.map((d) => draftCard(d))}
          {busy && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Drafting…</div>
          )}

          {!loading && missing.length > 0 && (
            <div className="text-[10px] text-warning">
              No {missing.map((p) => teamLabel(p, teams)).join(' or ')} contact number saved. Add one in <Link to="/terminal/playbook?tab=settings" className="underline underline-offset-2">Playbook settings</Link>, or type it before sending.
            </div>
          )}

          {!loading && related.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer select-none text-[10px] text-muted-foreground hover:text-foreground">
                Related approved replies ({related.length})
              </summary>
              <div className="mt-1 space-y-1.5">{related.map((p) => playbookCard(p, true))}</div>
            </details>
          )}

          {/* No drafts yet (an approved reply fits, a conflict, or the AI did not answer): one clear way to ask for drafts */}
          {data && data.status === 'ready' && !drafts.length && !loading && (
            <div className="flex justify-end pt-0.5">
              <Button variant="ghost" size="sm" disabled={working} onClick={() => void load('force')} className="h-6 px-2 text-[11px] text-primary">
                {busy === 'force' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
                {approvedFound || conflictFound ? 'Draft with AI anyway' : aiFailed ? 'Try the AI again' : 'Draft with AI'}
              </Button>
            </div>
          )}

          {/* Redraft controls, once there are drafts to improve */}
          {data && data.status === 'ready' && drafts.length > 0 && !loading && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              {INSTRUCTION_CHIPS.map((c) => (
                <Button key={c.key} variant="ghost" size="sm" disabled={working} onClick={() => void load('redraft', c.key)}
                  className="h-6 rounded-full border border-border bg-secondary/60 px-2.5 text-[11px] text-muted-foreground hover:text-foreground">
                  {busy === c.key && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{c.label}
                </Button>
              ))}
              <Button variant="ghost" size="sm" disabled={working} onClick={() => void load('redraft', ctx?.language === 'hi' ? 'english' : 'hindi')}
                className="h-6 rounded-full border border-border bg-secondary/60 px-2.5 text-[11px] text-muted-foreground hover:text-foreground">
                {ctx?.language === 'hi' ? 'English' : 'Hindi'}
              </Button>
              <Popover open={customOpen} onOpenChange={setCustomOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={working} className="h-6 rounded-full border border-border bg-secondary/60 px-2.5 text-[11px] text-muted-foreground hover:text-foreground">
                    Instruction…
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" side="top" className="w-72 p-2">
                  <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const v = custom.trim(); if (!v) return; setCustomOpen(false); setCustom(''); void load('redraft', v); }}>
                    <Input autoFocus value={custom} onChange={(e) => setCustom(e.target.value.slice(0, 200))} placeholder="e.g. Ask for the UTR politely" className="h-7 text-xs" aria-label="Instruction for the redraft" />
                    <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={!custom.trim()}>Draft</Button>
                  </form>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {picks.length > 0 && !loading && (
            <div className="hidden items-center gap-1 text-[10px] text-muted-foreground sm:flex">
              <BookCheck className="h-3 w-3 shrink-0" />Tab / Shift+Tab inserts a suggestion · Ctrl+Enter approves without sending · sending a suggestion saves it
            </div>
          )}
        </div>
      )}
    </div>
  );
}
