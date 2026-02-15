import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const defaultForm = { name: "", code: "", component_type: "allowance", is_taxable: false, is_fixed: true, calculation_type: "fixed", default_amount: 0, percentage_of: "" };

export default function SalaryComponentsPage({ componentType = "allowance" }: { componentType?: "allowance" | "deduction" }) {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...defaultForm, component_type: componentType });

  const label = componentType === "allowance" ? "Allowances" : "Deductions";

  const { data: components = [], isLoading } = useQuery({
    queryKey: ["hr_salary_components", componentType],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_salary_components").select("*").eq("component_type", componentType).order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, default_amount: form.default_amount || 0 };
      if (editId) {
        const { error } = await supabase.from("hr_salary_components").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_salary_components").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_salary_components"] });
      setShowDialog(false);
      setEditId(null);
      setForm({ ...defaultForm, component_type: componentType });
      toast.success(editId ? "Updated" : "Created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("hr_salary_components").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_salary_components"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_salary_components").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_salary_components"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({ name: c.name, code: c.code, component_type: c.component_type, is_taxable: c.is_taxable ?? false, is_fixed: c.is_fixed ?? true, calculation_type: c.calculation_type || "fixed", default_amount: c.default_amount || 0, percentage_of: c.percentage_of || "" });
    setShowDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{label}</h1>
          <p className="text-sm text-gray-500">Manage salary {label.toLowerCase()} components</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm({ ...defaultForm, component_type: componentType }); setShowDialog(true); }} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> Add {componentType === "allowance" ? "Allowance" : "Deduction"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Name", "Code", "Type", "Amount/Rate", "Taxable", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : components.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No {label.toLowerCase()} configured</td></tr>
              ) : (
                components.map((c: any) => (
                  <tr key={c.id} className={`border-b hover:bg-gray-50 ${!c.is_active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3"><span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{c.code}</span></td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{c.calculation_type || "fixed"}</td>
                    <td className="px-4 py-3 font-medium">
                      {c.calculation_type === "percentage" ? `${c.default_amount}%` : `₹${(c.default_amount || 0).toLocaleString()}`}
                      {c.percentage_of && <span className="text-xs text-gray-400 ml-1">of {c.percentage_of}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.is_taxable ? <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Taxable</span> : <span className="text-xs text-gray-400">Non-taxable</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Switch checked={c.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, is_active: v })} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteMutation.mutate(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} {componentType === "allowance" ? "Allowance" : "Deduction"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. HRA" /></div>
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. HRA" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Calculation Type</Label>
                <Select value={form.calculation_type} onValueChange={(v) => setForm({ ...form, calculation_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{form.calculation_type === "percentage" ? "Percentage (%)" : "Amount (₹)"}</Label><Input type="number" value={form.default_amount} onChange={(e) => setForm({ ...form, default_amount: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            {form.calculation_type === "percentage" && (
              <div><Label>Percentage Of</Label><Input value={form.percentage_of} onChange={(e) => setForm({ ...form, percentage_of: e.target.value })} placeholder="e.g. basic_salary" /></div>
            )}
            <div className="space-y-3">
              <div className="flex items-center gap-2"><Switch checked={form.is_taxable} onCheckedChange={(v) => setForm({ ...form, is_taxable: v })} /><Label>Taxable</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_fixed} onCheckedChange={(v) => setForm({ ...form, is_fixed: v })} /><Label>Fixed (same every month)</Label></div>
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
