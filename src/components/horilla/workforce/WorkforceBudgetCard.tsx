import { useMemo } from "react";
import { IndianRupee } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BUDGET_SOURCE_LABEL, formatInr, useWorkforceBudget, type BudgetDepartment } from "@/hooks/hrms/useWorkforceBudget";

/** Overview "Budget" card — HRMS managers only; departments with one person on roll are grouped. */
export function WorkforceBudgetCard({ canManage }: { canManage: boolean }) {
  const q = useWorkforceBudget(canManage);
  const rows = useMemo(() => {
    const deps = q.data?.departments || [];
    const big = deps.filter((d) => d.on_roll_hc !== 1);
    const small = deps.filter((d) => d.on_roll_hc === 1);
    if (small.length < 2) return deps; // one lone team can't be hidden in a group of one
    const g = small.reduce<BudgetDepartment>((a, d) => ({
      ...a, on_roll_hc: a.on_roll_hc + d.on_roll_hc, on_roll_cost: a.on_roll_cost + d.on_roll_cost,
      hiring_hc: a.hiring_hc + d.hiring_hc, hiring_cost: a.hiring_cost + d.hiring_cost,
      uncovered_hc: a.uncovered_hc + d.uncovered_hc, uncovered_cost: a.uncovered_cost + d.uncovered_cost,
      required_hc: a.required_hc + d.required_hc, full_cost: a.full_cost + d.full_cost,
    }), { department_id: null, department_name: `Small teams (${small.map((d) => d.department_name).join(", ")})`,
      on_roll_hc: 0, on_roll_cost: 0, hiring_hc: 0, hiring_cost: 0, uncovered_hc: 0, uncovered_cost: 0, required_hc: 0, full_cost: 0 });
    return [...big, g];
  }, [q.data]);

  if (!canManage || q.isError || !q.data) return null;
  const c = q.data.company;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><IndianRupee className="h-4 w-4" /> Budget (monthly)</CardTitle>
        <p className="text-xs text-muted-foreground">{BUDGET_SOURCE_LABEL}. Visible to HRMS managers only.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Figure label="Cost today" value={formatInr(c.on_roll_cost)} hint={`${c.on_roll_hc} people on roll`} />
          <Figure label="Requested hiring" value={formatInr(c.hiring_cost)} hint={`${c.hiring_hc} people in open requests`} />
          <Figure label="If fully staffed" value={formatInr(c.full_cost)} hint={`${c.required_hc} required on all lines`} />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-1.5 font-medium">Department</th>
              <th className="px-1 text-right font-medium">Today</th>
              <th className="px-1 text-right font-medium">Requested</th>
              <th className="pl-1 text-right font-medium">Fully staffed</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((d) => (
              <tr key={d.department_name || "x"} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-2 text-foreground">{d.department_name || "Unassigned"}</td>
                <td className="px-1 text-right">{formatInr(d.on_roll_cost)}</td>
                <td className="px-1 text-right">{formatInr(d.hiring_cost)}</td>
                <td className="pl-1 text-right font-medium text-foreground">{formatInr(d.full_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          Requested hiring uses each request's salary range midpoint, else its ATS job's range, else the role's average CTC on record.
          Roles with no salary anywhere count as ₹0. Fully staffed = cost today + each line's shortfall × that per-person figure.
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
