import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, DollarSign } from "lucide-react";

interface EmployeeSalaryStructureProps {
  employeeId: string;
}

export function EmployeeSalaryStructure({ employeeId }: EmployeeSalaryStructureProps) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ component_id: "", amount: "", is_percentage: false });

  const { data: structures = [], isLoading } = useQuery({
    queryKey: ["hr_employee_salary_structures", employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_employee_salary_structures")
        .select("*, hr_salary_components!hr_employee_salary_structures_component_id_fkey(name, component_type, is_taxable)")
        .eq("employee_id", employeeId)
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!employeeId,
  });

  const { data: components = [] } = useQuery({
    queryKey: ["hr_salary_components_all"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_salary_components").select("id, name, component_type").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!form.component_id || !form.amount) throw new Error("Component and amount are required");
      const { error } = await (supabase as any).from("hr_employee_salary_structures").insert({
        employee_id: employeeId,
        component_id: form.component_id,
        amount: parseFloat(form.amount),
        is_percentage: form.is_percentage,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_salary_structures", employeeId] });
      setShowAdd(false);
      setForm({ component_id: "", amount: "", is_percentage: false });
      toast.success("Salary component added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_employee_salary_structures")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_salary_structures", employeeId] });
      toast.success("Component removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalFixed = structures
    .filter((s: any) => !s.is_percentage)
    .reduce((sum: number, s: any) => sum + (s.amount || 0), 0);

  const earnings = structures.filter((s: any) => s.hr_salary_components?.component_type === "allowance" || s.hr_salary_components?.component_type === "earning");
  const deductions = structures.filter((s: any) => s.hr_salary_components?.component_type === "deduction");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <DollarSign className="h-4 w-4" /> Salary Structure Overrides
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add Component</Button>
      </div>

      {structures.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No custom salary structure — using template defaults</p>
      ) : (
        <>
          <div className="flex gap-2">
            <Card className="flex-1">
              <CardContent className="p-3 text-center">
                <div className="text-lg font-bold text-green-600">₹{totalFixed.toLocaleString("en-IN")}</div>
                <div className="text-xs text-muted-foreground">Total Fixed</div>
              </CardContent>
            </Card>
            <Card className="flex-1">
              <CardContent className="p-3 text-center">
                <div className="text-lg font-bold">{structures.length}</div>
                <div className="text-xs text-muted-foreground">Components</div>
              </CardContent>
            </Card>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {structures.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm font-medium">{s.hr_salary_components?.name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.hr_salary_components?.component_type === "deduction" ? "destructive" : "default"} className="text-xs">
                      {s.hr_salary_components?.component_type || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.is_percentage ? `${s.amount}%` : `₹${Number(s.amount).toLocaleString("en-IN")}`}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => removeMutation.mutate(s.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Salary Component</DialogTitle>
            <DialogDescription>Override or add a specific salary component for this employee</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Component</Label>
              <Select value={form.component_id} onValueChange={v => setForm({ ...form, component_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select component..." /></SelectTrigger>
                <SelectContent>
                  {components.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.component_type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 5000" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_percentage} onCheckedChange={v => setForm({ ...form, is_percentage: v })} />
              <Label>Percentage-based</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
