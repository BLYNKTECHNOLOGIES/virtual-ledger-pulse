import { Link } from "react-router-dom";
import { IndianRupee } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BUDGET_SOURCE_LABEL, formatInr, useWorkforceBudget } from "@/hooks/hrms/useWorkforceBudget";

/**
 * Overview "Budget" card — HRMS managers only. The database groups departments with fewer than
 * 2 people and builds every average from at least 2 people, so no figure is one person's salary.
 */
export function WorkforceBudgetCard({ canManage }: { canManage: boolean }) {
  const q = useWorkforceBudget(canManage);
  if (!canManage) return null;
  if (q.isError) {
    return (
      <Card><CardContent className="p-4 text-sm text-destructive">
        Couldn't load the salary budget. <button type="button" className="underline" onClick={() => q.refetch()}>Try again</button>
      </CardContent></Card>
    );
  }
  if (!q.data) return null;
  const c = q.data.company;
  const rows = q.data.departments;
  const unpriced = q.data.unpriced || [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><IndianRupee className="h-4 w-4" /> Budget (monthly)</CardTitle>
        <p className="text-xs text-muted-foreground">{BUDGET_SOURCE_LABEL}. Visible to HRMS managers only.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Cost today" value={formatInr(c.on_roll_cost)}
            hint={`${c.on_roll_hc} people on roll${c.training_hc ? ` (incl. ${c.training_hc} in training)` : ""}`} />
          <Figure label="Hired, joining" value={formatInr(c.joining_cost)} hint={`${c.joining_hc} selected or joining`} />
          <Figure label="Requested hiring" value={formatInr(c.hiring_cost)} hint={`${c.hiring_hc} people in open requests`} />
          <Figure label="If fully staffed" value={formatInr(c.full_cost)} hint={`${c.required_hc} required on all lines`} />
        </div>

        {/* Desktop table */}
        <table className="hidden w-full text-sm sm:table">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-1.5 font-medium">Department</th>
              <th className="px-1 text-right font-medium">Today</th>
              <th className="px-1 text-right font-medium">Joining</th>
              <th className="px-1 text-right font-medium">Requested</th>
              <th className="pl-1 text-right font-medium">Fully staffed</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((d) => (
              <tr key={d.department_name || "x"} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-2 text-foreground">{d.department_name || "Unassigned"}</td>
                <td className="px-1 text-right">{formatInr(d.on_roll_cost)}</td>
                <td className="px-1 text-right">{formatInr(d.joining_cost)}</td>
                <td className="px-1 text-right">{formatInr(d.hiring_cost)}</td>
                <td className="pl-1 text-right font-medium text-foreground">{formatInr(d.full_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Phones: stacked rows, nothing clipped */}
        <div className="space-y-2 sm:hidden">
          {rows.map((d) => (
            <div key={d.department_name || "x"} className="rounded-md border border-border p-2.5 text-sm">
              <p className="font-medium text-foreground">{d.department_name || "Unassigned"}</p>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums">
                <dt className="text-muted-foreground">Today</dt><dd className="text-right">{formatInr(d.on_roll_cost)}</dd>
                <dt className="text-muted-foreground">Joining</dt><dd className="text-right">{formatInr(d.joining_cost)}</dd>
                <dt className="text-muted-foreground">Requested</dt><dd className="text-right">{formatInr(d.hiring_cost)}</dd>
                <dt className="text-muted-foreground">Fully staffed</dt><dd className="text-right font-medium text-foreground">{formatInr(d.full_cost)}</dd>
              </dl>
            </div>
          ))}
        </div>

        {unpriced.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs">
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

        <p className="text-xs text-muted-foreground">
          Per-person figures use the request's salary range midpoint, else its ATS job's range, else an average CTC built from at least 2 people
          (the role, else the department, else all planned staff). Departments with fewer than 2 people are grouped. Fully staffed = cost today + each
          line's shortfall after people in training × that per-person figure.
        </p>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
