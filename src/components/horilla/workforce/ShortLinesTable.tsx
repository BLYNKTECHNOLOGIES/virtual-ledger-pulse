import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ats/AtsUi";
import { cn } from "@/lib/utils";
import { PRIORITY_DOT, PRIORITY_LABEL, formatIstDate, priorityWhyText, type StaffingDerived } from "@/lib/hrms/workforce";
import type { OpenJobRef } from "@/lib/ats/jobRequirements";
import { DesignationLink } from "./DesignationStory";

const PRIORITY_ORDER = ["critical", "high", "medium", "low"];
const OPEN = ["pending_approval", "approved", "recruitment_active", "partially_fulfilled"];

export interface ShortLineHandlers {
  canManage: boolean;
  busy?: boolean;
  onApprove: (req: any) => void;
  onReject: (req: any) => void;
  onCreate: (line: StaffingDerived, people: number) => void;
  onOpenRequirement: (id: string) => void;
}

interface Props extends ShortLineHandlers {
  rows: StaffingDerived[];
  /** Open and draft requirements, keyed by line. */
  reqsByLine: Map<string, any[]>;
  /** The requirements couldn't load: the Hiring column is unknown, not empty. */
  reqsError?: boolean;
  /** ATS jobs recruiting for each requirement (requirement id → jobs); undefined while loading. */
  jobsByReq?: Map<string, any[]>;
  /** The job links couldn't load (approved requests must not look as if no job recruits for them). */
  jobsError?: boolean;
  /** Open ATS jobs each approved requirement could be linked to (requirement id → jobs). */
  linkable?: Map<string, OpenJobRef[]>;
  initial?: number;
}

type Hiring = { tone: "warning" | "primary" | "success" | "destructive" | "neutral"; text: string; req?: any; noJob?: boolean; suggest?: OpenJobRef | null };

const priorityText = (r: StaffingDerived) => `${PRIORITY_LABEL[r.priority] ?? r.priority} priority`;

