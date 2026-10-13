import { useState } from "react";
import { Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import {
  HIRING_REASONS,
  PRIORITY_CLASS,
  PRIORITY_LABEL,
  REQ_STATUS_CLASS,
  REQ_STATUS_LABEL,
  formatIstDate,
  formatIstDateTime,
} from "@/lib/hrms/workforce";
import { useRequirementTransition, useSetRequirementStatus } from "@/hooks/hrms/useWorkforcePlanning";
import { RequirementReasonDialog, type ReasonTarget } from "@/components/horilla/workforce/RequirementReasonDialog";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { JobStatusBadge } from "@/components/ats/AtsBits";

interface HiringRequirementDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requirement: any | null;
  canApprove: boolean;
  canManage: boolean;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function HiringRequirementDetailDialog({
  open,
  onOpenChange,
  requirement,
  canApprove,
  canManage,
}: HiringRequirementDetailDialogProps) {
  const reqId = open ? requirement?.id ?? null : null;
  const atsJobs = useQuery({
    queryKey: ["workforce_requirement_ats_jobs", reqId],
    enabled: !!reqId,
    queryFn: async () => {
      const { data: jobs, error } = await supabase.from("ats_jobs")
        .select("id, job_code, title, status").eq("requisition_id", reqId!).order("created_at");
      if (error) throw error;
      const ids = (jobs ?? []).map((j) => j.id);
      const counts = new Map<string, { apps: number; hired: number }>();
      if (ids.length) {
        const { data: apps, error: aErr } = await supabase.from("ats_applications").select("job_id, status").in("job_id", ids);
        if (aErr) throw aErr;
        for (const a of apps ?? []) {
          const c = counts.get(a.job_id as string) ?? { apps: 0, hired: 0 };
          c.apps++; if (a.status === "hired") c.hired++;
          counts.set(a.job_id as string, c);
        }
      }
      return (jobs ?? []).map((j) => ({ ...j, ...(counts.get(j.id) ?? { apps: 0, hired: 0 }) }));
    },
  });
  const navigate = useNavigate();
  const setStatus = useSetRequirementStatus();
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const transition = useRequirementTransition();
  const [cancelTarget, setCancelTarget] = useState<ReasonTarget | null>(null);

  if (!requirement) return null;

  const filled = requirement.positions_filled ?? 0;
  const needed = requirement.number_required ?? 0;
  const remaining = Math.max(0, needed - filled);
  const pct = needed > 0 ? Math.min(100, (filled / needed) * 100) : 0;
  const reasonLabel =
    HIRING_REASONS.find((r) => r.value === requirement.reason)?.label ?? requirement.reason;
  const replacement = requirement.replacement;

  const canSendToRecruitment =
    canManage && requirement.status === "approved";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {requirement.requirement_no}
          <Badge variant="outline" className={REQ_STATUS_CLASS[requirement.status]}>
            {REQ_STATUS_LABEL[requirement.status] ?? requirement.status}
          </Badge>
          <Badge variant="outline" className={PRIORITY_CLASS[requirement.priority]}>
            {PRIORITY_LABEL[requirement.priority] ?? requirement.priority}
          </Badge>
        </span>
      }
      description={`${requirement.positions?.title ?? "Position"} · ${
        requirement.departments?.name ?? "Department"
      }${requirement.shift_label ? ` · ${requirement.shift_label} shift` : ""}`}
      contentClassName="max-w-2xl"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canApprove && requirement.status === "pending_approval" && (
            <>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setShowReject((s) => !s)}
              >
                <ThumbsDown className="h-4 w-4" /> Reject
              </Button>
              <Button
                onClick={() =>
                  setStatus.mutate({ id: requirement.id, status: "approved" })
                }
                disabled={setStatus.isPending}
              >
                <ThumbsUp className="h-4 w-4" /> Approve
              </Button>
            </>
          )}
          {canManage && requirement.status === "draft" && (
            <Button disabled={transition.isPending} onClick={() => transition.mutate({ id: requirement.id, action: "submit" })}>
              Submit for approval
            </Button>
          )}
          {canManage && ["draft", "pending_approval", "approved", "recruitment_active", "partially_fulfilled"].includes(requirement.status) && (
            <Button variant="outline" className="text-destructive"
              onClick={() => setCancelTarget({ id: requirement.id, requirement_no: requirement.requirement_no, action: "cancel" })}>
              Cancel requirement
            </Button>
          )}
          {canManage && ["rejected", "cancelled"].includes(requirement.status) && (
            <Button variant="outline" disabled={transition.isPending} onClick={() => transition.mutate({ id: requirement.id, action: "reopen" })}>
              Reopen as draft
            </Button>
          )}
          {canSendToRecruitment && (
            <Button onClick={() => navigate(`/hrms/ats/jobs?new=1&requirement=${requirement.id}`)}>
              <Send className="h-4 w-4" />
              Create ATS job
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Required" value={needed} />
          <Stat label="Filled" value={filled} />
          <Stat label="Remaining" value={remaining} />
          <Stat label="Target joining" value={formatIstDate(requirement.target_joining_date)} />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Fulfilment</span>
            <span>
              {filled}/{needed} filled
            </span>
          </div>
          <Progress value={pct} />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">ATS jobs for this requirement</p>
          {atsJobs.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : atsJobs.isError ? (
            <p className="text-sm text-destructive">Couldn't load ATS jobs.</p>
          ) : !atsJobs.data?.length ? (
            <p className="text-sm text-muted-foreground">No ATS job yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {atsJobs.data.map((j) => (
                <li key={j.id}>
                  <Link to={`/hrms/ats/jobs/${j.id}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40">
                    <span className="font-mono text-xs text-muted-foreground">{j.job_code}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{j.title}</span>
                    <JobStatusBadge status={j.status} />
                    <span className="text-xs text-muted-foreground">{j.apps} applications · {j.hired} hired</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Reason: </span>
            <span className="text-foreground">{reasonLabel}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Employment type: </span>
            <span className="text-foreground">{requirement.employment_type || "—"}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Experience: </span>
            <span className="text-foreground">{requirement.experience_required || "—"}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Salary range: </span>
            <span className="text-foreground">
              {requirement.salary_min || requirement.salary_max
                ? `₹${requirement.salary_min ?? "—"} – ₹${requirement.salary_max ?? "—"}`
                : "—"}
            </span>
          </p>
          {replacement && (
            <p>
              <span className="text-muted-foreground">Replacement for: </span>
              <span className="text-foreground">
                {[replacement.first_name, replacement.last_name].filter(Boolean).join(" ")}
                {replacement.badge_id ? ` (${replacement.badge_id})` : ""}
              </span>
            </p>
          )}
          <p>
            <span className="text-muted-foreground">Raised by: </span>
            <span className="text-foreground">
              {requirement.requested_by_name || "—"} on{" "}
              {formatIstDateTime(requirement.requested_at)}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">Approval: </span>
            <span className="text-foreground">
              {requirement.approved_at
                ? `${requirement.approver_name || "Approved"} · ${formatIstDateTime(
                    requirement.approved_at,
                  )}`
                : requirement.approver_name
                  ? `Awaiting ${requirement.approver_name}`
                  : "—"}
            </span>
          </p>
        </div>

        {requirement.required_skills && (
          <p className="text-sm">
            <span className="text-muted-foreground">Required skills: </span>
            <span className="text-foreground">{requirement.required_skills}</span>
          </p>
        )}
        {requirement.rejection_reason && (
          <p className="text-sm text-destructive">
            Rejected: {requirement.rejection_reason}
          </p>
        )}

        {showReject && (
          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-foreground">Reason for rejection</p>
            <Textarea
              rows={2}
              className="text-foreground"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <Button
              variant="destructive"
              size="sm"
              disabled={!rejectReason.trim() || setStatus.isPending}
              onClick={() =>
                setStatus.mutate(
                  {
                    id: requirement.id,
                    status: "rejected",
                    rejectionReason: rejectReason.trim(),
                  },
                  {
                    onSuccess: () => {
                      setShowReject(false);
                      setRejectReason("");
                      onOpenChange(false);
                    },
                  },
                )
              }
            >
              Confirm rejection
            </Button>
          </div>
        )}
      </div>
      <RequirementReasonDialog target={cancelTarget} onClose={() => { setCancelTarget(null); onOpenChange(false); }} />
    </ResponsiveDialog>
  );
}
