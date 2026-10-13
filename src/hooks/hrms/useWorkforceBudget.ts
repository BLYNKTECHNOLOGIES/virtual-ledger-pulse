import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Label every budget figure carries. */
export const BUDGET_SOURCE_LABEL = "Based on CTC on record (RazorpayX salary register)";

export interface BudgetTotals {
  on_roll_hc: number; on_roll_cost: number; hiring_hc: number; hiring_cost: number;
  uncovered_hc: number; uncovered_cost: number; required_hc: number; full_cost: number;
  /** People in training included in on-roll figures. */
  training_hc: number;
  /** Hired but not yet joined (selected / joining), priced on the line's per-person figure. */
  joining_hc: number; joining_cost: number;
}
/** Departments with fewer than 2 people are grouped (department_id null) so no total is one person's salary. */
export interface BudgetDepartment extends Omit<BudgetTotals, "on_roll_cost" | "full_cost"> {
  department_id: string | null; department_name: string | null; on_roll_cost: number | null; full_cost: number | null;
}
export interface BudgetLine {
  plan_id: string; department_id: string | null; position_title: string | null; shift_label: string | null;
  required_hc: number; on_roll_hc: number; training_hc: number; joining_hc: number; joining_cost: number;
  /** null when one person is on roll — their salary only shows inside the department total. */
  on_roll_cost: number | null; on_roll_avg: number | null;
  hiring_hc: number; hiring_cost: number; hiring_basis: string | null;
  uncovered_hc: number; uncovered_cost: number; per_person: number | null; per_person_basis: string;
  full_cost: number | null; grouped: boolean;
}
export interface BudgetRequirement { id: string; people: number; per_person: number | null; basis: string; no_range: boolean }
export interface BudgetUnpriced { id: string; requirement_no: string; people: number; position_title: string | null; per_person: number | null; basis: string }
export interface WorkforceBudget {
  company: BudgetTotals; departments: BudgetDepartment[]; lines: BudgetLine[]; requirements: BudgetRequirement[]; unpriced: BudgetUnpriced[];
}

export function formatInr(v?: number | null): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `₹${Math.round(Number(v)).toLocaleString("en-IN")}`;
}

/** Salary budget — HRMS managers only (the database refuses everyone else). */
export function useWorkforceBudget(enabled: boolean) {
  return useQuery({
    queryKey: ["workforce_staffing_matrix", "budget"],
    enabled,
    retry: false,
    queryFn: async (): Promise<WorkforceBudget> => {
      const { data, error } = await supabase.rpc("hr_workforce_budget");
      if (error) throw error;
      return data as unknown as WorkforceBudget;
    },
    staleTime: 60_000,
  });
}

export interface MyDepartmentLine {
  department_id: string; department_name: string; plan_id: string; position_title: string | null;
  shift_label: string | null; required_hc: number; on_roll_hc: number; short_hc: number; in_training_hc: number;
  requests: { id: string; requirement_no: string; status: string; number_required: number; source: string;
    requested_by_name: string | null; target_joining_date: string | null }[];
}

/** Lines of the departments the signed-in employee heads (empty when they head none). */
export function useMyDepartmentStaffing() {
  return useQuery({
    queryKey: ["workforce_staffing_matrix", "my_department"],
    queryFn: async (): Promise<MyDepartmentLine[]> => {
      const { data, error } = await supabase.rpc("hr_my_department_staffing");
      if (error) throw error;
      return (data || []) as MyDepartmentLine[];
    },
    staleTime: 60_000,
  });
}

export function useDepartmentRequestHiring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { planId: string; number: number; target: string | null; reason: string; adds: boolean }) => {
      const { data, error } = await supabase.rpc("hr_department_request_hiring", {
        p_plan_id: v.planId, p_number: v.number, p_target: (v.target || null) as string, p_reason: v.reason, p_adds: v.adds,
      });
      if (error) throw error;
      return data as unknown as { id: string; requirement_no: string };
    },
    onSuccess: (d) => {
      ["workforce_staffing_matrix", "workforce_hiring_requirements", "workforce_audit"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`Request ${d.requirement_no} sent for approval`);
    },
    onError: (e: any) => toast.error(e?.message || "Could not send the request"),
  });
}
