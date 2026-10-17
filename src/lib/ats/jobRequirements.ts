import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { diffLinks } from "./jobRequirementDiff";

export { diffLinks };

/** Extra requirement links of one job (ats_job_requirements; the job's requisition_id is separate). */
export function useJobRequirementLinks(jobId?: string | null) {
  return useQuery({
    queryKey: ["ats", "job-requirement-links", jobId],
    enabled: !!jobId,
    queryFn: async (): Promise<string[]> => {
      if (!jobId) return [];
      const { data, error } = await supabase.from("ats_job_requirements" as any).select("requirement_id").eq("job_id", jobId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.requirement_id as string);
    },
    staleTime: 30_000,
  });
}

export interface LinkedJobRef { jobId: string; jobTitle: string }

/** requirement_id → the open/paused job already feeding it (single link + link table). */
export function useActiveJobRequirementLinks(excludeJobId?: string | null) {
  return useQuery({
    queryKey: ["ats", "active-job-requirement-links", excludeJobId ?? null],
    queryFn: async (): Promise<Map<string, LinkedJobRef>> => {
      const [{ data: jobs, error: e1 }, { data: links, error: e2 }] = await Promise.all([
        supabase.from("ats_jobs").select("id, title, requisition_id").in("status", ["open", "paused"]),
        supabase.from("ats_job_requirements" as any).select("job_id, requirement_id"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const titles = new Map((jobs ?? []).map((j: any) => [j.id as string, j.title as string]));
      const m = new Map<string, LinkedJobRef>();
      for (const j of jobs ?? []) {
        if (j.requisition_id && j.id !== excludeJobId && !m.has(j.requisition_id)) m.set(j.requisition_id, { jobId: j.id, jobTitle: j.title });
      }
      for (const l of (links ?? []) as any[]) {
        if (l.job_id === excludeJobId || m.has(l.requirement_id)) continue;
        const t = titles.get(l.job_id);
        if (t) m.set(l.requirement_id, { jobId: l.job_id, jobTitle: t });
      }
      return m;
    },
    staleTime: 30_000,
  });
}

/** Make ats_job_requirements match the desired set for a job (requisition_id stays on the job row). */
export async function syncJobRequirementLinks(jobId: string, desired: string[], primaryId: string | null) {
  const { data, error } = await supabase.from("ats_job_requirements" as any).select("requirement_id").eq("job_id", jobId);
  if (error) throw error;
  const { add, remove } = diffLinks(((data ?? []) as any[]).map((r) => r.requirement_id as string), desired, primaryId);
  if (remove.length) {
    const { error: e } = await supabase.from("ats_job_requirements" as any).delete().eq("job_id", jobId).in("requirement_id", remove);
    if (e) throw e;
  }
  if (add.length) {
    const { error: e } = await supabase.from("ats_job_requirements" as any).insert(add.map((requirement_id) => ({ job_id: jobId, requirement_id })));
    if (e) throw e;
  }
}

/** Create/update a job and replace its requirement links in one server transaction (ats_save_job). */
export async function saveJobWithLinks(jobId: string | null, job: Record<string, unknown>, links: string[]) {
  const { data, error } = await (supabase.rpc as any)("ats_save_job", { p_job_id: jobId, p_job: job, p_links: links });
  if (error) throw error;
  return data as any;
}

export interface OpenJobRef { id: string; job_code: string | null; title: string; department_id: string | null; position_id: string | null; shift_ids: string[] | null }

/**
 * Open/paused jobs a requirement could join instead of a new posting: same department, the job's
 * role among the requirement line's roles, and a job shift on the requirement's line.
 */
export function matchingJobsForRequirement(
  jobs: OpenJobRef[],
  req: { department_id?: string | null; position_id?: string | null },
  planRoleIds: string[] | null, planShiftIds: string[] | null,
): OpenJobRef[] {
  const roles = [...(planRoleIds ?? []), ...(req.position_id ? [req.position_id] : [])];
  return jobs.filter((j) =>
    (!j.department_id || !req.department_id || j.department_id === req.department_id) &&
    !!j.position_id && roles.includes(j.position_id) &&
    (!planShiftIds?.length || !(j.shift_ids ?? []).length || (j.shift_ids ?? []).some((s) => planShiftIds.includes(s))));
}

/** Open jobs per requirement id that can take that requirement as another shift link. */
export function useLinkableJobs(requirements: { id: string; department_id?: string | null; position_id?: string | null; staffing_plan_id?: string | null }[]) {
  const ids = requirements.map((r) => r.id).sort().join(",");
  return useQuery({
    queryKey: ["ats", "linkable-jobs", ids],
    enabled: requirements.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, OpenJobRef[]>> => {
      const [{ data: jobs, error: e1 }, { data: plans, error: e2 }] = await Promise.all([
        supabase.from("ats_jobs").select("id, job_code, title, department_id, position_id, shift_ids").in("status", ["open", "paused"]).order("created_at"),
        supabase.from("hr_headcount_plans").select("id, shift_id, eligible_shift_ids, position_id, eligible_position_ids"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const pm = new Map(((plans ?? []) as any[]).map((p) => [p.id as string, p]));
      const m = new Map<string, OpenJobRef[]>();
      for (const r of requirements) {
        const p = r.staffing_plan_id ? pm.get(r.staffing_plan_id) : null;
        const roles = p ? (p.eligible_position_ids?.length ? p.eligible_position_ids : p.position_id ? [p.position_id] : []) : null;
        const shifts = p ? (p.eligible_shift_ids?.length ? p.eligible_shift_ids : p.shift_id ? [p.shift_id] : []) : null;
        m.set(r.id, matchingJobsForRequirement((jobs ?? []) as OpenJobRef[], r, roles, shifts));
      }
      return m;
    },
  });
}
