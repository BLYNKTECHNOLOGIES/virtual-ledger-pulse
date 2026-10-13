import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidatePlanning } from "@/hooks/hrms/useWorkforcePlanning";

export const OPEN_REQ_STATUSES = ["draft", "pending_approval", "approved", "recruitment_active", "partially_fulfilled"];

/** Clear a line's "automatic hiring paused" and raise its automatic request now (HRMS managers). */
export function useResumeAutoHiring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (planId: string) => {
      const { data, error } = await supabase.rpc("hr_wf_resume_auto_hiring", { p_plan: planId });
      if (error) throw error;
      return (data?.requirement_no ?? null) as string | null;
    },
    onSuccess: (no) => {
      invalidatePlanning(qc);
      toast.success(no ? `Automatic hiring restarted — ${no} awaits approval` : "Automatic hiring restarted — nothing to raise right now");
    },
    onError: (e: any) => toast.error(e?.message || "Could not restart automatic hiring"),
  });
}

/** Move an open requirement to another active line of the same department and role (audited reason). */
export function useMoveRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, planId, reason }: { id: string; planId: string; reason: string }) => {
      const { error } = await supabase.rpc("hr_update_requirement", {
        p_id: id, p_patch: { staffing_plan_id: planId }, p_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidatePlanning(qc); toast.success("Requirement moved to the line"); },
    onError: (e: any) => toast.error(e?.message || "Could not move the requirement"),
  });
}

/** People on notice in planned roles — also those who sit on no staffing line. */
export function useLeavingSoon() {
  return useQuery({
    queryKey: ["workforce_staffing_matrix", "leaving_soon"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hr_workforce_leaving_soon");
      if (error) throw error;
      return (data || []) as { employee_id: string; department_id: string | null; position_id: string | null; plan_id: string | null; last_working_day: string | null }[];
    },
    staleTime: 60_000,
  });
}

/** Lines a requirement may sit on: active, same department, role among the line's roles. */
export function linesForRole(plans: any[], departmentId?: string | null, positionId?: string | null) {
  if (!departmentId || !positionId) return [];
  return plans.filter((p) => p.is_active !== false && p.department_id === departmentId &&
    (p.eligible_position_ids?.length ? p.eligible_position_ids.includes(positionId) : p.position_id === positionId));
}
