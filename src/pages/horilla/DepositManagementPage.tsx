import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Wallet, Eye, Edit2, CheckCircle, BadgeIndianRupee, Shield, Pause, Play, ChevronRight, ChevronDown, Undo2, Trash2, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { SeedDepositsDialog } from "@/components/hr/payroll/SeedDepositsDialog";
import { EmployeePicker } from "@/components/hrms/EmployeePicker";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type DepositType = "security" | "error_recovery";
type Lifecycle = "active" | "collected" | "refunded" | "exited_unpaid" | "cancelled";
type SubTab = Lifecycle | "all";

const TYPE_LABEL: Record<DepositType, string> = {
  security: "Security Deposit",
  error_recovery: "Error Recovery",
};

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "collected", label: "Collected" },
  { key: "refunded", label: "Paid back" },
  { key: "exited_unpaid", label: "Exited — unpaid" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const LIFECYCLE_BADGE: Record<Lifecycle, { label: string; cls: string }> = {
  active: { label: "Collecting", cls: "bg-warning/10 text-warning" },
  collected: { label: "Collected — held", cls: "bg-success/10 text-success" },
  refunded: { label: "Paid back", cls: "bg-primary/10 text-primary" },
  exited_unpaid: { label: "Exited — unpaid", cls: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled — exited", cls: "bg-muted text-muted-foreground" },
};

/** Single source of truth for which bucket a deposit belongs to. */
function lifecycleOf(d: any): Lifecycle {
  if (["refunded", "withheld", "partial"].includes(d.refund_status) || d.is_recovered || d.is_settled) return "refunded";
  const employeeActive = d.hr_employees?.is_active !== false;
  const held = Number(d.collected_amount || 0) > 0;
  // An exited employee can never be "collecting" — nothing more can be deducted.
  if (!employeeActive) return held ? "exited_unpaid" : "cancelled";
  if (d.is_fully_collected) return "collected";
  return "active";
}

/** A deposit governed by a live F&F settlement is locked here — F&F decides its fate. */
const isFnfLocked = (d: any) => ["reserved", "closed"].includes(d.fnf_state || "none");

const inr = (n: any) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function DepositManagementPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<DepositType>("security");
  const [subTab, setSubTab] = useState<SubTab>("active");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showTransactions, setShowTransactions] = useState<string | null>(null);
  const [editingDeposit, setEditingDeposit] = useState<any>(null);
  const [editReason, setEditReason] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});


  // Refund ("pay back to employee") dialog
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMonth, setRefundMonth] = useState(format(new Date(), "yyyy-MM"));
  const [withheldReason, setWithheldReason] = useState("");

  // Delete / cancel remaining EMIs
  const [deleteTarget, setDeleteTarget] = useState<any>(null);



  const emptyForm = {
    employee_id: "",
    deposit_type: "security" as DepositType,
    total_deposit_amount: "",
    deduction_mode: "fixed_installment",
    deduction_value: "",
    deduction_start_month: format(new Date(), "yyyy-MM"),
    incident_date: "",
    incident_reference: "",
    recovery_reason: "",
  };
  const [form, setForm] = useState(emptyForm);

  const { data: allDeposits = [], isLoading } = useQuery({
    queryKey: ["hr_employee_deposits"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employee_deposits")
        .select("*, hr_employees!hr_employee_deposits_employee_id_fkey(id, badge_id, first_name, last_name, is_active)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const typeDeposits = useMemo(
    () => allDeposits.filter((d: any) => (d.deposit_type || "security") === tab),
    [allDeposits, tab],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0, collected: 0, refunded: 0, exited_unpaid: 0, cancelled: 0, all: typeDeposits.length };
    typeDeposits.forEach((d: any) => { c[lifecycleOf(d)] += 1; });
    return c;
  }, [typeDeposits]);

  const deposits = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = subTab === "all" ? typeDeposits : typeDeposits.filter((d: any) => lifecycleOf(d) === subTab);
    if (q) {
      list = list.filter((d: any) => {
        const e = d.hr_employees || {};
        const name = `${e.first_name || ""} ${e.last_name || ""}`.toLowerCase();
        return name.includes(q) || String(e.badge_id || "").toLowerCase().includes(q);
      });
    }
    return list;
  }, [typeDeposits, subTab, search]);

  // One row per employee, entries nested underneath
  const groups = useMemo(() => {
    const map = new Map<string, { employee: any; rows: any[] }>();
    deposits.forEach((d: any) => {
      const key = d.employee_id;
      if (!map.has(key)) map.set(key, { employee: d.hr_employees, rows: [] });
      map.get(key)!.rows.push(d);
    });
    return Array.from(map.entries()).map(([employee_id, g]) => {
      const total = g.rows.reduce((s, r) => s + Number(r.total_deposit_amount || 0), 0);
      const collected = g.rows.reduce((s, r) => s + Number(r.collected_amount || 0), 0);
      const balance = g.rows.reduce((s, r) => s + Number(r.current_balance || 0), 0);
      const refunded = g.rows.reduce((s, r) => s + Number(r.refund_amount || 0), 0);
      const withheld = g.rows.reduce((s, r) => s + Number(r.withheld_amount || 0), 0);
      return { employee_id, employee: g.employee, rows: g.rows, total, collected, balance, refunded, withheld };
    }).sort((a, b) => (a.employee?.first_name || "").localeCompare(b.employee?.first_name || ""));
  }, [deposits]);

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active_deposit"],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() => (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name, total_salary").eq("is_active", true).order("first_name"));
      return data || [];
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["hr_deposit_transactions", showTransactions],
    queryFn: async () => {
      if (!showTransactions) return [];
      const { data, error } = await (supabase as any)
        .from("hr_deposit_transactions")
        .select("*")
        .eq("deposit_id", showTransactions)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!showTransactions,
  });

  /**
   * Installments of the record being deleted that have ALREADY gone to RazorpayX.
   * RazorpayX has no delete endpoint for a single payroll deduction, so once an
   * installment is pushed the money is live on that month's payroll — deleting
   * the HRMS record silently would leave an orphan deduction there.
   */
  const { data: pushedInstallments = [] } = useQuery({
    queryKey: ["hr_deposit_pushed_installments", deleteTarget?.id],
    queryFn: async () => {
      const { data: sched } = await (supabase as any)
        .from("hr_employee_deposit_schedule")
        .select("id, period_month, amount, status")
        .eq("deposit_id", deleteTarget.id);
      const rows = (sched || []) as any[];
      const ids = rows.map((r) => r.id);
      let pushedRefs = new Set<string>();
      if (ids.length) {
        const { data: ded } = await (supabase as any)
          .from("hr_payroll_input_deductions")
          .select("recovery_ref_id, pushed_at, amount, period_month")
          .eq("recovery_kind", "deposit")
          .in("recovery_ref_id", ids)
          .not("pushed_at", "is", null);
        pushedRefs = new Set((ded || []).map((d: any) => d.recovery_ref_id));
      }
      return rows.filter((r) => r.status === "pushed" || pushedRefs.has(r.id));
    },
    enabled: !!deleteTarget?.id,
  });



  const addMutation = useMutation({
    mutationFn: async () => {
      const totalAmt = Number(form.total_deposit_amount);
      const isAlreadyDeducted = form.deduction_mode === "already_deducted";
      const isRecovery = form.deposit_type === "error_recovery";
      const { data: inserted, error } = await (supabase as any).from("hr_employee_deposits").insert({
        employee_id: form.employee_id,
        deposit_type: form.deposit_type,
        total_deposit_amount: totalAmt,
        deduction_mode: form.deduction_mode,
        deduction_value: isAlreadyDeducted ? totalAmt : Number(form.deduction_value),
        deduction_start_month: isAlreadyDeducted ? null : form.deduction_start_month,
        collected_amount: isAlreadyDeducted ? totalAmt : 0,
        current_balance: isAlreadyDeducted ? totalAmt : 0,
        is_fully_collected: isAlreadyDeducted,
        incident_date: isRecovery && form.incident_date ? form.incident_date : null,
        incident_reference: isRecovery ? form.incident_reference || null : null,
        recovery_reason: isRecovery ? form.recovery_reason || null : null,
      }).select("id").single();
      if (error) throw error;

      await (supabase as any).from("hr_deposit_transactions").insert({
        employee_id: form.employee_id,
        deposit_id: inserted.id,
        deposit_type: form.deposit_type,
        transaction_type: "initiated",
        amount: isAlreadyDeducted ? totalAmt : 0,
        balance_after: isAlreadyDeducted ? totalAmt : 0,
        description: `${TYPE_LABEL[form.deposit_type]} initiated — Target: ${inr(totalAmt)}${isAlreadyDeducted ? " (pre-collected)" : ""}`,
        transaction_date: new Date().toISOString().slice(0, 10),
      });

      const { error: schedErr } = await (supabase as any).rpc("hr_rebuild_deposit_schedule", { p_deposit_id: inserted.id });
      if (schedErr) throw new Error(`Deposit saved but schedule failed: ${schedErr.message}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      setShowAdd(false);
      setForm({ ...emptyForm, deposit_type: tab });
      toast.success("Deposit added and monthly deductions scheduled");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // An edit never silently changes money: the old and new values, who changed them,
  // when, and why are appended to the deposit ledger. Records governed by a live
  // F&F settlement are immutable here.
  const editMutation = useMutation({
    mutationFn: async () => {
      if (isFnfLocked(editingDeposit)) {
        throw new Error("This record is reserved by an F&F settlement — change it from the F&F settlement instead.");
      }
      const oldAmount = Number(editingDeposit.total_deposit_amount);
      const newAmount = Number(form.total_deposit_amount);
      const oldMode = editingDeposit.deduction_mode;
      const newMode = form.deduction_mode;
      const oldValue = Number(editingDeposit.deduction_value);
      const newValue = Number(form.deduction_value);

      const changes: string[] = [];
      if (oldAmount !== newAmount) changes.push(`Amount: ${inr(oldAmount)} → ${inr(newAmount)}`);
      if (oldMode !== newMode) changes.push(`Mode: ${oldMode} → ${newMode}`);
      if (oldValue !== newValue) changes.push(`Value: ${oldValue} → ${newValue}`);
      if (changes.length > 0 && !editReason.trim()) {
        throw new Error("Write the reason for this change — it is kept in the deposit ledger.");
      }
      if (newAmount < Number(editingDeposit.collected_amount || 0)) {
        throw new Error(`Target cannot be below the ${inr(editingDeposit.collected_amount)} already collected.`);
      }

      const isRecovery = (editingDeposit.deposit_type || "security") === "error_recovery";
      const { error } = await (supabase as any).from("hr_employee_deposits").update({
        total_deposit_amount: newAmount,
        deduction_mode: newMode,
        deduction_value: newValue,
        deduction_start_month: form.deduction_start_month,
        incident_date: isRecovery && form.incident_date ? form.incident_date : null,
        incident_reference: isRecovery ? form.incident_reference || null : null,
        recovery_reason: isRecovery ? form.recovery_reason || null : null,
        updated_at: new Date().toISOString(),
      }).eq("id", editingDeposit.id);
      if (error) throw error;

      if (changes.length > 0) {
        const { data: auth } = await (supabase as any).auth.getUser();
        const actor = auth?.user?.email || auth?.user?.id || "unknown user";
        await (supabase as any).from("hr_deposit_transactions").insert({
          employee_id: editingDeposit.employee_id,
          deposit_id: editingDeposit.id,
          deposit_type: editingDeposit.deposit_type || "security",
          transaction_type: "modified",
          amount: 0,
          balance_after: Number(editingDeposit.current_balance),
          description: `Modified: ${changes.join("; ")} · Reason: ${editReason.trim()} · By: ${actor}`,
          transaction_date: new Date().toISOString().slice(0, 10),
        });
      }

      const { error: schedErr } = await (supabase as any).rpc("hr_rebuild_deposit_schedule", { p_deposit_id: editingDeposit.id });
      if (schedErr) throw new Error(`Deposit updated but schedule failed: ${schedErr.message}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      qc.invalidateQueries({ queryKey: ["hr_deposit_transactions"] });
      setShowEdit(false);
      setEditingDeposit(null);
      setEditReason("");
      toast.success("Deposit updated and schedule rebuilt");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pauseResumeMutation = useMutation({
    mutationFn: async ({ deposit, action }: { deposit: any; action: "pause" | "resume" }) => {
      const isPausing = action === "pause";
      const { error } = await (supabase as any).from("hr_employee_deposits").update({
        is_paused: isPausing,
        paused_at: isPausing ? new Date().toISOString() : null,
        paused_reason: isPausing ? "Manually paused by admin" : null,
        updated_at: new Date().toISOString(),
      }).eq("id", deposit.id);
      if (error) throw error;

      await (supabase as any).from("hr_deposit_transactions").insert({
        employee_id: deposit.employee_id,
        deposit_id: deposit.id,
        deposit_type: deposit.deposit_type || "security",
        transaction_type: isPausing ? "paused" : "resumed",
        amount: 0,
        balance_after: Number(deposit.current_balance),
        description: isPausing ? "Deposit deductions paused by admin" : "Deposit deductions resumed by admin",
        transaction_date: new Date().toISOString().slice(0, 10),
      });

      await (supabase as any).rpc("hr_rebuild_deposit_schedule", { p_deposit_id: deposit.id });
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      qc.invalidateQueries({ queryKey: ["hr_deposit_transactions"] });
      toast.success(action === "pause" ? "Deposit paused" : "Deposit resumed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  /**
   * Delete a deposit / error recovery.
   * - Nothing collected yet → the record and its (empty) schedule + audit rows are removed outright.
   * - Money already collected → collections are never destroyed: only the pending future
   *   installments are removed and the record is closed as cancelled, keeping the held amount
   *   and its ledger intact so it can still be paid back later.
   */
  const deleteMutation = useMutation({
    mutationFn: async (d: any) => {
      const collected = Number(d.collected_amount || 0);

      // Re-check live: an installment already pushed to RazorpayX must never be
      // wiped silently — the deduction stays live on that month's payroll.
      const { data: liveSched } = await (supabase as any)
        .from("hr_employee_deposit_schedule")
        .select("id, status")
        .eq("deposit_id", d.id);
      const liveIds = ((liveSched || []) as any[]).map((r) => r.id);
      let livePushed = ((liveSched || []) as any[]).filter((r) => r.status === "pushed").map((r) => r.id);
      if (liveIds.length) {
        const { data: ded } = await (supabase as any)
          .from("hr_payroll_input_deductions")
          .select("recovery_ref_id")
          .eq("recovery_kind", "deposit")
          .in("recovery_ref_id", liveIds)
          .not("pushed_at", "is", null);
        livePushed = [...new Set([...livePushed, ...((ded || []) as any[]).map((x) => x.recovery_ref_id)])];
      }
      if (livePushed.length > 0 && !deleteAcknowledged) {
        throw new Error(
          `${livePushed.length} installment(s) of this record are already pushed to RazorpayX. Reverse them in RazorpayX first, then confirm the acknowledgement.`,
        );
      }

      // Never destroy collected or already-pushed installments.
      const { error: schedErr } = await (supabase as any)
        .from("hr_employee_deposit_schedule")
        .delete()
        .eq("deposit_id", d.id)
        .neq("status", "collected")
        .neq("status", "pushed");
      if (schedErr) throw schedErr;



      if (collected <= 0) {
        await (supabase as any).from("hr_deposit_transactions").delete().eq("deposit_id", d.id);
        const { error } = await (supabase as any).from("hr_employee_deposits").delete().eq("id", d.id);
        if (error) throw error;
        return { hardDeleted: true };
      }

      await (supabase as any).from("hr_deposit_transactions").insert({
        employee_id: d.employee_id,
        deposit_id: d.id,
        deposit_type: d.deposit_type || "security",
        transaction_type: "modified",
        amount: 0,
        balance_after: Number(d.current_balance || 0),
        description: `Remaining installments cancelled by admin — ${inr(collected)} already collected retained`,
        transaction_date: new Date().toISOString().slice(0, 10),
      });

      const { error } = await (supabase as any).from("hr_employee_deposits").update({
        is_paused: true,
        paused_at: new Date().toISOString(),
        paused_reason: "Remaining installments cancelled",
        is_fully_collected: true,
        current_balance: collected,
        settlement_notes: `Cancelled by admin — collected ${inr(collected)} of ${inr(d.total_deposit_amount)} retained`,
        updated_at: new Date().toISOString(),
      }).eq("id", d.id);
      if (error) throw error;
      return { hardDeleted: false };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      qc.invalidateQueries({ queryKey: ["hr_deposit_transactions"] });
      setDeleteTarget(null);
      toast.success(r.hardDeleted ? "Record deleted" : "Remaining installments cancelled — collected amount kept");
    },
    onError: (e: any) => toast.error(e.message),
  });

  /** Pay back to employee — stages a payroll addition and closes the record. */
  const refundMutation = useMutation({
    mutationFn: async () => {
      const d = refundTarget;
      const held = Number(d.collected_amount || 0);
      const amount = Number(refundAmount);
      if (!(amount > 0)) throw new Error("Enter a refund amount greater than zero");
      if (amount > held) throw new Error(`Refund cannot exceed the amount held (${inr(held)})`);
      const withheld = Math.round((held - amount) * 100) / 100;
      if (withheld > 0 && !withheldReason.trim()) throw new Error("A reason is required when part of the amount is withheld");

      const period = `${refundMonth}-01`;
      const isRecovery = (d.deposit_type || "security") === "error_recovery";
      const label = isRecovery
        ? `Error recovery refund${d.incident_reference ? ` (${d.incident_reference})` : ""}`
        : "Security deposit refund";

      // razorpay_employee_id is NOT NULL on the inputs table — resolve the mapping first
      const { data: mapRow, error: mapErr } = await (supabase as any)
        .from("hr_razorpay_employee_map")
        .select("razorpay_employee_id")
        .eq("hr_employee_id", d.employee_id)
        .not("razorpay_employee_id", "is", null)
        .maybeSingle();
      if (mapErr) throw mapErr;
      if (!mapRow?.razorpay_employee_id) {
        throw new Error("This employee is not mapped to RazorpayX yet — map them before staging a pay back.");
      }

      const { error: addErr } = await (supabase as any).from("hr_payroll_input_additions").insert({
        hr_employee_id: d.employee_id,
        razorpay_employee_id: mapRow.razorpay_employee_id,
        period_month: period,
        amount,
        label,
        addition_type: 0,
        taxable: false,
      });
      if (addErr) throw addErr;


      await (supabase as any).from("hr_deposit_transactions").insert({
        employee_id: d.employee_id,
        deposit_id: d.id,
        deposit_type: d.deposit_type || "security",
        transaction_type: "refund",
        amount: -amount,
        balance_after: withheld,
        description: `${inr(amount)} paid back via payroll addition (${refundMonth})${withheld > 0 ? ` · ${inr(withheld)} withheld — ${withheldReason.trim()}` : ""}`,
        transaction_date: new Date().toISOString().slice(0, 10),
        period_month: period,
      });

      const { error } = await (supabase as any).from("hr_employee_deposits").update({
        refund_status: "refunded",
        refund_amount: amount,
        withheld_amount: withheld,
        withheld_reason: withheld > 0 ? withheldReason.trim() : null,
        refunded_at: new Date().toISOString(),
        refund_period_month: period,
        is_recovered: isRecovery ? true : undefined,
        recovered_at: isRecovery ? new Date().toISOString() : undefined,
        is_settled: true,
        settled_at: new Date().toISOString(),
        current_balance: withheld,
        settlement_notes: withheld > 0 ? `Partially paid back — ${withheldReason.trim()}` : "Paid back in full",
        updated_at: new Date().toISOString(),
      }).eq("id", d.id);
      if (error) throw error;

      await (supabase as any).rpc("hr_rebuild_deposit_schedule", { p_deposit_id: d.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      qc.invalidateQueries({ queryKey: ["hr_deposit_transactions"] });
      setRefundTarget(null);
      toast.success("Refund staged as a payroll addition — record moved to Paid back");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openRefund = (d: any) => {
    setRefundTarget(d);
    setRefundAmount(String(Number(d.collected_amount || 0)));
    setRefundMonth(format(new Date(), "yyyy-MM"));
    setWithheldReason("");
  };

  const openEdit = (d: any) => {
    setEditingDeposit(d);
    setForm({
      employee_id: d.employee_id,
      deposit_type: (d.deposit_type || "security") as DepositType,
      total_deposit_amount: String(d.total_deposit_amount),
      deduction_mode: d.deduction_mode,
      deduction_value: String(d.deduction_value),
      deduction_start_month: d.deduction_start_month || "",
      incident_date: d.incident_date || "",
      incident_reference: d.incident_reference || "",
      recovery_reason: d.recovery_reason || "",
    });
    setEditReason("");
    setShowEdit(true);
  };

  const totalDeposits = deposits.reduce((s: number, d: any) => s + Number(d.total_deposit_amount || 0), 0);
  const totalCollected = deposits.reduce((s: number, d: any) => s + Number(d.collected_amount || 0), 0);
  const totalRefunded = deposits.reduce((s: number, d: any) => s + Number(d.refund_amount || 0), 0);
  const totalWithheld = deposits.reduce((s: number, d: any) => s + Number(d.withheld_amount || 0), 0);

  const summaryTiles = subTab === "refunded"
    ? [
        { label: "Records", value: String(deposits.length), icon: Wallet, color: "text-info", bg: "bg-info/10" },
        { label: "Collected", value: inr(totalCollected), icon: BadgeIndianRupee, color: "text-success", bg: "bg-success/10" },
        { label: "Paid back", value: inr(totalRefunded), icon: Undo2, color: "text-primary", bg: "bg-primary/10" },
        { label: "Withheld", value: inr(totalWithheld), icon: Shield, color: "text-warning", bg: "bg-warning/10" },
      ]
    : [
        { label: `Total ${TYPE_LABEL[tab]}`, value: inr(totalDeposits), icon: Wallet, color: "text-info", bg: "bg-info/10" },
        { label: "Collected", value: inr(totalCollected), icon: BadgeIndianRupee, color: "text-success", bg: "bg-success/10" },
        { label: subTab === "exited_unpaid" || subTab === "collected" ? "Held by company" : "Outstanding", value: subTab === "exited_unpaid" || subTab === "collected" ? inr(totalCollected) : inr(Math.max(totalDeposits - totalCollected, 0)), icon: Shield, color: "text-primary", bg: "bg-primary/10" },
        { label: "Employees", value: String(groups.length), icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
      ];

  const modeLabel = (mode: string) => {
    switch (mode) {
      case "one_time": return "One-Time";
      case "percentage": return "% of Salary";
      case "percentage_ctc": return "% of Monthly CTC";
      case "fixed_installment": return "Fixed/Month";
      case "already_deducted": return "Already Deducted";
      default: return mode;
    }
  };

  const txTypeColor = (type: string) => {
    switch (type) {
      case "collection": return "bg-success/10 text-success";
      case "penalty_deduction": return "bg-destructive/10 text-destructive";
      case "replenishment": return "bg-info/10 text-info";
      case "refund": return "bg-primary/10 text-primary";
      case "ff_refund": return "bg-primary/10 text-primary";
      case "initiated": return "bg-info/10 text-info";
      case "modified": return "bg-warning/10 text-warning";
      case "completed": return "bg-success/10 text-success";
      case "paused": return "bg-warning/10 text-warning";
      case "resumed": return "bg-info/10 text-info";
      case "withheld": return "bg-destructive/10 text-destructive";
      case "reserved": return "bg-primary/10 text-primary";
      case "released": return "bg-muted text-foreground";
      default: return "bg-muted text-foreground";
    }
  };

  const txTypeLabel = (type: string) => {
    switch (type) {
      case "collection": return "Collection";
      case "penalty_deduction": return "Penalty Deduction";
      case "replenishment": return "Replenishment";
      case "refund": return "Paid back";
      case "ff_refund": return "F&F Refund";
      case "initiated": return "Initiated";
      case "modified": return "Modified";
      case "completed": return "Completed";
      case "paused": return "Paused";
      case "resumed": return "Resumed";
      case "withheld": return "Withheld in F&F";
      case "reserved": return "Reserved for F&F";
      case "released": return "Released from F&F";
      default: return type;
    }
  };

  const isPct = (m: string) => m === "percentage" || m === "percentage_ctc";

  const monthlyCtcFor = (employeeId?: string) => {
    if (!employeeId) return 0;
    const emp = employees.find((e: any) => e.id === employeeId);
    const annual = Number(emp?.total_salary || 0);
    return annual > 0 ? annual / 12 : 0;
  };

  const renderDepositForm = (isEdit: boolean) => (
    <div className="space-y-4">
      {!isEdit && (
        <div>
          <Label>Employee</Label>
          <EmployeePicker employees={employees} value={form.employee_id} onChange={(v) => setForm({ ...form, employee_id: v })} />
        </div>
      )}
      <div>
        <Label>Total Deposit Amount (₹)</Label>
        <div className="flex gap-2">
          <Input className="flex-1" type="number" min="0" value={form.total_deposit_amount} onChange={(e) => setForm({ ...form, total_deposit_amount: e.target.value })} placeholder="e.g. 15000" />
          <Select
            value=""
            onValueChange={(v) => {
              const monthly = monthlyCtcFor(isEdit ? editingDeposit?.employee_id : form.employee_id);
              if (!monthly) { toast.error("No CTC on record for this employee"); return; }
              setForm({ ...form, total_deposit_amount: String(Math.round(monthly * Number(v))) });
            }}
          >
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Use CTC" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1× Monthly CTC</SelectItem>
              <SelectItem value="2">2× Monthly CTC</SelectItem>
              <SelectItem value="3">3× Monthly CTC</SelectItem>
              <SelectItem value="0.5">½× Monthly CTC</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(() => {
          const monthly = monthlyCtcFor(isEdit ? editingDeposit?.employee_id : form.employee_id);
          return monthly ? <p className="text-xs text-muted-foreground mt-1">Monthly CTC: {inr(Math.round(monthly))}</p> : null;
        })()}
      </div>

      <div>
        <Label>Deduction Mode</Label>
        <Select value={form.deduction_mode} onValueChange={(v) => setForm({ ...form, deduction_mode: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="one_time">One-Time (Full deduction at once)</SelectItem>
            <SelectItem value="percentage_ctc">Percentage of Monthly CTC</SelectItem>
            <SelectItem value="percentage">Percentage of Monthly Salary</SelectItem>
            <SelectItem value="fixed_installment">Fixed Amount per Month</SelectItem>
            <SelectItem value="already_deducted">Already Deducted (Pre-collected)</SelectItem>
          </SelectContent>
        </Select>
        {form.deduction_mode === "already_deducted" && <p className="text-xs text-muted-foreground mt-1">Marked fully collected immediately — no payroll deduction</p>}
      </div>
      {form.deduction_mode !== "already_deducted" && (
        <>
          <div>
            <Label>{isPct(form.deduction_mode) ? "Percentage (%)" : "Amount (₹)"}</Label>
            <Input type="number" min="0" step={isPct(form.deduction_mode) ? "1" : "100"} value={form.deduction_value} onChange={(e) => setForm({ ...form, deduction_value: e.target.value })} placeholder={isPct(form.deduction_mode) ? "e.g. 10" : "e.g. 5000"} />
          </div>
          <div>
            <Label>Deduction Start Month</Label>
            <Input type="month" value={form.deduction_start_month} onChange={(e) => setForm({ ...form, deduction_start_month: e.target.value })} />
          </div>
        </>
      )}
      {form.deposit_type === "error_recovery" && (
        <div className="space-y-4 rounded-md border border-border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Incident Date</Label>
              <Input type="date" value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} />
            </div>
            <div>
              <Label>Reference (order / txn no.)</Label>
              <Input value={form.incident_reference} onChange={(e) => setForm({ ...form, incident_reference: e.target.value })} placeholder="e.g. SO-2041 / UTR" />
            </div>
          </div>
          <div>
            <Label>Recovery Reason</Label>
            <Textarea rows={2} value={form.recovery_reason} onChange={(e) => setForm({ ...form, recovery_reason: e.target.value })} placeholder="What went wrong and why it is being recovered" />
          </div>
        </div>
      )}
    </div>
  );

  const colCount = tab === "error_recovery" ? 10 : 9;

  const renderEntryRow = (d: any) => {
    const state = lifecycleOf(d);
    const locked = isFnfLocked(d);
    const progress = d.total_deposit_amount > 0 ? Math.round((d.collected_amount / d.total_deposit_amount) * 100) : 0;
    const canRefund = state !== "refunded" && !locked && Number(d.collected_amount || 0) > 0;
    return (
      <TableRow key={d.id} className="bg-muted/20">
        <TableCell className="pl-10 text-sm text-muted-foreground">
          {d.deduction_start_month || (d.created_at ? String(d.created_at).slice(0, 10) : "—")}
        </TableCell>
        <TableCell className="text-right tabular-nums">{inr(d.total_deposit_amount)}</TableCell>
        <TableCell className="text-right tabular-nums text-success">{inr(d.collected_amount)}</TableCell>
        <TableCell className="text-right tabular-nums text-primary">{inr(d.current_balance)}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Progress value={progress} className="h-2 w-16" />
            <span className="text-xs text-muted-foreground">{progress}%</span>
          </div>
        </TableCell>
        <TableCell className="text-xs">
          {modeLabel(d.deduction_mode)}
          <div className="text-muted-foreground">{isPct(d.deduction_mode) ? `${d.deduction_value}%` : inr(d.deduction_value)}</div>
        </TableCell>
        {tab === "error_recovery" && (
          <TableCell className="text-xs text-muted-foreground max-w-[180px]">
            <div className="truncate">{d.incident_reference || "—"}</div>
            <div>{d.incident_date || ""}</div>
          </TableCell>
        )}
        <TableCell>
          <span className={`px-2 py-0.5 rounded-full text-xs ${LIFECYCLE_BADGE[state].cls}`}>{LIFECYCLE_BADGE[state].label}</span>
          {d.is_paused && state === "active" && <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-warning/10 text-warning">Paused</span>}
          {locked && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary" title="Governed by the employee's F&F settlement">
              {d.fnf_state === "closed" ? "Settled in F&F" : "Reserved in F&F"}
            </span>
          )}
        </TableCell>
        <TableCell className="text-xs">
          {state === "refunded" ? (
            <div>
              <div className="text-primary">{inr(d.refund_amount)} paid back</div>
              {Number(d.withheld_amount) > 0 && (
                <div className="text-muted-foreground">{inr(d.withheld_amount)} withheld — {d.withheld_reason || "—"}</div>
              )}
              {d.refund_period_month && <div className="text-muted-foreground">{String(d.refund_period_month).slice(0, 7)}</div>}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setShowTransactions(d.id)} title="View ledger">
              <Eye className="h-3 w-3" />
            </Button>
            {state !== "refunded" && locked && (
              <span className="text-[11px] text-muted-foreground self-center px-1">
                Handled in F&amp;F
              </span>
            )}
            {state !== "refunded" && !locked && (
              <>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(d)} title="Edit">
                  <Edit2 className="h-3 w-3" />
                </Button>
                {!d.is_fully_collected && (
                  d.is_paused ? (
                    <Button size="sm" variant="ghost" className="h-7 text-info" onClick={() => pauseResumeMutation.mutate({ deposit: d, action: "resume" })} title="Resume deductions">
                      <Play className="h-3 w-3" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-7 text-warning" onClick={() => pauseResumeMutation.mutate({ deposit: d, action: "pause" })} title="Pause deductions">
                      <Pause className="h-3 w-3" />
                    </Button>
                  )
                )}
                {canRefund && (
                  <Button size="sm" variant="ghost" className="h-7 text-primary px-2 text-xs" onClick={() => openRefund(d)} title="Pay back to employee">
                    <Undo2 className="h-3 w-3 mr-1" /> Pay back
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-destructive"
                  onClick={() => setDeleteTarget(d)}
                  title={Number(d.collected_amount || 0) > 0 ? "Cancel remaining installments" : "Delete record"}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Deposit Management"
        description="Security deposits and error recoveries — deduction, holding and pay-back in one place"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" onClick={() => setShowSeed(true)} className="h-9 w-full sm:w-auto">
              <Wallet className="h-4 w-4 mr-1" /> Seed existing {TYPE_LABEL[tab].toLowerCase()}
            </Button>
            <Button onClick={() => { setForm({ ...emptyForm, deposit_type: tab }); setShowAdd(true); }} className="h-9 w-full sm:w-auto bg-[#E8604C] hover:bg-[#d4553f]"><Plus className="h-4 w-4 mr-1" /> Add {TYPE_LABEL[tab]}</Button>
          </div>
        }

      />

      {/* Category tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-full sm:w-fit overflow-x-auto">
        {(["security", "error_recovery"] as DepositType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 sm:flex-none whitespace-nowrap px-4 py-1.5 text-sm rounded-md transition-colors ${tab === t ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            {TYPE_LABEL[t]}
            <span className="ml-2 text-xs text-muted-foreground">
              {allDeposits.filter((d: any) => (d.deposit_type || "security") === t).length}
            </span>
          </button>
        ))}
      </div>

      {/* Lifecycle sub-tabs + employee search */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
          <div className="flex gap-2 w-max md:w-auto md:flex-wrap">
            {SUB_TABS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSubTab(s.key)}
                className={`whitespace-nowrap px-3 py-1 text-xs rounded-full border transition-colors ${subTab === s.key ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {s.label} <span className="ml-1 tabular-nums">{counts[s.key] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="relative w-full md:w-64 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee or badge…"
            className="pl-8 h-9"
          />
        </div>
      </div>


      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {summaryTiles.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 md:p-4 flex items-center gap-2 md:gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div className="min-w-0"><p className="text-base md:text-xl font-bold truncate">{s.value}</p><p className="text-[11px] md:text-xs text-muted-foreground truncate">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Mobile list — same data, filters and actions as the desktop table */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <Card><CardContent className="p-4"><TableSkeleton rows={4} columns={2} /></CardContent></Card>
        ) : groups.length === 0 ? (
          <Card><CardContent className="p-4"><EmptyState icon={Wallet} title="Nothing here" description={`No ${TYPE_LABEL[tab].toLowerCase()} records in this state.`} /></CardContent></Card>
        ) : (
          groups.map((g) => {
            const open = !!expanded[g.employee_id];
            const progress = g.total > 0 ? Math.round((g.collected / g.total) * 100) : 0;
            return (
              <Card key={g.employee_id}>
                <CardContent className="p-3 space-y-3">
                  <button className="w-full text-left" onClick={() => setExpanded((e) => ({ ...e, [g.employee_id]: !open }))}>
                    <div className="flex items-start gap-2">
                      {open ? <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">
                          {g.employee?.first_name} {g.employee?.last_name}
                          <span className="text-xs text-muted-foreground ml-1">({g.employee?.badge_id})</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] ${LIFECYCLE_BADGE[lifecycleOf(g.rows[0])].cls}`}>
                            {LIFECYCLE_BADGE[lifecycleOf(g.rows[0])].label}
                          </span>
                          {g.rows.length > 1 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{g.rows.length} entries</span>}
                          {g.employee?.is_active === false && <span className="text-[11px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">Exited</span>}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div><p className="text-muted-foreground">Total</p><p className="tabular-nums font-medium">{inr(g.total)}</p></div>
                      <div><p className="text-muted-foreground">Collected</p><p className="tabular-nums text-success">{inr(g.collected)}</p></div>
                      <div><p className="text-muted-foreground">Balance</p><p className="tabular-nums text-primary">{inr(g.balance)}</p></div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={progress} className="h-2 flex-1" />
                      <span className="text-[11px] text-muted-foreground">{progress}%</span>
                    </div>
                    {g.refunded > 0 && (
                      <p className="mt-2 text-[11px] text-primary">{inr(g.refunded)} paid back{g.withheld > 0 ? ` · ${inr(g.withheld)} withheld` : ""}</p>
                    )}
                  </button>

                  {open && (
                    <div className="space-y-2 border-t border-border pt-2">
                      {g.rows.map((d: any) => {
                        const state = lifecycleOf(d);
                        const locked = isFnfLocked(d);
                        const p = d.total_deposit_amount > 0 ? Math.round((d.collected_amount / d.total_deposit_amount) * 100) : 0;
                        const canRefund = state !== "refunded" && !locked && Number(d.collected_amount || 0) > 0;
                        return (
                          <div key={d.id} className="rounded-md bg-muted/30 p-2 space-y-2">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-muted-foreground">{d.deduction_start_month || (d.created_at ? String(d.created_at).slice(0, 10) : "—")}</span>
                              <span className="tabular-nums font-medium">{inr(d.total_deposit_amount)}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[11px]">
                              <div><p className="text-muted-foreground">Collected</p><p className="tabular-nums text-success">{inr(d.collected_amount)}</p></div>
                              <div><p className="text-muted-foreground">Balance</p><p className="tabular-nums text-primary">{inr(d.current_balance)}</p></div>
                              <div><p className="text-muted-foreground">Mode</p><p>{modeLabel(d.deduction_mode)} · {isPct(d.deduction_mode) ? `${d.deduction_value}%` : inr(d.deduction_value)}</p></div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress value={p} className="h-1.5 flex-1" />
                              <span className="text-[11px] text-muted-foreground">{p}%</span>
                            </div>
                            {tab === "error_recovery" && (
                              <p className="text-[11px] text-muted-foreground">Incident: {d.incident_reference || "—"} {d.incident_date ? `· ${d.incident_date}` : ""}</p>
                            )}
                            <div className="flex flex-wrap gap-1">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] ${LIFECYCLE_BADGE[state].cls}`}>{LIFECYCLE_BADGE[state].label}</span>
                              {d.is_paused && state === "active" && <span className="px-2 py-0.5 rounded-full text-[11px] bg-warning/10 text-warning">Paused</span>}
                              {locked && (
                                <span className="px-2 py-0.5 rounded-full text-[11px] bg-primary/10 text-primary">
                                  {d.fnf_state === "closed" ? "Settled in F&F" : "Reserved in F&F"}
                                </span>
                              )}
                            </div>
                            {state === "refunded" && (
                              <p className="text-[11px] text-primary">
                                {inr(d.refund_amount)} paid back
                                {Number(d.withheld_amount) > 0 ? ` · ${inr(d.withheld_amount)} withheld — ${d.withheld_reason || "—"}` : ""}
                                {d.refund_period_month ? ` · ${String(d.refund_period_month).slice(0, 7)}` : ""}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1 pt-1">
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowTransactions(d.id)}>
                                <Eye className="h-3 w-3 mr-1" /> Ledger
                              </Button>
                              {state !== "refunded" && locked && (
                                <span className="text-[11px] text-muted-foreground self-center px-1">Handled in F&amp;F</span>
                              )}
                              {state !== "refunded" && !locked && (
                                <>
                                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEdit(d)}>
                                    <Edit2 className="h-3 w-3 mr-1" /> Edit
                                  </Button>
                                  {!d.is_fully_collected && (
                                    d.is_paused ? (
                                      <Button size="sm" variant="outline" className="h-8 text-xs text-info" onClick={() => pauseResumeMutation.mutate({ deposit: d, action: "resume" })}>
                                        <Play className="h-3 w-3 mr-1" /> Resume
                                      </Button>
                                    ) : (
                                      <Button size="sm" variant="outline" className="h-8 text-xs text-warning" onClick={() => pauseResumeMutation.mutate({ deposit: d, action: "pause" })}>
                                        <Pause className="h-3 w-3 mr-1" /> Pause
                                      </Button>
                                    )
                                  )}
                                  {canRefund && (
                                    <Button size="sm" variant="outline" className="h-8 text-xs text-primary" onClick={() => openRefund(d)}>
                                      <Undo2 className="h-3 w-3 mr-1" /> Pay back
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" className="h-8 text-xs text-destructive" onClick={() => setDeleteTarget(d)}>
                                    <Trash2 className="h-3 w-3 mr-1" /> {Number(d.collected_amount || 0) > 0 ? "Cancel EMIs" : "Delete"}
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Grouped table */}
      <Card className="hidden md:block">

        <CardHeader><CardTitle className="text-sm">{TYPE_LABEL[tab]} — {SUB_TABS.find((s) => s.key === subTab)?.label}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Mode</TableHead>
                {tab === "error_recovery" && <TableHead>Incident</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Pay back</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={colCount} className="p-0"><TableSkeleton rows={4} columns={colCount} /></TableCell></TableRow>
              ) : groups.length === 0 ? (
                <TableRow><TableCell colSpan={colCount}><EmptyState icon={Wallet} title="Nothing here" description={`No ${TYPE_LABEL[tab].toLowerCase()} records in this state.`} /></TableCell></TableRow>
              ) : (
                groups.map((g) => {
                  const open = !!expanded[g.employee_id];
                  const progress = g.total > 0 ? Math.round((g.collected / g.total) * 100) : 0;
                  return (
                    <Fragment key={g.employee_id}>
                      <TableRow className="cursor-pointer" onClick={() => setExpanded((e) => ({ ...e, [g.employee_id]: !open }))}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1">
                            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            {g.employee?.first_name} {g.employee?.last_name}
                            <span className="text-xs text-muted-foreground ml-1">({g.employee?.badge_id})</span>
                            {g.rows.length > 1 && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{g.rows.length} entries</span>}
                            {g.employee?.is_active === false && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">Exited</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{inr(g.total)}</TableCell>
                        <TableCell className="text-right tabular-nums text-success">{inr(g.collected)}</TableCell>
                        <TableCell className="text-right tabular-nums text-primary">{inr(g.balance)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={progress} className="h-2 w-20" />
                            <span className="text-xs text-muted-foreground">{progress}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{g.rows.length === 1 ? modeLabel(g.rows[0].deduction_mode) : "Mixed"}</TableCell>
                        {tab === "error_recovery" && <TableCell className="text-xs text-muted-foreground">{g.rows.length === 1 ? (g.rows[0].incident_reference || "—") : `${g.rows.length} incidents`}</TableCell>}
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${LIFECYCLE_BADGE[lifecycleOf(g.rows[0])].cls}`}>
                            {LIFECYCLE_BADGE[lifecycleOf(g.rows[0])].label}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {g.refunded > 0 ? (
                            <div>
                              <div className="text-primary">{inr(g.refunded)}</div>
                              {g.withheld > 0 && <div className="text-muted-foreground">{inr(g.withheld)} withheld</div>}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{open ? "Hide" : "View"}</TableCell>
                      </TableRow>
                      {open && g.rows.map(renderEntryRow)}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SeedDepositsDialog
        open={showSeed}
        onOpenChange={setShowSeed}
        depositType={tab}
        typeLabel={TYPE_LABEL[tab]}
        employees={employees}
      />

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add {TYPE_LABEL[form.deposit_type]}</DialogTitle>
            <DialogDescription>Amount and monthly payroll deduction plan</DialogDescription>
          </DialogHeader>
          {renderDepositForm(false)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.employee_id || !form.total_deposit_amount || (form.deduction_mode !== "already_deducted" && !form.deduction_value)} className="bg-[#E8604C] hover:bg-[#d4553f]">
              {addMutation.isPending ? "Saving…" : `Add ${TYPE_LABEL[form.deposit_type]}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Deposit Configuration</DialogTitle>
            <DialogDescription>Update deposit amount or deduction schedule</DialogDescription>
          </DialogHeader>
          {renderDepositForm(true)}
          <div className="mt-3">
            <Label>Reason for this change *</Label>
            <Textarea
              rows={2}
              className="mt-1 text-foreground"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="Why is the amount / schedule being changed? Kept in the deposit ledger."
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              The old and new values, your name and this reason are appended to the ledger.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending || !form.total_deposit_amount || !form.deduction_value} className="bg-[#E8604C] hover:bg-[#d4553f]">
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay back dialog */}
      <Dialog open={!!refundTarget} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {(refundTarget?.deposit_type || "security") === "error_recovery" ? "Error recovered — pay back to employee" : "Pay back security deposit"}
            </DialogTitle>
            <DialogDescription>
              {refundTarget && `${refundTarget.hr_employees?.first_name} ${refundTarget.hr_employees?.last_name || ""} · held ${inr(refundTarget.collected_amount)}`}
            </DialogDescription>
          </DialogHeader>
          {refundTarget && (() => {
            const held = Number(refundTarget.collected_amount || 0);
            const amt = Number(refundAmount || 0);
            const withheld = Math.max(Math.round((held - amt) * 100) / 100, 0);
            return (
              <div className="space-y-4">
                <div>
                  <Label>Refund amount (₹)</Label>
                  <Input type="number" min="0" max={held} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">
                    {withheld > 0 ? `${inr(withheld)} will be withheld` : "Full amount paid back"}
                  </p>
                </div>
                <div>
                  <Label>Payroll month</Label>
                  <Input type="month" value={refundMonth} onChange={(e) => setRefundMonth(e.target.value)} />
                </div>
                {withheld > 0 && (
                  <div>
                    <Label>Reason for withholding</Label>
                    <Textarea rows={2} value={withheldReason} onChange={(e) => setWithheldReason(e.target.value)} placeholder="e.g. adjusted against loss / notice shortfall" />
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)}>Cancel</Button>
            <Button onClick={() => refundMutation.mutate()} disabled={refundMutation.isPending} className="bg-[#E8604C] hover:bg-[#d4553f]">
              {refundMutation.isPending ? "Saving…" : "Confirm pay back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ledger Dialog */}
      <Dialog open={!!showTransactions} onOpenChange={(open) => !open && setShowTransactions(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Deposit Ledger</DialogTitle>
            <DialogDescription>All movements for this entry</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Balance After</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No transactions yet</TableCell></TableRow>
                ) : (
                  transactions.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{t.transaction_date}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${txTypeColor(t.transaction_type)}`}>
                          {txTypeLabel(t.transaction_type)}
                        </span>
                      </TableCell>
                      <TableCell className={`font-medium ${Number(t.amount) >= 0 ? "text-success" : "text-destructive"}`}>
                        {Number(t.amount) >= 0 ? "+" : ""}{inr(Math.abs(Number(t.amount)))}
                      </TableCell>
                      <TableCell className="text-sm">{inr(t.balance_after)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">{t.description || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {Number(deleteTarget?.collected_amount || 0) > 0 ? "Cancel remaining installments?" : "Delete this record?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {Number(deleteTarget?.collected_amount || 0) > 0 ? (
                <>
                  {inr(deleteTarget?.collected_amount)} has already been collected, so the record and its ledger are kept.
                  Only the pending future installments are removed and no further deduction will be pushed to payroll.
                  You can still pay the held amount back to the employee later.
                </>
              ) : (
                <>
                  Nothing has been collected yet, so this {TYPE_LABEL[(deleteTarget?.deposit_type || "security") as DepositType].toLowerCase()} record
                  and its pending installments will be permanently removed. This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={deleteMutation.isPending}
              onClick={(e) => { e.preventDefault(); deleteMutation.mutate(deleteTarget); }}
            >
              {Number(deleteTarget?.collected_amount || 0) > 0 ? "Cancel remaining" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
}
