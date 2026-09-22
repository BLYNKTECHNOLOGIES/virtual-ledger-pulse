import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  deriveStaffingRow,
  type StaffingDerived,
  type StaffingMatrixRow,
} from "@/lib/hrms/workforce";

const STALE = 60_000;

/** Departments, positions, shifts and employees used by the planning forms. */
export function useWorkforceLookups() {
  return useQuery({
    queryKey: ["workforce_lookups"],
    queryFn: async () => {
      const [departments, positions, shifts, employees] = await Promise.all([
        supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
        supabase.from("positions").select("id, title, department_id").eq("is_active", true).order("title"),
        supabase
          .from("hr_shifts")
          .select("id, name, start_time, end_time")
          .eq("is_active", true)
          .order("start_time"),
        supabase
          .from("hr_employees")
          .select("id, badge_id, first_name, last_name, resignation_status")
          .eq("is_active", true)
          .order("first_name"),
      ]);
      return {
        departments: departments.data || [],
        positions: positions.data || [],
        shifts: shifts.data || [],
        employees: employees.data || [],
      };
    },
    staleTime: 5 * 60_000,
  });
}

/** Derived staffing matrix — current headcount, pipeline and seats come from live records. */
export function useStaffingMatrix() {
  const query = useQuery({
    queryKey: ["workforce_staffing_matrix"],
    queryFn: async (): Promise<StaffingMatrixRow[]> => {
      const { data, error } = await supabase.rpc("hr_workforce_staffing_matrix");
      if (error) throw error;
      return (data || []) as StaffingMatrixRow[];
    },
    staleTime: STALE,
  });

  const rows = useMemo<StaffingDerived[]>(
    () => (query.data || []).map(deriveStaffingRow),
    [query.data],
  );

  return { ...query, rows };
}

/**
 * People actually on roll per department, role and shift.
 * Used for seat occupancy: a desk is shared across shifts, so the number of
 * people sitting at once is the busiest single shift, not everyone added up.
 */
export function useSeatOccupancy() {
  return useQuery({
    queryKey: ["workforce_seat_occupancy"],
    queryFn: async () => {
      const [workInfoResult, schedulesResult] = await Promise.all([
        supabase
          .from("hr_employee_work_info")
          .select(
            "employee_id, department_id, job_position_id, shift_id, employee_type, employee:hr_employees!hr_employee_work_info_employee_id_fkey!inner(id, first_name, last_name, is_active, resignation_status)",
          )
          .eq("employee.is_active", true),
        supabase
          .from("hr_employee_shift_schedule")
          .select("employee_id, shift_id, effective_from")
          .eq("is_current", true)
          .order("effective_from", { ascending: false }),
      ]);
      if (workInfoResult.error) throw workInfoResult.error;
      if (schedulesResult.error) throw schedulesResult.error;

      const currentShiftByEmployee = new Map<string, string>();
      (schedulesResult.data || []).forEach((schedule) => {
        if (!currentShiftByEmployee.has(schedule.employee_id)) {
          currentShiftByEmployee.set(schedule.employee_id, schedule.shift_id);
        }
      });

      return (workInfoResult.data || [])
        .filter((row: any) => (row.employee?.resignation_status ?? "") !== "completed")
        .map((row) => ({
          ...row,
          shift_id: currentShiftByEmployee.get(row.employee_id) ?? row.shift_id ?? null,
        }));
    },
    staleTime: STALE,
  });
}

