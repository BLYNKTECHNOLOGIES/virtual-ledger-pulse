import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { atsErrorMessage } from "./errors";

export type AtsJob = Tables<"ats_jobs">;
export type AtsJobInsert = TablesInsert<"ats_jobs">;
export type AtsJobUpdate = TablesUpdate<"ats_jobs">;
export type AtsStage = Tables<"ats_stages">;
export type AtsSource = Tables<"ats_sources">;
export type AtsReason = Tables<"ats_reject_reasons">;
export type AtsSettings = Tables<"ats_settings">;
export type AtsEvent = Tables<"ats_events">;

export interface AtsOverview {
  open_jobs: number; open_seats: number; draft_jobs: number; paused_jobs: number;
  applications_7d: number; applications_30d: number; in_pipeline: number; unreviewed: number;
  idle: number; idle_days: number; hired_this_month: number; rejected_this_month: number;
  stage_counts: { stage_id: string; code: string; name: string; sort_order: number; count: number }[];
  source_counts_30d: { source_id: string | null; name: string; count: number }[];
}

export interface JobSummaryRow {
  job_id: string; total_applications: number; active_count: number; on_hold_count: number;
  rejected_count: number; withdrawn_count: number; hired_count: number; unreviewed_count: number;
  new_7d: number; last_applied_at: string | null; stage_counts: Record<string, number>;
}

export const useIsHrAdmin = () =>
  useQuery({
    queryKey: ["ats", "is-hr-admin"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hr_is_hr_admin" as any);
      if (error) throw error;
      return data === true;
    },
  });

export const useCanManageAtsSettings = () =>
  useQuery({
    queryKey: ["ats", "can-manage-settings"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ats_can_manage_settings" as any);
      if (error) throw error;
      return data === true;
    },
  });

export const atsKeys = {
  overview: ["ats", "overview"] as const,
  jobs: ["ats", "jobs"] as const,
  job: (id: string) => ["ats", "job", id] as const,
  jobSummary: ["ats", "job-summary"] as const,
  jobEvents: (id: string) => ["ats", "events", "job", id] as const,
  stages: ["ats", "stages"] as const,
  sources: ["ats", "sources"] as const,
  reasons: ["ats", "reasons"] as const,
  settings: ["ats", "settings"] as const,
  lookup: (name: string) => ["ats", "lookup", name] as const,
};

const unwrap = <T,>(r: { data: T | null; error: any }): T => {
  if (r.error) throw r.error;
  return r.data as T;
};

/* ---------- queries ---------- */
export const useAtsOverview = () =>
  useQuery({
    queryKey: atsKeys.overview,
    queryFn: async () => unwrap(await supabase.rpc("ats_overview_stats")) as unknown as AtsOverview,
  });

export const useAtsJobs = () =>
  useQuery({
    queryKey: atsKeys.jobs,
    queryFn: async () => unwrap(await supabase.from("ats_jobs").select("*").order("updated_at", { ascending: false })) as AtsJob[],
  });

export const useAtsJob = (id?: string) =>
  useQuery({
    queryKey: atsKeys.job(id ?? ""),
    enabled: !!id,
    queryFn: async () => unwrap(await supabase.from("ats_jobs").select("*").eq("id", id!).maybeSingle()) as AtsJob | null,
  });

export const useAtsJobSummary = () =>
  useQuery({
    queryKey: atsKeys.jobSummary,
    queryFn: async () => {
      const rows = unwrap(await supabase.from("ats_job_summary").select("*")) as any[];
      const map = new Map<string, JobSummaryRow>();
      for (const r of rows ?? []) map.set(r.job_id, { ...r, stage_counts: (r.stage_counts ?? {}) as Record<string, number> });
      return map;
    },
  });

export const useAtsJobEvents = (id?: string) =>
  useQuery({
    queryKey: atsKeys.jobEvents(id ?? ""),
    enabled: !!id,
    queryFn: async () =>
      unwrap(await supabase.from("ats_events").select("*").eq("job_id", id!).order("created_at", { ascending: false }).limit(100)) as AtsEvent[],
  });

export const useAtsStages = () =>
  useQuery({
    queryKey: atsKeys.stages,
    queryFn: async () => unwrap(await supabase.from("ats_stages").select("*").order("sort_order")) as AtsStage[],
  });

export const useAtsSources = () =>
  useQuery({
    queryKey: atsKeys.sources,
    queryFn: async () => unwrap(await supabase.from("ats_sources").select("*").order("sort_order").order("name")) as AtsSource[],
  });

export const useAtsReasons = () =>
  useQuery({
    queryKey: atsKeys.reasons,
    queryFn: async () => unwrap(await supabase.from("ats_reject_reasons").select("*").order("sort_order").order("label")) as AtsReason[],
  });

export const useAtsSettings = () =>
  useQuery({
    queryKey: atsKeys.settings,
    queryFn: async () => unwrap(await supabase.from("ats_settings").select("*").maybeSingle()) as AtsSettings | null,
  });

/* ---------- read-only lookups (non-ATS tables, SELECT only) ---------- */
export interface Lookup { id: string; label: string; [k: string]: any }

