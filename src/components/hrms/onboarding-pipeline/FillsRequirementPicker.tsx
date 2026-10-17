import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const RECRUITING = ["approved", "recruitment_active", "partially_fulfilled"];

/**
 * "Fills hiring requirement": open approved / recruiting requirements of the same department and role.
 * Prefilled once from hr_wf_suggest_requirement (the same rule the ATS hire uses) while HR hasn't chosen.
 */
export function FillsRequirementPicker({ departmentId, positionId, shiftId, value, onChange, disabled, declined, onDecline }: {
  departmentId?: string | null; positionId?: string | null; shiftId?: string | null;
  value: string; onChange: (v: string) => void; disabled?: boolean;
  /** HR explicitly chose "None" — never suggest again. */
  declined?: boolean; onDecline?: () => void;
}) {
  const touched = useRef(false);
  const opts = useQuery({
    queryKey: ["workforce_hiring_requirements", "fillable", departmentId, positionId],
    enabled: !!departmentId && !!positionId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_hiring_requirements")
        .select("id, requirement_no, shift_label, number_required, positions_filled, status, position_id, staffing_plan_id")
        .eq("department_id", departmentId!).in("status", RECRUITING).order("requested_at");
      if (error) throw error;
      const { data: pipe } = await supabase.rpc("hr_requirement_pipeline", { p_requirement: null });
      const left = new Map<string, number>(((pipe ?? []) as any[]).map((p) => [p.requirement_id, p.still_needed]));
      const { data: lines } = await supabase.from("hr_headcount_plans").select("id, position_id, eligible_position_ids, shift_id, hr_shifts:shift_id(name)");
      const roles = new Map<string, string[]>(((lines ?? []) as any[]).map((l) => [l.id, l.eligible_position_ids?.length ? l.eligible_position_ids : [l.position_id]]));
      return (data ?? [])
        .filter((r: any) => (r.staffing_plan_id ? roles.get(r.staffing_plan_id) ?? [r.position_id] : [r.position_id]).includes(positionId))
        .map((r: any) => ({ ...r, line_label: ((lines ?? []) as any[]).find((l) => l.id === r.staffing_plan_id)?.hr_shifts?.name ?? null, still: left.get(r.id) ?? Math.max(0, r.number_required - r.positions_filled) }));
    },
    staleTime: 30_000,
  });
  const suggest = useQuery({
    queryKey: ["workforce_hiring_requirements", "suggest", departmentId, positionId, shiftId],
    enabled: !!departmentId && !!positionId && !value && !disabled && !declined,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hr_wf_suggest_requirement", {
        p_department: departmentId, p_position: positionId, p_shift: shiftId || null, p_preferred: null,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
  useEffect(() => {
    if (!touched.current && !value && !declined && suggest.data) onChange(suggest.data);
  }, [suggest.data, value, onChange, declined]);

  const list = opts.data ?? [];
  const current = value && !list.some((r: any) => r.id === value) ? value : null;
  return (
    <div className="sm:col-span-2">
      <Label>Fills hiring request</Label>
      <Select value={value || "none"} disabled={disabled || !departmentId || !positionId}
        onValueChange={(v) => { touched.current = true; if (v === "none") (onDecline ? onDecline() : onChange("")); else onChange(v); }}>
        <SelectTrigger className="text-foreground"><SelectValue placeholder={positionId ? "None" : "Pick the designation first"} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None — not filling a request</SelectItem>
          {current && <SelectItem value={current}>Current request</SelectItem>}
          {list.map((r: any) => (
            <SelectItem key={r.id} value={r.id}>{r.requirement_no} · {r.shift_label || r.line_label || "Any shift"} · still to find {r.still}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 text-xs text-muted-foreground">
        When this person joins, the request counts them as filled and its ATS job's openings go down. Changeable until they join.
      </p>
    </div>
  );
}
