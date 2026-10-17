import { Link } from "react-router-dom";
import { ChevronDown, IndianRupee } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricStrip } from "@/components/ats/AtsUi";
import { cn } from "@/lib/utils";
import { BUDGET_SOURCE_LABEL, formatInr, useWorkforceBudget } from "@/hooks/hrms/useWorkforceBudget";

/**
 * Overview "Budget" card — HRMS managers only. The database groups departments with fewer than
 * 2 people and builds every average from at least 2 people, so no figure is one person's salary.
 */
export function WorkforceBudgetCard({ canManage, filtered = false }: { canManage: boolean; filtered?: boolean }) {
  const q = useWorkforceBudget(canManage);
  const [how, setHow] = useState(false);
  if (!canManage) return null;
  if (q.isError && !q.data) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 text-sm text-destructive">
        Couldn't load the salary budget. <button type="button" className="underline" onClick={() => q.refetch()}>Try again</button>
      </section>
    );
  }
  if (!q.data) {
    return q.isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : null;
  }
  const c = q.data.company;
  const rows = q.data.departments;
  const unpriced = q.data.unpriced || [];
  return (
    <section className="rounded-xl border border-border bg-card" aria-label="Monthly budget">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-foreground">
          <IndianRupee className="h-4 w-4 text-muted-foreground" aria-hidden /> Monthly budget
        </h2>
        <p className="text-xs text-muted-foreground">{filtered ? "Whole company — the filters above don't apply · " : ""}{BUDGET_SOURCE_LABEL} · HRMS managers only</p>
      </header>
      <div className="space-y-3 p-4">
        <MetricStrip className="sm:grid-cols-4 xl:grid-cols-4">
          <Figure label="Cost today" value={formatInr(c.on_roll_cost)}
            hint={`${c.on_roll_hc} on roll${c.training_hc ? ` (incl. ${c.training_hc} in training)` : ""}`} />
          <Figure label="Hired, joining" value={formatInr(c.joining_cost)} hint={`${c.joining_hc} selected or joining`} />
          <Figure label="Being hired" value={formatInr(c.hiring_cost)} hint={`${c.hiring_hc} people in open requests`} />
          <Figure label="If fully staffed" value={formatInr(c.full_cost)} hint={`${c.required_hc} required on all lines`} />
        </MetricStrip>

        {rows.length > 0 && (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 font-medium">Department</th>
                    <th className="px-1 text-right font-medium">Today</th>
                    <th className="px-1 text-right font-medium">Joining</th>
                    <th className="px-1 text-right font-medium">Being hired</th>
                    <th className="pl-1 text-right font-medium">Fully staffed</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((d) => (
                    <tr key={d.department_name || "x"} className="border-b border-border/60 last:border-0">
                      <td className="py-1.5 pr-2 text-foreground">{d.department_name || "Smaller departments (grouped)"}</td>
                      <td className="px-1 text-right">{formatInr(d.on_roll_cost)}</td>
                      <td className="px-1 text-right">{formatInr(d.joining_cost)}</td>
                      <td className="px-1 text-right">{formatInr(d.hiring_cost)}</td>
                      <td className="pl-1 text-right font-medium text-foreground">{formatInr(d.full_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 sm:hidden">
              {rows.map((d) => (
                <div key={d.department_name || "x"} className="rounded-lg border border-border p-2.5 text-sm">
                  <p className="font-medium text-foreground">{d.department_name || "Smaller departments (grouped)"}</p>
                  <dl className="mt-1 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-3 gap-y-0.5 text-xs tabular-nums">
                    <dt className="text-muted-foreground">Today</dt><dd className="text-right">{formatInr(d.on_roll_cost)}</dd>
                    <dt className="text-muted-foreground">Joining</dt><dd className="text-right">{formatInr(d.joining_cost)}</dd>
                    <dt className="text-muted-foreground">Being hired</dt><dd className="text-right">{formatInr(d.hiring_cost)}</dd>
                    <dt className="text-muted-foreground">Fully staffed</dt><dd className="text-right font-medium text-foreground">{formatInr(d.full_cost)}</dd>
                  </dl>
                </div>
              ))}
            </div>
          </>
        )}

        {unpriced.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-2.5 text-xs">
            <p className="font-medium text-foreground">{unpriced.length} open request{unpriced.length === 1 ? "" : "s"} without a salary range — priced on an average</p>
            <ul className="mt-1 space-y-0.5">
              {unpriced.map((u) => (
                <li key={u.id}>
                  <Link className="text-primary underline-offset-2 hover:underline" to={`/hrms/workforce-planning/hiring-requirements?req=${u.id}`}>
                    {u.requirement_no}
                  </Link>{" "}
                  · {u.position_title ?? "Role"} × {u.people} · {u.per_person != null ? `${formatInr(u.per_person)} (${u.basis})` : "₹0 — no salary data"} · add a salary range
                </li>
              ))}
            </ul>
          </div>
        )}

        <button type="button" onClick={() => setHow((v) => !v)} aria-expanded={how}
          className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          How these figures are priced <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", how && "rotate-180")} />
        </button>
        {how && (
          <p className="text-xs text-muted-foreground">
            Per-person figures use the request's salary range midpoint, else its ATS job's range, else an average CTC built from at least 2 people
            (the role, else the department, else all planned staff). Departments with fewer than 2 people are grouped. Fully staffed = cost today + each
            line's shortfall after people in training × that per-person figure.
          </p>
        )}
      </div>
    </section>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
