import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown, ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { MetricStrip } from "@/components/ats/AtsUi";
import { usePermissions } from "@/hooks/usePermissions";
import { WorkforceFilters } from "@/components/horilla/workforce/WorkforceFilters";
import { HiringRequirementDialog } from "@/components/horilla/workforce/HiringRequirementDialog";
import { WorkforceAttention } from "@/components/horilla/workforce/WorkforceAttention";
import { ShortLinesTable } from "@/components/horilla/workforce/ShortLinesTable";
import { StaffingBreakdown, type BreakdownRow } from "@/components/horilla/workforce/StaffingBreakdown";
import { RequirementReasonDialog, declineConsequence, type ReasonTarget } from "@/components/horilla/workforce/RequirementReasonDialog";
import { WorkforceBudgetCard } from "@/components/horilla/workforce/WorkforceBudgetCard";
import {
  useHiringRequirements, useRequirementTransition, useStaffingMatrix, useWorkforceLookups, useForecastEvents,
} from "@/hooks/hrms/useWorkforcePlanning";
import { useRequirementJobs } from "@/hooks/hrms/useRequirementLifecycle";
import { useHiringLinkableJobs } from "@/hooks/hrms/useWorkforceAttention";
import { useLeavingSoon } from "@/hooks/hrms/useWorkforceRepair";
import { buildForecast, horizonEndFor } from "@/lib/hrms/workforceForecast";
import {
  EMPTY_FILTERS, WF_DEFINITIONS, formatIstDate, istToday, matchesFilters, planningShifts, requirementMatchesFilters,
  rotaOrder, sumLines, type StaffingDerived, type WorkforceFilterState,
} from "@/lib/hrms/workforce";
import { cn } from "@/lib/utils";

const OPEN = new Set(["pending_approval", "approved", "recruitment_active", "partially_fulfilled"]);
const OPEN_OR_DRAFT = new Set(["draft", ...OPEN]);