export const useDepartmentsLookup = () =>
  useQuery({
    queryKey: atsKeys.lookup("departments"),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows = unwrap(await supabase.from("departments").select("id,name,is_active").eq("is_active", true).order("name")) as any[];
      return rows.map((r) => ({ id: r.id, label: r.name })) as Lookup[];
    },
  });

export const usePositionsLookup = () =>
  useQuery({
    queryKey: atsKeys.lookup("positions"),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows = unwrap(await supabase.from("positions").select("id,title,department_id,is_active").eq("is_active", true).order("title")) as any[];
      return rows.map((r) => ({ id: r.id, label: r.title, department_id: r.department_id })) as Lookup[];
    },
  });

export const useShiftsLookup = () =>
  useQuery({
    queryKey: atsKeys.lookup("shifts"),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows = unwrap(await supabase.from("hr_shifts").select("id,name,start_time,end_time,is_active").eq("is_active", true).order("name")) as any[];
      return rows.map((r) => ({
        id: r.id,
        label: `${r.name} (${String(r.start_time ?? "").slice(0, 5)}–${String(r.end_time ?? "").slice(0, 5)})`,
      })) as Lookup[];
    },
  });

export const useEmployeesLookup = () =>
  useQuery({
    queryKey: atsKeys.lookup("employees"),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows = unwrap(await supabase.from("hr_employees").select("id,first_name,last_name,is_active").eq("is_active", true).order("first_name")) as any[];
      return rows.map((r) => ({ id: r.id, label: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unnamed" })) as Lookup[];
    },
  });

/** Requirements an ATS job may be opened for: approved or recruiting only, with what is still to be found. */
export const useRequirementsLookup = () =>
  useQuery({
    queryKey: atsKeys.lookup("requirements"),
    staleTime: 60_000,
    queryFn: async () => {
      const [rows, pipe, plans] = await Promise.all([
        supabase
          .from("hr_hiring_requirements")
          .select("id,requirement_no,department_id,position_id,shift_id,shift_label,location,employment_type,number_required,positions_filled,required_skills,experience_required,salary_min,salary_max,status,staffing_plan_id")
          .in("status", REQUIREMENT_PICKER_STATUSES as unknown as string[])
          .order("requirement_no"),
        supabase.rpc("hr_requirement_pipeline", { p_requirement: null }),
        supabase.from("hr_headcount_plans").select("id,shift_id,eligible_shift_ids"),
      ]);
      const list = unwrap(rows) as any[];
      if (pipe.error) throw pipe.error;
      if (plans.error) throw plans.error;
      const planShifts = new Map<string, string[]>(((plans.data ?? []) as any[]).map((p) => [
        p.id as string,
        (p.eligible_shift_ids?.length ? p.eligible_shift_ids : p.shift_id ? [p.shift_id] : []) as string[],
      ]));
      const need = new Map<string, number>(((pipe.data ?? []) as any[]).map((p) => [p.requirement_id, p.still_needed]));
      return list.map((r) => ({
        ...r,
        still_needed: need.get(r.id) ?? Math.max((r.number_required ?? 0) - (r.positions_filled ?? 0), 0),
        // Shifts the requirement's staffing line covers; null = no line / unrestricted (covers any shift).
        plan_shift_ids: r.staffing_plan_id ? planShifts.get(r.staffing_plan_id) ?? [] : null,
      }));
    },
  });

export const REQUIREMENT_PICKER_STATUSES = ["approved", "recruitment_active", "partially_fulfilled"] as const;

/* ---------- mutations ---------- */
export function useAtsMutation<TVars>(
  fn: (v: TVars) => Promise<unknown>,
  opts: { invalidate: (v: TVars) => QueryKey[]; success?: string | ((v: TVars) => string); inUse?: string; onSuccess?: (data: any, v: TVars) => void; pageErrors?: boolean; refetchOnError?: boolean },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, v) => {
      for (const k of [...opts.invalidate(v), atsKeys.overview]) qc.invalidateQueries({ queryKey: k });
      const s = typeof opts.success === "function" ? opts.success(v) : opts.success;
      if (s) toast.success(s);
      opts.onSuccess?.(data, v);
    },
    onError: (e, v) => {
      if (opts.refetchOnError) for (const k of opts.invalidate(v)) qc.invalidateQueries({ queryKey: k });
      const own = opts.pageErrors && e instanceof Error && !(e as { code?: unknown }).code;
      toast.error(own ? e.message : atsErrorMessage(e, opts.inUse));
    },
  });
}

const jobKeys = (id?: string): QueryKey[] =>
  [atsKeys.jobs, atsKeys.jobSummary, ...(id ? [atsKeys.job(id), atsKeys.jobEvents(id)] : [])];

export const createJob = async (v: Omit<AtsJobInsert, "slug">) =>
  unwrap(await supabase.from("ats_jobs").insert({ ...v, slug: "" }).select("*").single()) as AtsJob;
export const updateJob = async ({ id, patch }: { id: string; patch: AtsJobUpdate }) =>
  unwrap(await supabase.from("ats_jobs").update(patch).eq("id", id).select("*").single()) as AtsJob;
export const deleteJob = async (id: string) => {
  const { error } = await supabase.from("ats_jobs").delete().eq("id", id);
  if (error) throw error;
};
export { jobKeys };
