// Copilot v2 panel for approvers (Shubham, Abhishek) in the Terminal order chat.
// Approved Playbook replies come first (no AI). AI drafts are made only for this open chat, only when no
// approved reply fits or the approver asks. Insert puts text in the composer; Approve sends it.
// KYC happens outside the chat, so a step worked out from our messages is a best guess: the question's replies for
// the neighbouring steps are offered too ("If: Checking KYC"), and sending one sets the chat to that step.
// When matching by meaning is unsure, a small model picks which approved question the client asked ("Picked by AI");
// the reply is still the approved text. Binance's deadlines and what we hold on the client are shown as chips.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertTriangle, BookCheck, Check, ChevronDown, ChevronUp, Clock, CornerDownLeft, History, Languages, Loader2, MapPin, Phone, RefreshCw,
  ShieldAlert, Signpost, Sparkles, UserRound, Wand2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  copilotDraft, copilotReject, CopilotError, type AiDraft, type DraftResponse, type PlaybookSuggestion, type StepSuggestion,
} from '@/hooks/useCopilotPlaybook';
import { copilotAdmin, useCopilotSituations, useCopilotTeams, useUserNames, userLabel } from '@/hooks/useCopilotAdmin';
import {
  FLAG_LABEL, KYC_WAIT_MS, REJECT_REASONS, buildCopilotPicks, clientSummary, contactsUsed, deadlineChips, deadlineContext, fillCopilotText,
  kycReload, modelLabel, statusLabel, teamLabel, waitForLiveKyc, type ContactPurpose, type CopilotPick,
} from '@/lib/copilot/copilotText';
import { markableSituations, STATUS_SITUATIONS } from '@/lib/copilot/situations';
import type { TemplateOrderValues } from '@/lib/fill-template';

export type { CopilotPick } from '@/lib/copilot/copilotText';

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
  /** Changes when the chat's step was set from outside the panel (a reply sent for another step): fresh suggestions. */
  refreshKey?: number;
  /** Live values from Binance's order detail on this screen: extra-KYC field and deadlines (ms). Sent with each request. */
  binance?: { kycVerify?: number | null; payBy?: number | null; releaseBy?: number | null } | null;
  /** The screen is still loading Binance's order detail (the first request on an open sell order waits a moment for it). */
  binanceLoading?: boolean;
}

const COLLAPSE_KEY = 'terminal-copilot-collapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };
const writeCollapsed = (v: boolean) => { try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ } };

const INSTRUCTION_CHIPS: Array<{ key: string; label: string }> = [
  { key: 'shorter', label: 'Shorter' },
  { key: 'formal', label: 'More formal' },
  { key: 'detail', label: 'Add detail' },
];

