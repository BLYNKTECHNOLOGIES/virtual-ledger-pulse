import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Briefcase, CalendarDays, Wallet, Landmark, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * HR Dashboard · Data Completeness card
 * ------------------------------------------------------------------
 * The plain-English "what do I do next with employees" home base for
 * a non-technical HR manager. Reads hr_employee_completeness (scoped
 * to draft/onboarding employees) and shows four gap counts, each row
 * deep-links to Bulk Completion filtered to that gap.
 */

type Row = { employee_id: string; has_bank: boolean; has_salary: boolean; has_doj: boolean; has_designation: boolean };

export function HRDashboardCompletenessCard() {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["hr_dashboard_completeness"],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_employee_completeness" as any)
        .select("employee_id, has_bank, has_salary, has_doj, has_designation");
      return (data || []) as unknown as Row[];
    },
    staleTime: 60_000,
  });

  const total = data?.length ?? 0;
  const done = (k: keyof Row) => (data || []).filter(r => r[k]).length;

  const rows = [
    { key: "designation", label: "Designation", icon: Briefcase, done: done("has_designation") },
    { key: "doj",         label: "Joining dates", icon: CalendarDays, done: done("has_doj") },
    { key: "salary",      label: "Salary", icon: Wallet, done: done("has_salary") },
    { key: "bank",        label: "Bank details", icon: Landmark, done: done("has_bank") },
  ] as const;

  const openGap = (gap: string) =>
    navigate(`/hrms/onboarding-pipeline?gap=${gap}`);

  const allComplete = total > 0 && rows.every(r => r.done === total);

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Employee data to finish</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {total === 0
              ? "No draft employees pending."
              : `${total} draft employee${total === 1 ? "" : "s"} — tap any row to fill the gap.`}
          </p>
        </div>
        {total > 0 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => navigate("/hrms/onboarding-pipeline")}>
            Open <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>

      {total === 0 || allComplete ? (
        <div className="flex items-center gap-2 text-sm text-success py-2">
          <CheckCircle2 className="h-4 w-4" />
          {total === 0 ? "Nothing pending." : "All draft employees have full data."}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const missing = total - r.done;
            const pct = total > 0 ? Math.round((r.done / total) * 100) : 0;
            const complete = missing === 0;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => !complete && openGap(r.key)}
                disabled={complete}
                className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                  complete
                    ? "border-success/30 bg-success/5 cursor-default"
                    : "border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    complete ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                  }`}>
                    <r.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{r.label}</span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {r.done}/{total}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${complete ? "bg-success" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {complete
                        ? "All set."
                        : `${missing} employee${missing === 1 ? "" : "s"} still need this — tap to fill`}
                    </p>
                  </div>
                  {!complete && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
