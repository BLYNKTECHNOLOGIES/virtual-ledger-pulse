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
      const { data: req } = job?.requisition_id
        ? await supabase.from("hr_hiring_requirements").select("id, requirement_no").eq("id", job.requisition_id).maybeSingle()
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
