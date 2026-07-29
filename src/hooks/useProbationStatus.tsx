import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";

export type ProbationRow = {
  employee_id: string;
  badge_id: string | null;
  probation_end_date: string | null;
  on_probation: boolean;
};

/** True when a leave type is Sick / Medical leave (blocked during probation). */
export function isSickLeaveType(lt: any): boolean {
  const n = `${lt?.name || ""} ${lt?.code || ""}`.toLowerCase();
  return /sick|medical|\bsl\b|\bml\b/.test(n);
}

export function useProbationStatus() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["hr_probation_status_v"],
    queryFn: async () => {
      const rows = await fetchAllPaginated<ProbationRow>(() =>
        (supabase as any).from("hr_probation_status_v").select("employee_id, badge_id, probation_end_date, on_probation")
      );
      return rows || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const byId = new Map<string, ProbationRow>();
  for (const r of data) byId.set(r.employee_id, r);

  return {
    isLoading,
    rows: data,
    isOnProbation: (employeeId?: string | null) => (employeeId ? !!byId.get(employeeId)?.on_probation : false),
    probationEndDate: (employeeId?: string | null) => (employeeId ? byId.get(employeeId)?.probation_end_date ?? null : null),
  };
}
