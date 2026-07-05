import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Shield, Clock, AlertTriangle, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";

const defaultForm = {
  name: "", late_threshold_minutes: 15, half_day_threshold_minutes: 240,
  absent_if_no_punch: true, grace_period_minutes: 0, late_count_for_lop: 3,
  half_day_count_for_lop: 2, early_leave_threshold_minutes: 30,
  min_overtime_minutes: 30, is_default: false,
};

export default function AttendancePolicyPage() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["hr_attendance_policies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_attendance_policies").select("*").eq("is_active", true).order("is_default", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Policy name is required");
      const payload = {
        name: form.name.trim(), late_threshold_minutes: form.late_threshold_minutes,
        half_day_threshold_minutes: form.half_day_threshold_minutes, absent_if_no_punch: form.absent_if_no_punch,
        grace_period_minutes: form.grace_period_minutes, late_count_for_lop: form.late_count_for_lop,
        half_day_count_for_lop: form.half_day_count_for_lop, early_leave_threshold_minutes: form.early_leave_threshold_minutes,
        min_overtime_minutes: form.min_overtime_minutes, is_default: form.is_default, updated_at: new Date().toISOString(),
      };
      if (form.is_default) {
        await (supabase as any).from("hr_attendance_policies").update({ is_default: false }).neq("id", editId || "");
      }
      if (editId) {
        const { error } = await (supabase as any).from("hr_attendance_policies").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("hr_attendance_policies").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_attendance_policies"] });
      setShowDialog(false); setEditId(null); setForm(defaultForm);
      toast.success(editId ? "Policy updated" : "Policy created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_attendance_policies").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_attendance_policies"] }); toast.success("Policy deactivated"); },
  });

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({ name: p.name, late_threshold_minutes: p.late_threshold_minutes || 15, half_day_threshold_minutes: p.half_day_threshold_minutes || 240, absent_if_no_punch: p.absent_if_no_punch ?? true, grace_period_minutes: p.grace_period_minutes || 0, late_count_for_lop: p.late_count_for_lop || 3, half_day_count_for_lop: p.half_day_count_for_lop || 2, early_leave_threshold_minutes: p.early_leave_threshold_minutes || 30, min_overtime_minutes: p.min_overtime_minutes || 30, is_default: p.is_default || false });
    setShowDialog(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 page-mount">
      <PageHeader
        title="Attendance Policies"
        description="Configure late, half-day, LOP, and overtime rules"
        actions={
          <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => { setEditId(null); setForm(defaultForm); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Policy
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[1, 2].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : policies.length === 0 ? (
        <EmptyState icon={Shield} title="No attendance policies configured yet" description="Create your first policy to define late, half-day and overtime rules." action={<Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => { setEditId(null); setForm(defaultForm); setShowDialog(true); }}><Plus className="h-4 w-4 mr-2" /> New Policy</Button>} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {policies.map((p: any) => (
            <Card key={p.id} className={p.is_default ? "ring-2 ring-primary/30" : ""}>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  {p.is_default && <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 text-[10px] rounded-full font-medium">Default</span>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                  {!p.is_default && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">Late after:</span><span className="font-medium tabular-nums">{p.late_threshold_minutes} min</span></div>
                  <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">Grace:</span><span className="font-medium tabular-nums">{p.grace_period_minutes} min</span></div>
                  <div className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-warning" /><span className="text-muted-foreground">Half-day if &lt;</span><span className="font-medium tabular-nums">{p.half_day_threshold_minutes} min</span></div>
                  <div className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-destructive" /><span className="text-muted-foreground">Early leave:</span><span className="font-medium tabular-nums">{p.early_leave_threshold_minutes} min</span></div>
                  <div className="flex items-center gap-2"><span className="text-muted-foreground tabular-nums">{p.late_count_for_lop} lates</span><span className="text-xs text-destructive">= 1 LOP</span></div>
                  <div className="flex items-center gap-2"><span className="text-muted-foreground tabular-nums">{p.half_day_count_for_lop} half-days</span><span className="text-xs text-destructive">= 1 LOP</span></div>
                  <div className="flex items-center gap-2"><span className="text-muted-foreground">Min OT:</span><span className="font-medium tabular-nums">{p.min_overtime_minutes} min</span></div>
                  <div className="flex items-center gap-2"><span className="text-muted-foreground">No punch = absent:</span><span className="font-medium">{p.absent_if_no_punch ? "Yes" : "No"}</span></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4" />{editId ? "Edit" : "New"} Attendance Policy</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Policy Name *</Label><Input className="h-9" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Office Policy" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Late After (minutes)</Label><Input type="number" className="h-9" value={form.late_threshold_minutes} onChange={(e) => setForm({ ...form, late_threshold_minutes: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Grace Period (minutes)</Label><Input type="number" className="h-9" value={form.grace_period_minutes} onChange={(e) => setForm({ ...form, grace_period_minutes: parseInt(e.target.value) || 0 })} /><p className="text-[10px] text-muted-foreground mt-0.5">Fallback only — shift-level grace takes priority</p></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Half-Day Threshold (minutes)</Label><Input type="number" className="h-9" value={form.half_day_threshold_minutes} onChange={(e) => setForm({ ...form, half_day_threshold_minutes: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Early Leave (minutes)</Label><Input type="number" className="h-9" value={form.early_leave_threshold_minutes} onChange={(e) => setForm({ ...form, early_leave_threshold_minutes: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Lates for 1 LOP</Label><Input type="number" className="h-9" value={form.late_count_for_lop} onChange={(e) => setForm({ ...form, late_count_for_lop: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Half-Days for 1 LOP</Label><Input type="number" className="h-9" value={form.half_day_count_for_lop} onChange={(e) => setForm({ ...form, half_day_count_for_lop: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div><Label>Min Overtime (minutes)</Label><Input type="number" className="h-9" value={form.min_overtime_minutes} onChange={(e) => setForm({ ...form, min_overtime_minutes: parseInt(e.target.value) || 0 })} /></div>
            <div className="flex items-center gap-3"><Switch checked={form.absent_if_no_punch} onCheckedChange={(v) => setForm({ ...form, absent_if_no_punch: v })} /><Label>Mark absent if no punch recorded</Label></div>
            <div className="flex items-center gap-3"><Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} /><Label>Set as default policy</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-9" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{editId ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
