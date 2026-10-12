import { useMailStatus } from "@/lib/ats/mail";
import { useInterviewCounts } from "@/lib/ats/interviews";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
 import { Briefcase, Inbox, Eye, Hourglass, UserCheck, UserX, Plus, Mail, CalendarClock, ClipboardCheck, CheckCircle2, Users, UserPlus, AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarList, QueryError, RowsSkeleton, SectionCard } from "@/components/ats/AtsBits";
import { CandidateAvatar, MetricCell, MetricStrip } from "@/components/ats/AtsUi";
import { AppStatusBadge } from "@/components/ats/CandidateBits";
import { useAts } from "@/components/ats/AtsContext";
import { useAtsJobSummary, useAtsJobs, useAtsOverview, useAtsSources } from "@/lib/ats/api";
import { useRecentApplications, candidateHref } from "@/lib/ats/candidates";
import { fmtDate, fmtRelative, todayIST } from "@/lib/ats/format";
import { cn } from "@/lib/utils";

export default function AtsOverviewPage() {
  const navigate = useNavigate();
  const { openJobEditor } = useAts();
  const ov = useAtsOverview();
  const sourcesQ = useAtsSources();
  const careersSourceId = (sourcesQ.data ?? []).find((s) => s.code === "careers")?.id;
  const jobs = useAtsJobs();
  const summary = useAtsJobSummary();
  const recent = useRecentApplications();
  const today = todayIST();
  const integ = useQuery({
    queryKey: ["ats", "integration-status"],
    queryFn: async () => { const { data, error } = await supabase.rpc("ats_integration_status"); if (error) throw error; return data as any; },
  });
  const mailSt = useMailStatus();
  const ivCounts = useInterviewCounts();
  const unsorted = Number(integ.data?.unmatched_active ?? 0);

  const openJobs = useMemo(() => (jobs.data ?? []).filter((j) => j.status === "open"), [jobs.data]);

  const o = ov.data;
  const attention = [
    { count: ov.isError ? 0 : Number(o?.unreviewed ?? 0), icon: Eye, text: (n: number) => `application${n === 1 ? "" : "s"} waiting for a first look`, button: "Review now", to: "/hrms/ats/candidates?unreviewed=1" },
    { count: integ.isError ? 0 : unsorted, icon: Inbox, text: (n: number) => `careers-page application${n === 1 ? "" : "s"} not matched to a job`, button: "Sort them", to: `/hrms/ats/candidates?job=general${careersSourceId ? `&source=${careersSourceId}` : ""}` },
    { count: ivCounts.isError ? 0 : Number(ivCounts.data?.today ?? 0), icon: CalendarClock, text: (n: number) => `interview${n === 1 ? "" : "s"} today`, button: "View", to: "/hrms/ats/interviews?view=today" },
    { count: ivCounts.isError ? 0 : Number(ivCounts.data?.action ?? 0), icon: ClipboardCheck, text: (n: number) => `interview${n === 1 ? " needs" : "s need"} an update or feedback`, button: "Review", to: "/hrms/ats/interviews?view=action" },
    { count: mailSt.isError || !mailSt.data?.enabled ? 0 : Number(mailSt.data.unread ?? 0), icon: Mail, text: (n: number) => `unread candidate ${n === 1 ? "reply" : "replies"}`, button: "Open inbox", to: "/hrms/ats/inbox" },
    { count: ov.isError ? 0 : Number(o?.idle ?? 0), icon: Hourglass, text: (n: number) => `candidate${n === 1 ? "" : "s"} with no movement for ${o?.idle_days}+ days`, button: "Show them", to: "/hrms/ats/candidates?idle=1", warning: true },
  ].filter((row) => row.count > 0);
  const attentionLoading = ov.isLoading || integ.isLoading || ivCounts.isLoading || mailSt.isLoading || sourcesQ.isLoading;
  const attentionFailed = ov.isError || integ.isError || ivCounts.isError || mailSt.isError || sourcesQ.isError;
  const failedChecks = [
    { query: ov, what: "applications waiting for review" },
    { query: integ, what: "careers-page applications" },
    { query: ivCounts, what: "interviews" },
    { query: mailSt, what: "candidate replies" },
  ].filter(({ query }) => query.isError);
  const attentionLoaded = ov.isSuccess && integ.isSuccess && ivCounts.isSuccess && mailSt.isSuccess && sourcesQ.isSuccess;
  const stages = [...(o?.stage_counts ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const middleBars = ["bg-primary/40", "bg-primary/55 bg-primary/[0.55]", "bg-primary/70", "bg-primary/85 bg-primary/[0.85]", "bg-primary"];

  return (
    <div className="space-y-5">
      {jobs.isSuccess && jobs.data.length === 0 && <SectionCard title={<span className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" aria-hidden />Create your first job</span>}>
        <p className="mb-3 text-sm text-muted-foreground">Applicants are filed under jobs. Applications without a job still appear below.</p>
        <Button onClick={() => openJobEditor(null)} className="gap-1.5"><Plus className="h-4 w-4" aria-hidden /> New job</Button>
      </SectionCard>}
      <SectionCard title="Needs attention">
        <div className="divide-y divide-border" role="status" aria-live="polite">
          {attention.map((row) => <div key={row.button} className="flex !flex-nowrap items-center gap-3 py-2.5">
            <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", row.warning ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary")}><row.icon className="h-4 w-4" aria-hidden /></span>
            <p className="min-w-0 flex-1 text-sm text-foreground"><span className="font-semibold tabular-nums">{row.count}</span> {row.text(row.count)}</p>
            <Button variant="outline" size="sm" asChild className="shrink-0"><Link to={row.to}>{row.button}</Link></Button>
          </div>)}
          {failedChecks.map(({ query, what }) => <div key={what} className="flex !flex-nowrap items-center gap-3 py-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning"><AlertTriangle className="h-4 w-4" aria-hidden /></span>
            <p className="min-w-0 flex-1 text-sm text-foreground">Couldn't check {what}.</p>
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => query.refetch()}>Try again</Button>
          </div>)}
          {attentionLoading && <div className="space-y-2 py-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>}
          {attentionLoaded && !attentionLoading && !attentionFailed && !attention.length && <div className="flex !flex-nowrap items-center gap-3 py-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success"><CheckCircle2 className="h-4 w-4" aria-hidden /></span>
            <p className="text-sm text-foreground">Nothing needs your attention right now.</p>
          </div>}
        </div>
      </SectionCard>
      <MetricStrip>
        {ov.isLoading ? Array.from({ length: 6 }, (_, i) => <MetricCell key={i}><Skeleton className="h-3 w-20" /><Skeleton className="mt-2 h-8 w-12" /><div className="mt-0.5 h-4" /></MetricCell>) : ov.isError ? <div className="col-span-full bg-card p-4"><QueryError error={ov.error} onRetry={() => ov.refetch()} /></div> : o ? <>
          <MetricCell label="Open jobs" value={o.open_jobs} helper={`${o.open_seats} seat${Number(o.open_seats) === 1 ? "" : "s"}`} icon={Briefcase} />
          <MetricCell label="Applied in the last 7 days" value={o.applications_7d} helper={`${o.applications_30d} in the last 30 days`} icon={Inbox} />
          <MetricCell label="Awaiting review" value={o.unreviewed} helper="Not opened yet" icon={Eye} onClick={() => navigate("/hrms/ats/candidates?unreviewed=1")} />
          <MetricCell label="Idle" value={o.idle} helper={`No movement in ${o.idle_days}+ days`} icon={Hourglass} onClick={() => navigate("/hrms/ats/candidates?idle=1")} />
          <MetricCell label="Hired this month" value={o.hired_this_month} icon={UserCheck} valueClassName={Number(o.hired_this_month) > 0 ? "text-success" : undefined} />
          <MetricCell label="Rejected this month" value={o.rejected_this_month} icon={UserX} />
        </> : null}
      </MetricStrip>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Pipeline by stage" description="Active and on-hold applications. Click a stage to see them.">
          {ov.isLoading ? <RowsSkeleton rows={6} /> : ov.isError ? <QueryError error={ov.error} onRetry={() => ov.refetch()} /> : <BarList
            emptyText="No one is in the pipeline yet."
            rows={stages.map((s, i) => ({ key: s.stage_id, label: s.name, count: s.count, barClassName: i === 0 ? "bg-muted-foreground/50" : i === stages.length - 1 ? "bg-success" : middleBars[Math.round(((i - 1) / Math.max(1, stages.length - 3)) * (middleBars.length - 1))] }))}
            onRowClick={(key) => navigate(`/hrms/ats/candidates?stage=${key}`)} />}
        </SectionCard>
        <SectionCard title="Where applicants came from" description="Last 30 days">
          {ov.isLoading ? <RowsSkeleton rows={6} /> : ov.isError ? <QueryError error={ov.error} onRetry={() => ov.refetch()} /> : <BarList
            emptyText="No applications in the last 30 days."
            rows={(o?.source_counts_30d ?? []).map((s, i) => ({ key: s.source_id ?? `unknown-${i}`, label: s.name, count: s.count, barClassName: "bg-primary/70" }))} />}
        </SectionCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Recent applications">
          {recent.isLoading ? <RowsSkeleton rows={4} /> : recent.isError ? <QueryError error={recent.error} onRetry={() => recent.refetch()} /> : !(recent.data ?? []).length ? <p className="py-6 text-center text-sm text-muted-foreground">No applications yet.</p> : <ul className="divide-y divide-border">
            {(recent.data ?? []).map((r) => <li key={r.application_id}>
              <Button variant="ghost" onClick={() => navigate(candidateHref(r))} className="-mx-2 flex h-auto w-[calc(100%+1rem)] items-center gap-3 whitespace-normal rounded-lg px-2 py-2.5 text-left font-normal hover:bg-muted/50">
                <CandidateAvatar full_name={r.full_name} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5"><span className="min-w-0 truncate text-sm font-medium text-foreground">{r.full_name}</span>{r.status !== "active" && <AppStatusBadge status={r.status} />}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.job_title ?? "General application"}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums" title={fmtDate(r.applied_at)}>{fmtRelative(r.applied_at)}</span>
              </Button>
            </li>)}
          </ul>}
        </SectionCard>
        <SectionCard title="Open jobs">
          {jobs.isLoading || summary.isLoading ? <RowsSkeleton rows={4} /> : jobs.isError ? <QueryError error={jobs.error} onRetry={() => jobs.refetch()} /> : openJobs.length === 0 ? <EmptyState icon={Briefcase} title="No open jobs" description="Open a draft job to start receiving applicants." className="py-8" action={<Button onClick={() => openJobEditor(null)} size="sm" className="gap-1.5"><Plus className="h-4 w-4" aria-hidden /> New job</Button>} /> : <ul className="divide-y divide-border">
            {openJobs.map((j) => {
              const s = summary.data?.get(j.id);
              const overdue = !!j.target_close_date && j.target_close_date < today;
              return <li key={j.id}><Button variant="ghost" onClick={() => navigate(`/hrms/ats/jobs/${j.id}`)} className="-mx-2 block h-auto w-[calc(100%+1rem)] whitespace-normal rounded-lg px-2 py-3 text-left font-normal hover:bg-muted/50 [&_svg]:size-3.5">
                <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1"><span className="min-w-0 text-sm font-semibold text-foreground">{j.title}</span>{j.target_close_date && <span className={cn("text-xs tabular-nums", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>Target {fmtDate(j.target_close_date)}{overdue && " · overdue"}</span>}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
                  <span className="t-mono">{j.job_code}</span>
                  <span className="inline-flex items-center gap-1"><Users aria-hidden />{(s?.active_count ?? 0) + (s?.on_hold_count ?? 0)} in pipeline</span>
                  <span className="inline-flex items-center gap-1"><Eye aria-hidden />{s?.unreviewed_count ?? 0} awaiting review</span>
                  <span className="inline-flex items-center gap-1"><UserPlus aria-hidden />{s?.new_7d ?? 0} new this week</span>
                </span>
                {s && typeof s.hired_count === "number" && <span className="mt-2 block"><span className="text-xs text-muted-foreground tabular-nums">Hired {s.hired_count} of {j.openings}</span><span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-success" style={{ width: `${Math.min(100, j.openings > 0 ? (s.hired_count / j.openings) * 100 : 0)}%` }} /></span></span>}
              </Button></li>;
            })}
          </ul>}
        </SectionCard>
      </div>
    </div>
  );
}
