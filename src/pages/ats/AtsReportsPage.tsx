import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/hrms/primitives/StatCard";
import { StatGridSkeleton } from "@/components/shared/skeletons";
import { BarList, QueryError, RowsSkeleton, SectionCard } from "@/components/ats/AtsBits";
import { useAtsJobs, useAtsSources } from "@/lib/ats/api";
import { atsErrorMessage } from "@/lib/ats/errors";
import {
  MAX_RANGE_DAYS, RANGE_PRESETS, bucketLabel, daysBetween, downloadReportXlsx, fmtDays, fmtHours, funnelRows, isYmd,
  matchPreset, paramsFromSearch, pct, presetRange, type AtsReport, type RangePreset, type ReportParams, useAtsReport,
} from "@/lib/ats/reports";

const STATUS_ORDER: Record<string, number> = { open: 0, paused: 1, draft: 2, closed: 3 };
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pctNum = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            {head.map((h, i) => <th key={h} className={`px-2 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
const Td = ({ children, first, className = "" }: { children: React.ReactNode; first?: boolean; className?: string }) => (
  <td className={`px-2 py-2 ${first ? "text-left text-foreground" : "text-right tabular-nums"} ${className}`}>{children}</td>
);

export default function AtsReportsPage() {
  const [sp, setSp] = useSearchParams();
  const params = paramsFromSearch(sp);
  const { data, isLoading, error, refetch } = useAtsReport(params);
  const jobsQ = useAtsJobs();
  const sourcesQ = useAtsSources();
  const [custom, setCustom] = useState(() => matchPreset(params.from, params.to) === "custom");
  const [draft, setDraft] = useState({ from: params.from, to: params.to });
  const [draftBad, setDraftBad] = useState(false);

  const write = (p: ReportParams) => {
    const n = new URLSearchParams();
    if (p.from) n.set("from", p.from);
    if (p.to) n.set("to", p.to);
    if (p.job) n.set("job", p.job);
    if (p.source) n.set("source", p.source);
    setSp(n, { replace: true });
  };

  const jobs = useMemo(() => [...(jobsQ.data ?? [])].sort((a, b) =>
    (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.title.localeCompare(b.title)), [jobsQ.data]);
  const sources = sourcesQ.data ?? [];

  const onPreset = (v: string) => {
    if (v === "custom") { setCustom(true); setDraft({ from: params.from, to: params.to }); setDraftBad(false); return; }
    setCustom(false); setDraftBad(false);
    write({ ...params, ...presetRange(v as RangePreset) });
  };
  const onDraft = (k: "from" | "to", v: string) => {
    const d = { ...draft, [k]: v };
    setDraft(d);
    const ok = isYmd(d.from) && isYmd(d.to) && d.to >= d.from && daysBetween(d.from, d.to) <= MAX_RANGE_DAYS;
    setDraftBad(!ok);
    if (ok) write({ ...params, from: d.from, to: d.to });
  };

  const jobName = params.job === "general" ? "General applications" : params.job ? (jobsQ.data?.find((j) => j.id === params.job)?.title ?? "") : "";
  const sourceName = params.source ? (sources.find((s) => s.id === params.source)?.name ?? "") : "";
  const onDownload = async () => {
    if (!data) return;
    try { await downloadReportXlsx(data, { job: jobName, source: sourceName }); }
    catch (e) { toast.error(atsErrorMessage(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <Select value={custom ? "custom" : matchPreset(params.from, params.to)} onValueChange={onPreset}>
            <SelectTrigger className="w-[170px]" aria-label="Period"><SelectValue /></SelectTrigger>
            <SelectContent>{RANGE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          {custom && (
            <>
              <label className="text-xs text-muted-foreground">From
                <Input type="date" className="mt-1 w-[150px] text-foreground" value={draft.from} onChange={(e) => onDraft("from", e.target.value)} />
              </label>
              <label className="text-xs text-muted-foreground">To
                <Input type="date" className="mt-1 w-[150px] text-foreground" value={draft.to} onChange={(e) => onDraft("to", e.target.value)} />
              </label>
            </>
          )}
          <Select value={params.job || "all"} onValueChange={(v) => write({ ...params, job: v === "all" ? "" : v })}>
            <SelectTrigger className="w-[220px]" aria-label="Job"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jobs</SelectItem>
              {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.status === "open" ? j.title : `${j.title} · ${cap(j.status)}`}</SelectItem>)}
              <SelectItem value="general">General applications</SelectItem>
            </SelectContent>
          </Select>
          <Select value={params.source || "all"} onValueChange={(v) => write({ ...params, source: v === "all" ? "" : v })}>
            <SelectTrigger className="w-[180px]" aria-label="Source"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-1.5" disabled={isLoading || !!error || !data} onClick={onDownload}>
            <Download className="h-4 w-4" /> Download Excel
          </Button>
        </div>
        {custom && draftBad && <p className="text-xs text-destructive">The end date must be on or after the start date, within 2 years.</p>}
        <p className="text-xs text-muted-foreground">Applications are counted by the date they applied (IST). Hires, interviews and team activity are counted by the date they happened. Waiting now is the pipeline today.</p>
      </div>

      {error ? <QueryError error={error} onRetry={() => refetch()} /> : <Body data={data} loading={isLoading} params={params} />}
    </div>
  );
}


function Body({ data, loading, params }: { data?: AtsReport; loading: boolean; params: ReportParams }) {
  const s = data?.summary;
  const sk = <RowsSkeleton rows={4} />;
  return (
    <div className="space-y-4">
      {loading || !s ? <StatGridSkeleton count={8} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Applications" value={s.applications} helper="applied in the period" />
          <StatCard label="Reviewed" value={s.reviewed} helper={`${pct(s.reviewed, s.applications)} of applications`} />
          <StatCard label="Reached interview" value={s.reached_interview} helper={`${pct(s.reached_interview, s.applications)} of applications`} />
          <StatCard label="Hired" value={s.hired} tone="emerald" helper={`${pct(s.hired, s.applications)} hire rate`} />
          <StatCard label="Time to hire" value={fmtDays(s.median_days_to_hire)} helper="median, from applying to hired" />
          <StatCard label="Time to first review" value={fmtHours(s.median_hours_to_review)} helper="median, from arriving in the ATS" />
          <StatCard label="Hires in the period" value={s.hires_in_period} helper="whenever they applied" />
          <StatCard label="Still open" value={s.open} helper={`${s.rejected} rejected · ${s.withdrawn} withdrawn`} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Funnel">
          {!data ? sk : data.summary.applications === 0 ? <Empty text="No applications in this period." /> : (
            <ul className="space-y-3">
              {funnelRows(data).map((f, i, all) => (
                <li key={f.stage_id} className="space-y-1">
                  <div className="grid grid-cols-[minmax(0,8rem)_1fr_2.5rem] items-center gap-3 text-sm">
                    <span className="truncate text-foreground" title={f.name}>{f.name}</span>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(f.ofTotal ?? 0) * 100}%` }} />
                    </div>
                    <span className="text-right font-medium tabular-nums">{f.reached}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {pctNum(f.ofTotal)} of applications{i > 0 ? ` · ${pctNum(f.ofPrevious)} from ${all[i - 1].name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Applications and hires">
          {!data ? sk : (
            <>
              <p className="-mt-2 mb-2 text-xs text-muted-foreground">{data.range.bucket === "week" ? "Per week (weeks start on Monday)" : "Per month"}</p>
              {data.trend.every((t) => t.applications === 0 && t.hires === 0) ? <Empty text="No applications or hires in this period." /> : (
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={data.trend.map((t) => ({ ...t, label: bucketLabel(t.bucket, data.range.bucket) }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                      <Tooltip
                        labelFormatter={(l) => (data.range.bucket === "week" ? `Week of ${l}` : String(l))}
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="applications" name="Applications" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="hires" name="Hires" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Sources">
        {!data ? sk : !data.sources.length ? <Empty text="No applications in this period." /> : (
          <Table head={["Source", "Applications", "Reviewed", "Reached interview", "Hired", "Hire rate", "Rejected"]}>
            {data.sources.map((x) => (
              <tr key={x.source_id ?? "none"} className="border-b border-border last:border-0">
                <Td first>{x.name}</Td><Td>{x.applications}</Td><Td>{x.reviewed}</Td><Td>{x.reached_interview}</Td>
                <Td>{x.hired}</Td><Td>{pct(x.hired, x.applications)}</Td><Td>{x.rejected}</Td>
              </tr>
            ))}
          </Table>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Jobs">
          {!data ? sk : !data.jobs.length ? <Empty text="No applications in this period." /> : (
            <Table head={["Job", "Applications", "Reached interview", "Hired", "Time to hire"]}>
              {data.jobs.map((x) => (
                <tr key={x.job_id ?? "general"} className="border-b border-border last:border-0">
                  <Td first>{x.job_id && x.title !== "Job removed" ? <Link className="text-primary hover:underline" to={`/hrms/ats/jobs/${x.job_id}`}>{x.title}</Link> : x.title}</Td>
                  <Td>{x.applications}</Td><Td>{x.reached_interview}</Td><Td>{x.hired}</Td><Td>{fmtDays(x.median_days_to_hire)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </SectionCard>

        <SectionCard title="Why candidates left">
          {!data ? sk : (
            <BarList
              rows={data.reasons.map((r) => ({ key: `${r.reason_id ?? "none"}:${r.status}`, label: r.label + (r.status === "withdrawn" ? " (withdrew)" : ""), count: r.count }))}
              emptyText="Nobody was rejected or withdrew in this period."
            />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Interviews">
          {!data ? sk : (() => {
            const iv = data.interviews;
            const act = (n: number) => (n > 0 ? <Link className="text-warning hover:underline" to="/hrms/ats/interviews?view=action">{n}</Link> : n);
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatCard label="Interviews" value={iv.total} />
                  <StatCard label="Completed" value={iv.completed} />
                  <StatCard label="Did not attend" value={iv.no_show} helper={`${pct(iv.no_show, iv.completed + iv.no_show)} no-show rate`} />
                  <StatCard label="Cancelled" value={iv.cancelled} />
                  <StatCard label="Upcoming" value={iv.upcoming} />
                  <StatCard label="Waiting for an update" value={act(iv.awaiting_update)} helper={<>Feedback missing: {act(iv.feedback_missing)}</>} />
                </div>
                <p className="text-xs text-muted-foreground">In person {iv.by_mode.in_person} · Video {iv.by_mode.video} · Phone {iv.by_mode.phone}</p>
              </div>
            );
          })()}
        </SectionCard>

        <SectionCard title="Waiting now">
          {!data ? sk : !data.waiting.length ? <Empty text="No open applications." /> : (
            <Table head={["Stage", "Open", "On hold", "Median days in stage", `Waiting over ${data.idle_days} days`]}>
              {data.waiting.map((x) => {
                const q = new URLSearchParams({ stage: x.stage_id, idle: "1" });
                if (params.job) q.set("job", params.job);
                if (params.source) q.set("source", params.source);
                return (
                  <tr key={x.stage_id} className="border-b border-border last:border-0">
                    <Td first>{x.name}</Td><Td>{x.open}</Td><Td>{x.on_hold}</Td><Td>{x.median_days ?? "—"}</Td>
                    <Td>{x.over_idle > 0 ? <Link className="font-medium text-warning hover:underline" to={`/hrms/ats/candidates?${q}`}>{x.over_idle}</Link> : x.over_idle}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Team activity">
        {!data ? sk : !data.team.length ? <Empty text="No activity in this period." /> : (
          <Table head={["Person", "Moved", "Rejected", "Hired", "Notes", "Emails sent", "Interviews scheduled"]}>
            {data.team.map((x) => (
              <tr key={x.user_id} className="border-b border-border last:border-0">
                <Td first>{x.name ?? "Unknown"}</Td><Td>{x.moved}</Td><Td>{x.rejected}</Td><Td>{x.hired}</Td>
                <Td>{x.notes}</Td><Td>{x.emails_sent}</Td><Td>{x.interviews_scheduled}</Td>
              </tr>
            ))}
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
