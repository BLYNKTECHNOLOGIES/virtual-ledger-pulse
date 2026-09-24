import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Employee status is DERIVED from the workflow records — never typed in by hand.
 *   Inactive     ← is_active = false (set only by separation completion / F&F paid,
 *                  which are also the ONLY paths that dismiss in RazorpayX)
 *   On Notice    ← resignation_status = 'notice_period'
 *   On Training  ← assigned to the Trainees shift
 *   On Probation ← probation_end_date today or later
 *   Active       ← everything else
 * Inactive carries an F&F sub-status: Completed (settlement paid) or Pending.
 */
export type EmployeeStatusKey = "active" | "on_notice" | "on_training" | "on_probation" | "inactive";

export interface DerivedEmployeeStatus {
  key: EmployeeStatusKey;
  label: string;
  fnf?: "pending" | "completed";
  fullLabel: string;
  className: string;
}

const CLASS: Record<EmployeeStatusKey, string> = {
  active: "bg-success/10 text-success",
  on_notice: "bg-warning/10 text-warning",
  on_training: "bg-primary/10 text-primary",
  on_probation: "bg-accent text-accent-foreground",
  inactive: "bg-destructive/10 text-destructive",
};

const LABEL: Record<EmployeeStatusKey, string> = {
  active: "Active",
  on_notice: "On Notice",
  on_training: "On Training",
  on_probation: "On Probation",
  inactive: "Inactive",
};

export const EMPLOYEE_STATUS_OPTIONS = (Object.keys(LABEL) as EmployeeStatusKey[]).map((k) => ({ value: k, label: LABEL[k] }));

export function deriveEmployeeStatus(
  emp: { id: string; is_active?: boolean | null; resignation_status?: string | null; probation_end_date?: string | null },
  ctx: { fnfByEmployee?: Map<string, string>; trainingShiftIds?: Set<string>; shiftId?: string | null },
): DerivedEmployeeStatus {
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10); // IST
  let key: EmployeeStatusKey = "active";
  let fnf: "pending" | "completed" | undefined;
  const rs = String(emp.resignation_status || "").toLowerCase();

  if (emp.is_active === false) {
    key = "inactive";
    if (rs) fnf = ctx.fnfByEmployee?.get(emp.id) === "paid" ? "completed" : "pending";
  } else if (rs === "notice_period") key = "on_notice";
  else if (ctx.shiftId && ctx.trainingShiftIds?.has(ctx.shiftId)) key = "on_training";
  else if (emp.probation_end_date && emp.probation_end_date >= today) key = "on_probation";

  const label = LABEL[key];
  return {
    key,
    label,
    fnf,
    fullLabel: fnf ? `${label} · F&F ${fnf === "completed" ? "Completed" : "Pending"}` : label,
    className: CLASS[key],
  };
}

/** Lookups needed to derive status: latest F&F status per employee + training shift ids. */
export function useEmployeeStatusContext() {
  return useQuery({
    queryKey: ["hr_employee_status_context"],
    queryFn: async () => {
      const [fnfRes, shiftRes] = await Promise.all([
        (supabase as any).from("hr_fnf_settlements").select("employee_id, status, created_at").order("created_at", { ascending: true }),
        (supabase as any).from("hr_shifts").select("id, name").ilike("name", "%train%"),
      ]);
      const fnfByEmployee = new Map<string, string>();
      for (const r of (fnfRes.data || []) as any[]) {
        // any paid settlement wins; otherwise latest status
        if (fnfByEmployee.get(r.employee_id) === "paid") continue;
        fnfByEmployee.set(r.employee_id, r.status);
      }
      const trainingShiftIds = new Set<string>(((shiftRes.data || []) as any[]).map((s) => s.id));
      return { fnfByEmployee, trainingShiftIds };
    },
    staleTime: 60_000,
  });
}
