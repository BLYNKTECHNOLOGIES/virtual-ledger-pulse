import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** "From ATS: <job code> · <requirement number>" for onboarding records created by the hire hand-off. */
export function OnboardingAtsOrigin({ applicationId }: { applicationId?: string | null }) {
  const q = useQuery({
    queryKey: ["ats", "onboarding-origin", applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data: app, error } = await supabase.from("ats_applications")
        .select("id, candidate_id, job_id").eq("id", applicationId!).maybeSingle();
      if (error) throw error;
      if (!app?.job_id) return { app, job: null as any, req: null as any };
      const { data: job } = await supabase.from("ats_jobs").select("id, job_code, requisition_id").eq("id", app.job_id).maybeSingle();
      // The requirement this onboarding actually fills (a shared job feeds several); the job's main link only as fallback.
      const { data: ob } = await supabase.from("hr_employee_onboarding").select("hiring_requirement_id")
        .eq("ats_application_id", app.id).neq("status", "cancelled").limit(1).maybeSingle();
      const reqId = (ob as any)?.hiring_requirement_id ?? job?.requisition_id ?? null;
      const { data: req } = reqId
        ? await supabase.from("hr_hiring_requirements").select("id, requirement_no").eq("id", reqId).maybeSingle()
        : { data: null };
      return { app, job, req };
    },
  });
  if (!applicationId || !q.data?.app) return null;
  const { app, job, req } = q.data;
  return (
    <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      From ATS:{" "}
      <Link className="text-primary hover:underline" to={job ? `/hrms/ats/jobs/${job.id}` : `/hrms/ats/candidates/${app.candidate_id}`}>{job?.job_code ?? "general application"}</Link>
      {" · "}<Link className="text-primary hover:underline" to={`/hrms/ats/candidates/${app.candidate_id}`}>candidate</Link>
      {req && <>{" · "}<Link className="text-primary hover:underline" to={`/hrms/workforce-planning/hiring-requirements?req=${req.id}`}>{req.requirement_no}</Link></>}
    </p>
  );
}
