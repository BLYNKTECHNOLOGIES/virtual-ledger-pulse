import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidatePlanning } from "@/hooks/hrms/useWorkforcePlanning";
import { useRequirementPipeline } from "@/hooks/hrms/useRequirementLifecycle";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, UserPlus, Users, Pencil, Trash2, Play, Pause, XCircle, RotateCcw, PlusCircle, RefreshCw, Globe, EyeOff, Activity, Briefcase, FileUp, Building2, MapPin, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { JobStatusBadge, QueryError, RowsSkeleton, SectionCard } from "@/components/ats/AtsBits";
import { useAts } from "@/components/ats/AtsContext";
import { MetricCell, MetricStrip, StatusPill, stageDotClass } from "@/components/ats/AtsUi";
import { Skeleton } from "@/components/ui/skeleton";
import { CandidateTable } from "@/components/ats/CandidateTable";
import { CareersJobCard } from "@/components/ats/CareersJobCard";
import { WorkforceJobCard } from "@/components/ats/WorkforceJobCard";
import { JobLineShiftNotice } from "@/components/ats/JobLineShiftNotice";
import { PipelineBoard } from "@/components/ats/PipelineBoard";
import { candidateHref, saveNavCtx, useCandidateList } from "@/lib/ats/candidates";
import { useAtsSettings } from "@/lib/ats/api";
import {
  deleteJob, jobKeys, updateJob, useAtsJob, useAtsJobEvents, useAtsJobSummary, useAtsMutation, useAtsStages,
  useDepartmentsLookup, useEmployeesLookup, useRequirementsLookup, useShiftsLookup,
} from "@/lib/ats/api";
import { employmentLabel, fieldLabels, fmtDate, fmtDateTime, fmtExperience, fmtPay, fmtRelative } from "@/lib/ats/format";
import { useJobRequirementLinks } from "@/lib/ats/jobRequirements";

