import { UnreadMailMark } from "@/components/ats/UnreadMailMark";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Columns2, Plus, Search, Table2, Users, FilterX, KanbanSquare, Download } from "lucide-react";
import { toast } from "sonner";
import { BulkBar } from "@/components/ats/BulkBar";
import { PipelineBoard } from "@/components/ats/PipelineBoard";
import { downloadCandidatesXlsx, withCurrentCtc } from "@/lib/ats/export";
import { atsErrorMessage } from "@/lib/ats/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDebounce } from "@/hooks/useDebounce";
import { QueryError, RowsSkeleton } from "@/components/ats/AtsBits";
import { useAts } from "@/components/ats/AtsContext";
import { CandidateTable } from "@/components/ats/CandidateTable";
import { CandidateReviewPanel } from "@/components/ats/CandidateReviewPanel";
import { UnreviewedDot, isUnreviewed } from "@/components/ats/CandidateBits";
import { useAtsJobSummary, useAtsJobs, useAtsSettings, useAtsSources, useAtsStages } from "@/lib/ats/api";
import {
  fetchMatchingRows, PAGE_SIZE, candidateHref, hasActiveFilters, parseFilters, saveNavCtx, useAnyApplication, useCandidateList, useGeneralCount,
  type AtsAppRow, type CandidateFilters,
} from "@/lib/ats/candidates";
import { fmtDate } from "@/lib/ats/format";

const MODE_KEY = "ats.candidates.mode";
const NEXT_KEY = "ats.candidates.goNext";
const readLS = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

const STATUS_OPTS = [
  { v: "active", l: "Active" }, { v: "hired", l: "Hired" }, { v: "rejected", l: "Rejected" }, { v: "withdrawn", l: "Withdrawn" }, { v: "all", l: "All" },
];
const SORT_OPTS = [
  { v: "newest", l: "Newest applied" }, { v: "oldest", l: "Oldest" }, { v: "activity", l: "Last activity" }, { v: "rating", l: "Rating" }, { v: "name", l: "Name" },
];
const APPLIED_OPTS = [{ v: "all", l: "Any time" }, { v: "7d", l: "Last 7 days" }, { v: "30d", l: "Last 30 days" }, { v: "90d", l: "Last 90 days" }];

function countFor(s: any, status: CandidateFilters["status"]): number {
  if (!s) return 0;
  switch (status) {
    case "active": return Number(s.active_count ?? 0) + Number(s.on_hold_count ?? 0);
    case "hired": return Number(s.hired_count ?? 0);
    case "rejected": return Number(s.rejected_count ?? 0);
    case "withdrawn": return Number(s.withdrawn_count ?? 0);
    default: return Number(s.total_applications ?? 0);
  }
}

