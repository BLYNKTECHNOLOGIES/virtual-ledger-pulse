import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, MoreHorizontal, Pencil, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import {
  HIRING_REASONS, PRIORITY_LABEL, PRIORITY_TONE, REQ_STATUS_LABEL, REQ_STATUS_TONE,
  daysUntil, employmentTypeLabel, formatIstDate, formatIstDateTime, istToday, linePriorityText,
} from "@/lib/hrms/workforce";
import { invalidatePlanning, useHeadcountPlans, useRequirementTransition, useStaffingMatrix, type RequirementAction } from "@/hooks/hrms/useWorkforcePlanning";
import { linesForRole, useMoveRequirement } from "@/hooks/hrms/useWorkforceRepair";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRequirementAudit, useRequirementJobs, useRequirementPipeline } from "@/hooks/hrms/useRequirementLifecycle";
import { RequirementReasonDialog, declineConsequence, type ReasonTarget } from "@/components/horilla/workforce/RequirementReasonDialog";
import { HiringRequirementDialog } from "@/components/horilla/workforce/HiringRequirementDialog";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { JobStatusBadge } from "@/components/ats/AtsBits";
import { StatusPill } from "@/components/ats/AtsUi";
import { useAtsStages } from "@/lib/ats/api";
import { useLinkableJobs } from "@/lib/ats/jobRequirements";
import { BUDGET_SOURCE_LABEL, formatInr, useWorkforceBudget } from "@/hooks/hrms/useWorkforceBudget";
import { cn } from "@/lib/utils";
import { RequestStages } from "@/components/horilla/workforce/WorkforceChain";
import { requestWhy } from "@/lib/hrms/workforceChain";

interface HiringRequirementDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requirement: any | null;
  canApprove: boolean;
  canManage: boolean;
}

const OPEN = ["draft", "pending_approval", "approved", "recruitment_active", "partially_fulfilled"];
const SOURCE_LABEL: Record<string, string> = {
  capacity_occupancy: "Raised automatically", manual: "Raised by hand", department_request: "Department request", employee_separation: "Replacement",
};
const HISTORY_SHOWN = 5;

