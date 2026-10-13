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
        supabase.from("positions").select("id, title, department_id, in_workforce_planning").eq("is_active", true).order("title"),
        supabase
          .from("hr_shifts")
          .select("id, name, start_time, end_time, planning_shift_id, is_training_shift")
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
export function useSeatOccupancy(planningOnly = true) {
  return useQuery({
    queryKey: ["workforce_seat_occupancy", planningOnly],
    queryFn: async () => {
      const [workInfoResult, schedulesResult, shiftsResult, positionsResult] = await Promise.all([
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
        supabase.from("hr_shifts").select("id, planning_shift_id, is_training_shift"),
        supabase.from("positions").select("id, is_active, in_workforce_planning"),
      ]);
      if (workInfoResult.error) throw workInfoResult.error;
      if (schedulesResult.error) throw schedulesResult.error;
      if (shiftsResult.error) throw shiftsResult.error;
      if (positionsResult.error) throw positionsResult.error;
      const shiftById = new Map((shiftsResult.data || []).map((s: any) => [s.id, s]));
      const positionById = new Map((positionsResult.data || []).map((p: any) => [p.id, p]));

      const currentShiftByEmployee = new Map<string, string>();
      (schedulesResult.data || []).forEach((schedule) => {
        if (!currentShiftByEmployee.has(schedule.employee_id)) {
          currentShiftByEmployee.set(schedule.employee_id, schedule.shift_id);
        }
      });

      // Same people rules as the staffing matrix: positions outside planning
      // (leadership) and tentative positions never sit on the seat map; a shift
      // counts as its planning shift.
      return (workInfoResult.data || [])
        .filter((row: any) => (row.employee?.resignation_status ?? "") !== "completed")
        .filter((row: any) => {
          if (!planningOnly) return true;
          const pos = row.job_position_id ? positionById.get(row.job_position_id) : null;
          return !pos || (pos.is_active && pos.in_workforce_planning !== false);
        })
        .map((row) => {
          const raw = currentShiftByEmployee.get(row.employee_id) ?? row.shift_id ?? null;
          const shift = raw ? shiftById.get(raw) : null;
          return {
            ...row,
            raw_shift_id: raw,
            shift_id: raw ? shift?.planning_shift_id || raw : null,
            is_training: !!shift?.is_training_shift,
          };
        });
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
  seat_capacity_id?: string | null;
  follow_desks?: boolean;
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
    "workforce_line_people",
    "workforce_trainees",
    "workforce_seat_occupancy",
    "workforce_lookups",
    "ats",
  ].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
}

export { invalidatePlanning };

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
    mutationFn: async (arg: string | { id: string; reason: string }) => {
      const { id, reason } = typeof arg === "string" ? { id: arg, reason: null } : arg;
      const { error } = await supabase
        .from("hr_headcount_plans")
        .update(reason ? { is_active: false, notes: reason } : { is_active: false })
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
  is_training_only?: boolean;
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
  staffing_plan_id?: string | null;
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

/** Fields an approved / recruiting requirement may still change (with a reason). */
export const LIMITED_REQUIREMENT_FIELDS = [
  "number_required", "target_joining_date", "salary_min", "salary_max", "required_skills", "notes", "staffing_plan_id",
] as const;
const ALL_REQUIREMENT_FIELDS = [
  ...LIMITED_REQUIREMENT_FIELDS, "department_id", "position_id", "shift_id", "shift_label", "location", "employment_type",
  "reason", "reason_notes", "experience_required", "priority", "staffing_plan_id", "replacement_employee_id",
] as const;

export function useSaveHiringRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: HiringRequirementInput & { editReason?: string | null }) => {
      const { id, editReason, approver_name: _ignored, ...payload } = input;
      if (id) {
        // Edits go through hr_update_requirement (audited, status-aware); status only via the transition RPC.
        const { status, ...rest } = payload;
        const { data: before, error: readError } = await supabase
          .from("hr_hiring_requirements").select("status").eq("id", id).single();
        if (readError) throw readError;
        const full = ["draft", "pending_approval"].includes(before?.status ?? "");
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          const allowed: readonly string[] = full ? ALL_REQUIREMENT_FIELDS : LIMITED_REQUIREMENT_FIELDS;
          if (allowed.includes(k)) patch[k] = v;
        }
        const { error } = await (supabase.rpc as any)("hr_update_requirement", {
          p_id: id, p_patch: patch, p_reason: editReason?.trim() || null,
        });
        if (error) throw error;
        if (before?.status === "draft" && status === "pending_approval") {
          const { error: tErr } = await (supabase.rpc as any)("hr_requirement_transition", {
            p_id: id, p_action: "submit", p_reason: null,
          });
          if (tErr) throw tErr;
        }
        return id;
      }
      const { data: reqNo, error: numberError } = await supabase.rpc(
        "hr_next_hiring_requirement_no",
      );
      if (numberError) throw numberError;
      const { data: user } = await supabase.auth.getUser();
      const uid = user?.user?.id ?? null;
      let byName: string | null = user?.user?.email ?? null;
      if (uid) {
        const { data: u } = await supabase.from("users").select("first_name, last_name, username").eq("id", uid).maybeSingle();
        const n = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
        byName = n || u?.username || byName;
      }
      const { data, error } = await supabase
        .from("hr_hiring_requirements")
        .insert({
          ...payload,
          source: "manual",
          requirement_no: reqNo as string,
          requested_by: uid,
          requested_by_name: byName,
        } as any)
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

export type RequirementAction = "submit" | "approve" | "reject" | "cancel" | "reopen";

/** The only way the screens change a requirement's status (hr_requirement_transition). */
export function useRequirementTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: RequirementAction; reason?: string | null }) => {
      const { data, error } = await (supabase.rpc as any)("hr_requirement_transition", {
        p_id: id, p_action: action, p_reason: reason?.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_d, v) => {
      invalidatePlanning(qc);
      const word: Record<RequirementAction, string> = {
        submit: "submitted for approval", approve: "approved", reject: "rejected", cancel: "cancelled", reopen: "reopened as a draft",
      };
      toast.success(`Requirement ${word[v.action]}`);
    },
    onError: (e: any) => toast.error(e?.message || "Could not update the requirement"),
  });
}

