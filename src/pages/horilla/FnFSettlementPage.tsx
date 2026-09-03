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
import { Calculator, Plus, IndianRupee, AlertTriangle, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";
import { dismissInRazorpay } from "@/lib/razorpayPushback";
import { EmployeePicker } from "@/components/hrms/EmployeePicker";
import { SourceTag, DashboardLink } from "@/components/hr/payroll/SourceTag";
import { useAuth } from "@/hooks/useAuth";
import { computeFnFDraft, buildFnFPayload, fnfNetPayable, syncFnFDepositReservations, sumRefunds, missingDecisionReasons, type DepositDecision } from "@/lib/fnfEngine";

export default function FnFSettlementPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [payPrompt, setPayPrompt] = useState<{ id: string; name: string } | null>(null);
  const [paymentRef, setPaymentRef] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  // One settlement per employee: the dialog is either creating a new one or
  // editing the existing (still-editable) settlement of that employee.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dismissPrompt, setDismissPrompt] = useState<{ id: string; employee_id: string; name: string; lwd: string } | null>(null);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [form, setForm] = useState({
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
  // Provenance of the final-month salary figure — RazorpayX is the payroll authority.
  const [finalMonth, setFinalMonth] = useState<{
    state: "idle" | "loading" | "razorpay" | "awaiting";
    periodMonth?: string;
    source?: "razorpay" | "register_csv";
  }>({ state: "idle" });
  const [calcNote, setCalcNote] = useState<string>("");
  // Source records behind each auto-filled figure (shown as expandable detail
  // and written into breakdown.source_ids so the settlement stays auditable).
  const [details, setDetails] = useState<{
    loans: any[]; penalties: any[]; deposits: DepositDecision[]; writtenOff: any[];
  }>({ loans: [], penalties: [], deposits: [], writtenOff: [] });
  const [openDetail, setOpenDetail] = useState<string | null>(null);




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

  // An employee can hold only ONE live settlement (cancelled ones free the slot,
  // matching the DB's partial unique index). Those employees are not offered for
  // a new settlement — their existing record is edited instead.
  const settledEmployeeIds = new Set(
    settlements.filter((s: any) => s.status !== "cancelled").map((s: any) => s.employee_id)
  );
  const selectableEmployees = separatedEmployees.filter(
    (e: any) => !settledEmployeeIds.has(e.id) || e.id === selectedEmpId
  );
  const allSettled = separatedEmployees.length > 0 && selectableEmployees.length === 0 && !editingId;
  const EDITABLE_STATUSES = ["draft", "calculated"];

  // Payroll doctrine: RazorpayX is the payroll authority.
  //  • Pending (final-month) salary  → mirrored RazorpayX payslip record for the LWD month.
  //                                     Never computed locally. Missing ⇒ "awaiting RazorpayX".
  //  • Leave encashment / gratuity   → NOT payable per company policy. Removed.
  //  • Penalties                     → stored in DAYS, priced at the payroll one-day rate.
  //  • Deposits / error recoveries   → one editable refund/withhold decision each; nothing
  //                                     is ever written off silently.
  const autoFillFnF = async (empId: string) => {
    setSelectedEmpId(empId);
    const emp = separatedEmployees.find((e: any) => e.id === empId);
    if (!emp) return;
    setFinalMonth({ state: "loading" });

    const draft = await computeFnFDraft(empId, emp.last_working_day || null);
    setFinalMonth(draft.finalMonth);
    setDetails(draft.details);
    setCalcNote(draft.calcNote);
    setForm(draft.form);
  };

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
      qc.invalidateQueries({ queryKey: ["hr_fnf_settlements"] });
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      setShowCreate(false);
      toast.success(editingId ? "F&F Settlement updated" : "F&F Settlement created");
      setEditingId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setSelectedEmpId("");
    setDetails({ loans: [], penalties: [], deposits: [], writtenOff: [] });
    setCalcNote("");
    setFinalMonth({ state: "idle" });
    setForm({
      last_working_day: "", payroll_month: "", pending_salary: 0, leave_encashment_days: 0, leave_encashment_amount: 0,
      bonus_amount: 0, gratuity_amount: 0, notice_pay_recovery: 0, loan_recovery: 0, deposit_refund: 0,
      penalty_deductions: 0, other_deductions: 0, other_deductions_notes: "", notes: "",
    });
  };

  const openCreate = () => {
    setEditingId(null);
    resetForm();
    setShowCreate(true);
  };

  const openEdit = (s: any) => {
    setEditingId(s.id);
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
    setShowCreate(true);
  };



  // The DB state machine (fn_enforce_fnf_state_machine) is the contract:
  //   draft → calculated → approved → paid   (draft/calculated → cancelled)
  //   approving requires approved_by; marking paid requires payment_reference.
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, paymentReference }: { id: string; status: string; paymentReference?: string }) => {
      // Money kept at exit must carry a written reason before the settlement moves forward.
      if (status === "approved" || status === "paid") {
        const { data: row } = await (supabase as any)
          .from("hr_fnf_settlements").select("breakdown").eq("id", id).maybeSingle();
        const decisions: DepositDecision[] = (row?.breakdown?.deposit_decisions || []).map((d: any) => ({
          deposit_id: d.deposit_id, deposit_type: d.deposit_type || "security",
          held: Number(d.held || 0), refund: Number(d.refund || 0), reason: d.reason || "",
          label: d.label || "Deposit", is_paused: false,
        }));
        const missing = missingDecisionReasons(decisions);
        if (missing.length > 0) {
          throw new Error(
            `Edit the settlement and write a reason for the amount being kept on: ${missing.map((m) => m.label).join(", ")}`,
          );
        }
      }
      const payload: any = { status, updated_at: new Date().toISOString() };

      if (status === "approved") payload.approved_by = user?.username || user?.id || "hr";
      if (status === "paid") {
        payload.paid_at = new Date().toISOString();
        payload.payment_reference = paymentReference;
      }
      const { error } = await (supabase as any).from("hr_fnf_settlements").update(payload).eq("id", id);
      if (error) throw error;

      // Cancelling releases every deposit this settlement had reserved.
      if (status === "cancelled") {
        try { await syncFnFDepositReservations(id); }
        catch (e: any) { toast.error(`Cancelled, but releasing the reserved deposits failed: ${e.message}`); }
      }


      // Approval is the moment the settlement enters payroll: F&F is the ONLY
      // thing that schedules additions/deductions for a leaver.
      if (status === "approved") {
        const { data: pushRes, error: pushErr } = await (supabase as any).functions.invoke("hr-push-fnf", {
          body: { settlement_id: id },
        });
        if (pushErr || pushRes?.ok === false) {
          toast.error(`Approved, but the RazorpayX push did not verify: ${pushRes?.error ?? pushErr?.message ?? "unknown error"}`);
        } else if (pushRes?.nothing_to_push) {
          toast.info("Approved — no additions or deductions to push to RazorpayX.");
        } else {
          toast.success("Approved and pushed to the RazorpayX final payroll run (read-back verified).");
        }
      }

      // Auto-deactivate employee when F&F is paid + surface Razorpay dismiss prompt
      if (status === "paid") {
        // Close every source record the settlement recovered/refunded.
        const { error: closeErr } = await (supabase as any).rpc("hr_close_fnf_sources", { p_settlement_id: id });
        if (closeErr) toast.error(`Paid, but closing loans/penalties/deposits failed: ${closeErr.message}`);

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
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      toast.success("Status updated");
      if (result) {
        setDismissPrompt({ id: result.settledId, employee_id: result.employee_id, name: result.name, lwd: result.lwd });
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Retry the RazorpayX push for an approved settlement whose read-back failed.
  const pushMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).functions.invoke("hr-push-fnf", { body: { settlement_id: id } });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || "Push did not verify on the RazorpayX read-back");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_fnf_settlements"] });
      toast.success("Pushed to RazorpayX and verified on the run");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Delete a settlement and unwind everything it touched ──────────────────
  // hr_delete_fnf_settlement reopens reserved/closed deposits and error
  // recoveries (with a released ledger entry), reopens loans it closed,
  // un-applies its penalties, unticks the exit-checklist F&F item, and refuses
  // outright once the settlement is live in a RazorpayX payroll run.
  const [deletePrompt, setDeletePrompt] = useState<{ id: string; name: string; status: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const deleteMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await (supabase as any).rpc("hr_delete_fnf_settlement", {
        p_settlement_id: id,
        p_reason: reason,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["hr_fnf_settlements"] });
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      qc.invalidateQueries({ queryKey: ["resignation-fnf"] });
      qc.invalidateQueries({ queryKey: ["resignation-checklist"] });
      qc.invalidateQueries({ queryKey: ["hr_loans"] });
      const bits = [
        res?.deposits_reopened ? `${res.deposits_reopened} deposit/recovery reopened` : null,
        res?.deposits_released ? `${res.deposits_released} reservation released` : null,
        res?.loans_reopened ? `${res.loans_reopened} loan reopened` : null,
        res?.penalties_reopened ? `${res.penalties_reopened} penalty reopened` : null,
        res?.checklist_unticked ? "exit checklist unticked" : null,
      ].filter(Boolean);
      toast.success(
        bits.length ? `Settlement deleted — ${bits.join(", ")}.` : "Settlement deleted — nothing else was affected.",
      );
      setDeletePrompt(null);
      setDeleteReason("");
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
      calculated: "bg-warning/10 text-warning border-warning/20",
      pending_approval: "bg-warning/10 text-warning border-warning/20",
      approved: "bg-info/10 text-info border-info/20",
      cancelled: "bg-destructive/10 text-destructive border-destructive/20",
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
          <Button
            className="h-9 bg-[#E8604C] hover:bg-[#d4553f]"
            onClick={openCreate}
            disabled={allSettled}
            title={allSettled ? "Every separated employee already has a settlement — edit the existing one" : undefined}
          >
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
            <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={openCreate}>
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
                      {s.razorpay_push_status && s.razorpay_push_status !== "pushed" && (
                        <span className="block mt-0.5 text-[10px] text-destructive" title={s.push_failure_reason || undefined}>
                          RazorpayX push {s.razorpay_push_status}
                        </span>
                      )}
                      {s.razorpay_push_status === "pushed" && (
                        <span className="block mt-0.5 text-[10px] text-success">Pushed to RazorpayX</span>
                      )}
                    </div>
                    {s.status === "approved" && s.razorpay_push_status !== "pushed" && (
                      <Button size="sm" variant="outline" className="h-8" disabled={pushMutation.isPending} onClick={() => pushMutation.mutate(s.id)}>
                        Retry push
                      </Button>
                    )}

                    {EDITABLE_STATUSES.includes(s.status) && (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => openEdit(s)}>
                        Edit
                      </Button>
                    )}

                    {s.status === "draft" && (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => updateStatusMutation.mutate({ id: s.id, status: "calculated" })}>
                        Submit
                      </Button>
                    )}
                    {(s.status === "calculated" || s.status === "pending_approval") && (
                      <Button size="sm" className="h-8" onClick={() => updateStatusMutation.mutate({ id: s.id, status: "approved" })}>
                        Approve
                      </Button>
                    )}
                    {s.status === "approved" && (() => {
                      const sourceConfirmed = ["razorpay", "register_csv"].includes(s.breakdown?.pending_salary_source);
                      const nothingToPay = Number(s.net_payable ?? 0) === 0;
                      const canMarkPaid = sourceConfirmed || nothingToPay;
                      return (
                        <Button
                          size="sm"
                          className="h-8 bg-success hover:bg-success"
                          disabled={!canMarkPaid}
                          title={
                            canMarkPaid
                              ? nothingToPay && !sourceConfirmed
                                ? "Zero-value settlement — nothing to pay"
                                : undefined
                              : "Final-month salary is not confirmed from RazorpayX yet"
                          }
                          onClick={() => {
                            setPaymentRef("");
                            setPayPrompt({
                              id: s.id,
                              name: `${s.hr_employees?.first_name ?? ""} ${s.hr_employees?.last_name ?? ""}`.trim() || "employee",
                            });
                          }}
                        >
                          Mark Paid
                        </Button>
                      );
                    })()}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                      title={
                        s.razorpay_push_status === "pushed"
                          ? "Already pushed to RazorpayX — remove it there first"
                          : "Delete this settlement and unwind everything it touched"
                      }
                      onClick={() => {
                        setDeleteReason("");
                        setDeletePrompt({
                          id: s.id,
                          status: s.status,
                          name: `${s.hr_employees?.first_name ?? ""} ${s.hr_employees?.last_name ?? ""}`.trim() || "employee",
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>


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

      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { setEditingId(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Calculator className="h-4 w-4" /> {editingId ? "Edit F&F Settlement" : "New F&F Settlement"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <EmployeePicker
                className="mt-1"
                placeholder={selectableEmployees.length ? "Select separated employee" : "All separated employees already settled"}
                employees={selectableEmployees}
                value={selectedEmpId}
                onChange={editingId ? () => {} : autoFillFnF}
                disabled={!!editingId}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {editingId
                  ? "One settlement per employee — the employee cannot be changed on an existing settlement."
                  : "Employees with an existing settlement are not listed; edit their settlement from the list instead."}
              </p>
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
            <Button variant="outline" className="h-9" onClick={() => { setShowCreate(false); setEditingId(null); }}>Cancel</Button>
            <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => createMutation.mutate()} disabled={!selectedEmpId || !form.last_working_day || createMutation.isPending}>
              {createMutation.isPending ? (editingId ? "Saving..." : "Creating...") : (editingId ? "Save Changes" : "Create Settlement")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payPrompt} onOpenChange={(o) => { if (!o) setPayPrompt(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Mark F&amp;F as Paid</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Record the bank/UTR reference for <strong>{payPrompt?.name}</strong>. A payment reference is mandatory before a settlement can be marked paid.
            </p>
            <Label>Payment Reference</Label>
            <Input className="h-9" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="UTR / transaction ID" />
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-9" onClick={() => setPayPrompt(null)}>Cancel</Button>
            <Button
              className="h-9 bg-success hover:bg-success"
              disabled={!paymentRef.trim() || updateStatusMutation.isPending}
              onClick={() => {
                if (!payPrompt) return;
                updateStatusMutation.mutate({ id: payPrompt.id, status: "paid", paymentReference: paymentRef.trim() });
                setPayPrompt(null);
              }}
            >
              Confirm Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletePrompt} onOpenChange={(o) => { if (!o) { setDeletePrompt(null); setDeleteReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the F&amp;F settlement of {deletePrompt?.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-xs">
                <p>Deleting does not just remove the sheet — everything this settlement touched is put back:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Security deposits and error recoveries it reserved or paid back / withheld are reopened with their full held amount, and the reason is written into the deposit history.</li>
                  <li>Loans it closed are reopened with the outstanding recalculated from the repayments actually paid.</li>
                  <li>Penalties it applied become open again.</li>
                  <li>The “Full &amp; Final settlement initiated” item on the exit checklist is unticked.</li>
                </ul>
                <p className="text-destructive">
                  If it was already pushed to RazorpayX, deletion is refused — remove the F&amp;F addition/deduction in RazorpayX first.
                </p>
                <p className="text-muted-foreground">
                  The employee’s account stays deactivated if the settlement was already paid — reactivate it from the employee page if that is what you want.
                </p>

              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label>Reason for deleting <span className="text-destructive">*</span></Label>
            <Textarea
              rows={2}
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. created for the wrong employee / wrong last working day"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteReason.trim() || deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!deletePrompt) return;
                deleteMutation.mutate({ id: deletePrompt.id, reason: deleteReason.trim() });
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete & unwind"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


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
