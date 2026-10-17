import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { CountPill, StatusPill } from "@/components/ats/AtsUi";
import { usePermissions } from "@/hooks/usePermissions";
import { HiringRequirementDialog } from "@/components/horilla/workforce/HiringRequirementDialog";
import { HiringRequirementDetailDialog } from "@/components/horilla/workforce/HiringRequirementDetailDialog";
import { useHeadcountPlans, useHiringRequirements, useStaffingMatrix, useWorkforceLookups } from "@/hooks/hrms/useWorkforcePlanning";
import { requirementLineIssues } from "@/hooks/hrms/useWorkforceAlerts";
import { useRequirementJobs, useRequirementPipeline } from "@/hooks/hrms/useRequirementLifecycle";
import { useHiringLinkableJobs } from "@/hooks/hrms/useWorkforceAttention";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PRIORITY_DOT, PRIORITY_LABEL, REQ_STATUS_LABEL, REQ_STATUS_TONE, formatIstDate, planningShifts, rotaOrder } from "@/lib/hrms/workforce";
import { cn } from "@/lib/utils";

type Tab = "open" | "pending" | "nojob" | "active" | "closed" | "all";
const HIRING = ["approved", "recruitment_active", "partially_fulfilled"];
const OPEN = ["draft", "pending_approval", ...HIRING];
const SOURCE: Record<string, string> = {
  capacity_occupancy: "Automatic", manual: "Manual", department_request: "Department request", employee_separation: "Replacement",
};

