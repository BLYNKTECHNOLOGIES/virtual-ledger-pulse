import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkforceLookups } from "@/hooks/hrms/useWorkforcePlanning";
import { shiftsOutsideLine } from "@/lib/hrms/workforce";

/** Says when a job lists shifts outside its linked requirement's staffing line. */
export function JobLineShiftNotice({ requirementId, jobShiftIds }: { requirementId?: string | null; jobShiftIds: string[] }) {
  const lookups = useWorkforceLookups();
  const line = useQuery({
    queryKey: ["workforce_hiring_requirements", "line-shifts", requirementId],
    enabled: !!requirementId,
    queryFn: async () => {
      const { data: r, error } = await supabase.from("hr_hiring_requirements")
        .select("requirement_no, staffing_plan_id, shift_label").eq("id", requirementId!).maybeSingle();
      if (error) throw error;
      if (!r?.staffing_plan_id) return null;
      const { data: p } = await supabase.from("hr_headcount_plans").select("shift_id, eligible_shift_ids").eq("id", r.staffing_plan_id).maybeSingle();
      const ids = ((p?.eligible_shift_ids as string[] | null)?.length ? p!.eligible_shift_ids : p?.shift_id ? [p.shift_id] : []) as string[];
      return { no: r.requirement_no as string, label: r.shift_label as string | null, ids };
    },
  });
  if (!requirementId || !line.data || !jobShiftIds.length) return null;
  const outside = shiftsOutsideLine((lookups.data?.shifts ?? []) as any[], jobShiftIds, line.data.ids);
  if (!outside.length) return null;
  const names = outside.map((s) => s.name.replace(/ Shift$/i, ""));
  return (
    <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
      {line.data.no} is for {line.data.label || "one shift"}. Hires for {names.join(" or ")} will be asked which shift they are hired for,
      and fill that shift's line instead of {line.data.no}.
    </p>
  );
}
