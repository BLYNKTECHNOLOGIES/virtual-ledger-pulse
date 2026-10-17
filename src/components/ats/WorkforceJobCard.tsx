import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/ats/AtsBits";
import { useStaffingMatrix } from "@/hooks/hrms/useWorkforcePlanning";
import { useRequirementPipeline } from "@/hooks/hrms/useRequirementLifecycle";
import { REQ_STATUS_CLASS, REQ_STATUS_LABEL } from "@/lib/hrms/workforce";

/** Workforce Planning context for an ATS job linked to a hiring requirement. */
export function WorkforceJobCard({ requirementId }: { requirementId: string }) {
  // Own cache key: the requirement details dialog caches the full row under ["workforce_hiring_requirements","one",id].
  const req = useQuery({
    queryKey: ["workforce_hiring_requirements", "job_card", requirementId],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_hiring_requirements")
        .select("id, requirement_no, status, number_required, positions_filled, staffing_plan_id").eq("id", requirementId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const matrix = useStaffingMatrix();
  const pipeline = useRequirementPipeline();
  const r = req.data;
  if (req.isLoading) return null;
  if (req.isError) return <SectionCard title="Workforce"><p className="text-sm text-destructive">Couldn't load the linked hiring requirement.</p></SectionCard>;
  if (!r) return null;
  const line = r.staffing_plan_id ? matrix.rows.find((l) => l.plan_id === r.staffing_plan_id) : undefined;
  const pct = r.number_required > 0 ? Math.min(100, (r.positions_filled / r.number_required) * 100) : 0;
  const p = pipeline.data?.get(r.id);
  return (
    <SectionCard title="Workforce">
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/hrms/workforce-planning/hiring-requirements?req=${r.id}`} className="t-mono text-primary hover:underline">{r.requirement_no}</Link>
          <Badge variant="outline" className={REQ_STATUS_CLASS[r.status]}>{REQ_STATUS_LABEL[r.status] ?? r.status}</Badge>
        </div>
        {matrix.isLoading ? <p className="text-muted-foreground">Loading the staffing line…</p> : line ? (
          <p className="text-muted-foreground">
            {line.department_name} · {line.position_title} · {line.shiftLabel} — required <span className="text-foreground">{line.required_hc}</span>,
            on roll <span className="text-foreground">{line.current_hc}</span>, short <span className="text-foreground">{Math.max(0, line.staffingGap)}</span>
          </p>
        ) : <p className="text-muted-foreground">Not linked to a staffing line.</p>}
        {p && (
          <p className="text-xs tabular-nums text-muted-foreground">
            Applied {p.applied} · Interview {p.interview} · Offer {p.offer} · Hired {p.hired} · Joining {p.joining} · Joined {p.joined}
          </p>
        )}
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Filled</span><span>{r.positions_filled} of {r.number_required}</span></div>
          <Progress value={pct} />
        </div>
      </div>
    </SectionCard>
  );
}