/** Roles that hold employees but have no headcount plan yet. */
export function useUnplannedScopes() {
  return useQuery({
    queryKey: ["workforce_unplanned_scopes"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hr_workforce_unplanned_scopes");
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE,
  });
}

export interface HeadcountPlanInput {
  id?: string;
  department_id: string;
  position_id: string;
  eligible_position_ids: string[];
  shift_id: string | null;
  eligible_shift_ids: string[];
  shift_label: string | null;
  location: string | null;
  employment_type: string | null;
  approved_hc: number;
  required_hc: number;
  target_date: string | null;
  priority: string;
  notes: string | null;
}

export function useHeadcountPlans() {
  return useQuery({
    queryKey: ["workforce_headcount_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_headcount_plans")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE,
  });
}

function invalidatePlanning(qc: ReturnType<typeof useQueryClient>) {
  [
    "workforce_staffing_matrix",
    "workforce_unplanned_scopes",
    "workforce_headcount_plans",
    "workforce_seat_capacity",
    "workforce_hiring_requirements",
    "workforce_audit",
  ].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
}

export function useSaveHeadcountPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: HeadcountPlanInput) => {
      const { id, ...payload } = input;
      if (id) {
        const { error } = await supabase
          .from("hr_headcount_plans")
          .update(payload)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_headcount_plans").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidatePlanning(qc);
      toast.success("Staffing plan saved");
    },
    onError: (e: any) => toast.error(e?.message || "Could not save the staffing plan"),
  });
}

export function useDeleteHeadcountPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("hr_headcount_plans")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePlanning(qc);
      toast.success("Staffing line removed");
    },
    onError: (e: any) => toast.error(e?.message || "Could not remove the line"),
  });
}

export interface SeatCapacityInput {
  id?: string;
  department_id: string;
  position_id: string | null;
  eligible_position_ids: string[];
  shift_id: string | null;
  shift_label: string | null;
  location: string | null;
  physical_seats: number;
  max_operational_capacity: number | null;
  notes: string | null;
}

export function useSeatCapacity() {
  return useQuery({
    queryKey: ["workforce_seat_capacity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_seat_capacity")
        .select(
          "*, departments:department_id(name), positions:position_id(title), hr_shifts:shift_id(name)",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE,
  });
}

export function useSaveSeatCapacity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SeatCapacityInput) => {
      const { id, ...payload } = input;
      if (id) {
        const { error } = await supabase.from("hr_seat_capacity").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_seat_capacity").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidatePlanning(qc);
      toast.success("Seat capacity saved");
    },
    onError: (e: any) => toast.error(e?.message || "Could not save seat capacity"),
  });
}

export function useDeleteSeatCapacity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("hr_seat_capacity")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePlanning(qc);
      toast.success("Seat capacity removed");
    },
    onError: (e: any) => toast.error(e?.message || "Could not remove seat capacity"),
  });
}

export interface HiringRequirementInput {
  id?: string;
  department_id: string;
  position_id: string;
  shift_id: string | null;
  shift_label: string | null;
  location: string | null;
  employment_type: string | null;
  number_required: number;
  target_joining_date: string | null;
  reason: string;
  reason_notes: string | null;
  required_skills: string | null;
  experience_required: string | null;
  salary_min: number | null;
  salary_max: number | null;
  replacement_employee_id: string | null;
  approver_name: string | null;
  priority: string;
  status: string;
  notes: string | null;
}

export function useHiringRequirements() {
  return useQuery({
    queryKey: ["workforce_hiring_requirements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_hiring_requirements")
        .select(
          "*, departments:department_id(name), positions:position_id(title), hr_shifts:shift_id(name), replacement:replacement_employee_id(first_name, last_name, badge_id)",
        )
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE,
  });
}

export function useSaveHiringRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: HiringRequirementInput) => {
      const { id, ...payload } = input;
      if (id) {
        const { error } = await supabase
          .from("hr_hiring_requirements")
          .update(payload)
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data: reqNo, error: numberError } = await supabase.rpc(
        "hr_next_hiring_requirement_no",
      );
      if (numberError) throw numberError;
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("hr_hiring_requirements")
        .insert({
          ...payload,
          requirement_no: reqNo as string,
          requested_by: user?.user?.id ?? null,
          requested_by_name: user?.user?.email ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      invalidatePlanning(qc);
      toast.success("Hiring requirement saved");
    },
    onError: (e: any) => toast.error(e?.message || "Could not save the hiring requirement"),
  });
}

