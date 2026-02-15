import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const defaultForm = { name: "", start_time: "09:00", end_time: "18:00", break_duration_minutes: 60, grace_period_minutes: 15, is_night_shift: false };

export default function ShiftsPage() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ["hr_shifts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_shifts").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("hr_shifts").update(form).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_shifts").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_shifts"] });
      setShowDialog(false);
      setEditId(null);
      setForm(defaultForm);
      toast.success(editId ? "Shift updated" : "Shift created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("hr_shifts").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_shifts"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_shifts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_shifts"] });
      toast.success("Shift deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({ name: s.name, start_time: s.start_time, end_time: s.end_time, break_duration_minutes: s.break_duration_minutes, grace_period_minutes: s.grace_period_minutes, is_night_shift: s.is_night_shift });
    setShowDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Shifts</h1>
          <p className="text-sm text-gray-500">Manage employee work shifts and schedules</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm(defaultForm); setShowDialog(true); }} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> Add Shift
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <p className="text-gray-400 col-span-3 text-center py-12">Loading...</p>
        ) : shifts.length === 0 ? (
          <p className="text-gray-400 col-span-3 text-center py-12">No shifts configured</p>
        ) : (
          shifts.map((s: any) => (
            <Card key={s.id} className={`${!s.is_active ? "opacity-50" : ""}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{s.name}</h3>
                    {s.is_night_shift && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Night Shift</span>}
                  </div>
                  <Switch checked={s.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: s.id, is_active: v })} />
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <p>🕐 {s.start_time?.slice(0, 5)} — {s.end_time?.slice(0, 5)}</p>
                  <p>☕ Break: {s.break_duration_minutes} min</p>
                  <p>⏱ Grace: {s.grace_period_minutes} min</p>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => openEdit(s)}><Pencil className="h-3 w-3 mr-1" /> Edit</Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => deleteMutation.mutate(s.id)}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Shift" : "Create Shift"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Shift Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Morning Shift" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Time</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
              <div><Label>End Time</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Break (min)</Label><Input type="number" value={form.break_duration_minutes} onChange={(e) => setForm({ ...form, break_duration_minutes: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Grace Period (min)</Label><Input type="number" value={form.grace_period_minutes} onChange={(e) => setForm({ ...form, grace_period_minutes: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_night_shift} onCheckedChange={(v) => setForm({ ...form, is_night_shift: v })} />
              <Label>Night Shift</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name} className="bg-[#E8604C] hover:bg-[#d4553f]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
