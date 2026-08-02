import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

export function AssignMissingShiftsDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [bulkShift, setBulkShift] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: shifts = [] } = useQuery({
    queryKey: ["hr_shifts_active"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_shifts").select("id, name, start_time, end_time").eq("is_active", true).order("name");
      return data || [];
    },
    enabled: open,
  });

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["hr_employees_missing_shift"],
    queryFn: async () => {
      const [{ data: emps }, { data: sched }] = await Promise.all([
        (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name, is_active").order("first_name"),
        (supabase as any).from("hr_employee_shift_schedule").select("employee_id").eq("is_current", true),
      ]);
      const assigned = new Set((sched || []).map((s: any) => s.employee_id));
      return (emps || []).filter((e: any) => !assigned.has(e.id));
    },
    enabled: open,
  });

  const applyBulk = (shiftId: string) => {
    setBulkShift(shiftId);
    const next: Record<string, string> = {};
    pending.forEach((e: any) => { next[e.id] = shiftId; });
    setPicks(next);
  };

  const save = async () => {
    const entries = Object.entries(picks).filter(([, v]) => v);
    if (!entries.length) { toast.error("Pick a shift for at least one employee"); return; }
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await (supabase as any).from("hr_employee_shift_schedule").insert(
        entries.map(([employee_id, shift_id]) => ({ employee_id, shift_id, effective_from: today, is_current: true }))
      );
      if (error) throw error;
      await Promise.all(entries.map(([employee_id, shift_id]) =>
        (supabase as any).from("hr_employee_work_info").update({ shift_id }).eq("employee_id", employee_id)
      ));
      toast.success(`Shift assigned to ${entries.length} employee${entries.length === 1 ? "" : "s"}`);
      setPicks({});
      setBulkShift("");
      qc.invalidateQueries({ queryKey: ["hr_employees_missing_shift"] });
      qc.invalidateQueries({ queryKey: ["hr_setup_checklist"] });
      qc.invalidateQueries({ queryKey: ["hr_employee_shift_schedule"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to assign shifts");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign shift schedule</DialogTitle>
          <DialogDescription>Employees without a current shift schedule.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-32 animate-pulse rounded bg-muted/40" />
        ) : pending.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="h-6 w-6 text-success" />
            Every employee has a shift assigned.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Apply to all</span>
              <Select value={bulkShift} onValueChange={applyBulk}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose a shift" /></SelectTrigger>
                <SelectContent>
                  {shifts.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-[50vh] overflow-y-auto space-y-1.5 pr-1">
              {pending.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground truncate">{e.first_name} {e.last_name}</span>
                      {!e.is_active && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">Inactive</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{e.badge_id}</p>
                  </div>
                  <Select value={picks[e.id] || ""} onValueChange={(v) => setPicks((p) => ({ ...p, [e.id]: v }))}>
                    <SelectTrigger className="h-8 w-44 text-xs shrink-0"><SelectValue placeholder="Select shift" /></SelectTrigger>
                    <SelectContent>
                      {shifts.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Assign
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