/** Lines still short after trainees and hires: who is short, by how much, and what hiring covers it. */
export function ShortLinesTable({ rows, reqsByLine, reqsError, jobsByReq, jobsError, linkable, initial = 8, ...h }: Props) {
  const [all, setAll] = useState(false);
  const list = rows
    .filter((r) => r.netHiringRequirement > 0)
    .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || b.netHiringRequirement - a.netHiringRequirement);
  const shown = all ? list : list.slice(0, initial);
  const need = list.reduce((a, r) => a + r.netHiringRequirement, 0);

  const describe = (r: StaffingDerived) => {
    const lineReqs = reqsByLine.get(r.plan_id) ?? [];
    const open = lineReqs.filter((q) => OPEN.includes(q.status));
    const drafts = lineReqs.filter((q) => q.status === "draft");
    const draftHc = drafts.reduce((a, q) => a + (Number(q.number_required) || 0), 0);
    // Drafts don't count as requested (the engine ignores them), so they stay inside "not requested";
    // a new request is only offered for what no draft covers yet.
    const notRequested = Math.max(0, r.uncoveredHiringRequirement);
    const requestable = Math.max(0, notRequested - draftHc);
    const pills: Hiring[] = open.map((q) => {
      if (q.status === "pending_approval") return { tone: "warning", text: `Awaiting approval · ${q.number_required}`, req: q };
      if (jobsError && !jobsByReq) return { tone: "neutral", text: "ATS jobs couldn't load", req: q };
      if (!jobsByReq) return { tone: "neutral", text: "Checking ATS jobs…", req: q };
      const jobs = (jobsByReq.get(q.id) ?? []).filter((j: any) => ["open", "paused"].includes(j.status));
      if (jobs.length) {
        const paused = jobs.every((j: any) => j.status === "paused");
        return { tone: paused ? "warning" : "success", text: `${paused ? "Paused" : "Recruiting"} · ${jobs.map((j: any) => j.job_code).join(", ")}`, req: q };
      }
      return { tone: "destructive", text: "Approved · no ATS job", req: q, noJob: true, suggest: linkable?.get(q.id)?.[0] ?? null };
    });
    if (drafts.length) pills.push({ tone: "neutral", text: `Draft · ${draftHc} not sent`, req: drafts[0] });
    return { pills, notRequested, requestable, drafts, pending: open.find((q) => q.status === "pending_approval"), first: open[0] ?? drafts[0] };
  };

  const action = (r: StaffingDerived, d: ReturnType<typeof describe>, block = false) => {
    const cls = cn("h-8", block && "w-full sm:w-auto");
    if (reqsError) return null;
    if (h.canManage && d.pending) {
      return (
        <div className={cn("flex gap-1.5", block && "w-full")}>
          <Button size="sm" variant="outline" className="h-8 shrink-0 px-2 text-destructive" onClick={() => h.onReject(d.pending)} aria-label={`Reject ${d.pending.requirement_no}`}>
            <ThumbsDown className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" className={cn("h-8", block && "flex-1")} disabled={h.busy} onClick={() => h.onApprove(d.pending)}>
            <ThumbsUp className="h-3.5 w-3.5" /> Approve
          </Button>
        </div>
      );
    }
    const noJob = d.pills.find((p) => p.noJob);
    if (h.canManage && noJob) {
      return (
        <Button asChild size="sm" variant="outline" className={cls}>
          <Link to={noJob.suggest ? `/hrms/ats/jobs?edit=${noJob.suggest.id}&requirement=${noJob.req.id}` : `/hrms/ats/jobs?new=1&requirement=${noJob.req.id}`}>
            {noJob.suggest ? `Link ${noJob.suggest.job_code ?? "open job"}` : "Create ATS job"}
          </Link>
        </Button>
      );
    }
    // A draft on the line comes first: finish and send it instead of raising a second request.
    if (h.canManage && d.drafts.length) {
      return <Button size="sm" variant="outline" className={cls} onClick={() => h.onOpenRequirement(d.drafts[0].id)}>Open draft</Button>;
    }
    if (h.canManage && d.requestable > 0) {
      return <Button size="sm" className={cls} onClick={() => h.onCreate(r, d.requestable)}>Request {d.requestable}</Button>;
    }
    if (d.first) return <Button size="sm" variant="outline" className={cls} onClick={() => h.onOpenRequirement(d.first.id)}>Open</Button>;
    return null;
  };

  return (
    <section className="rounded-xl border border-border bg-card" aria-label="Where we're short">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-semibold text-foreground">Where we're short</h2>
          <p className="text-xs text-muted-foreground">
            {list.length === 0 ? "Every line is staffed, or its gap is covered by people on the way." : `${list.length} line${list.length === 1 ? "" : "s"} · ${need} still to find after people on the way`}
          </p>
        </div>
        <Button asChild size="sm" variant="ghost" className="h-8 text-primary">
          <Link to="/hrms/workforce-planning/staffing-plan">Staffing plan <ArrowRight className="h-3.5 w-3.5" /></Link>
        </Button>
      </header>
      {reqsError && (
        <p className="border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">Couldn't load the hiring requests, so the Hiring column is missing.</p>
      )}

      {list.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> No hiring needed right now.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-28" />
                <col className="w-24" />
                <col className="w-[28%]" />
                <col className="w-36" />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Line</th>
                  <th className="px-2 py-2 font-medium">On roll</th>
                  <th className="px-2 py-2 text-right font-medium">Still to find</th>
                  <th className="px-3 py-2 font-medium">Hiring</th>
                  <th className="px-4 py-2"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const d = describe(r);
                  return (
                    <tr key={r.plan_id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2">
                          <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[r.priority] ?? PRIORITY_DOT.medium)} aria-hidden />
                          <p className="truncate font-medium text-foreground"><DesignationLink id={r.position_id} label={r.position_title ?? undefined} tooltip={r.position_title ?? undefined}>{r.position_title}</DesignationLink></p>
                          <span aria-hidden />
                          <p className="truncate text-xs text-muted-foreground" title={r.priority_why ? priorityWhyText(r.priority_why) : undefined}>
                            {r.shiftLabel} · {r.department_name} · {priorityText(r)}
                          </p>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <Staffed r={r} />
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <span className="text-base font-semibold tabular-nums text-destructive">{r.netHiringRequirement}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <HiringPills d={d} onOpen={h.onOpenRequirement} unknown={reqsError} />
                      </td>
                      <td className="px-4 py-2.5"><div className="flex justify-end">{action(r, d)}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phones */}
          <ul className="divide-y divide-border md:hidden">
            {shown.map((r) => {
              const d = describe(r);
              return (
                <li key={r.plan_id} className="space-y-2 px-4 py-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2">
                      <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[r.priority] ?? PRIORITY_DOT.medium)} aria-hidden />
                      <p className="truncate font-medium text-foreground"><DesignationLink id={r.position_id} label={r.position_title ?? undefined} tooltip={r.position_title ?? undefined}>{r.position_title}</DesignationLink></p>
                      <span aria-hidden />
                      <p className="text-xs text-muted-foreground">{r.shiftLabel} · {r.department_name} · {priorityText(r)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold leading-none tabular-nums text-destructive">{r.netHiringRequirement}</p>
                      <p className="text-[11px] text-muted-foreground">still to find</p>
                    </div>
                  </div>
                  <Staffed r={r} />
                  <HiringPills d={d} onOpen={h.onOpenRequirement} unknown={reqsError} />
                  {action(r, d, true)}
                </li>
              );
            })}
          </ul>

          {list.length > initial && (
            <div className="border-t border-border px-4 py-2">
              <Button size="sm" variant="link" className="h-auto px-0" onClick={() => setAll((v) => !v)}>
                {all ? "Show fewer" : `Show all ${list.length} lines`}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Staffed({ r }: { r: StaffingDerived }) {
  const pct = r.required_hc > 0 ? Math.min(100, (r.current_hc / r.required_hc) * 100) : 0;
  const extra = [
    r.in_training_hc ? `${r.in_training_hc} in training` : null,
    r.selected_hc + r.pending_joining_hc ? `${r.selected_hc + r.pending_joining_hc} joining` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <p className="text-sm tabular-nums text-foreground"><span className="font-semibold">{r.current_hc}</span><span className="text-muted-foreground"> / {r.required_hc}</span></p>
      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      {extra && <p className="mt-0.5 text-[11px] text-muted-foreground">{extra}</p>}
    </div>
  );
}

function HiringPills({ d, onOpen, unknown }: { d: { pills: Hiring[]; notRequested: number }; onOpen: (id: string) => void; unknown?: boolean }) {
  if (unknown) return <span className="text-xs text-muted-foreground">Not loaded</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {d.pills.map((p) => (
        <button key={p.req?.id ?? p.text} type="button" onClick={() => p.req && onOpen(p.req.id)}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={p.req ? `${p.req.requirement_no}${p.req.target_joining_date ? ` · target ${formatIstDate(p.req.target_joining_date)}` : ""}` : undefined}>
          <StatusPill tone={p.tone}>{p.text}</StatusPill>
        </button>
      ))}
      {d.notRequested > 0 && <StatusPill tone="destructive">{d.notRequested} not requested yet</StatusPill>}
      {d.pills.length === 0 && d.notRequested === 0 && <span className="text-xs text-muted-foreground">—</span>}
    </div>
  );
}
