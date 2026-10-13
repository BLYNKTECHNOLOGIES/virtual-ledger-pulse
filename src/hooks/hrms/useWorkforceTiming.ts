import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidatePlanning } from "@/hooks/hrms/useWorkforcePlanning";

export interface OverdueJoiner {
  onboarding_id: string; full_name: string | null; department_name: string | null; position_title: string | null;
  plan_id: string | null; date_of_joining: string; onboarding_status: string; days_overdue: number;
}

/** Joiners whose joining date passed more than 3 days ago and who still haven't joined (still counted as joining). */
export function useOverdueJoiners(enabled = true) {
  return useQuery({
    queryKey: ["workforce_staffing_matrix", "overdue_joiners"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hr_workforce_overdue_joiners");
      if (error) throw error;
      return (data || []) as OverdueJoiner[];
    },
    staleTime: 60_000,
  });
}

/** Move a trainee to their working shift through the same function the Employees shift screen uses. */
export function useMoveAfterTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, shiftId, from }: { employeeId: string; shiftId: string; from: string }) => {
      const { error } = await (supabase as any).rpc("hr_assign_shift_schedule", {
        p_employee_id: employeeId, p_shift_id: shiftId, p_effective_from: from,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePlanning(qc);
      qc.invalidateQueries({ queryKey: ["hr_employee_shift_schedule"] });
      toast.success("Shift change saved");
    },
    onError: (e: any) => toast.error(e?.message || "Could not change the shift"),
  });
}

/** Lines that follow a desk group: switch to fixed numbers (keeps today's required) or follow another group. */
export function useRehomeLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, seatId }: { planId: string; seatId: string | null }) => {
      const patch = seatId ? { seat_capacity_id: seatId, follow_desks: true } : { seat_capacity_id: null, follow_desks: false };
      const { error } = await supabase.from("hr_headcount_plans").update(patch as any).eq("id", planId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { invalidatePlanning(qc); toast.success(v.seatId ? "Line moved to the other desk group" : "Line now uses fixed numbers"); },
    onError: (e: any) => toast.error(e?.message || "Could not change the line"),
  });
}

export function useRemoveDeskGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("hr_wf_remove_desk_group", { p_seat: id, p_reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => { invalidatePlanning(qc); toast.success("Desk group removed"); },
    onError: (e: any) => toast.error(e?.message || "Could not remove the desk group"),
  });
}
