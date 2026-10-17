import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { usePermissions } from "@/hooks/usePermissions";
import { WorkforceFilters } from "@/components/horilla/workforce/WorkforceFilters";
import { HiringRequirementDialog } from "@/components/horilla/workforce/HiringRequirementDialog";
import { WorkforceAttention } from "@/components/horilla/workforce/WorkforceAttention";
import { ShortLinesTable } from "@/components/horilla/workforce/ShortLinesTable";
import { StaffingBreakdown, type BreakdownRow } from "@/components/horilla/workforce/StaffingBreakdown";
import { RequirementReasonDialog, declineConsequence, type ReasonTarget } from "@/components/horilla/workforce/RequirementReasonDialog";
import { WorkforceBudgetCard } from "@/components/horilla/workforce/WorkforceBudgetCard";
import { StaffingStatusCard, WorkforceTabs } from "@/components/horilla/workforce/WorkforceChain";
import { DesignationStoryHost } from "@/components/horilla/workforce/DesignationStory";
import {
  useForecastEvents, useHiringRequirements, useRequirementTransition, useStaffingMatrix, useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";
import { useRequirementJobs } from "@/hooks/hrms/useRequirementLifecycle";
import { useHiringLinkableJobs } from "@/hooks/hrms/useWorkforceAttention";
import { useLeavingSoon } from "@/hooks/hrms/useWorkforceRepair";
import { buildForecast, horizonEndFor } from "@/lib/hrms/workforceForecast";
import { gapParts } from "@/lib/hrms/workforceChain";
import {
  EMPTY_FILTERS, formatIstDate, istToday, matchesFilters, planningShifts,
  rotaOrder, type StaffingDerived, type WorkforceFilterState,
} from "@/lib/hrms/workforce";
import { cn } from "@/lib/utils";

const OPEN = new Set(["pending_approval", "approved", "recruitment_active", "partially_fulfilled"]);
const OPEN_OR_DRAFT = new Set(["draft", ...OPEN]);

/**
 * Overview: one answer (how many people short, and what is already being done about it), the few things that
 * need HR, and the lines that are short. Breakdowns and the budget wait behind "More detail".
 */
export default function WorkforceOverviewPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");
  const navigate = useNavigate();
  const [filters, setFilters] = useState<WorkforceFilterState>({ ...EMPTY_FILTERS });
  const [seed, setSeed] = useState<any | null>(null);
  const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);
  const [approving, setApproving] = useState<any | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

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
  const lineById = useMemo(() => new Map(rows.map((r) => [r.plan_id, r])), [rows]);

  // Position at day 90 — same calculation as the Forecast page (approved hiring only, no attrition).
  const events = useForecastEvents();
  const projected = useMemo(() => {
    if (!events.data) return null;
    const today = istToday();
    const end = horizonEndFor(today, "90");
    const f = buildForecast({
      today, end, includePending: false, attritionPct: 0,
      lines: filtered.map((r) => ({ plan_id: r.plan_id, required_hc: r.required_hc, current_hc: r.current_hc })),
      events: events.data,
    }).totals;
    return { closing: f.closing, required: f.required, lineGap: f.lineGap, endLabel: formatIstDate(end) };
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

  const parts = useMemo(() => gapParts(filtered), [filtered]);
  const shortLines = useMemo(() => filtered.filter((r) => r.staffingGap > 0).length, [filtered]);
  const filtering = filters.departmentId !== "all" || filters.positionId !== "all" || filters.shift !== "all" || filters.employmentType !== "all"
    || filters.status !== "all" || filters.priority !== "all" || !!filters.fromDate || !!filters.toDate;

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

  const reqsFailed = reqs.isError && !reqs.data;
  const nextReadyDate = filtered.map((r) => r.training_ready_date).filter(Boolean).sort()[0] ?? null;
  const nextReady = nextReadyDate
    ? new Date(`${String(nextReadyDate).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })
    : null;
  const loading = matrix.isLoading;
  const attention = (
    <WorkforceAttention
      rows={filtered}
      canManage={canManage}
      limit={3}
      scope={{ departmentId: filters.departmentId, positionId: filters.positionId }}
      shiftFiltered={filters.shift !== "all"}
      shift={filters.shift}
      onOpenRequirement={openReq}
      onApprove={approve}
      onReject={reject}
    />
  );

  return (
    <div className="hrms-page space-y-4">
      <PageHeader
        title="Workforce planning"
        description="Who you need, who you have, and what is being done about the gap."
        actions={canManage ? <Button variant="outline" onClick={() => setSeed({})}><Plus className="h-4 w-4" /> Hiring request</Button> : undefined}
      />

      <WorkforceTabs current="overview" />

      <WorkforceFilters
        value={filters}
        onChange={setFilters}
        departments={lookups?.departments || []}
        positions={lookups?.positions || []}
        shifts={rotaOrder(planningShifts(shifts))}
      />

      {loading ? (
        <>
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </>
      ) : matrix.isError && rows.length === 0 ? (
        <ErrorState title="Couldn't load staffing figures" error={matrix.error} onRetry={() => matrix.refetch()} />
      ) : rows.length === 0 ? (
        <>
          <EmptyState icon={ClipboardList} title="No staffing lines yet"
            description="Add a line for each designation and shift in the staffing plan. People on roll and the pipeline are then counted for you."
            action={<Button asChild><Link to="/hrms/workforce-planning/staffing-plan">Open the staffing plan</Link></Button>} />
          {attention}
        </>
      ) : filtered.length === 0 ? (
        <>
          <EmptyState icon={ClipboardList} title="No staffing lines match these filters"
            description={filters.positionId !== "all" && !rows.some((r) => r.position_id === filters.positionId || (r.role_ids ?? []).includes(filters.positionId))
              ? "This designation has no staffing line yet, so nobody can hire for it. Plan its lines, or clear the filters."
              : "Change or clear the filters to see the figures again."}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {canManage && filters.positionId !== "all" && !rows.some((r) => r.position_id === filters.positionId || (r.role_ids ?? []).includes(filters.positionId)) && (
                  <Button asChild><Link to={`/hrms/workforce-planning/staffing-plan?plan_role=${filters.positionId}`}>Plan lines for this designation</Link></Button>
                )}
                <Button variant="outline" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Clear filters</Button>
              </div>
            } />
          {attention}
        </>
      ) : (
        <>
          <StaffingStatusCard parts={parts} shortLines={shortLines} forecast={projected} forecastError={events.isError && !events.data}
            leaving={leavingQ.data ? leaving.length : null} nextReady={nextReady} filtered={filtering} />

          {attention}

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

          <section aria-label="More detail" className="rounded-xl border border-border bg-card">
            {/* Not a <button>: HRMS phone styles keep button text on one line. */}
            <div role="button" tabIndex={0} onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMoreOpen((o) => !o); } }}
              className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="min-w-0 text-sm font-medium text-foreground">
                More detail <span className="font-normal text-muted-foreground">· by shift, by department{canManage ? ", budget" : ""}</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", moreOpen && "rotate-180")} aria-hidden />
            </div>
            {moreOpen && (
              <div className="space-y-4 border-t border-border p-4">
                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                  <StaffingBreakdown title="By shift" description="On roll against required; shortfalls add up line by line."
                    rows={byShift} onSelect={(k) => setFilters((f) => ({ ...f, shift: f.shift === k ? "all" : k }))} />
                  <StaffingBreakdown title="By department" description="Select a department to filter the page."
                    rows={byDept} onSelect={(k) => setFilters((f) => ({ ...f, departmentId: f.departmentId === k ? "all" : k, positionId: "all" }))} />
                </div>
                <WorkforceBudgetCard canManage={canManage} filtered={filtering} />
              </div>
            )}
          </section>
        </>
      )}

      <HiringRequirementDialog open={!!seed} onOpenChange={(o) => !o && setSeed(null)} initial={seed ?? undefined} />
      <RequirementReasonDialog target={reasonTarget} onClose={() => setReasonTarget(null)} />
      <DesignationStoryHost />

      <AlertDialog open={!!approving} onOpenChange={(o) => !o && setApproving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {approving?.requirement_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              {approving?.number_required} {approving?.number_required === 1 ? "person" : "people"} for {approving?.positions?.title ?? "this designation"}
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
