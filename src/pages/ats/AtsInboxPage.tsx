import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Check, Clock, Loader2, Mail, MessageSquare, Paperclip, RefreshCw, RotateCcw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/EmptyState";
import { InterruptedRetryDialog, LastChecked } from "@/components/ats/MailBits";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { fmtDateTime, fmtRelative } from "@/lib/ats/format";
import { fmtUntil } from "@/lib/ats/interviews";
import {
  MailError, canRetry, mailErrorMessage, mailKeys, retryCandidateEmail, useMailStatus,
} from "@/lib/ats/mail";
import { atsErrorMessage } from "@/lib/ats/errors";
import {
  convKeys, intentMeta, setConversation, snoozeChoices, useConversationCounts, useConversations,
  type ConvView, type ConversationRow, type ReplyIntent,
} from "@/lib/ats/conversations";
import { QueryError, RowsSkeleton } from "@/components/ats/AtsBits";
import { useCheckNow } from "@/components/ats/EmailSettingsSection";
import { CandidateAvatar, CountPill, StageChip, StatusPill } from "@/components/ats/AtsUi";
import { AppStatusBadge } from "@/components/ats/CandidateBits";
import { CandidateReviewPanel } from "@/components/ats/CandidateReviewPanel";
import { IntentChip, PickTimeDialog } from "@/components/ats/ConversationBits";

