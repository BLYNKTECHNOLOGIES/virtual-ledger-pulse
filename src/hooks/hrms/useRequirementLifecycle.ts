import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidatePlanning } from "@/hooks/hrms/useWorkforcePlanning";

export interface RequirementPipeline {
  requirement_id: string;
  applied: number; new_hc: number; screening: number; assessment: number; interview: number; offer: number;
  hired: number; joining: number; joined: number; still_needed: number;
}

/** Funnel counts per requirement (hr_requirement_pipeline). Without an id: every requirement, keyed by id. */
export function useRequirementPipeline() {
  return useQuery({
    queryKey: ["workforce_hiring_requirements", "pipeline"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hr_requirement_pipeline", { p_requirement: null });
      if (error) throw error;
      const m = new Map<string, RequirementPipeline>();
      for (const r of (data ?? []) as RequirementPipeline[]) m.set(r.requirement_id, r);
      return m;
    },
    staleTime: 30_000,
  });
}

export function useRequirementAudit(id?: string | null) {
  return useQuery({
    queryKey: ["workforce_audit", "requirement", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_workforce_plan_audit")
        .select("id, field_changed, old_value, new_value, reason, changed_by_name, changed_at")
        .eq("entity", "hiring_requirement").eq("entity_id", id!).order("changed_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Open ATS jobs linked to every requirement (status per job). */
export function useRequirementJobs() {
  return useQuery({
    queryKey: ["ats", "requirement-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_jobs")
        .select("id, job_code, title, status, openings, is_published, requisition_id").not("requisition_id", "is", null).order("created_at");
      if (error) throw error;
      const m = new Map<string, any[]>();
      for (const j of data ?? []) { const k = j.requisition_id as string; m.set(k, [...(m.get(k) ?? []), j]); }
      return m;
    },
    staleTime: 30_000,
  });
}

/** Replacement requirements keyed by the leaving employee (newest first). */
export function useReplacementRequirements() {
  return useQuery({
    queryKey: ["workforce_hiring_requirements", "replacements"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_hiring_requirements")
        .select("id, requirement_no, status, replacement_employee_id, created_at")
        .not("replacement_employee_id", "is", null).order("created_at", { ascending: false });
      if (error) throw error;
      const m = new Map<string, { id: string; requirement_no: string; status: string }>();
      for (const r of data ?? []) if (!m.has(r.replacement_employee_id as string)) m.set(r.replacement_employee_id as string, r as any);
      return m;
    },
  });
}

export function useRaiseReplacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, note }: { employeeId: string; note?: string | null }) => {
      const { data, error } = await supabase.rpc("hr_raise_replacement_requirement", {
        p_employee: employeeId, p_reason: note?.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => { invalidatePlanning(qc); toast.success("Replacement requirement raised — awaiting approval"); },
    onError: (e: any) => toast.error(e?.message || "Could not raise the replacement requirement"),
  });
}

export const ONBOARDING_STATUS_LABEL: Record<string, string> = {
  draft: "Draft", in_progress: "In progress", completed: "Joined", cancelled: "Cancelled",
};
export const onboardingStatusLabel = (s?: string | null) =>
  s ? (ONBOARDING_STATUS_LABEL[s] ?? s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())) : "";

/** Onboarding record created from an ATS application (hire hand-off). */
export function useApplicationOnboarding(applicationId?: string | null) {
  return useQuery({
    queryKey: ["ats", "app-onboarding", applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_employee_onboarding")
        .select("id, status, current_stage, date_of_joining, employee_id")
        .eq("ats_application_id", applicationId!).order("created_at").limit(5);
      if (error) throw error;
      const rows = data ?? [];
      return rows.find((r) => r.status !== "cancelled") ?? rows[0] ?? null;
    },
  });
}

/** True when undoing the hire will leave onboarding in place (not an untouched draft). */
export const onboardingInProgress = (o?: { status: string; current_stage: number | null; employee_id: string | null } | null) =>
  !!o && o.status !== "cancelled" && !(o.status === "draft" && (o.current_stage ?? 1) <= 1 && !o.employee_id);
