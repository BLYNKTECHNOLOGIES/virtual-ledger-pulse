import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Briefcase, Inbox, Eye, Hourglass, UserCheck, UserX, Plus } from "lucide-react";
import { StatCard } from "@/components/hrms/primitives/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatGridSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarList, QueryError, RowsSkeleton, SectionCard } from "@/components/ats/AtsBits";
import { useAts } from "@/components/ats/AtsContext";
import { useAtsJobSummary, useAtsJobs, useAtsOverview } from "@/lib/ats/api";
import { useRecentApplications, candidateHref } from "@/lib/ats/candidates";
import { fmtDate, todayIST } from "@/lib/ats/format";
import { cn } from "@/lib/utils";

export default function AtsOverviewPage() {
  const navigate = useNavigate();
  const { openJobEditor } = useAts();
  const ov = useAtsOverview();
  const jobs = useAtsJobs();
  const summary = useAtsJobSummary();
  const recent = useRecentApplications();
  const today = todayIST();
  const integ = useQuery({
    queryKey: ["ats", "integration-status"],
    queryFn: async () => { const { data, error } = await supabase.rpc("ats_integration_status"); if (error) throw error; return data as any; },
  });
  const unsorted = Number(integ.data?.unmatched_active ?? 0);

  const openJobs = useMemo(() => (jobs.data ?? []).filter((j) => j.status === "open"), [jobs.data]);

  if (jobs.isSuccess && jobs.data.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No jobs yet"
        description="Create a job to start collecting and tracking applicants."
        action={<Button onClick={() => openJobEditor(null)} className="gap-1.5"><Plus className="h-4 w-4" /> New job</Button>}
        className="rounded-xl border border-dashed border-border"
      />
    );
  }

  const o = ov.data;
  return (
    <div className="space-y-5">
      {unsorted > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground" role="status">
          <Info className="h-4 w-4 text-primary" aria-hidden />
          {unsorted} careers-page application{unsorted === 1 ? " has" : "s have"} no matching job.
          <Link to="/hrms/ats/candidates?job=general" className="font-medium text-primary hover:underline">Sort them</Link>
        </div>
      )}
      {ov.isLoading ? (
        <StatGridSkeleton count={6} className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6" />
      ) : ov.isError ? (
        <QueryError error={ov.error} onRetry={() => ov.refetch()} />
      ) : o ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Open jobs" value={o.open_jobs} helper={`${o.open_seats} seats`} icon={Briefcase} tone="primary" />
          <StatCard label="New applications" value={o.applications_7d} helper={`${o.applications_30d} in 30 days`} icon={Inbox} />
          <button type="button" className="text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => navigate("/hrms/ats/candidates?unreviewed=1")}><StatCard label="Awaiting review" value={o.unreviewed} icon={Eye} /></button>
          <button type="button" className="text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => navigate("/hrms/ats/candidates?idle=1")}><StatCard label="Idle" value={o.idle} helper={`no movement in ${o.idle_days}+ days`} icon={Hourglass} /></button>
          <StatCard label="Hired this month" value={o.hired_this_month} icon={UserCheck} />
          <StatCard label="Rejected this month" value={o.rejected_this_month} icon={UserX} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Pipeline by stage">
          {ov.isLoading ? <RowsSkeleton rows={6} /> : (
            <BarList
              emptyText="No one is in the pipeline yet."
              rows={[...(o?.stage_counts ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((s) => ({ key: s.stage_id, label: s.name, count: s.count }))}
              onRowClick={(key) => navigate(`/hrms/ats/candidates?stage=${key}`)}
            />
          )}
        </SectionCard>
        <SectionCard title="Where applicants come from (30 days)">
          {ov.isLoading ? <RowsSkeleton rows={6} /> : (
            <BarList
              emptyText="No applications in the last 30 days."
              rows={(o?.source_counts_30d ?? []).map((s, i) => ({ key: s.source_id ?? `unknown-${i}`, label: s.name, count: s.count }))}
            />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Recent applications">
        {recent.isLoading ? <RowsSkeleton rows={4} /> : recent.isError ? (
          <QueryError error={recent.error} onRetry={() => recent.refetch()} />
        ) : !(recent.data ?? []).length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No applications yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.data!.map((r) => (
              <li key={r.application_id}>
                <button type="button" onClick={() => navigate(candidateHref(r))}
                  className="flex w-full items-center justify-between gap-3 rounded px-1 py-2 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0"><span className="block truncate font-medium text-foreground">{r.full_name}</span><span className="block truncate text-xs text-muted-foreground">{r.job_title ?? "General"}</span></span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(r.applied_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Open jobs">
        {jobs.isLoading || summary.isLoading ? <RowsSkeleton rows={4} /> : jobs.isError ? (
          <QueryError error={jobs.error} onRetry={() => jobs.refetch()} />
        ) : openJobs.length === 0 ? (
          <EmptyState icon={Briefcase} title="No open jobs" description="Open a draft job to start receiving applicants." className="py-8" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead className="text-right">Openings</TableHead>
                  <TableHead className="text-right">In pipeline</TableHead>
                  <TableHead className="text-right">Awaiting review</TableHead>
                  <TableHead className="text-right">New this week</TableHead>
                  <TableHead>Target date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openJobs.map((j) => {
                  const s = summary.data?.get(j.id);
                  const overdue = !!j.target_close_date && j.target_close_date < today;
                  return (
                    <TableRow key={j.id} className="cursor-pointer" tabIndex={0}
                      onClick={() => navigate(`/hrms/ats/jobs/${j.id}`)}
                      onKeyDown={(e) => e.key === "Enter" && navigate(`/hrms/ats/jobs/${j.id}`)}>
                      <TableCell>
                        <div className="font-medium text-foreground">{j.title}</div>
                        <div className="t-mono text-xs text-muted-foreground">{j.job_code}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{j.openings}</TableCell>
                      <TableCell className="text-right tabular-nums">{(s?.active_count ?? 0) + (s?.on_hold_count ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{s?.unreviewed_count ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">{s?.new_7d ?? 0}</TableCell>
                      <TableCell className={cn("whitespace-nowrap", overdue && "text-destructive font-medium")}>{fmtDate(j.target_close_date)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