export default function HiringRequirementsPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    return (["pending", "nojob", "active", "closed", "all"].includes(t ?? "") ? t : "open") as Tab;
  });
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [shift, setShift] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const navigate = useNavigate();

  const { data: requirements = [], isLoading, isError, error, refetch } = useHiringRequirements();
  const { data: lookups } = useWorkforceLookups();
  // Deep link from the staffing plan / overview: ?req=<requirement id>
  useEffect(() => {
    const id = searchParams.get("req");
    if (!id || isLoading) return;
    const found = (requirements as any[]).find((r) => r.id === id);
    if (found) setDetail(found);
    searchParams.delete("req");
    searchParams.delete("tab");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, requirements, isLoading, setSearchParams]);

  const { data: activePlans = [] } = useHeadcountPlans();
  const lineIssue = useMemo(() => {
    const x = requirementLineIssues(requirements as any[], activePlans as any[]);
    return { unlinked: new Set(x.unlinked.map((r: any) => r.id)), inactive: new Set(x.onInactiveLine.map((r: any) => r.id)) };
  }, [requirements, activePlans]);
  const pipeline = useRequirementPipeline();
  const reqJobs = useRequirementJobs();
  const linkable = useHiringLinkableJobs();
  const matrix = useStaffingMatrix();
  const lineById = useMemo(() => new Map(matrix.rows.map((l) => [l.plan_id, l])), [matrix.rows]);
  const shifts = (lookups?.shifts || []) as any[];
  const shiftOptions = rotaOrder(planningShifts(shifts));

  const liveJobs = (r: any) => (reqJobs.data?.get(r.id) ?? []).filter((j: any) => ["open", "paused"].includes(j.status));
  // Until the job links load (or when they fail), "no job" and "recruiting" can't be told apart.
  const jobsKnown = !!reqJobs.data;
  const noJob = (r: any) => HIRING.includes(r.status) && !!reqJobs.data && liveJobs(r).length === 0;
  const inTab = (r: any, t: Tab) => {
    switch (t) {
      case "open": return OPEN.includes(r.status);
      case "pending": return r.status === "pending_approval";
      case "nojob": return noJob(r);
      case "active": return HIRING.includes(r.status) && liveJobs(r).length > 0;
      case "closed": return ["fulfilled", "cancelled", "rejected"].includes(r.status);
      default: return true;
    }
  };
  const shiftName = (r: any) => {
    const line = r.staffing_plan_id ? lineById.get(r.staffing_plan_id) : undefined;
    return line?.shiftLabel ?? r.hr_shifts?.name ?? r.shift_label ?? "Any shift";
  };

  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (requirements as any[]).filter((r) => {
      if (dept !== "all" && r.department_id !== dept) return false;
      if (shift !== "all" && shiftName(r) !== shift) return false;
      if (!q) return true;
      return [r.requirement_no, r.positions?.title, r.departments?.name, shiftName(r)].filter(Boolean).some((v: string) => v.toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements, search, dept, shift, lineById]);
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { open: 0, pending: 0, nojob: 0, active: 0, closed: 0, all: 0 };
    for (const r of scoped) (Object.keys(c) as Tab[]).forEach((t) => { if (inTab(r, t)) c[t]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, reqJobs.data]);
  const filtered = scoped.filter((r) => inTab(r, tab));

  const TABS: { value: Tab; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "pending", label: "Awaiting approval" },
    { value: "nojob", label: "Approved, no job" },
    { value: "active", label: "Recruiting" },
    { value: "closed", label: "Closed" },
    { value: "all", label: "All" },
  ];

  const jobAction = (r: any, block = false) => {
    if (!canManage || !noJob(r)) return null;
    const jobs = linkable.data?.get(r.id) ?? [];
    return (
      <div className={cn("flex flex-wrap gap-1.5", block && "w-full")} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {jobs.map((job) => (
          <Button key={job.id} size="sm" className={cn("h-8", block && "flex-1")} onClick={() => navigate(`/hrms/ats/jobs?edit=${job.id}&requirement=${r.id}`)}
            title={`${job.job_code ?? "This job"} "${job.title}" is open for this designation — add this request to it`}>
            Link {job.job_code ?? "open job"}
          </Button>
        ))}
        <Button size="sm" variant={jobs.length ? "outline" : "default"} className={cn("h-8", block && "flex-1")} onClick={() => navigate(`/hrms/ats/jobs?new=1&requirement=${r.id}`)}>
          {jobs.length ? "New job" : "Create ATS job"}
        </Button>
      </div>
    );
  };

  const open = (r: any) => setDetail(r);

  return (
    <div className="hrms-page space-y-4">
      <PageHeader
        title="Hiring requirements"
        description="Every request to hire — who, how many, which shift and by when — from approval through recruitment to joining."
        actions={canManage && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New requirement</Button>
        )}
      />

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Requirement status">
        {TABS.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === t.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
              t.value === "nojob" && counts.nojob > 0 && tab !== t.value && "border-destructive/40 text-destructive")}>
            {t.label}
            {!jobsKnown && (t.value === "nojob" || t.value === "active")
              ? <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground" aria-label="not known yet">…</span>
              : <CountPill n={counts[t.value]} className={cn(tab === t.value && "bg-primary/15")} />}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pl-8 text-foreground" placeholder="Search number, role or department" aria-label="Search requirements"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger aria-label="Department" className={cn("h-9 text-foreground sm:w-52", dept !== "all" && "border-primary/50")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {(lookups?.departments || []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={shift} onValueChange={setShift}>
          <SelectTrigger aria-label="Shift" className={cn("h-9 text-foreground sm:w-44", shift !== "all" && "border-primary/50")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All shifts</SelectItem>
            {shiftOptions.map((s: any) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {reqJobs.isError && !reqJobs.data && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Couldn't load which ATS jobs recruit for each request, so "Approved, no job" and "Recruiting" are unknown.{" "}
          <button type="button" className="underline" onClick={() => reqJobs.refetch()}>Try again</button>
        </div>
      )}

      {isLoading || (!jobsKnown && reqJobs.isLoading && (tab === "nojob" || tab === "active")) ? (
        <TableSkeleton />
      ) : isError && requirements.length === 0 ? (
        <ErrorState title="Couldn't load hiring requirements" error={error} onRetry={() => refetch()} />
      ) : !jobsKnown && (tab === "nojob" || tab === "active") ? (
        <EmptyState icon={ClipboardList} title="ATS jobs not loaded" description="This list needs the ATS job links. Try again above, or use the Open tab." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={requirements.length === 0 ? "No hiring requirements yet" : "Nothing here"}
          description={requirements.length === 0
            ? "Shortages on staffing lines raise requirements automatically. You can also create one when a designation opens up."
            : search || dept !== "all" || shift !== "all" ? "No requirement matches these filters." : "No requirement has this status right now."}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Requirement</th>
                  <th className="px-2 py-2 font-medium">Line</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Filled</th>
                  <th className="hidden px-2 py-2 font-medium xl:table-cell">Candidates</th>
                  <th className="px-2 py-2 font-medium">ATS job</th>
                  <th className="hidden px-4 py-2 font-medium xl:table-cell">Target</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => {
                  const filled = r.positions_filled ?? 0;
                  const needed = r.number_required ?? 0;
                  const pct = needed > 0 ? Math.min(100, (filled / needed) * 100) : 0;
                  const pp = pipeline.data?.get(r.id);
                  const line = r.staffing_plan_id ? lineById.get(r.staffing_plan_id) : undefined;
                  const jobs = liveJobs(r);
                  const priority = line?.priority ?? r.priority;
                  return (
                    <tr key={r.id} onClick={() => open(r)}
                      className="cursor-pointer border-b border-border/60 align-top last:border-0 hover:bg-muted/30 focus-within:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <button type="button" onClick={(e) => { e.stopPropagation(); open(r); }}
                          className="whitespace-nowrap rounded-sm font-mono text-xs text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Open ${r.requirement_no}`}>
                          {r.requirement_no}
                        </button>
                        <p className="text-[11px] text-muted-foreground">{SOURCE[r.source] ?? "Manual"}{r.source === "department_request" && r.requested_by_name ? ` · ${r.requested_by_name}` : ""}</p>
                        <p className="text-[11px] text-muted-foreground xl:hidden">{r.target_joining_date ? `target ${formatIstDate(r.target_joining_date)}` : "no target date"}</p>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2">
                          <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[priority] ?? PRIORITY_DOT.medium)} aria-hidden />
                          <p className="font-medium text-foreground">{r.positions?.title ?? "Designation"} · {shiftName(r)}</p>
                          <span aria-hidden />
                          <p className="text-xs text-muted-foreground">
                            {r.departments?.name ?? "Department"} · {PRIORITY_LABEL[priority] ?? priority} priority
                            {line ? ` · line needs ${line.netHiringRequirement}` : ""}
                            {(r.adds_headcount ?? 0) > 0 ? ` · adds +${r.adds_headcount}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1 pl-4 pt-1 empty:hidden">
                          {lineIssue.unlinked.has(r.id) && <StatusPill tone="destructive">Not on a staffing line</StatusPill>}
                          {lineIssue.inactive.has(r.id) && <StatusPill tone="destructive">Line removed — move it</StatusPill>}
                          {line && line.over_requested_hc > 0 && OPEN.includes(r.status) && <StatusPill tone="warning">Line over-requested by {line.over_requested_hc}</StatusPill>}
                        </div>
                      </td>
                      <td className="px-2 py-2.5"><StatusPill tone={REQ_STATUS_TONE[r.status] ?? "neutral"}>{REQ_STATUS_LABEL[r.status] ?? r.status}</StatusPill></td>
                      <td className="px-2 py-2.5">
                        <p className="text-xs tabular-nums text-foreground">{filled} of {needed}</p>
                        <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></div>
                        {pp && <p className="mt-1 text-[11px] text-muted-foreground xl:hidden">{pp.applied} applied</p>}
                      </td>
                      <td className="hidden px-2 py-2.5 text-xs text-muted-foreground xl:table-cell">
                        {pp ? <>{pp.applied} applied{pp.hired ? ` · ${pp.hired} hired` : ""}{pp.joining ? ` · ${pp.joining} joining` : ""}</> : "—"}
                      </td>
                      <td className="px-2 py-2.5">
                        {!jobsKnown && HIRING.includes(r.status) ? (
                          <span className="text-xs text-muted-foreground">{reqJobs.isError ? "not loaded" : "…"}</span>
                        ) : jobs.length > 0 ? (
                          <div className="flex flex-wrap gap-1">{jobs.map((j: any) => <StatusPill key={j.id} tone={j.status === "open" ? "success" : "warning"}>{j.job_code}{j.status === "paused" ? " · paused" : ""}</StatusPill>)}</div>
                        ) : noJob(r) ? (canManage ? jobAction(r) : <StatusPill tone="destructive">No job</StatusPill>) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="hidden px-4 py-2.5 text-xs text-muted-foreground xl:table-cell">{r.target_joining_date ? formatIstDate(r.target_joining_date) : "No date"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {filtered.map((r: any) => {
              const filled = r.positions_filled ?? 0;
              const needed = r.number_required ?? 0;
              const line = r.staffing_plan_id ? lineById.get(r.staffing_plan_id) : undefined;
              const jobs = liveJobs(r);
              const pp = pipeline.data?.get(r.id);
              return (
                <div key={r.id} onClick={() => open(r)}
                  className="cursor-pointer rounded-xl border border-border bg-card p-3 hover:border-primary/40 focus-within:border-primary/40">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="min-w-0">
                      <p className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">{r.requirement_no} · {SOURCE[r.source] ?? "Manual"}</p>
                      <button type="button" onClick={(e) => { e.stopPropagation(); open(r); }}
                        className="rounded-sm text-left font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {r.positions?.title ?? "Designation"}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {shiftName(r)} · {r.departments?.name ?? "Department"} · {PRIORITY_LABEL[line?.priority ?? r.priority] ?? (line?.priority ?? r.priority)} priority
                      </p>
                    </div>
                    <StatusPill tone={REQ_STATUS_TONE[r.status] ?? "neutral"}>{REQ_STATUS_LABEL[r.status] ?? r.status}</StatusPill>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{filled} of {needed} filled</span>
                    {line ? ` · line needs ${line.netHiringRequirement}` : ""}{pp ? ` · ${pp.applied} applied` : ""}
                    {` · ${r.target_joining_date ? `target ${formatIstDate(r.target_joining_date)}` : "no target date"}`}
                  </p>
                  {jobs.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{jobs.map((j: any) => <StatusPill key={j.id} tone={j.status === "open" ? "success" : "warning"}>{j.job_code}{j.status === "paused" ? " · paused" : ""}</StatusPill>)}</div>}
                  {noJob(r) && <div className="mt-2">{canManage ? jobAction(r, true) : <StatusPill tone="destructive">No ATS job</StatusPill>}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      <HiringRequirementDialog open={createOpen} onOpenChange={setCreateOpen} />

      <HiringRequirementDetailDialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        requirement={detail}
        canApprove={canManage}
        canManage={canManage}
      />
    </div>
  );
}