function Chip({ tone = 'muted', children, title, fluid = false }: {
  tone?: 'muted' | 'green' | 'amber' | 'red' | 'primary'; children: React.ReactNode; title?: string;
  /** May shrink to the row's width (its text then truncates) instead of keeping its natural width. */
  fluid?: boolean;
}) {
  const cls = {
    muted: 'border-border bg-secondary/60 text-muted-foreground',
    green: 'border-trade-buy/30 bg-trade-buy/10 text-trade-buy',
    amber: 'border-warning/40 bg-warning/10 text-warning',
    red: 'border-destructive/40 bg-destructive/10 text-destructive',
    primary: 'border-primary/30 bg-primary/10 text-primary',
  }[tone];
  return (
    <span title={title} className={`inline-flex h-5 ${fluid ? 'min-w-0 max-w-full' : 'shrink-0'} items-center gap-1 rounded-full border px-2 text-[10px] font-medium leading-none ${cls}`}>
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

/**
 * What the client is waiting for, as the Copilot worked it out; an approver can change it for this chat. While Binance says
 * the client's extra KYC is not verified (and the chat shows neither its notice nor our payment details), the payment
 * step cannot be picked.
 */
function SituationMenu({ side, current, detected, detectedLabel, marked, disabled, payBlocked = false, onPick }: {
  side: 'BUY' | 'SELL' | null; current: string | null; detected: string | null; detectedLabel: string | null; marked: boolean;
  disabled?: boolean; payBlocked?: boolean; onPick: (code: string | null) => void;
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
          {options.map((o) => {
            const blocked = payBlocked && o.code.startsWith('sell.pay');
            return (
              <button key={o.code} type="button" disabled={blocked} onClick={() => { setOpen(false); if (o.code !== current) onPick(o.code); }}
                className={`rounded px-2 py-1.5 text-left text-xs hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent ${o.code === current ? 'bg-primary/10 text-primary' : 'text-foreground'}`}>
                <span className="block font-medium">{o.label}</span>
                <span className="block text-[10px] leading-snug text-muted-foreground">
                  {blocked ? "Not while Binance says the client's extra KYC is not verified." : o.description}
                </span>
              </button>
            );
          })}
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
  refreshKey = 0, binance = null, binanceLoading = false,
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
  // Read when a request is made, so a new poll of the order detail never reloads the suggestions by itself.
  const binanceRef = useRef(binance);
  binanceRef.current = binance;
  const binanceLoadingRef = useRef(binanceLoading);
  binanceLoadingRef.current = binanceLoading;
  const { data: teams } = useCopilotTeams();
  const { data: users = [] } = useUserNames();

  // The extra-KYC value the latest request was sent with, and whether one is about to go out (the 600 ms wait), for the
  // reload on "verified" below.
  const sentKyc = useRef<number | null>(null);
  const scheduled = useRef(false);
  /** 'context': the order facts only, with nothing to answer (no AI, nothing saved): no skeleton and no error line. */
  const load = useCallback(async (mode: 'suggest' | 'redraft' | 'force' | 'context', instruction: string | null = null) => {
    const quiet = mode === 'context';
    const mine = ++seq.current;
    scheduled.current = false;
    sentKyc.current = binanceRef.current?.kycVerify ?? null;
    if (!quiet) { if (mode === 'suggest') setLoading(true); else setBusy(instruction ?? mode); }
    setError(null);
    try {
      const res = await copilotDraft({
        orderNumber, exchangeAccountId: exchangeAccountId ?? null, mode, instruction,
        hint: {
          tradeType, status: orderStatus, totalPrice, asset, payMethod, latest: triggerRef.current?.hint ?? null,
          kycVerify: binanceRef.current?.kycVerify ?? null, payBy: binanceRef.current?.payBy ?? null,
          releaseBy: binanceRef.current?.releaseBy ?? null,
        },
      }, () => mine !== seq.current);
      if (mine !== seq.current) return;
      setData(res);
      setHidden(new Set());
    } catch (e) {
      if (mine !== seq.current) return;
      const err = e as CopilotError;
      if (err.code === 'cancelled' || quiet) return;
      setError(err.code === 'too_many_requests' ? 'Too many requests — wait a moment and try again.' : err.message || 'Could not load suggestions.');
    } finally {
      if (mine === seq.current) { setLoading(false); setBusy(null); }
    }
  }, [orderNumber, exchangeAccountId, tradeType, orderStatus, totalPrice, asset, payMethod]);

  // New client message (or a new order status) → suggestions for it. With nothing to answer, a quiet request brings the
  // order facts only (the situation, deadlines and client records; no AI, nothing saved). Closing the chat stops everything.
  useEffect(() => {
    seq.current++;
    setData(null);
    setError(null);
    setLoading(false);
    setBusy(null);
    // The request about to go out carries today's extra-KYC value (so the "verified" reload below does not double it).
    scheduled.current = true;
    sentKyc.current = binanceRef.current?.kycVerify ?? null;
    // On an open sell order it waits a moment (at most 3 s) for Binance's live extra-KYC value while the screen loads it.
    const started = Date.now();
    let t: ReturnType<typeof setTimeout>;
    const go = () => {
      if (waitForLiveKyc({ side: tradeType, status: orderStatus, live: binanceRef.current?.kycVerify, loading: binanceLoadingRef.current })
        && Date.now() - started < KYC_WAIT_MS) { t = setTimeout(go, 200); return; }
      void load(triggerKey ? 'suggest' : 'context');
    };
    t = setTimeout(go, 600);
    // Bumping the sequence on cleanup drops any answer that arrives after the chat changed or closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { clearTimeout(t); seq.current++; scheduled.current = false; };
  }, [orderNumber, triggerKey, orderStatus, load]);

  // The chat's step was set from outside (a reply sent for another step): fresh suggestions for a client message still
  // waiting, for that step. With nothing to answer, what is shown stays (drafts asked for by hand are kept).
  const seenRefresh = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === seenRefresh.current) return;
    seenRefresh.current = refreshKey;
    // A request about to go out reads the new step itself.
    if (triggerRef.current && !scheduled.current) void load('suggest');
  }, [refreshKey, load]);

  // Binance's extra-KYC value reaches the screen on an open sell order, and the last request and its answer did not know it
  // ("verified", or the field at all): fresh suggestions for a client message waiting, or (nothing to answer) the order
  // facts again, once. Never while a request is about to go out or running (re-checked when its answer lands).
  const kycVerify = binance?.kycVerify ?? null;
  const answeredKyc = data?.context?.binance_kyc ?? null;
  const pending = loading || !!busy;
  const factsOnly = !data || data.status === 'nothing_to_answer';
  useEffect(() => {
    const mode = kycReload({
      side: tradeType, status: orderStatus, live: kycVerify, sent: sentKyc.current, answered: answeredKyc, waiting: !!triggerRef.current,
      pending: pending || scheduled.current, factsOnly,
    });
    if (mode) void load(mode);
  }, [kycVerify, answeredKyc, pending, tradeType, orderStatus, load, factsOnly]);

  const fill = useCallback((text: string) => fillCopilotText(text, templateValues, data?.contacts), [templateValues, data?.contacts]);
  const requestId = data?.requestId ?? null;
  const drafts = useMemo(() => (data?.drafts ?? []).filter((d) => !(d.callId && hidden.has(d.callId))), [data?.drafts, hidden]);
  const playbook = useMemo(() => data?.playbook ?? [], [data?.playbook]);
  const related = useMemo(() => data?.related ?? [], [data?.related]);
  const alternatives = useMemo(() => data?.alternatives ?? [], [data?.alternatives]);
  const otherSteps = useMemo(() => data?.otherSteps ?? [], [data?.otherSteps]);
  const side = data?.context?.side ?? null;
  const detected = data?.context?.situation_detected ?? null;

  const picks = useMemo<CopilotPick[]>(
    () => buildCopilotPicks({ playbook, drafts, alternatives, requestId, side, detected, fill }),
    [playbook, drafts, alternatives, requestId, side, detected, fill],
  );

  useEffect(() => { onState({ requestId, picks }); }, [requestId, picks, onState]);

  const toggleCollapsed = () => setCollapsed((c) => { writeCollapsed(!c); return !c; });

  const changeSituation = async (picked: string | null) => {
    const side = data?.context?.side;
    if (!side) return;
    // Picking what the chat itself shows undoes an earlier correction.
    const code = picked !== null && picked === data?.context?.situation_detected ? null : picked;
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
  const aiPicked = data?.skippedReason === 'ai_picked_reply';

  // The last order facts from the server stay shown while suggestions reload or no client message waits.
  const [lastCtx, setLastCtx] = useState<typeof ctx | null>(null);
  useEffect(() => { if (ctx) setLastCtx(ctx); }, [ctx]);
  const facts = ctx ?? lastCtx;
  // Binance's deadlines: the screen's live values first, so they show even with nothing to answer. The countdown is
  // worked out at each render; a 5-second tick (and coming back to the tab) re-renders while there is one.
  const deadlineCtx = deadlineContext({ tradeType, orderStatus, live: binance, server: facts });
  const hasDeadline = !!(deadlineCtx.pay_by || deadlineCtx.release_by || deadlineCtx.appeal_case?.response_due);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasDeadline) return;
    const tick = () => setTick((n) => n + 1);
    const t = setInterval(tick, 5_000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [hasDeadline]);
  const deadlines = deadlineChips(deadlineCtx, Date.now());
  const client = useMemo(() => clientSummary(facts?.client), [facts?.client]);

  const statusLine = (() => {
    if (loading) return <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Reading the chat…</span>;
    if (error) return <span className="text-destructive">{error}</span>;
    if (!triggerKey && !data) return <span className="text-muted-foreground">No new client message.</span>;
    if (!data) return null;
    if (data.status === 'nothing_to_answer') return <span className="text-muted-foreground">No new client message.</span>;
    if (data.status === 'capped') return <span className="text-warning">AI drafting paused: this month's AI budget is used up. Approved replies still work.</span>;
    if (approvedFound) return <span className="text-trade-buy">Approved reply found — no AI used.</span>;
    if (aiPicked) return <span className="text-trade-buy">Approved reply picked by AI — nothing drafted.</span>;
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
          {p.pickedBy === 'ai' && (
            <Chip tone="primary" title="The AI matched the client's message to this approved question. The reply is the approved text.">
              <Sparkles className="h-2.5 w-2.5" />Picked by AI
            </Chip>
          )}
          {p.pickedBy === 'lead' && (
            <Chip title={`Clearly the closest question${data?.lead?.next != null ? `: the next one scores ${Math.round(data.lead.next * 100)}%` : ''}.`}>Clear best match</Chip>
          )}
          {p.specific && !!p.situations?.length && <Chip tone="primary" title="This reply is for this situation">For: {p.situations.join(', ')}</Chip>}
          {p.contextSimilarity != null && p.contextSimilarity >= 0.75 && (
            <Chip title={`Used before in a chat like this one (${Math.round(p.contextSimilarity * 100)}% alike)`}><History className="h-2.5 w-2.5" />Like an earlier chat</Chip>
          )}
          {p.machineTranslated && <span className="shrink-0 text-[10px] text-muted-foreground" title="This language version was written by the AI">· AI-written copy</span>}
          {p.languageNote?.endsWith('_outdated') && <span className="shrink-0 text-[10px] text-warning">· {lang} copy out of date — {p.language === 'en' ? 'English' : 'Hindi'} shown</span>}
          {p.missingLanguage && !p.languageNote?.endsWith('_outdated') && <span className="shrink-0 text-[10px] text-warning">· {lang} version not saved yet</span>}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {p.status === 'tentative' && !p.conflict && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-muted-foreground hover:text-trade-buy" onClick={() => onApprove(pick)} title="Approve and send to the client">
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
        {p.pickedBy === 'ai' && !compact && data?.route?.reason && (
          <div className="mt-1 text-[10px] text-muted-foreground">AI pick{data.route.confidence ? ` (${data.route.confidence} confidence)` : ''}: {data.route.reason}</div>
        )}
        {p.note && !compact && <div className="mt-1 text-[10px] text-muted-foreground">Note: {p.note}</div>}
        {p.status === 'tentative' && !p.conflict && !compact && <div className="mt-1 text-[10px] text-warning">Tentative — sending it, or Confirm, makes it approved.</div>}
        {!compact && contactLine(p.text)}
      </div>
    );
  };

  // A reply for another step the client could be at. Insert, then send: the chat is set to that step and the reply is
  // saved under it.
  const stepCard = (p: StepSuggestion) => {
    const pick = picks.find((x) => x.kind === 'entry' && x.entryId === p.entryId && x.situation);
    if (!pick) return null;
    const text = pick.text;
    const steps = p.stepLabels.join(' or ');
    return (
      <div key={p.entryId} className="rounded-md border border-border bg-card px-2.5 py-1.5">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span title="The reply for this step" className="inline-flex min-h-5 min-w-0 max-w-full items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium leading-tight text-primary">
            If: {steps}
          </span>
          <Chip tone={p.status === 'approved' ? 'green' : 'amber'}>{p.status === 'approved' ? 'Approved' : 'Tentative'}</Chip>
          {p.languageNote?.endsWith('_outdated') && <span className="shrink-0 text-[10px] text-warning">· {lang} copy out of date — {p.language === 'en' ? 'English' : 'Hindi'} shown</span>}
          {p.missingLanguage && !p.languageNote?.endsWith('_outdated') && <span className="shrink-0 text-[10px] text-warning">· {lang} version not saved yet</span>}
          <Button variant="outline" size="sm" className="ml-auto h-6 shrink-0 px-2 text-[11px]" onClick={() => onInsert(pick)}
            title={`Insert. Sending it sets this chat to “${pick.situation?.label}” and saves the reply there.`}>
            <CornerDownLeft className="mr-1 h-3 w-3" />Insert
          </Button>
        </div>
        <div className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-snug text-card-foreground">{text}</div>
        {contactLine(p.text)}
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
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-muted-foreground hover:text-trade-buy" onClick={() => onApprove(pick)} title="Approve and send to the client (saves it to the Playbook)">
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
    <div className="@container w-full min-w-0 rounded-lg border border-primary/25 bg-primary/[0.04]">
      {/* Header: what the Copilot assumed about this chat */}
      {/* In a narrow panel (phones, or the three-column order screen) the chips take their own row under the title. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 px-2.5 py-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="shrink-0 text-[11px] font-semibold text-foreground">Copilot</span>
        {(ctx || deadlines.length > 0 || risks.length > 0 || budget?.alertPct != null) && <div className="order-last flex min-w-0 basis-full flex-wrap items-center gap-1 @[32rem]:order-none @[32rem]:flex-1 @[32rem]:basis-0">
          {ctx && <Chip title={ctx.language_reason}><Languages className="h-2.5 w-2.5" />{lang} · {address}</Chip>}
          {/* Binance's deadlines stay visible while the panel is collapsed. */}
          {deadlines.map((d) => (
            <Chip key={d.key} tone={d.tone} title={d.title} fluid>
              <Clock className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{d.main ?? d.label}</span>{d.left && <span className="shrink-0">· {d.left}</span>}
            </Chip>
          ))}
          {/* Red risks get a banner below; the header keeps them visible while the panel is collapsed. */}
          {risks.filter((r) => collapsed || r.level !== 'red').map((r) => (
            <Chip key={r.code} tone={r.level === 'red' ? 'red' : 'amber'} title={r.label} fluid><AlertTriangle className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{r.label}</span></Chip>
          ))}
          {budget?.alertPct != null && (
            <Chip tone={budget.alertPct >= 80 ? 'red' : 'amber'} title="AI spend this month">AI ₹{Math.round(budget.spentInr).toLocaleString('en-IN')} / ₹{Math.round(budget.limitInr).toLocaleString('en-IN')}</Chip>
          )}
        </div>}
        <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => void load(data && data.status !== 'nothing_to_answer' ? 'redraft' : 'force')} disabled={working} title="Draft again" aria-label="Draft again">
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
          {client.text && (
            <div role="group" className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] leading-snug text-muted-foreground" aria-label="What we hold on the client">
              <span className="min-w-0"><UserRound className="mr-1 inline h-2.5 w-2.5 align-[-1px]" />Our records: {client.text}</span>
              {client.warnings.map((w) => <Chip key={w.key} tone={w.tone} title={w.title}>{w.label}</Chip>)}
            </div>
          )}
          {ctx?.situation && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] leading-snug" aria-label="Situation">
              <MapPin className="h-2.5 w-2.5 shrink-0 text-primary" />
              <span className="text-muted-foreground">Waiting for:</span>
              <SituationMenu side={ctx.side} current={ctx.situation ?? null} detected={ctx.situation_detected ?? null}
                detectedLabel={ctx.situation_detected_label ?? null} marked={!!ctx.situation_marked} disabled={working}
                payBlocked={ctx.binance_kyc_open === true && binance?.kycVerify !== 2} onPick={(c) => void changeSituation(c)} />
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
          {/* Other steps: the chat's step is worked out from our messages (KYC happens outside the chat), so the
              approver can pick the reply for the step the client is really at, or switch the chat to it. */}
          {!loading && ctx?.side && (alternatives.length > 0 || otherSteps.length > 0) && (
            <div className="space-y-1.5 rounded-md border border-dashed border-primary/25 px-2 py-1.5" aria-label="Other steps">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] leading-snug">
                <Signpost className="h-3 w-3 shrink-0 text-primary" />
                <span className="font-medium text-foreground">Client at another step?</span>
                {alternatives.length > 0 && <span className="text-muted-foreground">Sending one of these sets the chat to its step.</span>}
                {otherSteps.length > 0 && (
                  <>
                    <span className="text-muted-foreground">{alternatives.length ? 'Or switch to' : 'Switch to'}</span>
                    {otherSteps.map((st) => (
                      <button key={st.code} type="button" disabled={working} onClick={() => void changeSituation(st.code)}
                        title={`Switch this chat to “${st.label}” and get its suggestions.`}
                        className="inline-flex h-5 items-center rounded-full border border-border bg-secondary/60 px-2 text-[10px] font-medium text-foreground hover:bg-secondary disabled:opacity-60">
                        {st.label}
                      </button>
                    ))}
                  </>
                )}
              </div>
              {alternatives.map((p) => stepCard(p))}
            </div>
          )}
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
                {approvedFound || aiPicked || conflictFound ? 'Draft with AI anyway' : aiFailed ? 'Try the AI again' : 'Draft with AI'}
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