export function useSetRequirementStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      rejectionReason,
    }: {
      id: string;
      status: string;
      rejectionReason?: string;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      const patch: Record<string, unknown> = { status };
      if (status === "approved") {
        patch.approved_at = new Date().toISOString();
        patch.approver_id = user?.user?.id ?? null;
        patch.approver_name = user?.user?.email ?? null;
      }
      if (status === "rejected") patch.rejection_reason = rejectionReason || null;
      const { error } = await supabase
        .from("hr_hiring_requirements")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePlanning(qc);
      toast.success("Requirement updated");
    },
    onError: (e: any) => toast.error(e?.message || "Could not update the requirement"),
  });
}

/** Opens the recruitment posting for an approved requirement. */
export function useSendToRecruitment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requirementId: string) => {
      const { data, error } = await supabase.rpc("hr_send_requirement_to_recruitment", {
        p_requirement_id: requirementId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidatePlanning(qc);
      qc.invalidateQueries({ queryKey: ["recruitments"] });
      toast.success("Recruitment opening created");
    },
    onError: (e: any) => toast.error(e?.message || "Could not start recruitment"),
  });
}

export function useRequirementProgress(requirementId: string | null) {
  return useQuery({
    queryKey: ["workforce_requirement_progress", requirementId],
    enabled: !!requirementId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hr_hiring_requirement_progress", {
        p_requirement_id: requirementId as string,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row || {
        applied: 0,
        screened: 0,
        interview: 0,
        selected: 0,
        joining_pending: 0,
        joined: 0,
      }) as {
        applied: number;
        screened: number;
        interview: number;
        selected: number;
        joining_pending: number;
        joined: number;
      };
    },
    staleTime: STALE,
  });
}

export function useForecastAssumptions() {
  return useQuery({
    queryKey: ["workforce_forecast_assumptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_workforce_forecast_assumptions")
        .select("*");
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE,
  });
}

export function useSaveForecastAssumption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      departmentId,
      pct,
      notes,
    }: {
      departmentId: string | null;
      pct: number;
      notes?: string | null;
    }) => {
      let existingQuery = supabase
        .from("hr_workforce_forecast_assumptions")
        .select("id");

      existingQuery = departmentId
        ? existingQuery.eq("department_id", departmentId)
        : existingQuery.is("department_id", null);

      const { data: existing, error: lookupError } = await existingQuery.maybeSingle();
      if (lookupError) throw lookupError;

      if (existing?.id) {
        const { error } = await supabase
          .from("hr_workforce_forecast_assumptions")
          .update({ expected_monthly_attrition_pct: pct, notes: notes ?? null })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("hr_workforce_forecast_assumptions")
          .insert({
            department_id: departmentId,
            expected_monthly_attrition_pct: pct,
            notes: notes ?? null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workforce_forecast_assumptions"] });
      toast.success("Attrition assumption saved");
    },
    onError: (e: any) => toast.error(e?.message || "Could not save the assumption"),
  });
}

/** Confirmed joiners and people on notice, used by the forecast page. */
export function useWorkforceFlows() {
  return useQuery({
    queryKey: ["workforce_flows"],
    queryFn: async () => {
      const [joiners, notice, active] = await Promise.all([
        supabase
          .from("hr_candidates")
          .select("id, name, joining_date, job_position_id, recruitment_id")
          .eq("hired", true)
          .eq("converted", false)
          .not("joining_date", "is", null),
        supabase
          .from("hr_employees")
          .select("id, first_name, last_name, badge_id, resignation_status")
          .eq("is_active", true)
          .eq("resignation_status", "notice_period"),
        supabase
          .from("hr_employees")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
      ]);
      return {
        joiners: joiners.data || [],
        notice: notice.data || [],
        activeCount: active.count || 0,
      };
    },
    staleTime: STALE,
  });
}

export function useWorkforceAudit(limit = 100) {
  return useQuery({
    queryKey: ["workforce_audit", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_workforce_plan_audit")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE,
  });
}
