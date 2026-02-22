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

const defaultForm = { name: "", code: "", max_days_per_year: 12, is_paid: true, requires_approval: true, color: "#E8604C" };

export default function LeaveTypesPage() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["hr_leave_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_leave_types").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Always set carry_forward to true and max_carry_forward_days to null (infinite carry forward)
      const payload = {
        ...form,
        carry_forward: true,
        max_carry_forward_days: null,
      };
      if (editId) {
        const { error } = await supabase.from("hr_leave_types").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_leave_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_types"] });
      setShowDialog(false);
      setEditId(null);
      setForm(defaultForm);
      toast.success(editId ? "Leave type updated" : "Leave type created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("hr_leave_types").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_leave_types"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_leave_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_leave_types"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (t: any) => {
    setEditId(t.id);
    setForm({ name: t.name, code: t.code, max_days_per_year: t.max_days_per_year || 12, is_paid: t.is_paid ?? true, requires_approval: t.requires_approval ?? true, color: t.color || "#E8604C" });
    setShowDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Types</h1>
          <p className="text-sm text-gray-500">Configure different types of leave (allocated per quarter, all carry forward)</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm(defaultForm); setShowDialog(true); }} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> Add Type
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <p className="text-gray-400 col-span-3 text-center py-12">Loading...</p>
        ) : types.length === 0 ? (
          <p className="text-gray-400 col-span-3 text-center py-12">No leave types configured</p>
        ) : (
          types.map((t: any) => (
            <Card key={t.id} className={`${!t.is_active ? "opacity-50" : ""}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color || "#E8604C" }} />
                    <h3 className="font-semibold text-gray-900">{t.name}</h3>
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t.code}</span>
                  </div>
                  <Switch checked={t.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: t.id, is_active: v })} />
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <p>📅 Max {t.max_days_per_year} days/quarter</p>
                  <p>{t.is_paid ? "💰 Paid" : "📋 Unpaid"} • {t.requires_approval ? "✅ Needs Approval" : "🔓 Auto-Approved"}</p>
                  <p>🔄 All leaves carry forward</p>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => openEdit(t)}><Pencil className="h-3 w-3 mr-1" /> Edit</Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => deleteMutation.mutate(t.id)}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Leave Type" : "Create Leave Type"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Casual Leave" /></div>
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. CL" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Max Days/Quarter</Label><Input type="number" value={form.max_days_per_year} onChange={(e) => setForm({ ...form, max_days_per_year: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Color</Label><Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10" /></div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2"><Switch checked={form.is_paid} onCheckedChange={(v) => setForm({ ...form, is_paid: v })} /><Label>Paid Leave</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.requires_approval} onCheckedChange={(v) => setForm({ ...form, requires_approval: v })} /><Label>Requires Approval</Label></div>
            </div>
            <p className="text-xs text-gray-400">💡 All leaves carry forward infinitely across quarters.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.code} className="bg-[#E8604C] hover:bg-[#d4553f]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
