import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Calculator, Plus, IndianRupee, AlertTriangle, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";
import { dismissInRazorpay } from "@/lib/razorpayPushback";
import { SourceTag } from "@/components/hr/payroll/SourceTag";
import { useAuth } from "@/hooks/useAuth";
import { syncFnFDepositReservations, missingDecisionReasons, type DepositDecision } from "@/lib/fnfEngine";
import { FnFSettlementDialog } from "@/components/hrms/FnFSettlementDialog";
import { finalizeSeparation } from "@/lib/finalizeSeparation";


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
    (e: any) => !settledEmployeeIds.has(e.id)
  );
  const allSettled = separatedEmployees.length > 0 && selectableEmployees.length === 0 && !editingId;
  const EDITABLE_STATUSES = ["draft", "calculated"];

  // The create/edit form lives in the shared FnFSettlementDialog — the same
  // dialog is opened from the exit checklist on the Separation page.
  const openCreate = () => {
    setEditingId(null);
    setShowCreate(true);
  };

  const openEdit = (s: any) => {
    setEditingId(s.id);
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
          .from("hr_fnf_settlements").select("breakdown, razorpay_push_status").eq("id", id).maybeSingle();
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
        // Marking paid also completes the separation, so the payroll lines must be
        // verified on the live RazorpayX run first.
        if (status === "paid" && !["pushed", "nothing_to_push"].includes(String(row?.razorpay_push_status || ""))) {
          throw new Error(
            "The F&F lines are not verified on the RazorpayX payroll run yet — retry the push before marking this paid.",
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

      // Paid = the F&F money is verified on the payroll run. This is the ONLY
      // moment the separation is finalised (ERP login off, biometrics removed,
      // employee deactivated) and the RazorpayX dismissal is offered.
      if (status === "paid") {
        // Close every source record the settlement recovered/refunded.
        const { error: closeErr } = await (supabase as any).rpc("hr_close_fnf_sources", { p_settlement_id: id });
        if (closeErr) toast.error(`Paid, but closing loans/penalties/deposits failed: ${closeErr.message}`);

        const { data: settlement } = await (supabase as any)
          .from("hr_fnf_settlements")
          .select("employee_id, last_working_day")
          .eq("id", id)
          .single();
        if (settlement?.employee_id) {
          const fin = await finalizeSeparation(settlement.employee_id);
          return {
            settledId: id,
            employee_id: settlement.employee_id,
            name: fin.name,
            lwd: settlement.last_working_day || fin.lwd || new Date().toISOString().slice(0, 10),
            erp: fin.erp,
          };
        }
      }

      return null;
    },

    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["hr_fnf_settlements"] });
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      qc.invalidateQueries({ queryKey: ["resignation-employees"] });
      toast.success("Status updated");
      if (result) {
        toast.success(
          `Separation completed for ${result.name} — employee deactivated${result.erp?.deactivated ? ", ERP login disabled" : ""}.`,
        );
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
                    <p className="text-xs text-muted-foreground mt-0.5">
                      LWD: <span className="tabular-nums">{s.last_working_day}</span>
                      <span className="mx-1.5">·</span>
                      Payroll cycle: <span className="tabular-nums">{String(s.payroll_month || s.last_working_day || "").slice(0, 7)}</span>
                    </p>
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

      <FnFSettlementDialog
        open={showCreate}
        onOpenChange={(o) => { setShowCreate(o); if (!o) setEditingId(null); }}
        employees={selectableEmployees}
        settlement={editingId ? settlements.find((s: any) => s.id === editingId) ?? null : null}
      />

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
