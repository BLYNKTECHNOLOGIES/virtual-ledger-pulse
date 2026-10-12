import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Globe, Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { CountPill, HiringProgress, StatusPill } from "@/components/ats/AtsUi";
import { JobStatusBadge, QueryError, RowsSkeleton } from "@/components/ats/AtsBits";
import { useAts } from "@/components/ats/AtsContext";
import { useAtsJobSummary, useAtsJobs, useDepartmentsLookup } from "@/lib/ats/api";
import { fmtDateTime, fmtRelative } from "@/lib/ats/format";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "draft", label: "Draft" },
  { key: "paused", label: "Paused" },
  { key: "closed", label: "Closed" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];
const ALL = "__all";

export default function AtsJobsPage() {
  const navigate = useNavigate();
  const { openJobEditor } = useAts();
  const jobs = useAtsJobs();
  const summary = useAtsJobSummary();
  const depts = useDepartmentsLookup();
  const [filter, setFilter] = useState<FilterKey | null>(null);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState(ALL);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, open: 0, draft: 0, paused: 0, closed: 0 };
    for (const j of jobs.data ?? []) { c.all++; c[j.status] = (c[j.status] ?? 0) + 1; }
    return c;
  }, [jobs.data]);

  useEffect(() => {
    if (filter === null && jobs.isSuccess) setFilter(counts.open > 0 ? "open" : "all");
  }, [filter, jobs.isSuccess, counts.open]);

  const deptName = (id?: string | null) => depts.data?.find((d) => d.id === id)?.label ?? "—";

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (jobs.data ?? []).filter((j) =>
      (filter === null || filter === "all" || j.status === filter) &&
      (dept === ALL || j.department_id === dept) &&
      (!term || j.title.toLowerCase().includes(term) || j.job_code.toLowerCase().includes(term)),
    );
  }, [jobs.data, filter, dept, q]);

  if (jobs.isLoading) return <RowsSkeleton rows={6} />;
  if (jobs.isError) return <QueryError error={jobs.error} onRetry={() => jobs.refetch()} />;
  if ((jobs.data ?? []).length === 0) {
    return (
      <EmptyState icon={Briefcase} title="No jobs yet" description="Create a job to start collecting and tracking applicants."
        action={<Button onClick={() => openJobEditor(null)} className="gap-1.5"><Plus className="h-4 w-4" /> New job</Button>}
        className="rounded-xl border border-dashed border-border" />
    );
  }

  const CareersPill = () => <StatusPill tone="primary" icon={Globe}>On careers page</StatusPill>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={on}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary/40 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
              )}>
              {f.label} <CountPill n={counts[f.key] ?? 0} className={on ? "bg-card" : undefined} />
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or job code" className="pl-8 text-foreground" />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="text-foreground sm:w-56"><SelectValue placeholder="All departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {(depts.data ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <p className="text-sm tabular-nums text-muted-foreground">{rows.length} job{rows.length === 1 ? "" : "s"}</p>

      {rows.length === 0 ? (
        <EmptyState icon={Search} title="No matching jobs" description="Try another status, department or search term." className="rounded-xl border border-dashed border-border" />
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {rows.map((j) => {
              const s = summary.data?.get(j.id);
              return (
                <li key={j.id}>
                  <button type="button" onClick={() => navigate(`/hrms/ats/jobs/${j.id}`)}
                    className="w-full rounded-xl border border-border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="min-w-0">
                      <div className="break-words font-medium text-foreground">{j.title}</div>
                      <div className="t-mono text-xs text-muted-foreground">{j.job_code} · {deptName(j.department_id)}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5"><JobStatusBadge status={j.status} />{j.is_published && <CareersPill />}</div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div><div className="text-xs text-muted-foreground">Applicants</div><div className="text-sm font-semibold tabular-nums text-foreground">{s?.total_applications ?? 0}{(s?.new_7d ?? 0) > 0 && <span className="ml-1 text-xs font-normal text-primary">+{s!.new_7d}</span>}</div></div>
                      <div><div className="text-xs text-muted-foreground">In pipeline</div><div className="text-sm font-semibold tabular-nums text-foreground">{(s?.active_count ?? 0) + (s?.on_hold_count ?? 0)}</div></div>
                      <div><div className="text-xs text-muted-foreground">Hired</div><HiringProgress hired={s?.hired_count ?? 0} openings={j.openings} className="[&>div:last-child]:w-full" /></div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hidden rounded-xl border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead className="hidden lg:table-cell">Department</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Openings</TableHead>
                  <TableHead className="text-right">Applicants</TableHead>
                  <TableHead className="text-right">In pipeline</TableHead>
                  <TableHead>Hiring progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden xl:table-cell">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((j) => {
                  const s = summary.data?.get(j.id);
                  return (
                    <TableRow key={j.id} className="cursor-pointer hover:bg-muted/40" tabIndex={0}
                      onClick={() => navigate(`/hrms/ats/jobs/${j.id}`)}
                      onKeyDown={(e) => e.key === "Enter" && navigate(`/hrms/ats/jobs/${j.id}`)}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-foreground">{j.title}</span>{j.is_published && <CareersPill />}</div>
                        <div className="t-mono whitespace-nowrap text-xs text-muted-foreground">{j.job_code}</div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{deptName(j.department_id)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">{j.openings}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {s?.total_applications ?? 0}
                        {(s?.new_7d ?? 0) > 0 && <div className="text-xs text-primary">+{s!.new_7d} this week</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{(s?.active_count ?? 0) + (s?.on_hold_count ?? 0)}</TableCell>
                      <TableCell><HiringProgress hired={s?.hired_count ?? 0} openings={j.openings} /></TableCell>
                      <TableCell className="whitespace-nowrap"><JobStatusBadge status={j.status} /></TableCell>
                      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground xl:table-cell" title={fmtDateTime(j.updated_at)}>{fmtRelative(j.updated_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