function Section({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One stage of the candidate funnel; a link when the candidates list can show exactly these people. */
function Stage({ label, value, to, strong }: { label: string; value: React.ReactNode; to?: string; strong?: boolean }) {
  const body = (
    <>
      <span className="block truncate text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("block text-base font-semibold tabular-nums leading-tight", strong ? "text-primary" : "text-foreground")}>{value}</span>
    </>
  );
  return to ? (
    <Link to={to} className="min-w-0 bg-card px-2.5 py-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{body}</Link>
  ) : (
    <div className="min-w-0 bg-card px-2.5 py-2">{body}</div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

export function HiringRequirementDetailDialog({
  open, onOpenChange, requirement, canApprove, canManage,
}: HiringRequirementDetailDialogProps) {
  const reqId = open ? requirement?.id ?? null : null;
  const linkable = useLinkableJobs(open && requirement ? [requirement as any] : []);
  const navigate = useNavigate();
  const transition = useRequirementTransition();
  const pipeline = useRequirementPipeline();
  const jobsQ = useRequirementJobs();
  const audit = useRequirementAudit(reqId);
  const matrix = useStaffingMatrix();
  const stages = useAtsStages();
  const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);
  const [note, setNote] = useState("");
  const [confirmAction, setConfirmAction] = useState<RequirementAction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const qc = useQueryClient();
  const { data: activePlans = [] } = useHeadcountPlans();
  const move = useMoveRequirement();
  const [moveTo, setMoveTo] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [approveDate, setApproveDate] = useState("");
  const [allHistory, setAllHistory] = useState(false);
  const [moving, setMoving] = useState(false);
  // Opening another request starts clean: nothing typed or picked for the last one carries over.
  useEffect(() => {
    setNote(""); setConfirmAction(null); setEditOpen(false); setMoveTo(""); setMoveReason("");
    setApproveDate(""); setAllHistory(false); setMoving(false); setReasonTarget(null);
  }, [requirement?.id]);

  // Live row (the list snapshot may be stale after an action)
  const live = useQuery({
    queryKey: ["workforce_hiring_requirements", "one", reqId],
    enabled: !!reqId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_hiring_requirements")
        .select("*, departments:department_id(name), positions:position_id(title), replacement:replacement_employee_id(first_name, last_name, badge_id, last_working_day, notice_period_end_date)")
        .eq("id", reqId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const budget = useWorkforceBudget(open && !!canManage);
  const reduce = useMutation({
    mutationFn: async () => {
      const cur: any = live.data ?? requirement;
      const ln = matrix.rows.find((l) => l.plan_id === cur?.staffing_plan_id);
      const over = ln?.over_requested_hc ?? 0;
      const st = pipeline.data?.get(cur.id)?.still_needed ?? 0;
      const target = Math.max(1, (cur.number_required ?? 0) - over, (cur.number_required ?? 0) - st);
      const { error } = await supabase.rpc("hr_update_requirement", {
        p_id: cur.id, p_patch: { number_required: target, staffing_plan_id: cur.staffing_plan_id },
        p_reason: `Reduced to the line's need (was over-requested by ${over})`,
      });
      if (error) throw error;
      return target;
    },
    onSuccess: (t) => { invalidatePlanning(qc); live.refetch(); audit.refetch(); toast.success(`Request reduced to ${t}`); },
    onError: (e: any) => toast.error(e?.message || "Could not reduce the request"),
  });
  if (!requirement) return null;
  const r: any = live.data ?? requirement;
  const p = pipeline.data?.get(r.id);
  const jobs = jobsQ.data?.get(r.id) ?? [];
  const line = r.staffing_plan_id ? matrix.rows.find((l) => l.plan_id === r.staffing_plan_id) : undefined;

  const filled = r.positions_filled ?? 0;
  const needed = r.number_required ?? 0;
  const pct = needed > 0 ? Math.min(100, (filled / needed) * 100) : 0;
  const reasonLabel = HIRING_REASONS.find((x) => x.value === r.reason)?.label
    ?? (r.reason ? String(r.reason).replace(/_/g, " ").replace(/^./, (c: string) => c.toUpperCase()) : null);
  const rep = r.replacement;
  const openJob = jobs.find((j: any) => ["open", "paused"].includes(j.status));
  const recruiting = ["approved", "recruitment_active", "partially_fulfilled"].includes(r.status);
  const stillNeeded = p?.still_needed ?? Math.max(0, needed - filled);
  const linkJobs = canManage && recruiting && !openJob ? (linkable.data?.get(r.id) ?? []) : [];
  const targetIn = r.target_joining_date ? daysUntil(r.target_joining_date, istToday()) : null;

  const firstJob = jobs[0]?.id as string | undefined;
  const stageId = (code: string) => stages.data?.find((s) => s.code === code)?.id;
  const candLink = (extra: string) => (firstJob && jobs.length === 1 ? `/hrms/ats/candidates?job=${firstJob}${extra}` : undefined);
  const stageLink = (code: string) => candLink(stageId(code) ? `&stage=${stageId(code)}` : "");

  const run = (action: RequirementAction, reason?: string | null) =>
    transition.mutate({ id: r.id, action, reason }, {
      onSuccess: (status) => {
        // Show the new status at once — the list snapshot and the live row may still be refetching.
        qc.setQueryData(["workforce_hiring_requirements", "one", reqId], (old: any) => ({ ...(old ?? r), status }));
        setNote(""); live.refetch(); audit.refetch();
      },
    });
  const lineChoices = linesForRole(activePlans as any[], r.department_id, r.position_id).filter((pl: any) => pl.id !== r.staffing_plan_id);
  const lineName = (id: string) => matrix.rows.find((l) => l.plan_id === id)?.shiftLabel ?? "line";
  const canMove = canManage && OPEN.includes(r.status) && lineChoices.length > 0;
  // Line still short after this requirement goes away (its outstanding returns to the line's uncovered need).
  const shortAfter = line ? Math.min(line.netHiringRequirement, line.uncoveredHiringRequirement + stillNeeded) : null;
  // Over-requested approved/recruiting requirement → one click back to what the line needs (never below what is already found).
  const reduceTo = line && line.over_requested_hc > 0
    ? Math.max(1, needed - line.over_requested_hc, needed - stillNeeded)
    : null;

  const askCancel = () => setReasonTarget({ id: r.id, requirement_no: r.requirement_no, action: "cancel", consequence: declineConsequence(r, shortAfter) });
  const moreItems = [
    canManage && OPEN.includes(r.status) && { key: "edit", label: "Edit request", icon: Pencil, onSelect: () => setEditOpen(true) },
    canManage && recruiting && reduceTo !== null && { key: "reduce", label: `Reduce to line need (${needed} → ${reduceTo})`, disabled: move.isPending || reduce.isPending, onSelect: () => reduce.mutate() },
    linkJobs.length > 0 && { key: "new-job", label: "Create a new ATS job instead", icon: Send, onSelect: () => navigate(`/hrms/ats/jobs?new=1&requirement=${r.id}`) },
  ].filter(Boolean) as { key: string; label: string; icon?: typeof Pencil; disabled?: boolean; onSelect: () => void }[];
  const canCancel = canManage && OPEN.includes(r.status);
  const history = audit.data ?? [];
  const shownHistory = allHistory ? history : history.slice(0, HISTORY_SHOWN);

  const footer = (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <Button variant="outline" className="sm:mr-auto" onClick={() => onOpenChange(false)}>Close</Button>
      {(moreItems.length > 0 || canCancel) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline"><MoreHorizontal className="h-4 w-4" /> More</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {moreItems.map((m) => (
              <DropdownMenuItem key={m.key} disabled={m.disabled} onSelect={m.onSelect}>
                {m.icon && <m.icon className="h-4 w-4" />} {m.label}
              </DropdownMenuItem>
            ))}
            {canCancel && moreItems.length > 0 && <DropdownMenuSeparator />}
            {canCancel && <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={askCancel}>Cancel request…</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {canManage && r.status === "draft" && (
        <Button disabled={transition.isPending} onClick={() => run("submit", note)}>Submit for approval</Button>
      )}
      {canApprove && r.status === "pending_approval" && (
        <>
          <Button variant="outline" className="text-destructive"
            onClick={() => setReasonTarget({ id: r.id, requirement_no: r.requirement_no, action: "reject", consequence: declineConsequence(r, shortAfter) })}>
            <ThumbsDown className="h-4 w-4" /> Reject
          </Button>
          <Button disabled={transition.isPending} onClick={() => setConfirmAction("approve")}>
            <ThumbsUp className="h-4 w-4" /> Approve
          </Button>
        </>
      )}
      {canManage && ["rejected", "cancelled"].includes(r.status) && (
        <Button disabled={transition.isPending} onClick={() => run("reopen", note)}>Reopen as draft</Button>
      )}
      {linkJobs.map((j) => (
        <Button key={j.id} onClick={() => navigate(`/hrms/ats/jobs?edit=${j.id}&requirement=${r.id}`)}><Send className="h-4 w-4" /> Link to {j.job_code ?? j.title}</Button>
      ))}
      {canManage && recruiting && !openJob && linkJobs.length === 0 && (
        <Button onClick={() => navigate(`/hrms/ats/jobs?new=1&requirement=${r.id}`)}><Send className="h-4 w-4" /> Create ATS job</Button>
      )}
      {openJob && (
        <Button variant={canApprove && r.status === "pending_approval" ? "outline" : "default"} onClick={() => navigate(`/hrms/ats/jobs/${openJob.id}`)}>
          <ExternalLink className="h-4 w-4" /> Open ATS job
        </Button>
      )}
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{r.requirement_no}</span>
          <StatusPill tone={REQ_STATUS_TONE[r.status] ?? "neutral"}>{REQ_STATUS_LABEL[r.status] ?? r.status}</StatusPill>
          {(line?.priority ?? r.priority) && (
            <span title={line ? `Line priority: ${linePriorityText(line)}` : undefined}>
              <StatusPill tone={PRIORITY_TONE[line?.priority ?? r.priority] ?? "neutral"}>{PRIORITY_LABEL[line?.priority ?? r.priority] ?? (line?.priority ?? r.priority)} priority</StatusPill>
            </span>
          )}
          {(r.adds_headcount ?? 0) > 0 && <StatusPill tone="primary">Adds +{r.adds_headcount} headcount</StatusPill>}
        </span>
      }
      description={`${r.positions?.title ?? "Designation"} · ${r.departments?.name ?? "Department"} · ${line?.shiftLabel || r.shift_label || "Any shift"}`}
      contentClassName="md:max-w-5xl"
      focusContainer
      footer={footer}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Main column: why and where, progress, candidates, jobs, history */}
        <div className="min-w-0 space-y-5">
          <section className="space-y-2.5 rounded-xl border border-border p-3" aria-label="Why this request exists">
            <RequestStages status={r.status} />
            <p className="text-sm text-foreground">{requestWhy(r, line)}</p>
          </section>
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] overflow-hidden rounded-xl border border-border bg-border gap-px sm:grid-cols-4">
            <div className="min-w-0 bg-card px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">Filled</p>
              <p className="text-lg font-semibold tabular-nums leading-tight text-foreground">{filled}<span className="text-sm font-normal text-muted-foreground"> / {needed}</span></p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
            </div>
            <div className="min-w-0 bg-card px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">Still to find</p>
              <p className={cn("text-lg font-semibold tabular-nums leading-tight", stillNeeded > 0 && OPEN.includes(r.status) ? "text-destructive" : "text-foreground")}>{stillNeeded}</p>
              <p className="text-[11px] text-muted-foreground">after people hired or joining</p>
            </div>
            <div className="min-w-0 bg-card px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">Target joining</p>
              <p className="text-sm font-semibold leading-tight text-foreground">{formatIstDate(r.target_joining_date)}</p>
              {targetIn !== null && OPEN.includes(r.status) && (
                <p className={cn("text-[11px]", targetIn < 0 ? "text-destructive" : targetIn <= 15 ? "text-warning" : "text-muted-foreground")}>
                  {targetIn < 0 ? `${-targetIn} days ago` : targetIn === 0 ? "today" : `in ${targetIn} days`}
                </p>
              )}
            </div>
            <div className="min-w-0 bg-card px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">Raised</p>
              <p className="text-sm font-semibold leading-tight text-foreground">{formatIstDate(r.requested_at)}</p>
              <p className="truncate text-[11px] text-muted-foreground">{SOURCE_LABEL[r.source] ?? "—"}</p>
            </div>
          </div>

          <Section title="Candidates" aside={jobs.length > 1 ? <span className="text-xs text-muted-foreground">all {jobs.length} linked jobs</span> : undefined}>
            {pipeline.isError ? (
              <p className="text-sm text-destructive">Couldn't load the candidates. <button type="button" className="underline" onClick={() => pipeline.refetch()}>Try again</button></p>
            ) : jobsQ.isLoading || pipeline.isLoading ? (
              <div className="h-14 animate-pulse rounded-xl bg-muted/60" aria-label="Loading candidates" />
            ) : jobsQ.isError ? null : !jobs.length && !(p?.applied) && !filled ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                No candidates yet — they show here once an ATS job recruits for this request.
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] overflow-hidden rounded-xl border border-border bg-border gap-px sm:grid-cols-8">
                <Stage label="Applied" value={p?.applied ?? "—"} to={candLink("&status=all")} />
                <Stage label="Screening" value={p?.screening ?? "—"} to={stageLink("screening")} />
                <Stage label="Assessment" value={p?.assessment ?? "—"} to={stageLink("assessment")} />
                <Stage label="Interview" value={p?.interview ?? "—"} to={stageLink("interview")} />
                <Stage label="Offer" value={p?.offer ?? "—"} to={stageLink("offer")} />
                <Stage label="Hired" value={p?.hired ?? "—"} to={candLink("&status=hired")} />
                <Stage label="Joining" value={p?.joining ?? "—"} />
                <Stage label="Joined" value={p?.joined ?? filled} strong />
              </div>
            )}
            {jobs.length > 1 && <p className="text-xs text-muted-foreground">Open a job below to see its candidates.</p>}
          </Section>

          <Section title="ATS jobs">
            {jobsQ.isError ? (
              <p className="text-sm text-destructive">Couldn't load ATS jobs. <button type="button" className="underline" onClick={() => jobsQ.refetch()}>Try again</button></p>
            ) : !jobs.length ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                No ATS job yet.{recruiting
                  ? linkJobs.length
                    ? ` ${linkJobs.map((j) => j.job_code ?? j.title).join(", ")} is already open for this designation — link this request to it instead of posting again.`
                    : ` A new job will start with ${stillNeeded} opening${stillNeeded === 1 ? "" : "s"}.`
                  : " A job can be created once this is approved."}
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {jobs.map((j: any) => (
                  <li key={j.id}>
                    <Link to={`/hrms/ats/jobs/${j.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-muted/40">
                      <span className="min-w-0 truncate font-medium text-foreground"><span className="mr-1.5 font-mono text-xs text-muted-foreground">{j.job_code}</span>{j.title}</span>
                      <JobStatusBadge status={j.status} />
                      <span className="col-span-2 text-xs text-muted-foreground">{j.openings ?? 0} opening{j.openings === 1 ? "" : "s"} · {j.is_published ? "on the careers page" : "not on the careers page"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="History" aside={history.length > HISTORY_SHOWN ? (
            <button type="button" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => setAllHistory((v) => !v)} aria-expanded={allHistory}>
              {allHistory ? "Show latest" : `Show all ${history.length}`} <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", allHistory && "rotate-180")} />
            </button>
          ) : undefined}>
            {audit.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
              : audit.isError ? <p className="text-sm text-destructive">Couldn't load the history.</p>
              : !history.length ? <p className="text-sm text-muted-foreground">No history yet.</p>
              : (
                <ol className="relative space-y-3 border-l border-border pl-4">
                  {shownHistory.map((a: any) => (
                    <li key={a.id} className="relative text-sm">
                      <span aria-hidden className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-border ring-2 ring-card" />
                      <p className="text-foreground">
                        {String(a.field_changed ?? "").replace(/^Requirement\b/, "Request")}
                        {(a.old_value || a.new_value) && a.field_changed !== "Requirement created" && (
                          <span className="text-muted-foreground"> · {(a.old_value ?? "—").replace(/_/g, " ")} → {(a.new_value ?? "—").replace(/_/g, " ")}</span>
                        )}
                      </p>
                      {a.reason && <p className="break-words text-xs text-muted-foreground">{a.reason}</p>}
                      <p className="text-[11px] text-muted-foreground">{a.changed_by_name || "System"} · {formatIstDateTime(a.changed_at)}</p>
                    </li>
                  ))}
                </ol>
              )}
          </Section>
        </div>

        {/* Side column: line, details, budget */}
        <div className="min-w-0 space-y-4">
          <section className="rounded-xl border border-border p-3" aria-label="Staffing line">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-foreground">Staffing line</h3>
              {line && (
                <Link className="text-xs text-primary underline-offset-2 hover:underline" to={`/hrms/workforce-planning/staffing-plan?line=${line.plan_id}`}>Open line</Link>
              )}
            </div>
            {matrix.isLoading ? (
              <p className="mt-1 text-sm text-muted-foreground">Loading the staffing line…</p>
            ) : matrix.isError ? (
              <p className="mt-1 text-sm text-destructive">Couldn't load staffing lines. <button type="button" className="underline" onClick={() => matrix.refetch()}>Try again</button></p>
            ) : line ? (
              <>
                <p className="mt-0.5 text-xs text-muted-foreground">{line.position_title} · {line.shiftLabel} · {line.department_name}</p>
                <dl className="mt-2 grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2 text-center">
                  {[
                    ["Required", line.required_hc, ""],
                    ["On roll", line.current_hc, ""],
                    ["Short", Math.max(0, line.staffingGap), line.staffingGap > 0 ? "text-destructive" : ""],
                    ["Training", line.in_training_hc, ""],
                  ].map(([k, v, c]) => (
                    <div key={k as string} className="rounded-lg bg-muted/40 px-1 py-1.5">
                      <dt className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                      <dd className={cn("text-sm font-semibold tabular-nums text-foreground", c as string)}>{v}</dd>
                    </div>
                  ))}
                </dl>
                {line.over_requested_hc > 0 && (
                  <p className="mt-2 text-xs text-warning">Open requests ask for {line.over_requested_hc} more than this line needs.</p>
                )}
              </>
            ) : r.staffing_plan_id && OPEN.includes(r.status) ? (
              <p className="mt-1 text-sm text-destructive">Its staffing line was removed, so this request counts nowhere until it is moved to an active line.</p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Not linked to a staffing line.</p>
            )}
            {canMove && !matrix.isLoading && !matrix.isError && !moving && (
              <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setMoving(true)}>
                {line ? "Move to another line…" : "Link to a line…"}
              </Button>
            )}
            {canMove && !matrix.isLoading && !matrix.isError && moving && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{line ? "Move to another line" : "Link to a line"}</p>
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setMoving(false); setMoveTo(""); setMoveReason(""); }}>Cancel</button>
                </div>
                <Select value={moveTo} onValueChange={setMoveTo}>
                  <SelectTrigger className="h-9 text-foreground"><SelectValue placeholder="Choose a line" /></SelectTrigger>
                  <SelectContent>{lineChoices.map((pl: any) => <SelectItem key={pl.id} value={pl.id}>{lineName(pl.id)}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="h-9 text-foreground" placeholder="Reason (recorded in history)" value={moveReason} onChange={(e) => setMoveReason(e.target.value)} />
                <Button size="sm" className="w-full" disabled={!moveTo || !moveReason.trim() || move.isPending}
                  onClick={() => move.mutate({ id: r.id, planId: moveTo, reason: moveReason }, { onSuccess: () => { setMoveTo(""); setMoveReason(""); setMoving(false); live.refetch(); audit.refetch(); } })}>
                  {line ? "Move request" : "Link to line"}
                </Button>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border px-3 py-2" aria-label="Details">
            <dl className="divide-y divide-border/60">
              <Fact label="Reason">{reasonLabel || "—"}</Fact>
              <Fact label="Employment">{r.employment_type ? employmentTypeLabel(r.employment_type) : "—"}</Fact>
              <Fact label="Experience">{r.experience_required || "—"}</Fact>
              <Fact label="Monthly salary">{r.salary_min || r.salary_max ? `${formatInr(r.salary_min ?? r.salary_max)} – ${formatInr(r.salary_max ?? r.salary_min)}` : "—"}</Fact>
              <Fact label="Raised by">{r.source === "capacity_occupancy" && !r.requested_by_name ? "System (automatic)" : r.requested_by_name || "System"} · {formatIstDateTime(r.requested_at)}</Fact>
              <Fact label="Approval">
                {r.approved_at ? `${r.approver_name || "Approved"} · ${formatIstDateTime(r.approved_at)}` : r.status === "pending_approval" ? "Awaiting any HRMS manager" : "—"}
              </Fact>
              {r.required_skills && <Fact label="Skills">{r.required_skills}</Fact>}
              {r.reason_notes && <Fact label="Reason note"><span className="whitespace-pre-line">{r.reason_notes}</span></Fact>}
              {r.notes && <Fact label="Notes"><span className="whitespace-pre-line">{r.notes}</span></Fact>}
              {r.rejection_reason && <Fact label="Rejected"><span className="text-destructive">{r.rejection_reason}</span></Fact>}
            </dl>
          </section>

          {rep && (
            <section className="rounded-xl border border-border bg-muted/30 p-3 text-sm" aria-label="Replacement">
              <h3 className="font-display text-sm font-semibold text-foreground">Replacement</h3>
              <p className="mt-0.5 text-muted-foreground">
                For <span className="text-foreground">{[rep.first_name, rep.last_name].filter(Boolean).join(" ") || "an employee"}</span>
                {rep.badge_id ? ` (badge ${rep.badge_id})` : ""} · last working day {formatIstDate(rep.last_working_day ?? rep.notice_period_end_date)}
                {" · "}<Link className="text-primary underline-offset-2 hover:underline" to="/hrms/employee/separation">Separation</Link>
              </p>
            </section>
          )}

          {canManage && (() => {
            const b = budget.data?.requirements.find((x) => x.id === r.id);
            const hasRange = !!(r.salary_min || r.salary_max);
            const range = hasRange
              ? `${formatInr(r.salary_min ?? r.salary_max)}–${formatInr(r.salary_max ?? r.salary_min)} a month`
              : b?.per_person != null ? `${formatInr(b.per_person)} a month (average)` : null;
            const people = b?.people ?? stillNeeded;
            if (budget.isLoading && !budget.data) return null;
            return (
              <section className="rounded-xl border border-border p-3 text-sm" aria-label="Budget">
                <h3 className="font-display text-sm font-semibold text-foreground">Budget</h3>
                {range ? (
                  <p className="mt-0.5 text-foreground">{range} × {people}{b?.per_person != null ? ` ≈ ${formatInr(b.per_person * people)} a month` : ""}</p>
                ) : (
                  <p className="mt-0.5 text-muted-foreground">No salary figure yet{OPEN.includes(r.status) && canManage ? " — add a salary range to price this request" : ""}.</p>
                )}
                <p className="text-xs text-muted-foreground">{b?.basis || hasRange ? `Basis: ${b?.basis ?? "the request's salary range"}. ` : ""}{BUDGET_SOURCE_LABEL}. HRMS managers only.</p>
                {b?.no_range && OPEN.includes(r.status) && (
                  <p className="mt-1 text-xs text-warning">No salary range on this request — priced on an average. <button type="button" className="underline" onClick={() => setEditOpen(true)}>Add a salary range</button></p>
                )}
              </section>
            );
          })()}

          {canManage && (r.status === "draft" || ["rejected", "cancelled"].includes(r.status)) && (
            <div className="space-y-1">
              <label htmlFor="req-note" className="text-xs text-muted-foreground">Optional note for {r.status === "draft" ? "submitting" : "reopening"}</label>
              <Textarea id="req-note" rows={2} className="text-foreground" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {/* Only the small dialog closes; the details stay open. */}
      <RequirementReasonDialog target={reasonTarget} onClose={() => { setReasonTarget(null); live.refetch(); audit.refetch(); }} />

      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {r.requirement_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              {needed} {needed === 1 ? "person" : "people"} for {r.positions?.title ?? "this designation"}. Once approved, an ATS job can be opened.
              {(r.adds_headcount ?? 0) > 0 && (line?.follow_desks
                ? ` This request adds ${r.adds_headcount} beyond the line's required number, but the line follows its desk group and can't exceed its desks — switch the line to fixed numbers first (Staffing Plan) or add desks.`
                : ` This request adds headcount: approving also raises the line's required number by ${r.adds_headcount}${line ? ` (${line.required_hc} → ${line.required_hc + r.adds_headcount})` : ""}, recorded in the line's history.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(r.adds_headcount ?? 0) > 0 && line?.follow_desks && (
            <Link className="text-sm text-primary underline-offset-2 hover:underline" to={`/hrms/workforce-planning/staffing-plan?line=${line.plan_id}`}>Open the line in Staffing Plan</Link>
          )}
          {!r.target_joining_date && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Target joining date * — without one the forecast places this hire at the end of whatever period is chosen.</p>
              <Input type="date" className="h-9 text-foreground" value={approveDate} onChange={(e) => setApproveDate(e.target.value)} />
            </div>
          )}
          <Textarea rows={2} className="text-foreground" placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction disabled={!r.target_joining_date && !approveDate}
              onClick={async () => {
                setConfirmAction(null);
                if (!r.target_joining_date && approveDate) {
                  const { error } = await supabase.rpc("hr_update_requirement", {
                    p_id: r.id, p_patch: { target_joining_date: approveDate }, p_reason: "Target joining date set at approval",
                  });
                  if (error) { toast.error(error.message || "Could not set the target joining date"); return; }
                }
                setApproveDate("");
                run("approve", note);
              }}>Approve</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HiringRequirementDialog
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) { live.refetch(); audit.refetch(); } }}
        initial={editOpen ? { ...r } : undefined}
      />
    </ResponsiveDialog>
  );
}
