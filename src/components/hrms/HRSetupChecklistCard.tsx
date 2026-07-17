import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, AlertTriangle, ArrowRight, Settings, ListChecks } from "lucide-react";

/**
 * HR Setup Checklist — the "am I done configuring HRMS?" home base.
 * Sibling to HRDashboardCompletenessCard, which tracks per-employee gaps.
 * This one tracks org-wide setup gaps that block payroll / attendance / leave.
 *
 * Each row is tagged with WHO acts (r5): "Decision" (owner call) vs
 * "Data entry" (HR can just fill). Keeps a non-technical HR manager from
 * stalling on items that aren't theirs.
 */
type Row = {
  key: string;
  label: string;
  actor: "Decision" | "Data entry";
  need: (data: any) => boolean; // returns true when the row is still open
  detail: (data: any) => string;
  route: string;
  cta: string;
};

const rows: Row[] = [
  {
    key: "holidays",
    label: "Public holidays for the current financial year",
    actor: "Decision",
    need: (d) => d.holidays === 0,
    detail: (d) => `${d.holidays} holiday${d.holidays === 1 ? "" : "s"} configured`,
    route: "/hrms/holidays",
    cta: "Set holidays",
  },
  {
    key: "tax",
    label: "Income tax slabs (old & new regime)",
    actor: "Decision",
    need: (d) => d.tax_brackets === 0,
    detail: (d) => `${d.tax_brackets} tax bracket${d.tax_brackets === 1 ? "" : "s"} configured`,
    route: "/hrms/salary-components",
    cta: "Configure tax",
  },
  {
    key: "filing_statuses",
    label: "Employee filing statuses (Single / Married / HUF)",
    actor: "Decision",
    need: (d) => d.filing_statuses === 0,
    detail: (d) => `${d.filing_statuses} filing status${d.filing_statuses === 1 ? "" : "es"} defined`,
    route: "/hrms/salary-components",
    cta: "Add statuses",
  },
  {
    key: "structures",
    label: "Salary structure attached to every employee",
    actor: "Data entry",
    need: (d) => d.structures < d.employees,
    detail: (d) => `${d.structures} of ${d.employees} employees mapped`,
    route: "/hrms/salary-structure",
    cta: "Map structures",
  },
  {
    key: "bank",
    label: "Bank account on every employee",
    actor: "Data entry",
    need: (d) => d.bank < d.employees,
    detail: (d) => `${d.bank} of ${d.employees} employees have bank details`,
    route: "/hrms/dashboard",
    cta: "Fill bank details",
  },
  {
    key: "weekly_off",
    label: "Weekly-off pattern on every employee",
    actor: "Data entry",
    need: (d) => d.weekly_off < d.employees,
    detail: (d) => `${d.weekly_off} of ${d.employees} employees have weekly-off set`,
    route: "/hrms/weekly-off",
    cta: "Assign weekly-off",
  },
  {
    key: "shifts",
    label: "Shift schedule on every employee",
    actor: "Data entry",
    need: (d) => d.shifts < d.employees,
    detail: (d) => `${d.shifts} of ${d.employees} employees have a shift`,
    route: "/hrms/shifts",
    cta: "Assign shifts",
  },
];

export function HRSetupChecklistCard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["hr_setup_checklist"],
    queryFn: async () => {
      const [h, tb, fs, es, bd, wo, sh, emp] = await Promise.all([
        (supabase as any).from("hr_holidays").select("id", { count: "exact", head: true }),
        (supabase as any).from("hr_tax_brackets").select("id", { count: "exact", head: true }),
        (supabase as any).from("hr_filing_statuses").select("id", { count: "exact", head: true }),
        (supabase as any).from("hr_employee_salary_structures").select("employee_id", { count: "exact", head: true }),
        (supabase as any).from("hr_employee_bank_details").select("employee_id", { count: "exact", head: true }),
        (supabase as any).from("hr_employee_weekly_off").select("employee_id", { count: "exact", head: true }),
        (supabase as any).from("hr_employee_shift_schedule").select("employee_id", { count: "exact", head: true }),
        (supabase as any).from("hr_employees").select("id", { count: "exact", head: true }),
      ]);
      return {
        holidays: h.count || 0,
        tax_brackets: tb.count || 0,
        filing_statuses: fs.count || 0,
        structures: es.count || 0,
        bank: bd.count || 0,
        weekly_off: wo.count || 0,
        shifts: sh.count || 0,
        employees: emp.count || 0,
      };
    },
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <Card><CardContent className="p-5"><div className="h-32 animate-pulse rounded bg-muted/40" /></CardContent></Card>
    );
  }

  const open = rows.filter((r) => r.need(data));
  const done = rows.length - open.length;
  const allDone = open.length === 0;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" /> HRMS Setup Checklist
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {allDone
                ? "Everything the payroll and attendance engines need is in place."
                : `${done} of ${rows.length} setup items complete — payroll and attendance need the rest before they can run.`}
            </p>
          </div>
          {allDone ? (
            <Badge className="bg-success/15 text-success border-success/40">Ready</Badge>
          ) : (
            <Badge variant="outline" className="border-warning text-warning">
              <AlertTriangle className="h-3 w-3 mr-1" /> {open.length} pending
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          {rows.map((r) => {
            const pending = r.need(data);
            return (
              <div
                key={r.key}
                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                  pending ? "border-border bg-background" : "border-success/30 bg-success/5"
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  {pending ? (
                    <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-foreground">{r.label}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] h-4 px-1.5 ${
                          r.actor === "Decision"
                            ? "border-info/40 text-info"
                            : "border-muted-foreground/40 text-muted-foreground"
                        }`}
                      >
                        {r.actor}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{r.detail(data)}</p>
                  </div>
                </div>
                {pending && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs shrink-0 gap-1"
                    onClick={() => navigate(r.route)}
                  >
                    {r.cta} <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="text-[11px] text-muted-foreground flex items-start gap-1.5 pt-1">
          <Settings className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            <b>Decision</b> rows are owner/founder calls (statutory choices). <b>Data entry</b> rows can be filled by HR — bulk tools live on the Employee Onboarding page.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
