import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Calculator, FileText, Plus, IndianRupee } from "lucide-react";

export default function FnFSettlementPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [form, setForm] = useState({
    last_working_day: "",
    pending_salary: 0,
    leave_encashment_days: 0,
    leave_encashment_amount: 0,
    bonus_amount: 0,
    loan_recovery: 0,
    deposit_refund: 0,
    penalty_deductions: 0,
    other_deductions: 0,
    other_deductions_notes: "",
    notes: "",
  });

  const { data: settlements = [], isLoading } = useQuery({
    queryKey: ["hr_fnf_settlements"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_fnf_settlements")
        .select("*, hr_employees!hr_fnf_settlements_employee_id_fkey(first_name, last_name, badge_id, last_working_day)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: separatedEmployees = [] } = useQuery({
    queryKey: ["hr_separated_employees"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_employees")
        .select("id, first_name, last_name, badge_id, last_working_day, total_salary")
        .not("last_working_day", "is", null)
        .order("last_working_day", { ascending: false });
      return data || [];
    },
  });

  // Auto-pull data when employee is selected
  const autoFillFnF = async (empId: string) => {
    setSelectedEmpId(empId);
    const emp = separatedEmployees.find((e: any) => e.id === empId);
    if (!emp) return;

    // Pull loan balance
    const { data: loans } = await (supabase as any)
      .from("hr_loans")
      .select("outstanding_balance")
      .eq("employee_id", empId)
      .eq("status", "active");
    const loanRecovery = (loans || []).reduce((sum: number, l: any) => sum + Number(l.outstanding_balance || 0), 0);

    // Pull encashable leave balance
    const { data: allocations } = await (supabase as any)
      .from("hr_leave_allocations")
      .select("available_days, hr_leave_types!hr_leave_allocations_leave_type_id_fkey(is_encashable)")
      .eq("employee_id", empId);
    const encashDays = (allocations || [])
      .filter((a: any) => a.hr_leave_types?.is_encashable)
      .reduce((sum: number, a: any) => sum + Number(a.available_days || 0), 0);

    // Pull pending penalties
    const { data: penalties } = await (supabase as any)
      .from("hr_penalties")
      .select("deduction_amount")
      .eq("employee_id", empId)
      .eq("is_applied", false);
    const penaltyTotal = (penalties || []).reduce((sum: number, p: any) => sum + Number(p.deduction_amount || 0), 0);

    const dailySalary = Number(emp.total_salary || 0) / 30;

    setForm({
      last_working_day: emp.last_working_day || "",
      pending_salary: 0,
      leave_encashment_days: encashDays,
      leave_encashment_amount: Math.round(encashDays * dailySalary),
      bonus_amount: 0,
      loan_recovery: loanRecovery,
      deposit_refund: 0,
      penalty_deductions: penaltyTotal,
      other_deductions: 0,
      other_deductions_notes: "",
      notes: "",
    });
  };

  const netPayable = form.pending_salary + form.leave_encashment_amount + form.bonus_amount + form.deposit_refund
    - form.loan_recovery - form.penalty_deductions - form.other_deductions;

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_fnf_settlements").insert({
        employee_id: selectedEmpId,
        ...form,
        net_payable: netPayable,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_fnf_settlements"] });
      setShowCreate(false);
      toast.success("F&F Settlement created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const payload: any = { status, updated_at: new Date().toISOString() };
      if (status === "paid") payload.paid_at = new Date().toISOString();
      const { error } = await (supabase as any).from("hr_fnf_settlements").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_fnf_settlements"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "draft": return "secondary";
      case "pending_approval": return "outline";
      case "approved": return "default";
      case "paid": return "default";
      default: return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Full & Final Settlement</h1>
          <p className="text-sm text-muted-foreground">Manage settlement for separated employees</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> New Settlement
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : settlements.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calculator className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No F&F settlements yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {settlements.map((s: any) => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">
                      {s.hr_employees?.first_name} {s.hr_employees?.last_name}
                      <span className="text-muted-foreground text-xs ml-2">({s.hr_employees?.badge_id})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">LWD: {s.last_working_day}</p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="text-lg font-bold text-foreground flex items-center gap-1">
                        <IndianRupee className="h-4 w-4" />{Number(s.net_payable).toLocaleString("en-IN")}
                      </p>
                      <Badge variant={statusColor(s.status)}>{s.status.replace("_", " ")}</Badge>
                    </div>
                    {s.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: s.id, status: "pending_approval" })}>
                        Submit
                      </Button>
                    )}
                    {s.status === "pending_approval" && (
                      <Button size="sm" onClick={() => updateStatusMutation.mutate({ id: s.id, status: "approved" })}>
                        Approve
                      </Button>
                    )}
                    {s.status === "approved" && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => updateStatusMutation.mutate({ id: s.id, status: "paid" })}>
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-3 text-xs">
                  <div><span className="text-muted-foreground">Pending Salary</span><p className="font-medium">₹{Number(s.pending_salary).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground">Leave Encash</span><p className="font-medium">₹{Number(s.leave_encashment_amount).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground">Bonus</span><p className="font-medium">₹{Number(s.bonus_amount).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground">Loan Recovery</span><p className="font-medium text-red-600">-₹{Number(s.loan_recovery).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground">Penalties</span><p className="font-medium text-red-600">-₹{Number(s.penalty_deductions).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground">Other Ded.</span><p className="font-medium text-red-600">-₹{Number(s.other_deductions).toLocaleString("en-IN")}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New F&F Settlement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select value={selectedEmpId} onValueChange={autoFillFnF}>
                <SelectTrigger><SelectValue placeholder="Select separated employee" /></SelectTrigger>
                <SelectContent>
                  {separatedEmployees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Last Working Day</Label><Input type="date" value={form.last_working_day} onChange={(e) => setForm({ ...form, last_working_day: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Pending Salary (₹)</Label><Input type="number" value={form.pending_salary} onChange={(e) => setForm({ ...form, pending_salary: Number(e.target.value) })} /></div>
              <div><Label>Leave Encash Days</Label><Input type="number" value={form.leave_encashment_days} onChange={(e) => setForm({ ...form, leave_encashment_days: Number(e.target.value) })} /></div>
              <div><Label>Leave Encash Amount (₹)</Label><Input type="number" value={form.leave_encashment_amount} onChange={(e) => setForm({ ...form, leave_encashment_amount: Number(e.target.value) })} /></div>
              <div><Label>Bonus (₹)</Label><Input type="number" value={form.bonus_amount} onChange={(e) => setForm({ ...form, bonus_amount: Number(e.target.value) })} /></div>
              <div><Label>Loan Recovery (₹)</Label><Input type="number" value={form.loan_recovery} onChange={(e) => setForm({ ...form, loan_recovery: Number(e.target.value) })} /></div>
              <div><Label>Deposit Refund (₹)</Label><Input type="number" value={form.deposit_refund} onChange={(e) => setForm({ ...form, deposit_refund: Number(e.target.value) })} /></div>
              <div><Label>Penalty Ded. (₹)</Label><Input type="number" value={form.penalty_deductions} onChange={(e) => setForm({ ...form, penalty_deductions: Number(e.target.value) })} /></div>
              <div><Label>Other Ded. (₹)</Label><Input type="number" value={form.other_deductions} onChange={(e) => setForm({ ...form, other_deductions: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Other Deductions Notes</Label><Input value={form.other_deductions_notes} onChange={(e) => setForm({ ...form, other_deductions_notes: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <Card className="bg-muted/50">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Net Payable</p>
                <p className="text-2xl font-bold text-foreground">₹{netPayable.toLocaleString("en-IN")}</p>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!selectedEmpId || !form.last_working_day || createMutation.isPending} className="bg-[#E8604C] hover:bg-[#d4553f]">
              {createMutation.isPending ? "Creating..." : "Create Settlement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
