import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, CalendarDays, RotateCcw } from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function WeeklyOffManager() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", weekly_offs: [0] as number[], is_alternating: false, alternate_week_offs: [] as number[] });

  const { data: patterns = [] } = useQuery({
    queryKey: ["hr_weekly_off_patterns"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_weekly_off_patterns").select("*").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_weekly_off_patterns").insert({
        name: form.name,
        weekly_offs: form.weekly_offs,
        is_alternating: form.is_alternating,
        alternate_week_offs: form.is_alternating ? form.alternate_week_offs : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_weekly_off_patterns"] });
      setShowDialog(false);
      setForm({ name: "", weekly_offs: [0], is_alternating: false, alternate_week_offs: [] });
      toast.success("Weekly-off pattern created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleDay = (day: number, field: "weekly_offs" | "alternate_week_offs") => {
    const current = form[field];
    setForm({
      ...form,
      [field]: current.includes(day) ? current.filter(d => d !== day) : [...current, day],
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> Weekly-Off Patterns
        </CardTitle>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowDialog(true)}>
          <Plus className="h-3 w-3" /> Add Pattern
        </Button>
      </CardHeader>
      <CardContent>
        {patterns.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No patterns configured</p>
        ) : (
          <div className="space-y-2">
            {patterns.map((p: any) => (
              <div key={p.id} className="border border-border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  <div className="flex gap-1 mt-1">
                    {(p.weekly_offs || []).map((d: number) => (
                      <span key={d} className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded font-medium">
                        {DAYS[d]}
                      </span>
                    ))}
                    {p.is_alternating && p.alternate_week_offs?.length > 0 && (
                      <>
                        <span className="text-[10px] text-muted-foreground mx-1">alt:</span>
                        {p.alternate_week_offs.map((d: number) => (
                          <span key={`alt-${d}`} className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-medium">
                            {DAYS[d]}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
                {p.is_alternating && <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Weekly-Off Pattern</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Pattern Name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Alt Saturday-Sunday" />
            </div>
            <div>
              <Label className="mb-2 block">Weekly Offs</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i, "weekly_offs")}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      form.weekly_offs.includes(i)
                        ? "bg-red-100 text-red-700 border-red-300"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_alternating}
                onChange={e => setForm({ ...form, is_alternating: e.target.checked })}
                className="rounded"
              />
              <Label className="text-sm cursor-pointer">Alternating weekly offs (e.g., alternate Saturdays)</Label>
            </div>
            {form.is_alternating && (
              <div>
                <Label className="mb-2 block">Alternate Week Offs</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day, i) => (
                    <button
                      key={i}
                      onClick={() => toggleDay(i, "alternate_week_offs")}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        form.alternate_week_offs.includes(i)
                          ? "bg-amber-100 text-amber-700 border-amber-300"
                          : "bg-background text-muted-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || form.weekly_offs.length === 0}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function ShiftScheduleAssigner() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ employee_id: "", shift_id: "", effective_from: "" });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active_list"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employees").select("id, first_name, last_name, badge_id").eq("is_active", true).order("first_name");
      return data || [];
    },
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["hr_shifts_active"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_shifts").select("id, name, start_time, end_time").eq("is_active", true);
      return data || [];
    },
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ["hr_employee_shift_schedule"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_employee_shift_schedule")
        .select("*, hr_employees!hr_employee_shift_schedule_employee_id_fkey(first_name, last_name, badge_id), hr_shifts!hr_employee_shift_schedule_shift_id_fkey(name)")
        .eq("is_current", true)
        .order("effective_from", { ascending: false });
      return data || [];
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      // Deactivate old schedules
      await (supabase as any)
        .from("hr_employee_shift_schedule")
        .update({ is_current: false })
        .eq("employee_id", form.employee_id)
        .eq("is_current", true);
      
      const { error } = await (supabase as any).from("hr_employee_shift_schedule").insert({
        employee_id: form.employee_id,
        shift_id: form.shift_id,
        effective_from: form.effective_from,
        is_current: true,
      });
      if (error) throw error;

      // Also update work info
      await (supabase as any).from("hr_employee_work_info").update({ shift_id: form.shift_id }).eq("employee_id", form.employee_id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_shift_schedule"] });
      setShowDialog(false);
      setForm({ employee_id: "", shift_id: "", effective_from: "" });
      toast.success("Shift rotation assigned");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <RotateCcw className="h-4 w-4" /> Shift Rotation Schedule
        </CardTitle>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowDialog(true)}>
          <Plus className="h-3 w-3" /> Assign Rotation
        </Button>
      </CardHeader>
      <CardContent>
        {schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No shift rotations assigned</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Employee</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Shift</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Effective From</th>
                </tr>
              </thead>
              <tbody>
                {schedules.slice(0, 20).map((s: any) => (
                  <tr key={s.id} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2">
                      {s.hr_employees?.first_name} {s.hr_employees?.last_name}
                      <span className="text-xs text-muted-foreground ml-1">({s.hr_employees?.badge_id})</span>
                    </td>
                    <td className="px-3 py-2">{s.hr_shifts?.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.effective_from}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign Shift Rotation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={v => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>New Shift</Label>
              <Select value={form.shift_id} onValueChange={v => setForm({ ...form, shift_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                <SelectContent>
                  {shifts.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Effective From</Label>
              <Input type="date" value={form.effective_from} onChange={e => setForm({ ...form, effective_from: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => assignMutation.mutate()} disabled={!form.employee_id || !form.shift_id || !form.effective_from}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
