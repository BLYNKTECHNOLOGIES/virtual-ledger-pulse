import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Play, CalendarDays, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";

const EMPTY_FORM = {
  name: "", leave_type_id: "", accrual_period: "monthly", accrual_amount: 1,
  max_accrual: "", applicable_to: "all", department_id: "", is_active: true, effective_from: new Date().toISOString().slice(0, 10),
};

export default function LeaveAccrualPlansPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["hr_leave_accrual_plans"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_leave_accrual_plans")
        .select("*, hr_leave_types!hr_leave_accrual_plans_leave_type_id_fkey(id, name, color)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hr_leave_types_active_accrual"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_leave_types").select("id, name, color").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments_for_accrual"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("departments").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: accrualLogs = [] } = useQuery({
    queryKey: ["hr_leave_accrual_log_recent"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_leave_accrual_log")
        .select("*, hr_leave_accrual_plans!hr_leave_accrual_log_accrual_plan_id_fkey(name), hr_employees!hr_leave_accrual_log_employee_id_fkey(first_name, last_name, badge_id)")
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name, leave_type_id: form.leave_type_id, accrual_period: form.accrual_period,
        accrual_amount: Number(form.accrual_amount), max_accrual: form.max_accrual ? Number(form.max_accrual) : null,
        applicable_to: form.applicable_to,
        department_id: form.applicable_to === "department" ? form.department_id : null,
        is_active: form.is_active, effective_from: form.effective_from,
      };
      if (editId) {
        const { error } = await (supabase as any).from("hr_leave_accrual_plans").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("hr_leave_accrual_plans").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_accrual_plans"] });
      setShowForm(false); setEditId(null);
      toast.success(editId ? "Plan updated" : "Plan created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_leave_accrual_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_leave_accrual_plans"] }); toast.success("Plan deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const runAccrualMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("run_leave_accrual", { p_accrual_date: new Date().toISOString().slice(0, 10) });
      if (error) throw error;
      return data;
    },
    onSuccess: (count: number) => {
      qc.invalidateQueries({ queryKey: ["hr_leave_accrual_plans"] });
      qc.invalidateQueries({ queryKey: ["hr_leave_accrual_log_recent"] });
      qc.invalidateQueries({ queryKey: ["hr_leave_allocations_all"] });
      toast.success(`Accrual complete — ${count} allocation(s) updated`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (plan: any) => {
    setEditId(plan.id);
    setForm({
      name: plan.name, leave_type_id: plan.leave_type_id, accrual_period: plan.accrual_period,
      accrual_amount: plan.accrual_amount, max_accrual: plan.max_accrual?.toString() || "",
      applicable_to: plan.applicable_to, department_id: plan.department_id || "",
      is_active: plan.is_active, effective_from: plan.effective_from,
    });
    setShowForm(true);
  };

  const openNew = () => { setEditId(null); setForm(EMPTY_FORM); setShowForm(true); };

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Leave Accrual Plans"
        description="Auto-allocate leave based on job position/department with configurable accrual periods"
        actions={
          <>
            <Button variant="outline" onClick={() => runAccrualMutation.mutate()} disabled={runAccrualMutation.isPending} className="h-9">
              <Play className="h-4 w-4 mr-1" /> {runAccrualMutation.isPending ? "Running..." : "Run Accrual Now"}
            </Button>
            <Button onClick={openNew} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">
              <Plus className="h-4 w-4 mr-1" /> New Plan
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarDays}
              title="No accrual plans"
              description="Create a plan to automatically allocate leave days on a schedule."
              action={
                <Button onClick={openNew} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">
                  <Plus className="h-4 w-4 mr-1" /> New Plan
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p: any) => (
            <Card key={p.id} className={!p.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge style={{ backgroundColor: p.hr_leave_types?.color || "#6B7280" }} className="text-primary-foreground text-xs">
                    {p.hr_leave_types?.name}
                  </Badge>
                  <Badge variant={p.is_active ? "default" : "secondary"} className="text-xs">
                    {p.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Period:</span> <span className="font-medium capitalize">{p.accrual_period}</span></div>
                  <div><span className="text-muted-foreground">Amount:</span> <span className="font-medium tabular-nums">{p.accrual_amount} days</span></div>
                  <div><span className="text-muted-foreground">Scope:</span> <span className="font-medium capitalize">{p.applicable_to}</span></div>
                  <div><span className="text-muted-foreground">Effective:</span> <span className="font-medium tabular-nums">{p.effective_from}</span></div>
                </div>
                {p.last_accrual_date && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Last accrual: {p.last_accrual_date}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {accrualLogs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Recent Accrual Activity</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {["Date", "Plan", "Employee", "Days Accrued"].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accrualLogs.slice(0, 20).map((log: any) => (
                  <tr key={log.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 tabular-nums">{log.accrual_date}</td>
                    <td className="px-4 py-2">{log.hr_leave_accrual_plans?.name}</td>
                    <td className="px-4 py-2">{log.hr_employees?.first_name} {log.hr_employees?.last_name}</td>
                    <td className="px-4 py-2 font-medium text-success tabular-nums">+{log.accrued_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#E8604C]" />
              {editId ? "Edit Accrual Plan" : "New Accrual Plan"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Plan Name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monthly Casual Leave Accrual" className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Leave Type</Label>
                <Select value={form.leave_type_id} onValueChange={v => setForm({ ...form, leave_type_id: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((lt: any) => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Accrual Period</Label>
                <Select value={form.accrual_period} onValueChange={v => setForm({ ...form, accrual_period: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Accrual Amount (days)</Label>
                <Input type="number" min="0.5" step="0.5" value={form.accrual_amount} onChange={e => setForm({ ...form, accrual_amount: parseFloat(e.target.value) || 0 })} className="h-9" />
              </div>
              <div>
                <Label>Max Accrual (optional cap)</Label>
                <Input type="number" value={form.max_accrual} onChange={e => setForm({ ...form, max_accrual: e.target.value })} placeholder="No limit" className="h-9" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Applicable To</Label>
                <Select value={form.applicable_to} onValueChange={v => setForm({ ...form, applicable_to: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    <SelectItem value="department">Specific Department</SelectItem>
                    <SelectItem value="position">Specific Position</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.applicable_to === "department" && (
                <div>
                  <Label>Department</Label>
                  <Select value={form.department_id} onValueChange={v => setForm({ ...form, department_id: v })}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div>
              <Label>Effective From</Label>
              <Input type="date" value={form.effective_from} onChange={e => setForm({ ...form, effective_from: e.target.value })} className="h-9" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} className="h-9">Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || !form.leave_type_id}
              className="bg-[#E8604C] hover:bg-[#d4553f] h-9">
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
