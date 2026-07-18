import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Calculator, Plus, IndianRupee } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";
import { dismissInRazorpay } from "@/lib/razorpayPushback";

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
    gratuity_amount: 0,
    notice_pay_recovery: 0,
    loan_recovery: 0,
    deposit_refund: 0,
    penalty_deductions: 0,
    other_deductions: 0,
    other_deductions_notes: "",
    notes: "",
  });
  const [calcNote, setCalcNote] = useState<string>("");


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
        .select("id, first_name, last_name, badge_id, last_working_day, total_salary, basic_salary")
        .not("last_working_day", "is", null)
        .order("last_working_day", { ascending: false });
      return data || [];
    },
  });

  // Auto-pull data when employee is selected — uses Indian statutory formulas.
  //  • Leave encashment = Basic / 26 per day   (Payment of Wages / labour law standard)
  //  • Gratuity          = (Basic × 15 / 26) × completed years, if tenure ≥ 5 years
  //  • Pending salary    = working-day proration of Basic from period-start → LWD
  //                        (calendar days used only when Basic is missing)
  const autoFillFnF = async (empId: string) => {
    setSelectedEmpId(empId);
    const emp = separatedEmployees.find((e: any) => e.id === empId);
    if (!emp) return;

    const [{ data: loans }, { data: allocations }, { data: penalties }, { data: empDeposits }, { data: workInfo }] = await Promise.all([
      (supabase as any).from("hr_loans").select("outstanding_balance").eq("employee_id", empId).eq("status", "active"),
      (supabase as any).from("hr_leave_allocations").select("available_days, hr_leave_types!hr_leave_allocations_leave_type_id_fkey(is_encashable)").eq("employee_id", empId),
      (supabase as any).from("hr_penalties").select("deduction_amount").eq("employee_id", empId).eq("is_applied", false),
      (supabase as any).from("hr_employee_deposits").select("collected_amount").eq("employee_id", empId).eq("is_settled", false),
      (supabase as any).from("hr_employee_work_info").select("joining_date").eq("employee_id", empId).maybeSingle(),
    ]);

    const loanRecovery = (loans || []).reduce((sum: number, l: any) => sum + Number(l.outstanding_balance || 0), 0);
    const encashDays = (allocations || [])
      .filter((a: any) => a.hr_leave_types?.is_encashable)
      .reduce((sum: number, a: any) => sum + Number(a.available_days || 0), 0);
    const penaltyTotal = (penalties || []).reduce((sum: number, p: any) => sum + Number(p.deduction_amount || 0), 0);
    const depositRefund = (empDeposits || []).reduce((sum: number, d: any) => sum + Number(d.collected_amount || 0), 0);

    // Base pay basis: prefer Basic; fall back to 40% of CTC when Basic is missing (Indian norm).
    const totalCtc = Number(emp.total_salary || 0);
    const basicRaw = Number(emp.basic_salary || 0);
    const basicMonthly = basicRaw > 0 ? basicRaw : Math.round(totalCtc * 0.4);
    const perDayEncash = basicMonthly / 26;
    const encashAmount = Math.round(encashDays * perDayEncash);

    // Gratuity — statutory: only after 5 completed years.
    const doj = workInfo?.joining_date ? new Date(workInfo.joining_date) : null;
    const lwd = emp.last_working_day ? new Date(emp.last_working_day) : new Date();
    let gratuity = 0;
    let tenureYears = 0;
    if (doj && !isNaN(doj.getTime())) {
      const ms = lwd.getTime() - doj.getTime();
      tenureYears = ms / (365.25 * 24 * 3600 * 1000);
      if (tenureYears >= 5) {
        // ≥6 months in final year counts as full year (Payment of Gratuity Act).
        const completedYears = Math.floor(tenureYears) + ((tenureYears - Math.floor(tenureYears)) >= 0.5 ? 1 : 0);
        gratuity = Math.round(basicMonthly * (15 / 26) * completedYears);
      }
    }

    // Pending salary — working days from the 1st of the LWD month up to LWD, × Basic/26.
    // Skips Sundays only (conservative); operator can override in the field.
    let pendingSalary = 0;
    if (emp.last_working_day) {
      const end = new Date(emp.last_working_day + "T00:00:00Z");
      const monthStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
      let wd = 0;
      for (let t = monthStart.getTime(); t <= end.getTime(); t += 86400000) {
        const d = new Date(t);
        if (d.getUTCDay() !== 0) wd++;
      }
      pendingSalary = Math.round(wd * (basicMonthly / 26));
    }

    setCalcNote(
      `Basis: Basic ₹${basicMonthly.toLocaleString("en-IN")} / 26 = ₹${perDayEncash.toFixed(0)}/day. ` +
      (tenureYears >= 5
        ? `Tenure ${tenureYears.toFixed(2)}y ⇒ gratuity payable.`
        : (doj ? `Tenure ${tenureYears.toFixed(2)}y (<5y) — gratuity not payable.` : `Joining date not set — gratuity skipped.`))
    );

    setForm({
      last_working_day: emp.last_working_day || "",
      pending_salary: pendingSalary,
      leave_encashment_days: encashDays,
      leave_encashment_amount: encashAmount,
      bonus_amount: 0,
      gratuity_amount: gratuity,
      notice_pay_recovery: 0,
      loan_recovery: loanRecovery,
      deposit_refund: depositRefund,
      penalty_deductions: penaltyTotal,
      other_deductions: 0,
      other_deductions_notes: "",
      notes: "",
    });
  };

  const netPayable = form.pending_salary + form.leave_encashment_amount + form.bonus_amount
    + form.gratuity_amount + form.deposit_refund
    - form.loan_recovery - form.penalty_deductions - form.notice_pay_recovery - form.other_deductions;


  const createMutation = useMutation({
    mutationFn: async () => {
      const { gratuity_amount, notice_pay_recovery, ...rest } = form;
      const { error } = await (supabase as any).from("hr_fnf_settlements").insert({
        employee_id: selectedEmpId,
        ...rest,
        net_payable: netPayable,
        breakdown: {
          gratuity_amount,
          notice_pay_recovery,
          calc_note: calcNote,
          formulas: {
            leave_encashment: "days × (Basic / 26)",
            gratuity: "(Basic × 15 / 26) × completed_years (≥5y)",
            pending_salary: "working_days_in_month × (Basic / 26)",
          },
        },
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
      // Auto-deactivate employee when F&F is paid
      if (status === "paid") {
        const { data: settlement } = await (supabase as any)
          .from("hr_fnf_settlements")
          .select("employee_id")
          .eq("id", id)
          .single();
        if (settlement?.employee_id) {
          await (supabase as any)
            .from("hr_employees")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", settlement.employee_id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_fnf_settlements"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: "bg-muted/80 text-muted-foreground border-border",
      pending_approval: "bg-warning/10 text-warning border-warning/20",
      approved: "bg-info/10 text-info border-info/20",
      paid: "bg-success/10 text-success border-success/20",
    };
    return map[s] || "bg-muted/80 text-muted-foreground border-border";
  };

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Full & Final Settlement"
        description="Manage settlement for separated employees"
        actions={
          <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Settlement
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : settlements.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="No F&F settlements yet"
          description="Create settlements for separated employees to manage their final payouts"
          action={
            <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Settlement
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {settlements.map((s: any) => (
            <Card key={s.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">
                      {s.hr_employees?.first_name} {s.hr_employees?.last_name}
                      <span className="text-muted-foreground text-xs ml-2">({s.hr_employees?.badge_id})</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">LWD: <span className="tabular-nums">{s.last_working_day}</span></p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="text-lg font-bold text-foreground flex items-center gap-1 tabular-nums">
                        <IndianRupee className="h-4 w-4" />{Number(s.net_payable).toLocaleString("en-IN")}
                      </p>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusBadge(s.status)}`}>
                        {s.status.replace("_", " ")}
                      </span>
                    </div>
                    {s.status === "draft" && (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => updateStatusMutation.mutate({ id: s.id, status: "pending_approval" })}>
                        Submit
                      </Button>
                    )}
                    {s.status === "pending_approval" && (
                      <Button size="sm" className="h-8" onClick={() => updateStatusMutation.mutate({ id: s.id, status: "approved" })}>
                        Approve
                      </Button>
                    )}
                    {s.status === "approved" && (
                      <Button size="sm" className="h-8 bg-success hover:bg-success" onClick={() => updateStatusMutation.mutate({ id: s.id, status: "paid" })}>
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-3 text-xs border-t border-border pt-3">
                  <div><span className="text-muted-foreground block">Pending Salary</span><p className="font-medium tabular-nums">₹{Number(s.pending_salary).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground block">Leave Encash</span><p className="font-medium tabular-nums">₹{Number(s.leave_encashment_amount).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground block">Bonus</span><p className="font-medium tabular-nums">₹{Number(s.bonus_amount).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground block">Loan Recovery</span><p className="font-medium text-destructive tabular-nums">-₹{Number(s.loan_recovery).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground block">Penalties</span><p className="font-medium text-destructive tabular-nums">-₹{Number(s.penalty_deductions).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground block">Other Ded.</span><p className="font-medium text-destructive tabular-nums">-₹{Number(s.other_deductions).toLocaleString("en-IN")}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Calculator className="h-4 w-4" /> New F&amp;F Settlement
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select value={selectedEmpId} onValueChange={autoFillFnF}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select separated employee" /></SelectTrigger>
                <SelectContent>
                  {separatedEmployees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Last Working Day</Label><Input className="h-9 mt-1" type="date" value={form.last_working_day} onChange={(e) => setForm({ ...form, last_working_day: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Pending Salary (₹)</Label><Input className="h-9 mt-1" type="number" value={form.pending_salary} onChange={(e) => setForm({ ...form, pending_salary: Number(e.target.value) })} /></div>
              <div><Label>Leave Encash Days</Label><Input className="h-9 mt-1" type="number" value={form.leave_encashment_days} onChange={(e) => setForm({ ...form, leave_encashment_days: Number(e.target.value) })} /></div>
              <div><Label>Leave Encash Amount (₹)</Label><Input className="h-9 mt-1" type="number" value={form.leave_encashment_amount} onChange={(e) => setForm({ ...form, leave_encashment_amount: Number(e.target.value) })} /></div>
              <div><Label>Bonus (₹)</Label><Input className="h-9 mt-1" type="number" value={form.bonus_amount} onChange={(e) => setForm({ ...form, bonus_amount: Number(e.target.value) })} /></div>
              <div><Label>Gratuity (₹)</Label><Input className="h-9 mt-1" type="number" value={form.gratuity_amount} onChange={(e) => setForm({ ...form, gratuity_amount: Number(e.target.value) })} /></div>
              <div><Label>Notice Pay Recovery (₹)</Label><Input className="h-9 mt-1" type="number" value={form.notice_pay_recovery} onChange={(e) => setForm({ ...form, notice_pay_recovery: Number(e.target.value) })} /></div>
              <div><Label>Loan Recovery (₹)</Label><Input className="h-9 mt-1" type="number" value={form.loan_recovery} onChange={(e) => setForm({ ...form, loan_recovery: Number(e.target.value) })} /></div>
              <div><Label>Deposit Refund (₹)</Label><Input className="h-9 mt-1" type="number" value={form.deposit_refund} onChange={(e) => setForm({ ...form, deposit_refund: Number(e.target.value) })} /></div>
              <div><Label>Penalty Ded. (₹)</Label><Input className="h-9 mt-1" type="number" value={form.penalty_deductions} onChange={(e) => setForm({ ...form, penalty_deductions: Number(e.target.value) })} /></div>
              <div><Label>Other Ded. (₹)</Label><Input className="h-9 mt-1" type="number" value={form.other_deductions} onChange={(e) => setForm({ ...form, other_deductions: Number(e.target.value) })} /></div>
            </div>
            {calcNote && <p className="text-[11px] text-muted-foreground bg-muted/40 rounded px-2 py-1.5">{calcNote}</p>}

            <div><Label>Other Deductions Notes</Label><Input className="h-9 mt-1" value={form.other_deductions_notes} onChange={(e) => setForm({ ...form, other_deductions_notes: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea className="mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <Card className="bg-muted/50">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Net Payable</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">₹{netPayable.toLocaleString("en-IN")}</p>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-9" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => createMutation.mutate()} disabled={!selectedEmpId || !form.last_working_day || createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Settlement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