export default function WorkforceOverviewPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");
  const navigate = useNavigate();
  const [filters, setFilters] = useState<WorkforceFilterState>({ ...EMPTY_FILTERS });
  const [seed, setSeed] = useState<any | null>(null);
  const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);
  const [approving, setApproving] = useState<any | null>(null);
  const [approveNote, setApproveNote] = useState("");

  const matrix = useStaffingMatrix();
  const { rows } = matrix;
  const { data: lookups } = useWorkforceLookups();
  const reqs = useHiringRequirements();
  const requirements = (reqs.data || []) as any[];
  const reqJobs = useRequirementJobs();
  const linkable = useHiringLinkableJobs();
  const transition = useRequirementTransition();
  const shifts = (lookups?.shifts || []) as any[];

  // Lines carry no target date of their own; the date filter uses their open requirements' target joining dates.
  const reqsByLine = useMemo(() => {
    const m = new Map<string, any[]>();
    requirements.filter((r) => OPEN_OR_DRAFT.has(r.status) && r.staffing_plan_id).forEach((r) => {
      m.set(r.staffing_plan_id, [...(m.get(r.staffing_plan_id) || []), r]);
    });
    return m;
  }, [requirements]);
  const reqDates = useMemo(() => {
    const m = new Map<string, (string | null)[]>();
    reqsByLine.forEach((list, k) => m.set(k, list.map((r) => r.target_joining_date)));
    return m;
  }, [reqsByLine]);
  const filtered = useMemo(() => rows.filter((r) => matchesFilters(r, filters, reqDates)), [rows, filters, reqDates]);
  const t = useMemo(() => sumLines(filtered), [filtered]);
  const lineById = useMemo(() => new Map(rows.map((r) => [r.plan_id, r])), [rows]);
  const inFilters = (r: any) => requirementMatchesFilters(r, lineById, filters);
  const openReqs = requirements.filter((r) => OPEN.has(r.status) && inFilters(r));
  const pending = openReqs.filter((r) => r.status === "pending_approval");

  // Projected shortfall at day 90 — same calculation as the Forecast page (approved hiring only, no attrition).
  const events = useForecastEvents();
  const projectedGap = useMemo(() => {
    if (!events.data) return null;
    const today = istToday();
    return buildForecast({
      today, end: horizonEndFor(today, "90"), includePending: false, attritionPct: 0,
      lines: filtered.map((r) => ({ plan_id: r.plan_id, required_hc: r.required_hc, current_hc: r.current_hc })),
      events: events.data,
    }).totals.lineGap;
  }, [events.data, filtered]);

  // People on notice in planned roles — including those who sit on no staffing line.
  const leavingQ = useLeavingSoon();
  const leaving = useMemo(() => (leavingQ.data || []).filter((p) => {
    const line = p.plan_id ? lineById.get(p.plan_id) : undefined;
    if (line) return matchesFilters(line, { ...filters, fromDate: "", toDate: "" });
    return filters.shift === "all" &&
      (filters.departmentId === "all" || p.department_id === filters.departmentId) &&
      (filters.positionId === "all" || p.position_id === filters.positionId);
  }), [leavingQ.data, filters, lineById]);
  const nextLeaving = useMemo(() => leaving.map((n) => n.last_working_day).filter(Boolean).sort()[0] ?? null, [leaving]);

  const byShift = useMemo<BreakdownRow[]>(() => {
    const m = new Map<string, BreakdownRow>();
    filtered.forEach((r) => {
      const e = m.get(r.shiftLabel) || { key: r.shiftLabel, label: r.shiftLabel, required: 0, current: 0, short: 0, over: 0 };
      e.required += r.required_hc; e.current += r.current_hc;
      e.short += Math.max(0, r.staffingGap); e.over += Math.max(0, -r.staffingGap);
      m.set(r.shiftLabel, e);
    });
    const order = rotaOrder(planningShifts(shifts)).map((s: any) => s.name);
    return Array.from(m.values()).sort((a, b) => (order.indexOf(a.label) + 1 || 99) - (order.indexOf(b.label) + 1 || 99));
  }, [filtered, shifts]);
  const byDept = useMemo<BreakdownRow[]>(() => {
    const m = new Map<string, BreakdownRow & { id: string | null }>();
    filtered.forEach((r) => {
      const name = r.department_name || "No department";
      const e = m.get(name) || { key: r.department_id ?? "__none__", id: r.department_id, label: name, required: 0, current: 0, short: 0, over: 0, selectable: !!r.department_id };
      e.required += r.required_hc; e.current += r.current_hc;
      e.short += Math.max(0, r.staffingGap); e.over += Math.max(0, -r.staffingGap);
      m.set(name, e);
    });
    return Array.from(m.values()).sort((a, b) => b.required - a.required);
  }, [filtered]);

  const create = (r: StaffingDerived, people: number) =>
    setSeed({
      department_id: r.department_id!, position_id: r.position_id!, shift_id: r.shift_id,
      shift_label: r.shiftLabel === "Any shift" ? null : r.shiftLabel, employment_type: r.employment_type,
      number_required: people, target_joining_date: r.target_date, priority: r.priority, staffing_plan_id: r.plan_id,
    });
  const openReq = (id: string) => navigate(`/hrms/workforce-planning/hiring-requirements?req=${id}`);
  // Approving needs a target joining date (forecast) and, for "adds headcount" requests, the line check — both live in the details.
  // Otherwise a short confirmation here is enough.
  const approve = (q: any) => (q.target_joining_date && !(q.adds_headcount > 0) ? (setApproveNote(""), setApproving(q)) : openReq(q.id));
  const reject = (q: any) => setReasonTarget({ id: q.id, requirement_no: q.requirement_no, action: "reject", consequence: declineConsequence(q, null) });

  // Counted line by line: a surplus on one line never covers a shortage on another.
  const staffedCapped = filtered.reduce((a, r) => a + Math.min(r.current_hc, r.required_hc), 0);
  const staffedPct = t.required > 0 ? Math.round((staffedCapped / t.required) * 100) : 0;
  const reqsFailed = reqs.isError && !reqs.data;
  const nextReady = filtered.map((r) => r.training_ready_date).filter(Boolean).sort()[0] ?? null;
  const loading = matrix.isLoading;

  return (
    <div className="hrms-page space-y-4">
      <PageHeader
        title="Workforce planning"
        description="Who we need to hire, where, for which shift and by when. Every figure adds up the staffing lines."
        actions={
          <div className={cn("grid w-full gap-2 sm:flex sm:w-auto", canManage && "grid-cols-[repeat(2,minmax(0,1fr))]")}>
            {canManage && (
              <Button variant="outline" onClick={() => setSeed({})}><Plus className="h-4 w-4" /> Requirement</Button>
            )}
            <Button asChild>
              <Link to="/hrms/workforce-planning/staffing-plan">Staffing plan <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        }
      />

      <WorkforceFilters
        value={filters}
        onChange={setFilters}
        departments={lookups?.departments || []}
        positions={lookups?.positions || []}
        shifts={rotaOrder(planningShifts(shifts))}
      />

      {loading ? (
        <>
          <MetricStrip>{Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card px-4 py-3.5"><Skeleton className="h-3 w-20" /><Skeleton className="mt-2 h-7 w-14" /><Skeleton className="mt-2 h-3 w-28" /></div>
          ))}</MetricStrip>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </>
      ) : matrix.isError && rows.length === 0 ? (
        <ErrorState title="Couldn't load staffing figures" error={matrix.error} onRetry={() => matrix.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No staffing lines yet"
          description="Add a line for each role and shift in the staffing plan. People on roll and the pipeline are then counted for you."
          action={<Button asChild><Link to="/hrms/workforce-planning/staffing-plan">Open the staffing plan</Link></Button>} />
      ) : filtered.length === 0 ? (
        <>
          <EmptyState icon={ClipboardList} title="No staffing lines match these filters"
            description={filters.positionId !== "all" && !rows.some((r) => r.position_id === filters.positionId || (r.role_ids ?? []).includes(filters.positionId))
              ? "This role has no staffing line yet, so nobody can hire for it. Plan its lines, or clear the filters."
              : "Change or clear the filters to see the figures again."}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {canManage && filters.positionId !== "all" && !rows.some((r) => r.position_id === filters.positionId || (r.role_ids ?? []).includes(filters.positionId)) && (
                  <Button asChild><Link to={`/hrms/workforce-planning/staffing-plan?plan_role=${filters.positionId}`}>Plan lines for this role</Link></Button>
                )}
                <Button variant="outline" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Clear filters</Button>
              </div>
            } />
          <WorkforceAttention
            rows={filtered}
            canManage={canManage}
            scope={{ departmentId: filters.departmentId, positionId: filters.positionId }}
            shiftFiltered={filters.shift !== "all"}
            shift={filters.shift}
            onOpenRequirement={openReq}
            onApprove={approve}
            onReject={reject}
          />
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <MetricStrip>
              <Metric label="On roll" to="/hrms/workforce-planning/staffing-plan"
                value={<>{t.current}<span className="text-lg font-medium text-muted-foreground"> / {t.required}</span></>}
                helper={`${staffedPct}% staffed${t.inTraining ? ` · ${t.inTraining} in training${nextReady ? `, ready ${formatIstDate(nextReady)}` : ""}` : ""}`} />
              <Metric label="Short now" to="/hrms/workforce-planning/staffing-plan?status=understaffed" tone={t.shortNow > 0 ? "danger" : "success"}
                value={t.shortNow} helper={t.netNeed !== t.shortNow ? `${t.netNeed} still needed after trainees and hires` : `across ${filtered.filter((r) => r.staffingGap > 0).length} lines`} />
              <Metric label="Being hired" to="/hrms/workforce-planning/hiring-requirements"
                value={t.requested} helper={reqsFailed ? "requests couldn't load" : reqs.isLoading ? "…" : `${openReqs.length} request${openReqs.length === 1 ? "" : "s"}${pending.length ? ` · ${pending.length} awaiting approval` : ""}`} />
              <Metric label="Not yet requested" to="/hrms/workforce-planning/staffing-plan" tone={t.uncovered > 0 ? "warning" : "default"}
                value={t.uncovered} helper={t.uncovered > 0 ? "short with no hiring request" : "every shortage has a request"} />
              <Metric label="In 90 days" to="/hrms/workforce-planning/forecast" tone={(projectedGap ?? 0) > 0 ? "warning" : "default"}
                value={projectedGap == null ? "…" : projectedGap} helper="short after approved hiring" />
              <Metric label="Leaving soon" to="/hrms/workforce-planning/forecast" tone={leaving.length > 0 ? "warning" : "default"}
                value={leavingQ.isLoading ? "…" : leavingQ.isError && !leavingQ.data ? "—" : leaving.length}
                helper={leavingQ.isLoading ? " " : leavingQ.isError && !leavingQ.data ? "couldn't load" : leaving.length ? (nextLeaving ? `next last day ${formatIstDate(nextLeaving)}` : "last day not set") : "nobody on notice"} />
            </MetricStrip>
            <HowCounted />
          </div>

          <WorkforceAttention
            rows={filtered}
            canManage={canManage}
            columns={2}
            scope={{ departmentId: filters.departmentId, positionId: filters.positionId }}
            shiftFiltered={filters.shift !== "all"}
            shift={filters.shift}
            onOpenRequirement={openReq}
            onApprove={approve}
            onReject={reject}
          />

          <ShortLinesTable
            rows={filtered}
            reqsByLine={reqsByLine}
            reqsError={reqsFailed}
            jobsByReq={reqJobs.data}
            jobsError={reqJobs.isError}
            linkable={linkable.data}
            canManage={canManage}
            busy={transition.isPending}
            onApprove={approve}
            onReject={reject}
            onCreate={create}
            onOpenRequirement={openReq}
          />

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <StaffingBreakdown title="By shift" description="On roll against required; shortfalls add up line by line."
              rows={byShift} onSelect={(k) => setFilters((f) => ({ ...f, shift: f.shift === k ? "all" : k }))} />
            <StaffingBreakdown title="By department" description="Select a department to filter the page."
              rows={byDept} onSelect={(k) => setFilters((f) => ({ ...f, departmentId: f.departmentId === k ? "all" : k, positionId: "all" }))} />
          </div>

          <WorkforceBudgetCard canManage={canManage}
            filtered={filters.departmentId !== "all" || filters.positionId !== "all" || filters.shift !== "all" || filters.employmentType !== "all" || filters.status !== "all" || filters.priority !== "all" || !!filters.fromDate || !!filters.toDate} />
        </>
      )}

      <HiringRequirementDialog open={!!seed} onOpenChange={(o) => !o && setSeed(null)} initial={seed ?? undefined} />
      <RequirementReasonDialog target={reasonTarget} onClose={() => setReasonTarget(null)} />

      <AlertDialog open={!!approving} onOpenChange={(o) => !o && setApproving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {approving?.requirement_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              {approving?.number_required} {approving?.number_required === 1 ? "person" : "people"} for {approving?.positions?.title ?? "this role"}
              {approving?.target_joining_date ? `, joining by ${formatIstDate(approving.target_joining_date)}` : ""}. Recruitment can start once it is approved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea rows={2} className="text-foreground" placeholder="Optional note (kept in the request's history)" value={approveNote} onChange={(e) => setApproveNote(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction disabled={transition.isPending} onClick={() => {
              const q = approving; setApproving(null);
              if (q) transition.mutate({ id: q.id, action: "approve", reason: approveNote.trim() || null });
            }}>Approve</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const METRIC_TONE: Record<string, string> = {
  default: "text-foreground", danger: "text-destructive", warning: "text-amber-600 dark:text-amber-400", success: "text-emerald-600 dark:text-emerald-400",
};

/** One cell of the figure strip; the whole cell opens the page behind the number. */
function Metric({ label, value, helper, to, tone = "default" }: {
  label: string; value: React.ReactNode; helper?: React.ReactNode; to: string; tone?: keyof typeof METRIC_TONE;
}) {
  return (
    <Link to={to} className="group block min-w-0 bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">{label}</span>
      <div className={cn("mt-1 font-display text-[28px] font-semibold leading-8 tabular-nums", METRIC_TONE[tone])}>{value}</div>
      <div className="mt-0.5 min-h-4 text-xs leading-4 text-muted-foreground">{helper}</div>
    </Link>
  );
}

/** The definitions behind the strip, in one place. */
function HowCounted() {
  const [open, setOpen] = useState(false);
  const d = WF_DEFINITIONS;
  const rows: [string, string][] = [
    ["On roll", `${d.onRoll} Required: ${d.required}`],
    ["Short now", `${d.short} The smaller figure under it: ${d.netNeed.toLowerCase()}`],
    ["Being hired", d.beingHired],
    ["Not yet requested", d.notRequested],
    ["In 90 days", d.projected],
    ["Leaving soon", d.leaving],
  ];
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        How these numbers are counted <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 rounded-lg border border-border bg-card p-3 text-xs sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2"><dt className="w-28 shrink-0 font-medium text-foreground">{k}</dt><dd className="text-muted-foreground">{v}</dd></div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}
