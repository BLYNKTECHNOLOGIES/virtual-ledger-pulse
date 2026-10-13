import { useState } from "react";
import { ExternalLink, Pencil, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import {
  HIRING_REASONS, PRIORITY_CLASS, PRIORITY_LABEL, REQ_STATUS_CLASS, REQ_STATUS_LABEL,
  employmentTypeLabel, formatIstDate, formatIstDateTime,
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
import { useAtsStages } from "@/lib/ats/api";
import { BUDGET_SOURCE_LABEL, formatInr, useWorkforceBudget } from "@/hooks/hrms/useWorkforceBudget";

interface HiringRequirementDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requirement: any | null;
  canApprove: boolean;
  canManage: boolean;
}

const OPEN = ["draft", "pending_approval", "approved", "recruitment_active", "partially_fulfilled"];

function Stat({ label, value, to }: { label: string; value: React.ReactNode; to?: string }) {
  const body = (
    <>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </>
  );
  return to ? (
    <Link to={to} className="block rounded-lg border border-border bg-muted/30 p-2.5 hover:border-primary/50">{body}</Link>
  ) : (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5">{body}</div>
  );
}

export function HiringRequirementDetailDialog({
  open, onOpenChange, requirement, canApprove, canManage,
}: HiringRequirementDetailDialogProps) {
  const reqId = open ? requirement?.id ?? null : null;
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
    onSuccess: (t) => { invalidatePlanning(qc); live.refetch(); audit.refetch(); toast.success(`Requirement reduced to ${t}`); },
    onError: (e: any) => toast.error(e?.message || "Could not reduce the requirement"),
  });
  if (!requirement) return null;
  const r: any = live.data ?? requirement;
  const p = pipeline.data?.get(r.id);
  const jobs = jobsQ.data?.get(r.id) ?? [];
  const line = r.staffing_plan_id ? matrix.rows.find((l) => l.plan_id === r.staffing_plan_id) : undefined;

  const filled = r.positions_filled ?? 0;
  const needed = r.number_required ?? 0;
  const pct = needed > 0 ? Math.min(100, (filled / needed) * 100) : 0;
  const reasonLabel = HIRING_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason;
  const rep = r.replacement;
  const openJob = jobs.find((j: any) => ["open", "paused"].includes(j.status));
  const recruiting = ["approved", "recruitment_active", "partially_fulfilled"].includes(r.status);
  const stillNeeded = p?.still_needed ?? Math.max(0, needed - filled);

  const firstJob = jobs[0]?.id as string | undefined;
  const stageId = (code: string) => stages.data?.find((s) => s.code === code)?.id;
  const candLink = (extra: string) => (firstJob && jobs.length === 1 ? `/hrms/ats/candidates?job=${firstJob}${extra}` : undefined);

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

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {r.requirement_no}
          <Badge variant="outline" className={REQ_STATUS_CLASS[r.status]}>{REQ_STATUS_LABEL[r.status] ?? r.status}</Badge>
          <Badge variant="outline" className={PRIORITY_CLASS[r.priority]}>{PRIORITY_LABEL[r.priority] ?? r.priority}</Badge>
          {r.source === "department_request" && <Badge variant="outline">Department request · {r.requested_by_name || "head of department"}</Badge>}
          {(r.adds_headcount ?? 0) > 0 && <Badge variant="outline" className="border-primary/40 text-primary">Adds +{r.adds_headcount} headcount</Badge>}
        </span>
      }
      description={`${r.positions?.title ?? "Position"} · ${r.departments?.name ?? "Department"} · ${r.shift_label || line?.shiftLabel || "Any shift"}`}
      contentClassName="max-w-3xl"
      footer={
        <div className="flex w-full flex-col flex-wrap gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {canManage && OPEN.includes(r.status) && (
            <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>
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
          {canManage && recruiting && reduceTo !== null && (
            <Button variant="outline" disabled={move.isPending || reduce.isPending} onClick={() => reduce.mutate()}>
              Reduce to line need ({needed} → {reduceTo})
            </Button>
          )}
          {canManage && OPEN.includes(r.status) && (
            <Button variant="outline" className="text-destructive"
              onClick={() => setReasonTarget({ id: r.id, requirement_no: r.requirement_no, action: "cancel", consequence: declineConsequence(r, shortAfter) })}>
              Cancel requirement
            </Button>
          )}
          {canManage && ["rejected", "cancelled"].includes(r.status) && (
            <Button variant="outline" disabled={transition.isPending} onClick={() => run("reopen", note)}>Reopen as draft</Button>
          )}
          {canManage && recruiting && !openJob && (
            <Button onClick={() => navigate(`/hrms/ats/jobs?new=1&requirement=${r.id}`)}><Send className="h-4 w-4" /> Create ATS job</Button>
          )}
          {openJob && (
            <Button variant="secondary" onClick={() => navigate(`/hrms/ats/jobs/${openJob.id}`)}><ExternalLink className="h-4 w-4" /> Open ATS job</Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Recruitment progress</span>
            <span>{filled} of {needed} filled · {stillNeeded} still to find</span>
          </div>
          <Progress value={pct} />
        </div>

        {canManage && (() => {
          const b = budget.data?.requirements.find((x) => x.id === r.id);
          const range = r.salary_min || r.salary_max
            ? `${formatInr(r.salary_min ?? r.salary_max)}–${formatInr(r.salary_max ?? r.salary_min)} a month`
            : b?.per_person != null ? `${formatInr(b.per_person)} a month (average)` : "no salary figure";
          const people = b?.people ?? stillNeeded;
          return (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="text-foreground">Budget: {range} × {people}{b?.per_person != null ? ` ≈ ${formatInr(b.per_person * people)} a month` : ""}</p>
              <p className="text-xs text-muted-foreground">Basis: {b?.basis ?? (r.salary_min || r.salary_max ? "requirement salary range" : "—")}. {BUDGET_SOURCE_LABEL}. Visible to HRMS managers only.</p>
              {b?.no_range && OPEN.includes(r.status) && (
                <p className="mt-1 text-xs text-warning">No salary range on this request — priced on an average. <button type="button" className="underline" onClick={() => setEditOpen(true)}>Add a salary range</button></p>
              )}
            </div>
          );
        })()}

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Funnel {jobs.length > 1 && <span className="text-xs font-normal text-muted-foreground">(all {jobs.length} linked jobs)</span>}</p>
          {pipeline.isError ? (
            <p className="text-sm text-destructive">Couldn't load the funnel.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <Stat label="Applied" value={p?.applied ?? "—"} to={candLink("&status=all")} />
              <Stat label="Screening" value={p?.screening ?? "—"} to={candLink(stageId("screening") ? `&stage=${stageId("screening")}` : "")} />
              <Stat label="Assessment" value={p?.assessment ?? "—"} to={candLink(stageId("assessment") ? `&stage=${stageId("assessment")}` : "")} />
              <Stat label="Interview" value={p?.interview ?? "—"} to={candLink(stageId("interview") ? `&stage=${stageId("interview")}` : "")} />
              <Stat label="Offer" value={p?.offer ?? "—"} to={candLink(stageId("offer") ? `&stage=${stageId("offer")}` : "")} />
              <Stat label="Hired" value={p?.hired ?? "—"} to={candLink("&status=hired")} />
              <Stat label="Joining" value={p?.joining ?? "—"} />
              <Stat label="Joined" value={p?.joined ?? filled} />
              <Stat label="Remaining" value={stillNeeded} />
              <Stat label="Target joining" value={formatIstDate(r.target_joining_date)} />
            </div>
          )}
          {jobs.length > 1 && <p className="mt-1 text-xs text-muted-foreground">Numbers cover every linked job; open a job below to see its candidates.</p>}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Linked ATS jobs</p>
          {jobsQ.isError ? (
            <p className="text-sm text-destructive">Couldn't load ATS jobs.</p>
          ) : !jobs.length ? (
            <p className="text-sm text-muted-foreground">
              No ATS job yet.{recruiting ? ` A new job will default to ${stillNeeded} opening${stillNeeded === 1 ? "" : "s"}.` : " A job can be created once this is approved."}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {jobs.map((j: any) => (
                <li key={j.id}>
                  <Link to={`/hrms/ats/jobs/${j.id}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40">
                    <span className="font-mono text-xs text-muted-foreground">{j.job_code}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{j.title}</span>
                    <JobStatusBadge status={j.status} />
                    <span className="text-xs text-muted-foreground">{j.openings ?? 0} openings · {j.is_published ? "on careers page" : "not on careers page"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {rep && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-semibold text-foreground">Replacement</p>
            <p className="text-muted-foreground">
              For <span className="text-foreground">{[rep.first_name, rep.last_name].filter(Boolean).join(" ") || "an employee"}</span>
              {rep.badge_id ? ` (badge ${rep.badge_id})` : ""} · last working day {formatIstDate(rep.last_working_day ?? rep.notice_period_end_date)}
              {" · "}<Link className="text-primary underline-offset-2 hover:underline" to="/hrms/employee/separation">Separation</Link>
            </p>
          </div>
        )}

        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="mb-1 font-semibold text-foreground">Staffing line</p>
          {matrix.isLoading ? (
            <p className="text-muted-foreground">Loading the staffing line…</p>
          ) : matrix.isError ? (
            <p className="text-destructive">Couldn't load staffing lines. <button type="button" className="underline" onClick={() => matrix.refetch()}>Try again</button></p>
          ) : line ? (
            <p className="text-muted-foreground">
              {line.department_name} · {line.position_title} · {line.shiftLabel} — required <span className="text-foreground">{line.required_hc}</span>,
              on roll <span className="text-foreground">{line.current_hc}</span>, short <span className="text-foreground">{Math.max(0, line.staffingGap)}</span>,
              in training <span className="text-foreground">{line.in_training_hc}</span>
              {line.over_requested_hc > 0 && <span className="text-warning"> · {line.over_requested_hc} over-requested</span>}
              {" · "}<Link className="text-primary underline-offset-2 hover:underline" to={`/hrms/workforce-planning/staffing-plan?line=${line.plan_id}`}>Open in Staffing Plan</Link>
            </p>
          ) : r.staffing_plan_id && OPEN.includes(r.status) ? (
            <p className="text-destructive">Its staffing line was removed, so this requirement counts nowhere until it is moved to an active line.</p>
          ) : (
            <p className="text-muted-foreground">Not linked to a staffing line.</p>
          )}
          {canMove && !matrix.isLoading && !matrix.isError && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={moveTo} onValueChange={setMoveTo}>
                <SelectTrigger className="h-8 text-foreground sm:w-44"><SelectValue placeholder={line ? "Move to line" : "Link to line"} /></SelectTrigger>
                <SelectContent>{lineChoices.map((pl: any) => <SelectItem key={pl.id} value={pl.id}>{lineName(pl.id)}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="h-8 text-foreground" placeholder="Reason (recorded in history)" value={moveReason} onChange={(e) => setMoveReason(e.target.value)} />
              <Button size="sm" disabled={!moveTo || !moveReason.trim() || move.isPending}
                onClick={() => move.mutate({ id: r.id, planId: moveTo, reason: moveReason }, { onSuccess: () => { setMoveTo(""); setMoveReason(""); live.refetch(); audit.refetch(); } })}>
                {line ? "Move" : "Link to line"}
              </Button>
            </div>
          )}
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Reason: </span><span className="text-foreground">{reasonLabel}</span></p>
          <p><span className="text-muted-foreground">Employment type: </span><span className="text-foreground">{r.employment_type ? employmentTypeLabel(r.employment_type) : "—"}</span></p>
          <p><span className="text-muted-foreground">Experience: </span><span className="text-foreground">{r.experience_required || "—"}</span></p>
          <p><span className="text-muted-foreground">Monthly salary: </span><span className="text-foreground">
            {r.salary_min || r.salary_max ? `${formatInr(r.salary_min ?? r.salary_max)} – ${formatInr(r.salary_max ?? r.salary_min)}` : "—"}</span></p>
          <p><span className="text-muted-foreground">Raised by: </span><span className="text-foreground">{r.requested_by_name || "System"} on {formatIstDateTime(r.requested_at)}</span></p>
          <p><span className="text-muted-foreground">Approval: </span><span className="text-foreground">
            {r.approved_at ? `${r.approver_name || "Approved"} · ${formatIstDateTime(r.approved_at)}` : r.status === "pending_approval" ? "Awaiting any HRMS manager" : "—"}</span></p>
        </div>
        {r.required_skills && <p className="text-sm"><span className="text-muted-foreground">Required skills: </span><span className="text-foreground">{r.required_skills}</span></p>}
        {r.reason_notes && <p className="text-sm whitespace-pre-line"><span className="text-muted-foreground">Reason note: </span><span className="text-foreground">{r.reason_notes}</span></p>}
        {r.notes && <p className="text-sm whitespace-pre-line"><span className="text-muted-foreground">Notes: </span><span className="text-foreground">{r.notes}</span></p>}
        {r.rejection_reason && <p className="text-sm text-destructive">Rejected: {r.rejection_reason}</p>}

        {canManage && (r.status === "draft" || ["rejected", "cancelled"].includes(r.status)) && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Optional note for {r.status === "draft" ? "submitting" : "reopening"}</p>
            <Textarea rows={2} className="text-foreground" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">History</p>
          {audit.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : audit.isError ? <p className="text-sm text-destructive">Couldn't load the history.</p>
            : !audit.data?.length ? <p className="text-sm text-muted-foreground">No history yet.</p>
            : (
              <ul className="space-y-1.5 text-sm">
                {audit.data.map((a: any) => (
                  <li key={a.id} className="rounded-md border border-border px-2.5 py-1.5">
                    <span className="text-foreground">{a.field_changed}</span>
                    {(a.old_value || a.new_value) && a.field_changed !== "Requirement created" && (
                      <span className="text-muted-foreground"> · {(a.old_value ?? "—").replace(/_/g, " ")} → {(a.new_value ?? "—").replace(/_/g, " ")}</span>
                    )}
                    {a.reason && <span className="block text-xs text-muted-foreground">{a.reason}</span>}
                    <span className="block text-[11px] text-muted-foreground">{a.changed_by_name || "System"} · {formatIstDateTime(a.changed_at)}</span>
                  </li>
                ))}
              </ul>
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
              {needed} {needed === 1 ? "person" : "people"} for {r.positions?.title ?? "this role"}. Once approved, an ATS job can be opened.
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