/** Back-compat wrapper used by the requirement detail dialog. */
export function useSetRequirementStatus() {
  const t = useRequirementTransition();
  const map: Record<string, RequirementAction> = {
    approved: "approve", rejected: "reject", cancelled: "cancel", pending_approval: "submit", draft: "reopen",
  };
  return {
    ...t,
    mutate: (
      { id, status, rejectionReason }: { id: string; status: string; rejectionReason?: string },
      opts?: Parameters<typeof t.mutate>[1],
    ) => t.mutate({ id, action: map[status] ?? (status as RequirementAction), reason: rejectionReason }, opts),
  };
}

export interface LinePerson {
  kind: "on_roll" | "trainee";
  employee_id: string;
  full_name: string | null;
  badge_id: string | null;
  shift_name: string | null;
  on_notice: boolean;
  last_working_day: string | null;
  ready_date: string | null;
  post_training_shift_id: string | null;
  post_training_shift_name: string | null;
}

export function useLinePeople(planId?: string | null) {
  return useQuery({
    queryKey: ["workforce_line_people", planId],
    enabled: !!planId,
    queryFn: async (): Promise<LinePerson[]> => {
      const { data, error } = await (supabase.rpc as any)("hr_workforce_line_people", { p_plan_id: planId });
      if (error) throw error;
      return (data || []) as LinePerson[];
    },
    staleTime: STALE,
  });
}

export interface TraineeRow {
  employee_id: string;
  full_name: string | null;
  badge_id: string | null;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_title: string | null;
  training_end_date: string | null;
  post_training_shift_id: string | null;
  post_training_shift_name: string | null;
  plan_id: string | null;
  line_label: string | null;
}

export function useWorkforceTrainees() {
  return useQuery({
    queryKey: ["workforce_trainees"],
    queryFn: async (): Promise<TraineeRow[]> => {
      const { data, error } = await (supabase.rpc as any)("hr_workforce_trainees");
      if (error) throw error;
      return (data || []) as TraineeRow[];
    },
    staleTime: STALE,
  });
}

export function useSetPostTrainingShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, shiftId }: { employeeId: string; shiftId: string | null }) => {
      const { error } = await (supabase.rpc as any)("hr_set_post_training_shift", {
        p_employee: employeeId, p_shift: shiftId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidatePlanning(qc);
      toast.success("After-training shift saved");
    },
    onError: (e: any) => toast.error(e?.message || "Could not save the after-training shift"),
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
          .from("hr_employee_onboarding")
          .select("id, first_name, last_name, date_of_joining, position_id")
          .not("status", "in", "(completed,cancelled)")
          .not("date_of_joining", "is", null),
        supabase
          .from("hr_employees")
          .select("id, first_name, last_name, badge_id, resignation_status, last_working_day, notice_period_end_date, hr_employee_work_info!hr_employee_work_info_employee_id_fkey(department_id)")
          .eq("is_active", true)
          .eq("resignation_status", "notice_period"),
        supabase
          .from("hr_employees")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
      ]);
      return {
        joiners: (joiners.data || []).map((r: any) => ({
          id: r.id,
          name: [r.first_name, r.last_name].filter(Boolean).join(" "),
          joining_date: r.date_of_joining,
          job_position_id: r.position_id,
        })),
        notice: (notice.data || []).map((r: any) => {
          const wi = Array.isArray(r.hr_employee_work_info) ? r.hr_employee_work_info[0] : r.hr_employee_work_info;
          return { ...r, department_id: wi?.department_id ?? null, exit_date: r.last_working_day ?? r.notice_period_end_date ?? null };
        }),
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
