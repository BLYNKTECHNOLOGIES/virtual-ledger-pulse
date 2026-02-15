import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";

export default function SalaryStructurePage() {
  const qc = useQueryClient();
  const [selectedEmp, setSelectedEmp] = useState("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ employee_id: "", component_id: "", amount: 0 });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name, basic_salary").eq("is_active", true).order("first_name");
      return data || [];
    },
  });

  const { data: components = [] } = useQuery({
    queryKey: ["hr_salary_components_all"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_salary_components").select("*").eq("is_active", true).order("component_type, name");
      return data || [];
    },
  });

  const { data: structures = [], isLoading } = useQuery({
    queryKey: ["hr_employee_salary_structures", selectedEmp],
    queryFn: async () => {
      let query = (supabase as any)
        .from("hr_employee_salary_structures")
        .select("*, hr_employees!hr_employee_salary_structures_employee_id_fkey(id, badge_id, first_name, last_name), hr_salary_components!hr_employee_salary_structures_component_id_fkey(id, name, code, component_type, calculation_type)")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (selectedEmp !== "all") query = query.eq("employee_id", selectedEmp);
      const { data, error } = await query;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_employee_salary_structures").upsert({
        employee_id: form.employee_id,
        component_id: form.component_id,
        amount: form.amount,
      }, { onConflict: "employee_id,component_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_salary_structures"] });
      setShowAdd(false);
      setForm({ employee_id: "", component_id: "", amount: 0 });
      toast.success("Salary structure updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_employee_salary_structures").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_salary_structures"] });
      toast.success("Removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async () => {
      const rows = employees.flatMap((emp: any) =>
        components.map((comp: any) => ({
          employee_id: emp.id,
          component_id: comp.id,
          amount: comp.default_amount || 0,
          is_active: true,
        }))
      );
      const { error } = await (supabase as any)
        .from("hr_employee_salary_structures")
        .upsert(rows, { onConflict: "employee_id,component_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_salary_structures"] });
      toast.success(`Salary structure assigned to ${employees.length} employees`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Group by employee
  const grouped: Record<string, { employee: any; items: any[] }> = {};
  structures.forEach((s: any) => {
    const empId = s.employee_id;
    if (!grouped[empId]) grouped[empId] = { employee: s.hr_employees, items: [] };
    grouped[empId].items.push(s);
  });

  const groupedArr = Object.values(grouped).filter((g: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${g.employee?.first_name || ""} ${g.employee?.last_name || ""}`.toLowerCase();
    return name.includes(q) || g.employee?.badge_id?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Salary Structure</h1>
          <p className="text-sm text-gray-500">Assign allowances & deductions per employee</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => bulkAssignMutation.mutate()} disabled={bulkAssignMutation.isPending}>
            {bulkAssignMutation.isPending ? "Assigning..." : "Bulk Assign Defaults"}
          </Button>
          <Button onClick={() => setShowAdd(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
            <Plus className="h-4 w-4 mr-2" /> Assign Component
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={selectedEmp} onValueChange={setSelectedEmp}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-400 py-12">Loading...</p>
      ) : groupedArr.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400">No salary structures assigned. Click "Bulk Assign Defaults" to get started.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {groupedArr.map((g: any) => {
            const earnings = g.items.filter((i: any) => i.hr_salary_components?.component_type === "allowance");
            const deductions = g.items.filter((i: any) => i.hr_salary_components?.component_type === "deduction");
            const totalEarnings = earnings.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
            const totalDeductions = deductions.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);

            return (
              <Card key={g.employee?.id}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#E8604C]/10 flex items-center justify-center text-[#E8604C] font-bold text-sm">
                        {g.employee?.first_name?.[0]}{g.employee?.last_name?.[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{g.employee?.first_name} {g.employee?.last_name}</p>
                        <p className="text-xs text-gray-500">{g.employee?.badge_id}</p>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-green-700 font-medium">Earnings: ₹{totalEarnings.toLocaleString()}</p>
                      <p className="text-red-600">Deductions: ₹{totalDeductions.toLocaleString()}</p>
                      <p className="font-bold text-gray-900">Net: ₹{(totalEarnings - totalDeductions).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-green-700 mb-2">EARNINGS</p>
                      <div className="space-y-1">
                        {earnings.map((i: any) => (
                          <div key={i.id} className="flex items-center justify-between text-sm bg-green-50 px-3 py-1.5 rounded">
                            <span>{i.hr_salary_components?.name} <span className="text-xs text-gray-400">({i.hr_salary_components?.code})</span></span>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">₹{Number(i.amount).toLocaleString()}</span>
                              <button onClick={() => deleteMutation.mutate(i.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </div>
                        ))}
                        {earnings.length === 0 && <p className="text-xs text-gray-400">No earnings assigned</p>}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-red-600 mb-2">DEDUCTIONS</p>
                      <div className="space-y-1">
                        {deductions.map((i: any) => (
                          <div key={i.id} className="flex items-center justify-between text-sm bg-red-50 px-3 py-1.5 rounded">
                            <span>{i.hr_salary_components?.name} <span className="text-xs text-gray-400">({i.hr_salary_components?.code})</span></span>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">₹{Number(i.amount).toLocaleString()}</span>
                              <button onClick={() => deleteMutation.mutate(i.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </div>
                        ))}
                        {deductions.length === 0 && <p className="text-xs text-gray-400">No deductions assigned</p>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Salary Component</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Component</Label>
              <Select value={form.component_id} onValueChange={(v) => {
                const comp = components.find((c: any) => c.id === v);
                setForm({ ...form, component_id: v, amount: comp?.default_amount || 0 });
              }}>
                <SelectTrigger><SelectValue placeholder="Select component" /></SelectTrigger>
                <SelectContent>
                  {components.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.code}) — {c.component_type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!form.employee_id || !form.component_id} className="bg-[#E8604C] hover:bg-[#d4553f]">Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
