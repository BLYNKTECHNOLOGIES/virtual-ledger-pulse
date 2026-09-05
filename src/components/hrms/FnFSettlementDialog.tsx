import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fnfEditLock, invalidateFnFEverywhere } from "@/lib/fnfEditLock";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Calculator, AlertTriangle } from "lucide-react";
import { EmployeePicker } from "@/components/hrms/EmployeePicker";
import { SourceTag, DashboardLink } from "@/components/hr/payroll/SourceTag";
import { computeFnFDraft, buildFnFPayload, fnfNetPayable, syncFnFDepositReservations, sumRefunds, missingDecisionReasons, type DepositDecision } from "@/lib/fnfEngine";

/**
 * Shared create/edit dialog for Full & Final settlements.
 *
 * Used in two places so the flow is identical everywhere:
 *  - Full & Final Settlement page (picker over separated employees, or editing
 *    an existing settlement).
 *  - Exit Checklist on the Separation page (fixedEmployee mode — the employee
 *    is already known, so the picker is locked and the figures auto-fill).
 */
export interface FnFSettlementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Employees offered in the picker when creating (page mode). */
  employees?: any[];
  /** Existing settlement to edit (edit mode). */
  settlement?: any | null;
  /** Checklist mode: the employee is fixed — no picker, auto-fill on open. */
  fixedEmployee?: { id: string; first_name?: string; last_name?: string; badge_id?: string; last_working_day?: string | null } | null;
  onSaved?: () => void;
}

