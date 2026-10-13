import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface JobShift { id: string; name: string }

/** The shifts a job lists (ats_jobs.shift_ids → hr_shifts), in the job's order. */
export function useJobShifts(jobId?: string | null) {
  return useQuery({
    queryKey: ["ats", "job-shifts", jobId],
    enabled: !!jobId,
    queryFn: async (): Promise<JobShift[]> => {
      const { data: job, error } = await supabase.from("ats_jobs").select("shift_ids").eq("id", jobId!).maybeSingle();
      if (error) throw error;
      const ids = ((job?.shift_ids ?? []) as string[]).filter(Boolean);
      if (!ids.length) return [];
      const { data: s, error: e2 } = await supabase.from("hr_shifts").select("id, name").in("id", ids);
      if (e2) throw e2;
      const byId = new Map((s ?? []).map((x) => [x.id, x.name as string]));
      return ids.map((id) => ({ id, name: byId.get(id) ?? "Shift" }));
    },
    staleTime: 60_000,
  });
}

/** Default hired shift: the candidate's preferred shift when it is one of the job's (by id or name). */
export function defaultHireShift(shifts: JobShift[], preferred?: string[] | null): string | null {
  if (shifts.length === 1) return shifts[0].id;
  for (const p of preferred ?? []) {
    const k = String(p).trim().toLowerCase();
    const hit = shifts.find((s) => s.id === p || s.name.trim().toLowerCase() === k);
    if (hit) return hit.id;
  }
  return null;
}

export function HireShiftPicker({ shifts, value, onChange }: { shifts: JobShift[]; value: string | null; onChange: (v: string) => void }) {
  if (shifts.length < 2) return null;
  return (
    <div className="space-y-1.5 pt-2">
      <Label htmlFor="ats-hire-shift">Hired for which shift? *</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger id="ats-hire-shift" className="text-foreground"><SelectValue placeholder="Pick the shift" /></SelectTrigger>
        <SelectContent>{shifts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">The onboarding draft gets this shift and fills that shift's staffing line.</p>
    </div>
  );
}
