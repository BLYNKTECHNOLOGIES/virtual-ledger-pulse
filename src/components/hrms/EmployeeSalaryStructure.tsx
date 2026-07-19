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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <DollarSign className="h-4 w-4" /> Salary Structure
          <Badge variant="outline" className="text-[10px] uppercase ml-1">Mirror · RazorpayX</Badge>
        </h3>
        <Button asChild size="sm" variant="outline">
          <a href="https://x.razorpay.com/payroll" target="_blank" rel="noreferrer">Edit on RazorpayX ↗</a>
        </Button>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        This is a read-only mirror of the salary structure stored on RazorpayX. Salary edits happen on RazorpayX; the mirror re-syncs after the next sync run.
      </div>

      {structures.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No mirrored structure yet — sync from RazorpayX to populate.</p>
      ) : (
        <>
          <div className="flex gap-2">
            <Card className="flex-1">
              <CardContent className="p-3 text-center">
                <div className="text-lg font-bold text-success">₹{totalFixed.toLocaleString("en-IN")}</div>
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
                  <TableCell className="text-sm tabular-nums">
                    {s.is_percentage ? `${s.amount}%` : `₹${Number(s.amount).toLocaleString("en-IN")}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {/* Add-component dialog retired — structures are managed on RazorpayX. */}
    </div>
  );
}
