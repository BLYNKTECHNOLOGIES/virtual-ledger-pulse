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