export default function AtsCandidatesPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { openAddCandidate } = useAts();
  const [sp, setSp] = useSearchParams();
  const f = useMemo(() => parseFilters(sp), [sp]);
  const page = Math.max(0, Number(sp.get("page") ?? 0) || 0);
  const sel = sp.get("sel");
  const settings = useAtsSettings();
  const idleDays = settings.data?.idle_alert_days ?? 7;
  const jobs = useAtsJobs();
  const summary = useAtsJobSummary();
  const general = useGeneralCount(f.status);
  const stages = useAtsStages();
  const sources = useAtsSources();
  const any = useAnyApplication();
  const list = useCandidateList(f, page, idleDays, settings.isFetched);
  type Mode = "table" | "review" | "board";
  const [mode, setModeState] = useState<Mode>(() => { const m = readLS(MODE_KEY, "table"); return m === "review" || m === "board" ? m : "table"; });
  const [selected, setSelected] = useState<Map<string, AtsAppRow>>(new Map());
  const [selectingAll, setSelectingAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [goNext, setGoNextState] = useState(() => readLS(NEXT_KEY, "1") !== "0");
  const [q, setQ] = useState(f.q ?? "");
  const dq = useDebounce(q, 300);

  const setMode = (m: Mode) => { setModeState(m); writeLS(MODE_KEY, m); };
  const setGoNext = (v: boolean) => { setGoNextState(v); writeLS(NEXT_KEY, v ? "1" : "0"); };

  const update = useCallback((patch: Record<string, string | null>, keepPage = false) => {
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") n.delete(k); else n.set(k, v); }
      if (!keepPage) n.delete("page");
      return n;
    }, { replace: true });
  }, [setSp]);

  useEffect(() => { if ((dq.trim() || undefined) !== f.q) update({ q: dq.trim() || null, sel: null }); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setQ(f.q ?? ""); }, [f.q]);
  // Selection survives paging but clears when any filter changes.
  const filterKey = JSON.stringify(f);
  useEffect(() => { setSelected(new Map()); }, [filterKey]);

  const toggle = (r: AtsAppRow) => setSelected((m) => { const n = new Map(m); if (n.has(r.application_id!)) n.delete(r.application_id!); else n.set(r.application_id!, r); return n; });
  const togglePage = (on: boolean) => setSelected((m) => { const n = new Map(m); for (const r of list.data?.rows ?? []) { if (on) n.set(r.application_id!, r); else n.delete(r.application_id!); } return n; });
  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const { rows: all } = await fetchMatchingRows(f, idleDays, 1000);
      setSelected(new Map(all.map((r) => [r.application_id!, r])));
    } catch (e) { toast.error(atsErrorMessage(e)); } finally { setSelectingAll(false); }
  };
  const runExport = async (preset?: AtsAppRow[]) => {
    if (exporting) return;
    setExporting(true);
    const t = toast.loading("Preparing export…");
    try {
      const base = preset ?? (await fetchMatchingRows(f, idleDays, 5000, (n, total) => toast.loading(`Fetching ${n} of ${total}…`, { id: t }))).rows;
      if (!base.length) { toast.info("Nothing to export.", { id: t }); return; }
      toast.loading(`Building file with ${base.length} rows…`, { id: t });
      await downloadCandidatesXlsx(await withCurrentCtc(base));
      toast.success(`Exported ${base.length} candidate${base.length === 1 ? "" : "s"}`, { id: t });
    } catch (e) { toast.error(atsErrorMessage(e), { id: t }); } finally { setExporting(false); }
  };

  const rows = list.data?.rows ?? [];
  const total = list.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rememberCtx = () => saveNavCtx({
    items: rows.map((r) => ({ candidateId: r.candidate_id!, appId: r.application_id! })),
    from: `/hrms/ats/candidates?${sp.toString()}`,
  });
  const openFull = (r: AtsAppRow) => { rememberCtx(); navigate(candidateHref(r), { state: { fromList: true } }); };

  const effectiveMode: Mode = isMobile && mode === "review" ? "table" : mode;
  const selRow = rows.find((r) => r.application_id === sel) ?? (effectiveMode === "review" ? rows[0] : undefined);

  const moveSel = useCallback((dir: 1 | -1) => {
    if (!rows.length) return;
    const i = Math.max(0, rows.findIndex((r) => r.application_id === selRow?.application_id));
    const n = rows[Math.min(rows.length - 1, Math.max(0, i + dir))];
    if (n) update({ sel: n.application_id }, true);
  }, [rows, selRow?.application_id, update]);

  useEffect(() => {
    if (effectiveMode !== "review") return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,[contenteditable=true],[role=dialog],[role=menu],[role=listbox]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); moveSel(1); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); moveSel(-1); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [effectiveMode, moveSel]);

  const railJobs = useMemo(() => (jobs.data ?? []).filter((j) => j.status === "open" || j.status === "paused"), [jobs.data]);
  const closedJobs = useMemo(() => (jobs.data ?? []).filter((j) => j.status === "closed" || j.status === "draft"), [jobs.data]);
  const allCount = useMemo(() => {
    let n = countFor(null, f.status);
    summary.data?.forEach((s) => { n += countFor(s, f.status); });
    return n + (general.data ?? 0);
  }, [summary.data, general.data, f.status]);

  const railItem = (key: string | null, label: string, count: number | null) => {
    const active = (f.job ?? null) === key;
    return (
      <button key={key ?? "all"} type="button" onClick={() => update({ job: key, sel: null })}
        className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
        aria-current={active ? "true" : undefined}>
        <span className="truncate" title={label}>{label}</span>
        {count != null && <span className="shrink-0 text-xs tabular-nums">{count}</span>}
      </button>
    );
  };

  const rail = (
    <nav aria-label="Jobs" className="space-y-0.5">
      {railItem(null, "All jobs", allCount)}
      {railJobs.map((j) => railItem(j.id, j.title, countFor(summary.data?.get(j.id), f.status)))}
      {railItem("general", "General applications", general.data ?? 0)}
      {closedJobs.length > 0 && (
        <Collapsible defaultOpen={closedJobs.some((j) => j.id === f.job)}>
          <CollapsibleTrigger className="group flex w-full items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=closed]:-rotate-90" /> Closed jobs
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5">
            {closedJobs.map((j) => railItem(j.id, j.title, countFor(summary.data?.get(j.id), f.status)))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </nav>
  );

  const sel_ = (value: string, onChange: (v: string) => void, opts: { v: string; l: string }[], label: string, cls = "w-[9.5rem]") => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-9 text-foreground", cls)} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>{opts.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
    </Select>
  );

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, phone or ref" className="h-9 pl-8 text-foreground" aria-label="Search candidates" />
      </div>
      {isMobile && (
        <Select value={f.job ?? "__all"} onValueChange={(v) => update({ job: v === "__all" ? null : v, sel: null })}>
          <SelectTrigger className="h-9 w-full text-foreground" aria-label="Job"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All jobs ({allCount})</SelectItem>
            {[...railJobs, ...closedJobs].map((j) => <SelectItem key={j.id} value={j.id}>{j.title} ({countFor(summary.data?.get(j.id), f.status)})</SelectItem>)}
            <SelectItem value="general">General applications ({general.data ?? 0})</SelectItem>
          </SelectContent>
        </Select>
      )}
      {sel_(f.status, (v) => update({ status: v === "active" ? null : v, sel: null }), STATUS_OPTS, "Status", "w-[8.5rem]")}
      {sel_(f.stage ?? "__any", (v) => update({ stage: v === "__any" ? null : v, sel: null }),
        [{ v: "__any", l: "Any stage" }, ...(stages.data ?? []).filter((s) => s.is_active).map((s) => ({ v: s.id, l: s.name }))], "Stage")}
      {sel_(f.source ?? "__any", (v) => update({ source: v === "__any" ? null : v, sel: null }),
        [{ v: "__any", l: "Any source" }, ...(sources.data ?? []).map((s) => ({ v: s.id, l: s.name }))], "Source")}
      {sel_(f.applied, (v) => update({ applied: v === "all" ? null : v, sel: null }), APPLIED_OPTS, "Applied")}
      {sel_(f.sort, (v) => update({ sort: v === "newest" ? null : v }), SORT_OPTS, "Sort")}
      <label className="flex h-9 items-center gap-2 rounded-md border border-border px-2.5 text-sm text-foreground">
        <Switch checked={!!f.unreviewed} onCheckedChange={(v) => update({ unreviewed: v ? "1" : null, sel: null })} /> Unreviewed
      </label>
      <label className="flex h-9 items-center gap-2 rounded-md border border-border px-2.5 text-sm text-foreground">
        <Switch checked={!!f.idle} onCheckedChange={(v) => update({ idle: v ? "1" : null, sel: null })} /> Idle
      </label>
      <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={exporting} onClick={() => runExport()}><Download className="h-4 w-4" /> Export</Button>
      {(
        <div className="ml-auto inline-flex rounded-md border border-border p-0.5" role="group" aria-label="View">
          <Button size="sm" variant={mode === "table" ? "secondary" : "ghost"} className="h-8 gap-1.5" onClick={() => setMode("table")} aria-pressed={mode === "table"}><Table2 className="h-4 w-4" /> Table</Button>
          {!isMobile && <Button size="sm" variant={mode === "review" ? "secondary" : "ghost"} className="h-8 gap-1.5" onClick={() => setMode("review")} aria-pressed={mode === "review"}><Columns2 className="h-4 w-4" /> Review</Button>}
          <Button size="sm" variant={mode === "board" ? "secondary" : "ghost"} className="h-8 gap-1.5" onClick={() => setMode("board")} aria-pressed={mode === "board"}><KanbanSquare className="h-4 w-4" /> Board</Button>
        </div>
      )}
    </div>
  );

  const pager = total > PAGE_SIZE && (
    <div className="flex items-center justify-between gap-2 pt-3 text-sm text-muted-foreground">
      <span className="tabular-nums">{page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}</span>
      <div className="flex gap-1">
        <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Previous page" disabled={page === 0} onClick={() => update({ page: String(page - 1), sel: null }, true)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Next page" disabled={page + 1 >= pages} onClick={() => update({ page: String(page + 1), sel: null }, true)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );

  let body: React.ReactNode;
  if (effectiveMode === "board") {
    body = f.job
      ? <PipelineBoard key={f.job} jobId={f.job} />
      : <EmptyState icon={KanbanSquare} title="Pick a job to see its board" className="rounded-xl border border-dashed border-border" />;
  } else if (list.isLoading || !settings.isFetched) body = <RowsSkeleton rows={8} />;
  else if (list.isError) body = <QueryError error={list.error} onRetry={() => list.refetch()} />;
  else if (!rows.length && any.data === false) {
    body = <EmptyState icon={Users} title="No candidates yet" description="Add a candidate to start reviewing applicants."
      action={<Button onClick={() => openAddCandidate(f.job && f.job !== "general" ? f.job : null)} className="gap-1.5"><Plus className="h-4 w-4" /> Add candidate</Button>}
      className="rounded-xl border border-dashed border-border" />;
  } else if (!rows.length) {
    body = <EmptyState icon={FilterX} title="No candidates match these filters"
      action={hasActiveFilters(f) ? <Button variant="outline" onClick={() => { setQ(""); setSp(new URLSearchParams(), { replace: true }); }}>Clear filters</Button> : undefined}
      className="rounded-xl border border-dashed border-border" />;
  } else if (effectiveMode === "table") {
    const allPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.application_id!));
    body = <>
      {allPageSelected && total > rows.length && selected.size < Math.min(total, 1000) && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
          {selected.size} selected.
          <Button size="sm" variant="link" className="h-auto p-0" disabled={selectingAll} onClick={selectAllMatching}>
            Select all {Math.min(total, 1000)} matching these filters{total > 1000 ? " (first 1,000)" : ""}
          </Button>
        </div>
      )}
      <CandidateTable rows={rows} idleDays={idleDays} onOpen={openFull} selected={new Set(selected.keys())} onToggle={toggle} onToggleAll={togglePage} />
      {pager}
      {selected.size > 0 && <BulkBar rows={[...selected.values()]} onClear={() => setSelected(new Map())} onExport={() => runExport([...selected.values()])} exporting={exporting} />}
    </>;
  } else {
    body = (
      <div className="grid h-[calc(100vh-15rem)] min-h-[520px] grid-cols-[minmax(14rem,18rem)_1fr] overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex min-h-0 flex-col border-r border-border">
          <label className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            <Label htmlFor="ats-go-next" className="text-xs font-normal">After an action, go to the next candidate</Label>
            <Switch id="ats-go-next" checked={goNext} onCheckedChange={setGoNext} />
          </label>
          <ul className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Candidates">
            {rows.map((r) => {
              const on = r.application_id === selRow?.application_id;
              return (
                <li key={r.application_id} role="option" aria-selected={on}>
                  <button type="button" onClick={() => update({ sel: r.application_id }, true)}
                    className={cn("w-full border-b border-border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      on ? "bg-primary/10" : "hover:bg-muted/60")}>
                    <div className="flex items-center gap-1.5"><UnreviewedDot show={isUnreviewed(r)} /><span className="truncate text-sm font-medium text-foreground">{r.full_name}</span><UnreadMailMark candidateId={r.candidate_id} /></div>
                    <div className="truncate text-xs text-muted-foreground">{r.job_title ?? "General"} · {r.stage_name}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(r.applied_at)}</div>
                  </button>
                </li>
              );
            })}
          </ul>
          {pager && <div className="border-t border-border px-3 pb-2">{pager}</div>}
        </div>
        <div className="min-h-0 min-w-0 overflow-hidden">
          {selRow ? (
            <CandidateReviewPanel key={selRow.candidate_id!} candidateId={selRow.candidate_id!} appId={selRow.application_id}
              onAppChange={(a) => update({ sel: a }, true)}
              onActionDone={() => { if (goNext) moveSel(1); }}
              className="h-full" />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4", !isMobile && "lg:grid-cols-[14rem_1fr]")}>
      {!isMobile && <aside className="hidden lg:block"><div className="sticky top-2 rounded-xl border border-border bg-card p-2">{rail}</div></aside>}
      <div className="min-w-0 space-y-3">
        {filters}
        {!isMobile && <div className="lg:hidden">{/* tablet: compact job select */}
          <Select value={f.job ?? "__all"} onValueChange={(v) => update({ job: v === "__all" ? null : v, sel: null })}>
            <SelectTrigger className="h-9 w-64 text-foreground" aria-label="Job"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All jobs ({allCount})</SelectItem>
              {[...railJobs, ...closedJobs].map((j) => <SelectItem key={j.id} value={j.id}>{j.title} ({countFor(summary.data?.get(j.id), f.status)})</SelectItem>)}
              <SelectItem value="general">General applications ({general.data ?? 0})</SelectItem>
            </SelectContent>
          </Select>
        </div>}
        {body}
      </div>
    </div>
  );
}