const emptyForm = () => ({
  last_working_day: "",
  payroll_month: "",
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

export function FnFSettlementDialog({ open, onOpenChange, employees = [], settlement = null, fixedEmployee = null, onSaved }: FnFSettlementDialogProps) {
  const qc = useQueryClient();
  const editingId = settlement?.id ?? null;
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [finalMonth, setFinalMonth] = useState<{
    state: "idle" | "loading" | "razorpay" | "awaiting";
    periodMonth?: string;
    source?: "razorpay" | "register_csv";
  }>({ state: "idle" });
  const [calcNote, setCalcNote] = useState<string>("");
  const [details, setDetails] = useState<{
    loans: any[]; penalties: any[]; deposits: DepositDecision[]; writtenOff: any[];
  }>({ loans: [], penalties: [], deposits: [], writtenOff: [] });
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  const findEmp = (id: string) =>
    employees.find((e: any) => e.id === id) || (fixedEmployee?.id === id ? fixedEmployee : null);

  const autoFillFnF = async (empId: string) => {
    setSelectedEmpId(empId);
    const emp = findEmp(empId);
    if (!emp) return;
    setFinalMonth({ state: "loading" });
    const draft = await computeFnFDraft(empId, emp.last_working_day || null);
    setFinalMonth(draft.finalMonth);
    setDetails(draft.details);
    setCalcNote(draft.calcNote);
    setForm(draft.form as any);
  };

  const resetForm = () => {
    setSelectedEmpId("");
    setDetails({ loans: [], penalties: [], deposits: [], writtenOff: [] });
    setCalcNote("");
    setFinalMonth({ state: "idle" });
    setOpenDetail(null);
    setForm(emptyForm());
  };

  const loadEdit = (s: any) => {
    setSelectedEmpId(s.employee_id);
    const b = s.breakdown || {};
    const c = b.components || {};
    // Per-deposit decisions are authoritative. Legacy settlements (refunded +
    // written-off lists) are migrated into the same editable shape on open.
    const legacyDecisions: DepositDecision[] = [
      ...(c.deposits || []).map((d: any) => ({
        deposit_id: d.id, deposit_type: (d.type || "security"), held: Number(d.collected || 0),
        refund: Number(d.refund ?? d.collected ?? 0), reason: "",
        label: d.type === "error_recovery" ? "Error recovery" : "Security deposit", is_paused: false,
      })),
      ...(b.written_off_deposits || []).map((d: any) => ({
        deposit_id: d.id, deposit_type: (d.deposit_type || "security"), held: Number(d.collected_amount || 0),
        refund: 0, reason: d.reason || "Written off in legacy settlement",
        label: d.deposit_type === "error_recovery" ? "Error recovery" : "Security deposit", is_paused: d.reason === "paused",
      })),
    ];
    setDetails({
      loans: (c.loans || []).map((l: any) => ({ id: l.id, loan_type: l.type, outstanding_balance: l.outstanding })),
      penalties: (c.penalties || []).map((p: any) => ({
        id: p.id, penalty_month: p.month, penalty_type: p.type,
        penalty_amount: p.amount, days: Number(p.days || 0), day_rate: Number(p.day_rate || 0),
        amount: Number(p.amount || 0), note: p.note || "",
      })),
      deposits: Array.isArray(b.deposit_decisions) && b.deposit_decisions.length
        ? b.deposit_decisions.map((d: any) => ({
            deposit_id: d.deposit_id, deposit_type: d.deposit_type || "security",
            held: Number(d.held || 0), refund: Number(d.refund || 0),
            reason: d.reason || "", label: d.label || (d.deposit_type === "error_recovery" ? "Error recovery" : "Security deposit"),
            is_paused: false,
          }))
        : legacyDecisions,
      writtenOff: [],
    });
    setCalcNote(b.calc_note || "");
    setFinalMonth(
      ["razorpay", "register_csv"].includes(b.pending_salary_source)
        ? { state: "razorpay", source: b.pending_salary_source, periodMonth: b.razorpay_period_month || undefined }
        : { state: "awaiting", periodMonth: b.razorpay_period_month || undefined }
    );
    setForm({
      last_working_day: s.last_working_day || "",
      payroll_month: (s.payroll_month || s.last_working_day || "").slice(0, 7),
      pending_salary: Number(s.pending_salary || 0),
      leave_encashment_days: Number(s.leave_encashment_days || 0),
      leave_encashment_amount: Number(s.leave_encashment_amount || 0),
      bonus_amount: Number(s.bonus_amount || 0),
      gratuity_amount: 0,
      notice_pay_recovery: Number(b.notice_pay_recovery || 0),
      loan_recovery: Number(s.loan_recovery || 0),
      deposit_refund: Number(s.deposit_refund || 0),
      penalty_deductions: Number(s.penalty_deductions || 0),
      other_deductions: Number(s.other_deductions || 0),
      other_deductions_notes: s.other_deductions_notes || "",
      notes: s.notes || "",
    });
  };

  // Initialise the dialog every time it opens: edit an existing settlement,
  // auto-fill for the fixed checklist employee, or start a blank create form.
  useEffect(() => {
    if (!open) return;
    resetForm();
    if (settlement) {
      loadEdit(settlement);
    } else if (fixedEmployee?.id) {
      autoFillFnF(fixedEmployee.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const netPayable = fnfNetPayable(form as any);

  /** Edit one deposit decision line and keep the refund total in lockstep. */
  const setDecision = (id: string, patch: Partial<DepositDecision>) => {
    setDetails((prev) => {
      const deposits = prev.deposits.map((d) => (d.deposit_id === id ? { ...d, ...patch } : d));
      setForm((f) => ({ ...f, deposit_refund: sumRefunds(deposits) }));
      return { ...prev, deposits };
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const missing = missingDecisionReasons(details.deposits);
      if (missing.length > 0) {
        throw new Error(
          `Write a reason for the amount being kept on: ${missing.map((m) => m.label).join(", ")}`,
        );
      }
      const payload = buildFnFPayload(selectedEmpId, form as any, details, calcNote, finalMonth as any);

      if (editingId) {
        // Re-check the lock against the live row: another user may have pushed
        // this F&F into the monthly payroll run while this dialog was open.
        const { data: current } = await (supabase as any)
          .from("hr_fnf_settlements")
          .select("status, razorpay_push_status")
          .eq("id", editingId)
          .maybeSingle();
        const lock = fnfEditLock(current);
        if (lock.locked) throw new Error(lock.reason);

        const { error } = await (supabase as any)
          .from("hr_fnf_settlements")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editingId);
        if (error) throw error;
        await syncFnFDepositReservations(editingId);
        return;
      }

      const { data: created, error } = await (supabase as any)
        .from("hr_fnf_settlements")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        // Backed by the partial unique index — one live settlement per employee.
        if ((error as any).code === "23505") {
          throw new Error("This employee already has an F&F settlement. Edit the existing one instead.");
        }
        throw error;
      }
      await syncFnFDepositReservations(created.id);
    },
    onSuccess: () => {
      invalidateFnFEverywhere(qc);
      toast.success(editingId ? "F&F Settlement updated" : "F&F Settlement created");
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Calculator className="h-4 w-4" /> {editingId ? "Edit F&F Settlement" : "New F&F Settlement"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Employee</Label>
            {fixedEmployee ? (
              <div className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                {`${fixedEmployee.first_name ?? ""} ${fixedEmployee.last_name ?? ""}`.trim() || "Employee"}
                {fixedEmployee.badge_id ? <span className="text-muted-foreground text-xs ml-2">({fixedEmployee.badge_id})</span> : null}
              </div>
            ) : (
              <EmployeePicker
                className="mt-1"
                placeholder={employees.length ? "Select separated employee" : "All separated employees already settled"}
                employees={employees}
                value={selectedEmpId}
                onChange={editingId ? () => {} : autoFillFnF}
                disabled={!!editingId}
              />
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              {editingId
                ? "One settlement per employee — the employee cannot be changed on an existing settlement."
                : fixedEmployee
                  ? "Opened from the exit checklist — the settlement belongs to this employee."
                  : "Employees with an existing settlement are not listed; edit their settlement from the list instead."}
            </p>
          </div>
          <div><Label>Last Working Day</Label><Input className="h-9 mt-1" type="date" value={form.last_working_day} onChange={(e) => setForm({ ...form, last_working_day: e.target.value, payroll_month: form.payroll_month || (e.target.value || "").slice(0, 7) })} /></div>

          <div>
            <Label>Payroll cycle month</Label>
            <Input
              className="h-9 mt-1"
              type="month"
              value={form.payroll_month}
              onChange={(e) => setForm({ ...form, payroll_month: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              The monthly payroll run this settlement is added to. Its dues and recoveries appear in the
              Monthly Payroll Cockpit → Additions / Deductions for this month, grouped under “F&amp;F settlement”.
              Defaults to the last working day's month.
            </p>
          </div>

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
            <div>
              <Label>Deposit / Recovery Refund (₹)</Label>
              <Input className="h-9 mt-1" type="number" readOnly value={form.deposit_refund} />
              <p className="text-[10px] text-muted-foreground mt-0.5">Sum of the decisions below.</p>
            </div>
            <div><Label>Penalty Ded. (₹)</Label><Input className="h-9 mt-1" type="number" value={form.penalty_deductions} onChange={(e) => setForm({ ...form, penalty_deductions: Number(e.target.value) })} /></div>
            <div><Label>Other Ded. (₹)</Label><Input className="h-9 mt-1" type="number" value={form.other_deductions} onChange={(e) => setForm({ ...form, other_deductions: Number(e.target.value) })} /></div>
          </div>

          {/* Every auto-filled recovery/refund traces back to live HRMS records. */}
          {selectedEmpId && (
            <div className="rounded-md border border-border divide-y divide-border text-xs">
              {[
                { key: "loans", label: "Loans & advances recovered", rows: details.loans, amount: (r: any) => Number(r.outstanding_balance || 0), title: (r: any) => `${r.loan_type || "loan"} — outstanding`, note: () => "" },
                { key: "penalties", label: "Penalties applied", rows: details.penalties, amount: (r: any) => Number(r.amount || 0), title: (r: any) => `${r.penalty_month || ""} ${r.penalty_type === "days" ? `${r.days} day penalty` : r.penalty_type || "penalty"}`.trim(), note: (r: any) => r.note || "" },
              ].map((sec) => (
                <div key={sec.key}>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-2 py-1.5 text-left"
                    onClick={() => setOpenDetail(openDetail === sec.key ? null : sec.key)}
                  >
                    <span className="text-muted-foreground">{sec.label} ({sec.rows.length})</span>
                    <span className="tabular-nums font-medium">
                      ₹{sec.rows.reduce((s: number, r: any) => s + sec.amount(r), 0).toLocaleString("en-IN")}
                    </span>
                  </button>
                  {openDetail === sec.key && (
                    sec.rows.length ? (
                      <ul className="px-3 pb-2 space-y-1">
                        {sec.rows.map((r: any) => (
                          <li key={r.id} className="flex items-start justify-between gap-2 text-[11px] text-muted-foreground">
                            <span>
                              {sec.title(r)} <span className="opacity-60">· {String(r.id).slice(0, 8)}</span>
                              {sec.note(r) && <span className="block opacity-70">{sec.note(r)}</span>}
                            </span>
                            <span className="tabular-nums">₹{sec.amount(r).toLocaleString("en-IN")}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-3 pb-2 text-[11px] text-muted-foreground">Nothing outstanding.</p>
                    )
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Deposits & error recoveries — one explicit decision per record.
              Nothing is written off silently; keeping money always needs a reason. */}
          {selectedEmpId && (
            <div className="rounded-md border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Deposits & error recoveries held ({details.deposits.length})</Label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  Paying back ₹{Number(form.deposit_refund || 0).toLocaleString("en-IN")}
                </span>
              </div>
              {details.deposits.length === 0 && (
                <p className="text-[11px] text-muted-foreground">No money is held for this employee.</p>
              )}
              {details.deposits.map((d) => {
                const withheld = Math.round((Number(d.held || 0) - Number(d.refund || 0)) * 100) / 100;
                const needsReason = withheld > 0 && !String(d.reason || "").trim();
                return (
                  <div key={d.deposit_id} className="rounded border border-border/70 p-2 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-foreground">{d.label}</span>
                      <span className="text-muted-foreground tabular-nums">Held ₹{d.held.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">Pay back (₹)</Label>
                        <Input
                          className="h-8 mt-1 text-foreground"
                          type="number"
                          min={0}
                          max={d.held}
                          value={d.refund}
                          onChange={(e) => {
                            const v = Math.min(Math.max(Number(e.target.value) || 0, 0), d.held);
                            setDecision(d.deposit_id, { refund: v });
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Company keeps (₹)</Label>
                        <Input className="h-8 mt-1" type="number" readOnly value={withheld} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                        onClick={() => setDecision(d.deposit_id, { refund: d.held })}>Refund full</Button>
                      <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                        onClick={() => setDecision(d.deposit_id, { refund: 0 })}>Keep full</Button>
                    </div>
                    {withheld > 0 && (
                      <div>
                        <Label className="text-[10px]">Reason for keeping the money (required)</Label>
                        <Input
                          className={`h-8 mt-1 text-foreground ${needsReason ? "border-destructive" : ""}`}
                          value={d.reason}
                          placeholder="e.g. adjusted against the loss caused on order #1234"
                          onChange={(e) => setDecision(d.deposit_id, { reason: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-[10px] text-muted-foreground">
                Saving reserves these records on the Deposit Management page. They are finally closed —
                paid back or withheld with your reason in the ledger — when the settlement is marked paid.
              </p>
            </div>
          )}

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
          <Button variant="outline" className="h-9" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => createMutation.mutate()} disabled={!selectedEmpId || !form.last_working_day || createMutation.isPending}>
            {createMutation.isPending ? (editingId ? "Saving..." : "Creating...") : (editingId ? "Save Changes" : "Create Settlement")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