const CONV_TABS: { value: ConvView; label: string }[] = [
  { value: "needs_reply", label: "Needs reply" },
  { value: "follow_up", label: "Follow-up due" },
  { value: "waiting", label: "Waiting on candidate" },
  { value: "snoozed", label: "Snoozed" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];
const CONV_EMPTY: Record<string, { title: string; description?: string }> = {
  needs_reply: { title: "You're all caught up", description: "No replies are waiting for you." },
  follow_up: { title: "No follow-ups due" },
  waiting: { title: "No one owes you a reply" },
  snoozed: { title: "Nothing snoozed" },
  done: { title: "Nothing here yet" },
  all: { title: "No emails yet" },
  unread: { title: "No unread replies" },
};
const CONV_VIEWS = new Set<string>(["needs_reply", "follow_up", "waiting", "snoozed", "done", "all", "unread"]);
type PageView = ConvView | "undelivered" | "queued";

function useIsLg() {
  const q = "(min-width: 1024px)";
  const [on, setOn] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setOn(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return on;
}

const isTyping = (t: EventTarget | null) =>
  !!(t as HTMLElement | null)?.closest?.("input,textarea,select,[contenteditable=true],[role=dialog],[role=alertdialog],[role=menu],[role=listbox]");

const ivShort = (v: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })
    .formatToParts(new Date(v)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${String(p.dayPeriod ?? "").toUpperCase()}`;
};
const waitingText = (v: string) => {
  const h = Math.floor((Date.now() - new Date(v).getTime()) / 3_600_000);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
};

export default function AtsInboxPage() {
  const st = useMailStatus();
  const check = useCheckNow();
  const qc = useQueryClient();
  const nav = useNavigate();
  const isLg = useIsLg();
  const [sp, setSp] = useSearchParams();
  const rawView = sp.get("view") ?? "";
  const view: PageView = rawView === "undelivered" || rawView === "queued" || CONV_VIEWS.has(rawView) ? (rawView as PageView) : "needs_reply";
  const isConv = view !== "undelivered" && view !== "queued";
  const sel = sp.get("c");
  const enabled = !!st.data?.enabled;

  const setParams = (patch: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) (v == null ? next.delete(k) : next.set(k, v));
    setSp(next, { replace });
  };

  // Server-side search, 300 ms debounce.
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => { const t = setTimeout(() => setSearch(searchText.trim()), 300); return () => clearTimeout(t); }, [searchText]);
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = useConversationCounts(enabled);
  const conv = useConversations(isConv ? (view as ConvView) : "needs_reply", search, enabled && isConv);
  const rows = useMemo(() => (conv.data?.pages ?? []).flat().filter((r) => !!r.candidate_id), [conv.data]);

  // Message lists (unchanged behaviour).
  const list = useInfiniteQuery({
    queryKey: [...mailKeys.inbox, view],
    enabled: enabled && !isConv,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchInbox(view as View, pageParam as number),
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length : undefined),
    refetchInterval: 60_000,
  });
  const listRows = useMemo(() => (list.data?.pages ?? []).flat(), [list.data]);

  // Desktop: select the first row once loaded.
  useEffect(() => {
    if (isLg && isConv && !sel && rows.length) setParams({ c: rows[0].candidate_id!, app: null, tab: null }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLg, isConv, sel, rows]);

  const selIdx = rows.findIndex((r) => r.candidate_id === sel);
  const selRow = selIdx >= 0 ? rows[selIdx] : null;
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  const [pickFor, setPickFor] = useState<string | null>(null);

  const openRow = (r: ConversationRow) => {
    if (isLg) setParams({ c: r.candidate_id!, app: null, tab: null }, true);
    else nav(`/hrms/ats/candidates/${r.candidate_id}?${r.application_id ? `app=${r.application_id}&` : ""}tab=messages`);
  };
  // After an action on the selected row (any tab except All), move to the next row, else the previous, else clear.
  const advanceFrom = (candidateId: string, snapshot: ConversationRow[]) => {
    if (view === "all" || sp.get("c") !== candidateId) return;
    const i = snapshot.findIndex((r) => r.candidate_id === candidateId);
    if (i < 0) return;
    const next = snapshot[i + 1] ?? snapshot[i - 1] ?? null;
    setParams({ c: next?.candidate_id ?? null, app: null, tab: null }, true);
  };
  const act = async (candidateId: string, action: "done" | "reopen" | "snooze" | "unsnooze", until?: string) => {
    const snapshot = rows;
    try {
      await setConversation(candidateId, action === "unsnooze" ? "reopen" : action, until);
      toast.success(action === "done" ? "Conversation marked done" : action === "reopen" ? "Conversation reopened" : action === "unsnooze" ? "Conversation unsnoozed" : "Conversation snoozed");
      if (view !== "all") {
        // Drop the row from the cached list first, so the first-row auto-select can't pick it again.
        qc.setQueryData(convKeys.list(view as ConvView, search), (d: any) =>
          d?.pages ? { ...d, pages: d.pages.map((pg: ConversationRow[]) => pg.filter((r) => r.candidate_id !== candidateId)) } : d);
      }
      advanceFrom(candidateId, snapshot);
      qc.invalidateQueries({ queryKey: convKeys.all });
    } catch (e) { toast.error(atsErrorMessage(e)); }
  };

  // Keyboard: j/k (↓/↑) move · e done/reopen · s snooze · / search.
  const kb = useRef({ rows, selIdx, view, isConv, isLg, act });
  kb.current = { rows, selIdx, view, isConv, isLg, act };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target) || document.querySelector("[role=dialog],[role=alertdialog]")) return;
      const { rows: rs, selIdx: i, view: v, isConv: ic, isLg: lg, act: doAct } = kb.current;
      if (!ic) return;
      const k = e.key;
      if (k === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (!lg || !rs.length) return;
      if (k === "j" || k === "ArrowDown" || k === "k" || k === "ArrowUp") {
        e.preventDefault();
        const d = k === "j" || k === "ArrowDown" ? 1 : -1;
        const n = Math.min(rs.length - 1, Math.max(0, (i < 0 ? 0 : i + d)));
        setParams({ c: rs[n].candidate_id!, app: null, tab: null }, true);
        document.getElementById(`conv-${rs[n].candidate_id}`)?.scrollIntoView({ block: "nearest" });
        return;
      }
      const cur = i >= 0 ? rs[i] : null;
      if (!cur) return;
      if (k === "e") { e.preventDefault(); void doAct(cur.candidate_id!, v === "done" ? "reopen" : "done"); }
      else if (k === "s") { e.preventDefault(); setSnoozeFor(cur.candidate_id!); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  if (st.isLoading) return <RowsSkeleton rows={6} />;
  if (st.isError) return <QueryError error={st.error} onRetry={() => st.refetch()} />;

  const c = counts.data;
  const failed = Number(st.data?.failed_30d ?? st.data?.failed_7d ?? 0);
  const queued = Number(st.data?.queued ?? 0);
  const empty = CONV_EMPTY[view] ?? CONV_EMPTY.all;

  const convList = (
    <div className="flex min-h-0 flex-col">
      {conv.isLoading ? <div className="p-3"><RowsSkeleton rows={6} /></div> : conv.isError ? <div className="p-3"><QueryError error={conv.error} onRetry={() => conv.refetch()} /></div> :
        !rows.length ? <EmptyState icon={MessageSquare} title={empty.title} description={empty.description} /> : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto" aria-label="Conversations">
          {rows.map((r) => (
            <ConversationListItem key={r.candidate_id} r={r} view={view as ConvView} selected={isLg && r.candidate_id === sel}
              onOpen={() => openRow(r)} onAct={act}
              snoozeOpen={snoozeFor === r.candidate_id} onSnoozeOpenChange={(o) => setSnoozeFor(o ? r.candidate_id! : null)}
              onPick={() => setPickFor(r.candidate_id!)} />
          ))}
          {conv.hasNextPage && (
            <li className="p-2"><Button variant="outline" className="w-full" disabled={conv.isFetchingNextPage} onClick={() => conv.fetchNextPage()}>Load more</Button></li>
          )}
        </ul>
      )}
      {isLg && <p className="shrink-0 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">j/k move · e done · s snooze · / search</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {enabled && <p className="text-xs text-muted-foreground"><LastChecked sync={st.data!.sync} /></p>}
        </div>
        {enabled && (
          <Button size="sm" variant="outline" className="gap-1.5" disabled={check.disabled} onClick={check.run}>
            {check.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
          </Button>
        )}
      </div>

      {!enabled ? (
        <EmptyState icon={Mail} title="Candidate email is off"
          description="Turn it on in ATS → Settings → Email to send emails and see replies here."
          action={<Button asChild size="sm" variant="outline"><Link to="/hrms/ats/settings?tab=email">Open email settings</Link></Button>} />
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="max-w-full overflow-x-auto">
                <Tabs value={isConv ? view : ""} onValueChange={(x) => setParams({ view: x, c: null })}>
                  <TabsList className="flex-nowrap">
                    {CONV_TABS.map((t) => (
                      <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                        {t.label}
                        <CountPill n={c?.[t.value as keyof typeof c] ?? 0} className={t.value === "needs_reply" && (c?.needs_reply ?? 0) > 0 ? "bg-primary text-primary-foreground" : undefined} />
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              {isConv && (
                <div className="relative ml-auto w-full sm:w-72">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input ref={searchRef} value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search name, ref, email or text" className="pl-8 text-foreground" aria-label="Search conversations" />
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs">
              <button type="button" onClick={() => setParams({ view: "undelivered", c: null })}
                className={cn("underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded", view === "undelivered" ? "font-semibold text-foreground" : "text-muted-foreground")}>
                Not delivered ({failed})
              </button>
              <button type="button" onClick={() => setParams({ view: "queued", c: null })}
                className={cn("underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded", view === "queued" ? "font-semibold text-foreground" : "text-muted-foreground")}>
                Waiting to send ({queued})
              </button>
            </div>
          </div>

          {!isConv ? (
            <>
              {list.isLoading ? <RowsSkeleton rows={6} /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> :
                !listRows.length ? <EmptyState icon={Mail} title={EMPTY[view]} className="rounded-xl border border-border bg-card" /> : (
                <ul className={cn(view === "queued" && "opacity-90", "divide-y divide-border rounded-xl border border-border bg-card")}>
                  {listRows.map((r) => <InboxItem key={r.id} r={r} view={view as View} />)}
                </ul>
              )}
              {list.hasNextPage && (
                <Button variant="outline" className="w-full" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>Load more</Button>
              )}
            </>
          ) : isLg ? (
            <div className="grid h-[calc(100vh-8rem)] min-h-[680px] grid-cols-[minmax(17rem,21rem)_1fr] overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex min-h-0 flex-col border-r border-border">{convList}</div>
              <div className="min-h-0 min-w-0 overflow-hidden">
                {sel ? (
                  <CandidateReviewPanel key={sel} candidateId={sel} appId={sp.get("app") ?? selRow?.application_id ?? null} initialPaneTab="messages" shortcuts={false} className="h-full"
                    onAppChange={(id) => setParams({ app: id }, true)} onConversationChanged={() => advanceFrom(sel, rows)} />
                ) : !conv.isLoading && !rows.length ? null : <div className="p-4"><RowsSkeleton rows={6} /></div>}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">{convList}</div>
          )}
        </>
      )}
      <PickTimeDialog open={!!pickFor} onOpenChange={(o) => !o && setPickFor(null)} title="Snooze until" confirmLabel="Snooze"
        onPick={(iso) => { if (pickFor) void act(pickFor, "snooze", iso); }} />
    </div>
  );
}

function ConversationListItem({ r, view, selected, onOpen, onAct, snoozeOpen, onSnoozeOpenChange, onPick }: {
  r: ConversationRow; view: ConvView; selected: boolean; onOpen: () => void;
  onAct: (candidateId: string, action: "done" | "reopen" | "snooze" | "unsnooze", until?: string) => void;
  snoozeOpen: boolean; onSnoozeOpenChange: (o: boolean) => void; onPick: () => void;
}) {
  const unread = Number(r.unread ?? 0) > 0;
  const outbound = r.last_direction === "outbound";
  const failed = outbound && (r.last_status === "failed" || r.last_status === "bounced");
  const meta = !outbound ? intentMeta(r.last_intent) : null;
  const futureFu = r.follow_up_at && new Date(r.follow_up_at).getTime() > Date.now() ? r.follow_up_at : null;
  const longWait = r.state === "needs_reply" && r.last_in_at && Date.now() - new Date(r.last_in_at).getTime() > 86_400_000;
  const id = r.candidate_id!;
  return (
    <li id={`conv-${id}`} className="group relative">
      <div role="button" tabIndex={0} aria-current={selected ? "true" : undefined} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
        className={cn("flex cursor-pointer gap-2.5 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          selected ? "bg-primary/10" : "hover:bg-muted/40")}>
        <span className="relative">
          <CandidateAvatar full_name={r.full_name ?? ""} size="sm" />
          {unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card" aria-label="Unread" />}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className={cn("min-w-0 truncate text-sm text-foreground", unread ? "font-semibold" : "font-medium")}>{r.full_name ?? "Candidate"}</span>
            <span className="t-mono shrink-0 text-[11px] text-muted-foreground">{r.ref_no}</span>
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground" title={r.last_at ? fmtDateTime(r.last_at) : undefined}>{r.last_at ? fmtRelative(r.last_at) : ""}</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{r.job_title ?? "General application"}</span>
            {r.stage_name && <StageChip name={r.stage_name} kind={r.stage_kind} className="h-5 px-2 text-[11px]" />}
            {r.app_status && r.app_status !== "active" && <AppStatusBadge status={r.app_status} />}
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            {meta && <IntentChip intent={r.last_intent as ReplyIntent} size="sm" />}
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              {failed ? <span className="text-destructive">Not delivered: </span> : outbound ? "You: " : ""}{r.last_snippet ?? r.last_subject ?? ""}
            </p>
          </div>
          {(r.next_interview_at || futureFu || (view === "snoozed" && r.snoozed_until) || longWait) && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {r.next_interview_at && (
                <StatusPill tone={r.next_interview_response === "accepted" ? "success" : r.next_interview_response === "declined" ? "destructive" : "neutral"} className="h-5 px-2 text-[11px]">
                  Interview {ivShort(r.next_interview_at)}{r.next_interview_response === "accepted" ? " · confirmed" : r.next_interview_response === "declined" ? " · declined" : ""}
                </StatusPill>
              )}
              {futureFu && <StatusPill tone="neutral" icon={Clock} className="h-5 px-2 text-[11px]">Follow up {fmtUntil(futureFu)}</StatusPill>}
              {view === "snoozed" && r.snoozed_until && <StatusPill tone="neutral" className="h-5 px-2 text-[11px]">Snoozed until {fmtDateTime(r.snoozed_until)}</StatusPill>}
              {longWait && <StatusPill tone="warning" className="h-5 px-2 text-[11px]">Waiting {waitingText(r.last_in_at!)}</StatusPill>}
            </div>
          )}
        </div>
      </div>
      <div className={cn("absolute right-2 top-7 hidden items-center gap-0.5 rounded-md bg-card p-0.5 shadow-sm ring-1 ring-border lg:flex",
        snoozeOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100")}>
        <TooltipProvider delayDuration={150}><Tooltip><TooltipTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={view === "done" ? "Reopen" : "Done"} onClick={() => onAct(id, view === "done" ? "reopen" : "done")}>
            {view === "done" ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          </Button>
        </TooltipTrigger><TooltipContent>{view === "done" ? "Reopen" : "Done"} (e)</TooltipContent></Tooltip></TooltipProvider>
        {view === "snoozed" && (
          <TooltipProvider delayDuration={150}><Tooltip><TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Unsnooze" onClick={() => onAct(id, "unsnooze")}><BellRing className="h-4 w-4" /></Button>
          </TooltipTrigger><TooltipContent>Unsnooze</TooltipContent></Tooltip></TooltipProvider>
        )}
        <DropdownMenu open={snoozeOpen} onOpenChange={onSnoozeOpenChange}>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Snooze"><Clock className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs">Snooze until…</DropdownMenuLabel>
            {snoozeChoices().map((ch) => (
              <DropdownMenuItem key={ch.key} onSelect={() => (ch.until ? onAct(id, "snooze", ch.until) : onPick())}>{ch.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

const EMPTY: Record<string, string> = { unread: "No unread replies.", all: "No replies yet.", undelivered: "Every email was delivered.", queued: "Nothing is waiting to send." };
type View = "unread" | "all" | "undelivered" | "queued";
const PAGE = 50;
const SELECT =
  "id,candidate_id,application_id,direction,status,error,subject,snippet,from_name,from_address,to_addresses,received_at,sent_at,created_at,read_at,is_automatic,attachments,template_code,ats_candidates(full_name,ref_no),ats_applications(position_text,ats_jobs(title))";

interface InboxRow {
  template_code?: string | null;
  id: string; candidate_id: string; application_id: string | null; direction: string; status: string; error: string | null;
  subject: string | null; snippet: string | null; from_name: string | null; from_address: string | null; to_addresses: string[];
  received_at: string | null; sent_at: string | null; created_at: string; read_at: string | null; is_automatic: boolean;
  attachments: unknown;
  ats_candidates: { full_name: string; ref_no: string } | null;
  ats_applications: { position_text: string | null; ats_jobs: { title: string } | null } | null;
}

async function fetchInbox(view: View, page: number): Promise<InboxRow[]> {
  let q = supabase.from("ats_messages").select(SELECT);
  if (view === "unread") q = q.eq("direction", "inbound").is("read_at", null);
  else if (view === "all") q = q.eq("direction", "inbound");
  else if (view === "undelivered") q = q.eq("direction", "outbound").in("status", ["failed", "bounced"])
    .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  else q = q.eq("status", "queued");
  const order = view === "unread" || view === "all" ? "received_at" : "created_at";
  const { data, error } = await q.order(order, { ascending: false, nullsFirst: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (error) throw error;
  return (data ?? []) as unknown as InboxRow[];
}

function InboxItem({ r, view }: { r: InboxRow; view: View }) {
  const mailOn = !!useMailStatus().data?.enabled;
  const nav = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [busy, setBusy] = useState(false);
  const [askRetry, setAskRetry] = useState(false);
  const unreadRow = r.direction === "inbound" && !r.read_at;
  const when = r.received_at ?? r.sent_at ?? r.created_at;
  const job = r.ats_applications?.ats_jobs?.title ?? (r.application_id ? r.ats_applications?.position_text : null) ?? "General";
  const attCount = Array.isArray(r.attachments) ? r.attachments.length : 0;
  const href = `/hrms/ats/candidates/${r.candidate_id}?${r.application_id ? `app=${r.application_id}&` : ""}tab=messages`;
  const retry = async () => {
    setBusy(true);
    try {
      const res = await retryCandidateEmail(r.id);
      res.status === "sent" ? toast.success("Email sent") : toast.error(mailErrorMessage(res.error));
    } catch (err) {
      toast.error(err instanceof MailError ? mailErrorMessage(err.code, err.field) : mailErrorMessage(null));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["ats", "mail"] });
    }
  };
  return (
    <li>
      <div role="link" tabIndex={0} onClick={() => nav(href)} onKeyDown={(e) => { if (e.key === "Enter") nav(href); }}
        className={cn("flex cursor-pointer gap-3 px-3 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isMobile && "flex-col gap-1")}>
        <div className={cn("flex min-w-0 items-start gap-2", isMobile ? "w-full" : "w-60 shrink-0")}>
          <CandidateAvatar full_name={r.ats_candidates?.full_name ?? ""} size="sm" />
          <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("truncate text-sm text-foreground", unreadRow ? "font-semibold" : "font-medium")}>{r.ats_candidates?.full_name ?? "Candidate"}</span>
          </div>
          <p className="truncate text-xs text-muted-foreground"><span className="t-mono">{r.ats_candidates?.ref_no}</span> · {job}</p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm text-foreground">{r.subject || "(no subject)"}</span>
            {r.direction === "inbound" && r.is_automatic && <Badge variant="outline" className="shrink-0 font-normal">Automatic reply</Badge>}
            {r.direction === "outbound" && r.is_automatic && <Badge variant="outline" className="shrink-0 font-normal">Sent automatically</Badge>}
            {attCount > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground"><Paperclip className="h-3 w-3" />{attCount}</span>}
          </div>
          {r.snippet && <p className="truncate text-xs text-muted-foreground">{r.snippet}</p>}
          {view === "queued" && <div className="mt-1"><StatusPill tone="neutral">Waiting to send</StatusPill></div>}
          {view === "undelivered" && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-destructive">
              <StatusPill tone="destructive">Not delivered</StatusPill>
              <span>{r.status === "bounced" ? "Bounced: check the address" : mailErrorMessage(r.error)}</span>
              {r.status === "failed" && r.template_code === "interview-pick-a-slot" && <span>Make a new link from the Interviews card instead.</span>}
              {mailOn && r.status === "failed" && canRetry(r.error) && r.template_code !== "interview-pick-a-slot" && (
                <Button size="sm" variant="outline" className="h-7 gap-1" disabled={busy} onClick={(e) => { e.stopPropagation(); r.error === "interrupted" ? setAskRetry(true) : retry(); }}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retry
                </Button>
              )}
            </div>
          )}
        </div>
        <TooltipProvider><Tooltip><TooltipTrigger asChild>
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap text-xs text-muted-foreground" title={fmtDateTime(when)}>{fmtRelative(when)}{unreadRow && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}</span>
        </TooltipTrigger><TooltipContent>{fmtDateTime(when)}</TooltipContent></Tooltip></TooltipProvider>
      </div>
      <InterruptedRetryDialog open={askRetry} onOpenChange={setAskRetry} onConfirm={retry} />
    </li>
  );
}