const CLOSE_REASONS = ["Filled", "Cancelled", "On hold / budget", "Other"];
const EVENT_ICON: Record<string, typeof Activity> = {
  job_created: PlusCircle, job_updated: Pencil, job_status_changed: RefreshCw, job_published: Globe, job_unpublished: EyeOff,
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export default function AtsJobDetailPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { openJobEditor, openAddCandidate } = useAts();
  const atsSettings = useAtsSettings();
  const idleDays = atsSettings.data?.idle_alert_days ?? 7;
  const jobCands = useCandidateList({ job: jobId, status: "all", applied: "all", sort: "newest" }, 0, idleDays, !!jobId);
  const job = useAtsJob(jobId);
  const summary = useAtsJobSummary();
  const stages = useAtsStages();
  const events = useAtsJobEvents(jobId);
  const depts = useDepartmentsLookup();
  const shifts = useShiftsLookup();
  const emps = useEmployeesLookup();
  const reqs = useRequirementsLookup();
  const extraReqLinks = useJobRequirementLinks(jobId);
  const reqPipe = useRequirementPipeline();
  const qc = useQueryClient();
  const [closeOpen, setCloseOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [delOpen, setDelOpen] = useState(false);

  const setStatus = useAtsMutation(
    (v: { status: string; closed_reason?: string | null }) => updateJob({ id: jobId!, patch: v }),
    {
      invalidate: () => [...jobKeys(jobId), ["workforce_hiring_requirements"], ["workforce_staffing_matrix"]],
      success: (v) => ({ open: "Job is open", paused: "Job paused", closed: "Job closed" } as Record<string, string>)[v.status] ?? "Saved",
      onSuccess: () => { invalidatePlanning(qc); setCloseOpen(false); setReason(""); setNote(""); },
    },
  );
  const del = useAtsMutation(() => deleteJob(jobId!), {
    invalidate: () => jobKeys(jobId),
    success: "Job deleted",
    inUse: "This job has applications. Close it instead of deleting.",
    onSuccess: () => navigate("/hrms/ats/jobs"),
  });

  const j = job.data;
  const s = jobId ? summary.data?.get(jobId) : undefined;
  const stageStrip = useMemo(
    () => (stages.data ?? []).filter((st) => st.is_active).map((st) => ({ id: st.id, name: st.name, kind: st.kind, count: s?.stage_counts?.[st.code] ?? 0 })),
    [stages.data, s],
  );

  if (job.isLoading) return <RowsSkeleton rows={6} />;
  if (job.isError) return <QueryError error={job.error} onRetry={() => job.refetch()} />;
  if (!j) {
    return <EmptyState icon={Briefcase} title="Job not found" description="It may have been deleted."
      action={<Button variant="outline" asChild><Link to="/hrms/ats/jobs">Back to jobs</Link></Button>} />;
  }

  const dept = depts.data?.find((d) => d.id === j.department_id)?.label;
  const shiftLabels = (j.shift_ids ?? []).map((id) => shifts.data?.find((x) => x.id === id)?.label).filter(Boolean).join(", ");
  const manager = emps.data?.find((e) => e.id === j.hiring_manager_employee_id)?.label;
  const reqNo = j.requisition_id ? (reqs.data?.find((r: any) => r.id === j.requisition_id)?.requirement_no ?? "Linked") : null;
  const linkedReqIds = [...new Set([j.requisition_id, ...(extraReqLinks.data ?? [])].filter(Boolean))] as string[];
  const total = s?.total_applications ?? 0;
  const busy = setStatus.isPending;
  // Decided across every linked requirement, once per job: pausing stops all of the job's shifts.
  const openReqIds = linkedReqIds.filter((rid) => (reqs.data ?? []).some((r: any) => r.id === rid)); // lookup holds open requirements only
  const nothingLeft = openReqIds.length > 0 && openReqIds.every((rid) => reqPipe.data?.get(rid)?.still_needed === 0);

  const submitClose = () => {
    if (!reason) return;
    setStatus.mutate({ status: "closed", closed_reason: note.trim() ? `${reason} – ${note.trim()}` : reason });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Link to="/hrms/ats/jobs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          <ArrowLeft className="h-4 w-4" /> Jobs
        </Link>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words font-display text-2xl font-semibold leading-8 text-foreground">{j.title}</h2>
              {(() => { const t = posTitles.data?.find((p) => p.id === j.position_id)?.label; return t && t.trim().toLowerCase() !== j.title.trim().toLowerCase()
                ? <p className="text-sm text-muted-foreground">Position: {t}</p> : null; })()}
              <JobStatusBadge status={j.status} />
              {j.is_published && <StatusPill tone="primary" icon={Globe}>On careers page</StatusPill>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="t-mono">{j.job_code}</span>
              {dept && <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" aria-hidden />{dept}</span>}
              {j.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden />{j.location}</span>}
              {j.employment_type && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden />{employmentLabel(j.employment_type)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {j.status !== "closed" && <>
              <Button size="sm" variant={j.status === "draft" ? "outline" : "default"} onClick={() => openAddCandidate(j.id)} className="gap-1.5"><UserPlus className="h-4 w-4" /> Add candidate</Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/hrms/ats/import?job=${j.id}`)} className="gap-1.5"><FileUp className="h-4 w-4" /> Import</Button>
            </>}
            <Button size="sm" variant="outline" onClick={() => openJobEditor(j)} className="gap-1.5"><Pencil className="h-4 w-4" /> Edit</Button>
            <span aria-hidden className="h-6 w-px bg-border" />
            {j.status === "draft" && <Button size="sm" disabled={busy} onClick={() => setStatus.mutate({ status: "open" })} className="gap-1.5"><Play className="h-4 w-4" /> Open job</Button>}
            {j.status === "open" && <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus.mutate({ status: "paused" })} className="gap-1.5"><Pause className="h-4 w-4" /> Pause</Button>}
            {j.status === "paused" && <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus.mutate({ status: "open" })} className="gap-1.5"><Play className="h-4 w-4" /> Resume</Button>}
            {(j.status === "open" || j.status === "paused") && <Button size="sm" variant="outline" disabled={busy} onClick={() => setCloseOpen(true)} className="gap-1.5"><XCircle className="h-4 w-4" /> Close</Button>}
            {j.status === "closed" && <Button size="sm" disabled={busy} onClick={() => setStatus.mutate({ status: "open" })} className="gap-1.5"><RotateCcw className="h-4 w-4" /> Reopen</Button>}
            {summary.isSuccess && total === 0 && <>
              <span aria-hidden className="h-6 w-px bg-border" />
              <Button size="sm" variant="ghost" onClick={() => setDelOpen(true)} className="gap-1.5 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /> Delete</Button>
            </>}
          </div>
        </div>
      </div>

      <MetricStrip className="sm:grid-cols-4 xl:grid-cols-4">
        {summary.isLoading ? [0, 1, 2, 3].map((i) => <div key={i} className="bg-card px-4 py-3.5"><Skeleton className="h-3 w-20" /><Skeleton className="mt-2 h-7 w-12" /><Skeleton className="mt-1.5 h-3 w-16" /></div>) : summary.isError ? <div className="col-span-full bg-card p-4"><QueryError error={summary.error} onRetry={() => summary.refetch()} /></div> : <>
          <MetricCell label="Applicants" value={total} helper={(s?.new_7d ?? 0) > 0 ? <span className="text-primary">+{s!.new_7d} this week</span> : null} />
          <MetricCell label="In pipeline" value={(s?.active_count ?? 0) + (s?.on_hold_count ?? 0)} />
          <MetricCell label="Awaiting review" value={s?.unreviewed_count ?? 0} />
          <MetricCell label="Hired" value={<>{s?.hired_count ?? 0} <span className="text-base font-medium text-muted-foreground">of {j.openings}</span></>}
            helper={<span aria-hidden className="mt-1 block h-1.5 w-24 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-success" style={{ width: `${j.openings > 0 ? Math.min(100, ((s?.hired_count ?? 0) / j.openings) * 100) : 0}%` }} /></span>} />
        </>}
      </MetricStrip>

      <Tabs key={j.id} defaultValue={j.status === "open" ? "pipeline" : "overview"}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap sm:w-auto">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="candidates">{summary.isSuccess ? `Candidates (${total})` : "Candidates"}</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline"><PipelineBoard jobId={j.id} /></TabsContent>

        <TabsContent value="overview" className="space-y-4">
          <SectionCard title="Pipeline">
            {stageStrip.length === 0 ? <p className="text-sm text-muted-foreground">No stages configured.</p> : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {stageStrip.map((st) => (
                  <Link key={st.id} to={`/hrms/ats/candidates?job=${j.id}&stage=${st.id}`} className="relative overflow-hidden rounded-lg border border-border bg-card p-2.5 pt-3 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span aria-hidden className={`absolute inset-x-0 top-0 h-[3px] ${stageDotClass(st.kind)}`} />
                    <div className="truncate text-xs text-muted-foreground" title={st.name}>{st.name}</div>
                    <div className="font-display text-xl font-semibold tabular-nums text-foreground">{st.count}</div>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>

          <CareersJobCard job={j} />
          {linkedReqIds.map((rid) => <WorkforceJobCard key={rid} requirementId={rid} />)}
          {nothingLeft && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/5 p-2 text-xs">
              <span className="text-foreground">Nothing left to find on any linked requirement — everyone needed is hired or joining.{j.status === "open" ? " The job still shows an opening on the careers page." : ""}</span>
              {j.status === "open" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus.mutate({ status: "paused" })}><Pause className="h-3.5 w-3.5" /> Pause job</Button>
              )}
            </div>
          )}
          {linkedReqIds[0] && <JobLineShiftNotice requirementId={j.requisition_id ?? linkedReqIds[0]} jobShiftIds={(j.shift_ids ?? []) as string[]} />}

          <SectionCard title="Key facts">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label="Openings">{j.openings}</Fact>
              <Fact label="Employment type">{employmentLabel(j.employment_type)}</Fact>
              <Fact label="Shifts">{shiftLabels || "Any"}</Fact>
              <Fact label="Pay">{fmtPay(j.salary_min, j.salary_max, j.salary_period)}</Fact>
              <Fact label="Experience">{fmtExperience(j.experience_min_years, j.experience_max_years)}</Fact>
              <Fact label="Hiring manager">{manager ?? "—"}</Fact>
              <Fact label="Target date">{fmtDate(j.target_close_date)}</Fact>
<Fact label={`Hiring requirement${linkedReqIds.length > 1 ? "s" : ""}`}>{linkedReqIds.length ? linkedReqIds.map((rid, i) => (
                <span key={rid}>{i > 0 && " · "}<Link className="t-mono text-primary hover:underline" to={`/hrms/workforce-planning/hiring-requirements?req=${rid}`}>{reqs.data?.find((r: any) => r.id === rid)?.requirement_no ?? (i === 0 && reqNo === "Linked" ? "Open" : "Linked")}</Link></span>
              )) : "—"}</Fact>
              <Fact label="Created">{j.created_by_name ?? "—"}<span className="block text-xs text-muted-foreground">{fmtDateTime(j.created_at)}</span></Fact>
              <Fact label="Opened">{fmtDateTime(j.opened_at)}</Fact>
              {j.status === "closed" && <Fact label="Closed">{j.closed_reason ?? fmtDateTime(j.closed_at)}{j.closed_reason && <span className="block text-xs text-muted-foreground">{fmtDateTime(j.closed_at)}</span>}</Fact>}
            </dl>
          </SectionCard>

          {(["summary", "description", "requirements", "benefits"] as const).map((k) =>
            j[k] ? (
              <SectionCard key={k} title={k === "benefits" ? "Notes" : k[0].toUpperCase() + k.slice(1)}>
                <p className="max-w-prose whitespace-pre-wrap text-sm leading-6 text-foreground">{j[k]}</p>
              </SectionCard>
            ) : null,
          )}
        </TabsContent>

        <TabsContent value="candidates">
          <SectionCard title="Candidates" action={<Button size="sm" variant="ghost" asChild><Link to={`/hrms/ats/candidates?job=${j.id}&status=all`}>Open in Candidates</Link></Button>}>
            {jobCands.isLoading ? <RowsSkeleton rows={5} /> : jobCands.isError ? (
              <QueryError error={jobCands.error} onRetry={() => jobCands.refetch()} />
            ) : !(jobCands.data?.rows ?? []).length ? (
              <EmptyState icon={Users} title="No candidates yet" className="py-8"
                action={j.status === "closed" ? undefined : <Button size="sm" onClick={() => openAddCandidate(j.id)} className="gap-1.5"><UserPlus className="h-4 w-4" /> Add candidate</Button>} />
            ) : (
              <>
                <CandidateTable rows={jobCands.data!.rows} idleDays={idleDays} hideJob onOpen={(r) => {
                  saveNavCtx({ items: jobCands.data!.rows.map((x) => ({ candidateId: x.candidate_id!, appId: x.application_id! })), from: `/hrms/ats/jobs/${j.id}` });
                  navigate(candidateHref(r), { state: { fromList: true } });
                }} />
                {(jobCands.data!.count ?? 0) > jobCands.data!.rows.length && (
                  <p className="pt-3 text-xs text-muted-foreground">Showing the newest {jobCands.data!.rows.length} of {jobCands.data!.count}. <Link className="text-primary hover:underline" to={`/hrms/ats/candidates?job=${j.id}&status=all`}>See all</Link></p>
                )}
              </>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="activity">
          <SectionCard title="Activity">
            {events.isLoading ? <RowsSkeleton rows={5} /> : events.isError ? (
              <QueryError error={events.error} onRetry={() => events.refetch()} />
            ) : (events.data ?? []).length === 0 ? (
              <EmptyState icon={Activity} title="No activity yet" description="Changes to this job will be listed here." className="py-8" />
            ) : (
              <ul className="divide-y divide-border">
                {events.data!.map((ev) => {
                  const Icon = EVENT_ICON[ev.event_type] ?? Activity;
                  const fields = ev.event_type === "job_updated" ? fieldLabels((ev.data as any)?.fields) : "";
                  return (
                    <li key={ev.id} className="flex items-start gap-3 py-2.5">
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground break-words">{fields ? `Updated: ${fields}` : ev.summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {ev.actor_name ?? "System"} ·{" "}
                          <Tooltip>
                            <TooltipTrigger asChild><span className="cursor-default underline decoration-dotted underline-offset-2">{fmtRelative(ev.created_at)}</span></TooltipTrigger>
                            <TooltipContent>{fmtDateTime(ev.created_at)}</TooltipContent>
                          </Tooltip>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <ResponsiveDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close job"
        description="Closed jobs stop accepting applicants. You can reopen later."
        footer={<>
          <Button variant="ghost" onClick={() => setCloseOpen(false)}>Cancel</Button>
          <Button type="submit" form="ats-close-form" disabled={!reason || busy}>Close job</Button>
        </>}
      >
        <form id="ats-close-form" onSubmit={(e) => { e.preventDefault(); submitClose(); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <RadioGroup value={reason} onValueChange={setReason} className="grid grid-cols-2 gap-2">
              {CLOSE_REASONS.map((r) => (
                <Label key={r} htmlFor={`cr-${r}`} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 font-normal">
                  <RadioGroupItem id={`cr-${r}`} value={r} /> {r}
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ats-close-note">Note (optional)</Label>
            <Textarea id="ats-close-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="text-foreground"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitClose(); } }} />
          </div>
        </form>
      </ResponsiveDialog>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>“{j.title}” and its activity history will be removed. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => del.mutate(undefined as never)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
