import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const defaultForm = {
  name: "", code: "", max_days_per_year: 12, is_paid: true, requires_approval: true, color: "#E8604C",
  reset: false, reset_based: "" as string, reset_month: "", reset_day: "",
  is_encashable: false, exclude_company_leave: false, exclude_holiday: false, is_compensatory_leave: false,
  carryforward_type: "carryforward", carryforward_expire_in: null as number | null, carryforward_expire_period: "",
  require_attachment: false,
};

const RESET_PERIODS = [
  { value: "yearly", label: "Yearly" },
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
];

const CARRYFORWARD_TYPES = [
  { value: "no carryforward", label: "No Carry Forward" },
  { value: "carryforward", label: "Carry Forward" },
  { value: "carryforward expire", label: "Carry Forward with Expiry" },
];

const EXPIRE_PERIODS = [
  { value: "day", label: "Days" },
  { value: "month", label: "Months" },
  { value: "year", label: "Years" },
];

const MONTHS_LIST = [
  { value: "1", label: "January" }, { value: "2", label: "February" }, { value: "3", label: "March" },
  { value: "4", label: "April" }, { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" }, { value: "9", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

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
      const payload: any = {
        name: form.name,
        code: form.code,
        max_days_per_year: form.max_days_per_year,
        is_paid: form.is_paid,
        requires_approval: form.requires_approval,
        color: form.color,
        reset: form.reset,
        reset_based: form.reset ? form.reset_based || null : null,
        reset_month: form.reset && form.reset_based === "yearly" ? form.reset_month || null : null,
        reset_day: form.reset ? form.reset_day || null : null,
        is_encashable: form.is_encashable,
        exclude_company_leave: form.exclude_company_leave,
        exclude_holiday: form.exclude_holiday,
        is_compensatory_leave: form.is_compensatory_leave,
        carryforward_type: form.carryforward_type,
        carry_forward: form.carryforward_type !== "no carryforward",
        carryforward_expire_in: form.carryforward_type === "carryforward expire" ? form.carryforward_expire_in : null,
        carryforward_expire_period: form.carryforward_type === "carryforward expire" ? form.carryforward_expire_period || null : null,
        max_carry_forward_days: form.carryforward_type === "carryforward" ? form.max_days_per_year : null,
        require_attachment: form.require_attachment,
      };
      if (editId) {
        const { error } = await (supabase as any).from("hr_leave_types").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("hr_leave_types").insert(payload);
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
    setForm({
      name: t.name, code: t.code, max_days_per_year: t.max_days_per_year || 12,
      is_paid: t.is_paid ?? true, requires_approval: t.requires_approval ?? true, color: t.color || "#E8604C",
      reset: t.reset ?? false, reset_based: t.reset_based || "", reset_month: t.reset_month || "", reset_day: t.reset_day || "",
      is_encashable: t.is_encashable ?? false, exclude_company_leave: t.exclude_company_leave ?? false,
      exclude_holiday: t.exclude_holiday ?? false, is_compensatory_leave: t.is_compensatory_leave ?? false,
      carryforward_type: t.carryforward_type || "carryforward",
      carryforward_expire_in: t.carryforward_expire_in ?? null,
      carryforward_expire_period: t.carryforward_expire_period || "",
      require_attachment: t.require_attachment ?? false,
    });
    setShowDialog(true);
  };

  const getCarryForwardLabel = (t: any) => {
    if (t.carryforward_type === "no carryforward") return "No carry forward";
    if (t.carryforward_type === "carryforward expire") return `Carry forward (expires in ${t.carryforward_expire_in || "?"} ${t.carryforward_expire_period || "?"})`;
    return "Carry forward";
  };

  const getResetLabel = (t: any) => {
    if (!t.reset) return null;
    if (t.reset_based === "yearly") return `Reset: Yearly (${MONTHS_LIST.find(m => m.value === t.reset_month)?.label || ""} ${t.reset_day || ""})`;
    if (t.reset_based === "monthly") return `Reset: Monthly (day ${t.reset_day || "?"})`;
    if (t.reset_based === "weekly") return "Reset: Weekly";
    return "Reset enabled";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Types</h1>
          <p className="text-sm text-gray-500">Configure leave types with reset, carryforward & encashment rules</p>
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
                  <p>🔄 {getCarryForwardLabel(t)}</p>
                  {getResetLabel(t) && <p>🔁 {getResetLabel(t)}</p>}
                  {t.is_encashable && <p>💵 Encashable</p>}
                  {t.is_compensatory_leave && <p>⚡ Compensatory Leave</p>}
                  {t.exclude_holiday && <p>🏖️ Excludes holidays</p>}
                  {t.require_attachment && <p>📎 Attachment required</p>}
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit Leave Type" : "Create Leave Type"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Casual Leave" /></div>
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. CL" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Max Days/Quarter</Label><Input type="number" value={form.max_days_per_year} onChange={(e) => setForm({ ...form, max_days_per_year: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Color</Label><Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10" /></div>
            </div>

            {/* Toggles */}
            <div className="space-y-3 border-t pt-3">
              <p className="text-xs font-medium text-gray-500 uppercase">Payment & Approval</p>
              <div className="flex items-center gap-2"><Switch checked={form.is_paid} onCheckedChange={(v) => setForm({ ...form, is_paid: v })} /><Label>Paid Leave</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.requires_approval} onCheckedChange={(v) => setForm({ ...form, requires_approval: v })} /><Label>Requires Approval</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.require_attachment} onCheckedChange={(v) => setForm({ ...form, require_attachment: v })} /><Label>Require Attachment</Label></div>
            </div>

            {/* Carry Forward */}
            <div className="space-y-3 border-t pt-3">
              <p className="text-xs font-medium text-gray-500 uppercase">Carry Forward</p>
              <div>
                <Label>Carry Forward Type</Label>
                <Select value={form.carryforward_type} onValueChange={(v) => setForm({ ...form, carryforward_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CARRYFORWARD_TYPES.map((cf) => <SelectItem key={cf.value} value={cf.value}>{cf.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.carryforward_type === "carryforward expire" && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Expire In</Label><Input type="number" value={form.carryforward_expire_in ?? ""} onChange={(e) => setForm({ ...form, carryforward_expire_in: parseInt(e.target.value) || null })} placeholder="e.g. 3" /></div>
                  <div>
                    <Label>Period</Label>
                    <Select value={form.carryforward_expire_period} onValueChange={(v) => setForm({ ...form, carryforward_expire_period: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {EXPIRE_PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Reset */}
            <div className="space-y-3 border-t pt-3">
              <p className="text-xs font-medium text-gray-500 uppercase">Reset Configuration</p>
              <div className="flex items-center gap-2"><Switch checked={form.reset} onCheckedChange={(v) => setForm({ ...form, reset: v })} /><Label>Enable Reset</Label></div>
              {form.reset && (
                <>
                  <div>
                    <Label>Reset Period</Label>
                    <Select value={form.reset_based} onValueChange={(v) => setForm({ ...form, reset_based: v })}>
                      <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                      <SelectContent>
                        {RESET_PERIODS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.reset_based === "yearly" && (
                    <div>
                      <Label>Reset Month</Label>
                      <Select value={form.reset_month} onValueChange={(v) => setForm({ ...form, reset_month: v })}>
                        <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                        <SelectContent>
                          {MONTHS_LIST.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {(form.reset_based === "yearly" || form.reset_based === "monthly") && (
                    <div><Label>Reset Day</Label><Input value={form.reset_day} onChange={(e) => setForm({ ...form, reset_day: e.target.value })} placeholder="e.g. 1, 15, or 'last day'" /></div>
                  )}
                </>
              )}
            </div>

            {/* Special Flags */}
            <div className="space-y-3 border-t pt-3">
              <p className="text-xs font-medium text-gray-500 uppercase">Special Options</p>
              <div className="flex items-center gap-2"><Switch checked={form.is_encashable} onCheckedChange={(v) => setForm({ ...form, is_encashable: v })} /><Label>Encashable</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_compensatory_leave} onCheckedChange={(v) => setForm({ ...form, is_compensatory_leave: v })} /><Label>Compensatory Leave</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.exclude_company_leave} onCheckedChange={(v) => setForm({ ...form, exclude_company_leave: v })} /><Label>Exclude Company Holidays</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.exclude_holiday} onCheckedChange={(v) => setForm({ ...form, exclude_holiday: v })} /><Label>Exclude Public Holidays</Label></div>
            </div>
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
