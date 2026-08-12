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
import { Calculator, Plus, IndianRupee, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";
import { dismissInRazorpay } from "@/lib/razorpayPushback";
import { EmployeePicker } from "@/components/hrms/EmployeePicker";
import { SourceTag, DashboardLink } from "@/components/hr/payroll/SourceTag";

export default function FnFSettlementPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [dismissPrompt, setDismissPrompt] = useState<{ id: string; employee_id: string; name: string; lwd: string } | null>(null);
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
  // Provenance of the final-month salary figure — RazorpayX is the payroll authority.
  const [finalMonth, setFinalMonth] = useState<{
    state: "idle" | "loading" | "razorpay" | "awaiting";
    periodMonth?: string;
    source?: "razorpay" | "register_csv";
  }>({ state: "idle" });
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

  // Payroll doctrine: RazorpayX is the payroll authority.
  //  • Pending (final-month) salary  → mirrored RazorpayX payslip record for the LWD month.
  //                                     Never computed locally. Missing ⇒ "awaiting RazorpayX".
  //  • Leave encashment / gratuity   → NOT payable per company policy. Removed.
  //  • Loans / penalties / deposits  → HRMS-owned; security deposits only (error-recovery
  //                                     collections are recoveries, never refunded).
  const autoFillFnF = async (empId: string) => {
    setSelectedEmpId(empId);
    const emp = separatedEmployees.find((e: any) => e.id === empId);
    if (!emp) return;
    setFinalMonth({ state: "loading" });

    const lwdIso: string | null = emp.last_working_day || null;
    const periodMonth = lwdIso ? `${lwdIso.slice(0, 7)}-01` : null;

    const [{ data: loans }, { data: penalties }, { data: empDeposits }, payslipRes] = await Promise.all([
      (supabase as any).from("hr_loans").select("id, outstanding_balance").eq("employee_id", empId).eq("status", "active"),
      (supabase as any).from("hr_penalties").select("id, deduction_amount").eq("employee_id", empId).eq("is_applied", false),
      (supabase as any)
        .from("hr_employee_deposits")
        .select("id, collected_amount, deposit_type")
        .eq("employee_id", empId)
        .eq("is_settled", false),
      periodMonth
        ? (supabase as any)
            .from("hr_razorpay_payslip_records")
            .select("net_pay, reg_net_pay, period_month")
            .eq("hr_employee_id", empId)
            .eq("period_month", periodMonth)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const loanRecovery = (loans || []).reduce((sum: number, l: any) => sum + Number(l.outstanding_balance || 0), 0);
    const penaltyTotal = (penalties || []).reduce((sum: number, p: any) => sum + Number(p.deduction_amount || 0), 0);
    const securityDeposits = (empDeposits || []).filter((d: any) => (d.deposit_type || "security") === "security");
    const depositRefund = securityDeposits.reduce((sum: number, d: any) => sum + Number(d.collected_amount || 0), 0);

    // Final-month salary — RazorpayX only.
    const slip: any = (payslipRes as any)?.data || null;
    const apiNet = Number(slip?.net_pay || 0);
    const regNet = Number(slip?.reg_net_pay || 0);
    const pendingSalary = apiNet > 0 ? apiNet : regNet > 0 ? regNet : 0;
    const source: "razorpay" | "register_csv" | undefined =
      apiNet > 0 ? "razorpay" : regNet > 0 ? "register_csv" : undefined;

    setFinalMonth(
      pendingSalary > 0
        ? { state: "razorpay", periodMonth: periodMonth || undefined, source }
        : { state: "awaiting", periodMonth: periodMonth || undefined }
    );

    const excludedRecoveryCount = (empDeposits || []).length - securityDeposits.length;
    setCalcNote(
      excludedRecoveryCount > 0
        ? `${excludedRecoveryCount} error-recovery deposit${excludedRecoveryCount > 1 ? "s" : ""} excluded from the refund — recoveries are not refundable.`
        : ""
    );

    setForm({
      last_working_day: lwdIso || "",
      pending_salary: pendingSalary,
      leave_encashment_days: 0,
      leave_encashment_amount: 0,
      bonus_amount: 0,
      gratuity_amount: 0,
      notice_pay_recovery: 0,
      loan_recovery: loanRecovery,
      deposit_refund: depositRefund,
      penalty_deductions: penaltyTotal,
      other_deductions: 0,
      other_deductions_notes: "",
      notes: "",
    });
  };

  const netPayable = form.pending_salary + form.bonus_amount + form.deposit_refund
    - form.loan_recovery - form.penalty_deductions - form.notice_pay_recovery - form.other_deductions;


  const createMutation = useMutation({
    mutationFn: async () => {
      const { gratuity_amount, notice_pay_recovery, ...rest } = form;
      const { error } = await (supabase as any).from("hr_fnf_settlements").insert({
        employee_id: selectedEmpId,
        ...rest,
        net_payable: netPayable,
        breakdown: {
          notice_pay_recovery,
          calc_note: calcNote,
          policy: "no_leave_encashment_no_gratuity",
          pending_salary_source: finalMonth.source || "manual",
          razorpay_period_month: finalMonth.periodMonth || null,
          deposit_refund_scope: "security_only",
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


  // The DB state machine (fn_enforce_fnf_state_machine) is the contract:
  //   draft → calculated → approved → paid   (draft/calculated → cancelled)
  //   approving requires approved_by; marking paid requires payment_reference.
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, paymentReference }: { id: string; status: string; paymentReference?: string }) => {
      const payload: any = { status, updated_at: new Date().toISOString() };
      if (status === "approved") payload.approved_by = user?.username || user?.id || "hr";
      if (status === "paid") {
        payload.paid_at = new Date().toISOString();
        payload.payment_reference = paymentReference;
      }
      const { error } = await (supabase as any).from("hr_fnf_settlements").update(payload).eq("id", id);
      if (error) throw error;

      // Auto-deactivate employee when F&F is paid + surface Razorpay dismiss prompt
      if (status === "paid") {
        const { data: settlement } = await (supabase as any)
          .from("hr_fnf_settlements")
          .select("employee_id, last_working_day, hr_employees!hr_fnf_settlements_employee_id_fkey(first_name, last_name)")
          .eq("id", id)
          .single();
        if (settlement?.employee_id) {
          await (supabase as any)
            .from("hr_employees")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", settlement.employee_id);
          return {
            settledId: id,
            employee_id: settlement.employee_id,
            name: `${settlement.hr_employees?.first_name ?? ""} ${settlement.hr_employees?.last_name ?? ""}`.trim() || "employee",
            lwd: settlement.last_working_day || new Date().toISOString().slice(0, 10),
          };
        }
      }
      return null;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["hr_fnf_settlements"] });
      toast.success("Status updated");
      if (result) {
        setDismissPrompt({ id: result.settledId, employee_id: result.employee_id, name: result.name, lwd: result.lwd });
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [dismissing, setDismissing] = useState(false);
  const confirmDismissInRazorpay = async () => {
    if (!dismissPrompt) return;
    setDismissing(true);
    try {
      const res = await dismissInRazorpay(dismissPrompt.employee_id, {
        dateOfDismissal: dismissPrompt.lwd,
        reason: "F&F settled",
        triggeredFrom: "fnf_paid",
      });
      if (res.ok) toast.success("Dismissal propagated to Razorpay");
      else if (res.skipped) toast.info("Employee is not linked to Razorpay — nothing to propagate.");
      else if (res.manualRequired) toast.warning("Dismiss manually in the RazorpayX dashboard — this employee never activated their RazorpayX account, so the dismiss API cannot resolve them. Logged in Data Health.");
    } finally {
      setDismissing(false);
      setDismissPrompt(null);
    }
  };


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
                      <Button
                        size="sm"
                        className="h-8 bg-success hover:bg-success"
                        disabled={!["razorpay", "register_csv"].includes(s.breakdown?.pending_salary_source)}
                        title={
                          ["razorpay", "register_csv"].includes(s.breakdown?.pending_salary_source)
                            ? undefined
                            : "Final-month salary is not confirmed from RazorpayX yet"
                        }
                        onClick={() => updateStatusMutation.mutate({ id: s.id, status: "paid" })}
                      >
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-3 text-xs border-t border-border pt-3">
                  <div>
                    <span className="text-muted-foreground block">Final-Month Salary</span>
                    <p className="font-medium tabular-nums">₹{Number(s.pending_salary).toLocaleString("en-IN")}</p>
                    {["razorpay", "register_csv"].includes(s.breakdown?.pending_salary_source) && (
                      <SourceTag compact source={s.breakdown.pending_salary_source} className="mt-0.5" />
                    )}
                  </div>
                  <div><span className="text-muted-foreground block">Bonus</span><p className="font-medium tabular-nums">₹{Number(s.bonus_amount).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground block">Deposit Refund</span><p className="font-medium tabular-nums">₹{Number(s.deposit_refund || 0).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground block">Loan Recovery</span><p className="font-medium text-destructive tabular-nums">-₹{Number(s.loan_recovery).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground block">Penalties</span><p className="font-medium text-destructive tabular-nums">-₹{Number(s.penalty_deductions).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground block">Other Ded.</span><p className="font-medium text-destructive tabular-nums">-₹{Number(s.other_deductions).toLocaleString("en-IN")}</p></div>
                </div>
                {(Number(s.leave_encashment_amount || 0) > 0 || Number(s.breakdown?.gratuity_amount || 0) > 0) && (
                  <p className="mt-2 text-[11px] text-amber-600 inline-flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Legacy calculation — includes leave encashment / gratuity, which are no longer payable under current policy.
                  </p>
                )}

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
              <EmployeePicker className="mt-1" placeholder="Select separated employee" employees={separatedEmployees} value={selectedEmpId} onChange={autoFillFnF} />
            </div>
            <div><Label>Last Working Day</Label><Input className="h-9 mt-1" type="date" value={form.last_working_day} onChange={(e) => setForm({ ...form, last_working_day: e.target.value })} /></div>

            <div className="rounded-md border border-border p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Final-Month Salary (₹)</Label>
                {finalMonth.state === "razorpay" && finalMonth.source && <SourceTag source={finalMonth.source} />}
              </div>
              <Input className="h-9" type="number" readOnly value={form.pending_salary} />
              {finalMonth.state === "awaiting" && (
                <p className="text-[11px] text-destructive inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  No RazorpayX payslip mirrored for {finalMonth.periodMonth?.slice(0, 7) || "the final month"} yet — run that month's payroll in RazorpayX and pull it back before paying this settlement.
                </p>
              )}
              <DashboardLink />
              <p className="text-[11px] text-muted-foreground">
                Leave encashment and gratuity are not payable under current company policy and are excluded.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Bonus (₹)</Label><Input className="h-9 mt-1" type="number" value={form.bonus_amount} onChange={(e) => setForm({ ...form, bonus_amount: Number(e.target.value) })} /></div>
              <div><Label>Notice Pay Recovery (₹)</Label><Input className="h-9 mt-1" type="number" value={form.notice_pay_recovery} onChange={(e) => setForm({ ...form, notice_pay_recovery: Number(e.target.value) })} /></div>
              <div><Label>Loan Recovery (₹)</Label><Input className="h-9 mt-1" type="number" value={form.loan_recovery} onChange={(e) => setForm({ ...form, loan_recovery: Number(e.target.value) })} /></div>
              <div><Label>Security Deposit Refund (₹)</Label><Input className="h-9 mt-1" type="number" value={form.deposit_refund} onChange={(e) => setForm({ ...form, deposit_refund: Number(e.target.value) })} /></div>
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

      <AlertDialog open={!!dismissPrompt} onOpenChange={(o) => { if (!o) setDismissPrompt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Also mark dismissed in Razorpay?</AlertDialogTitle>
            <AlertDialogDescription>
              F&amp;F for <strong>{dismissPrompt?.name}</strong> is settled. Propagating the dismissal to Razorpay
              (date of dismissal: <span className="tabular-nums">{dismissPrompt?.lwd}</span>) enables F&amp;F payroll on their side
              and stops future payslips. This is destructive on the Razorpay side and requires the CONFIRM_DISMISS acknowledgement —
              click <em>Dismiss in Razorpay</em> to send it, or <em>Skip</em> to keep this to the HRMS only.
              If the employee is not linked to Razorpay, nothing will be sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismissing}>Skip</AlertDialogCancel>
            <AlertDialogAction
              disabled={dismissing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); confirmDismissInRazorpay(); }}
            >
              {dismissing ? "Sending…" : "Dismiss in Razorpay"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
