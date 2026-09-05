import { useMemo, useState } from "react";
import { useFormDraftPersistence } from "@/hooks/useFormDraftPersistence";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Send, Trash2, Ban, RotateCcw, Info, Layers, Calculator, Download, Gift, CalendarDays, ChevronLeft, ChevronRight, PlusCircle, Search, Undo2 } from "lucide-react";
import { SourceTag, DashboardLink } from "@/components/hr/payroll/SourceTag";
import { BulkPayrollInputDialog } from "@/components/hr/payroll/BulkPayrollInputDialog";
import { AutoLopDialog } from "@/components/hr/payroll/AutoLopDialog";
import { CompOffEncashmentDialog } from "@/components/hr/payroll/CompOffEncashmentDialog";

import { AutoRecoveriesCard } from "@/components/hr/payroll/AutoRecoveriesCard";
import { TrainingCtcAdjustmentsCard } from "@/components/hr/payroll/TrainingCtcAdjustmentsCard";

import { OtherPayrollInputsCard } from "@/components/hr/payroll/OtherPayrollInputsCard";
import { FnFSettlementInputsCard } from "@/components/hr/payroll/FnFSettlementInputsCard";
import { useComplianceSettings } from "@/hooks/hrms/useComplianceSettings";
import { additionTypeCode, additionTypeSlug } from "@/lib/hrms/additionType";

// Razorpay's fixed bonus catalogue (Payroll Settings → Bonus Types) — the only
// subtypes Razorpay accepts for a Bonus addition.
const RAZORPAY_BONUS_TYPES = [
  { key: "joining", label: "Joining Bonus" },
  { key: "retention", label: "Retention Bonus" },
  { key: "work_anniversary", label: "Work Anniversary Bonus" },
  { key: "end_of_year", label: "End of year Bonus" },
  { key: "retirement", label: "Retirement Bonus" },
  { key: "profit_sharing", label: "Profit-Sharing Bonus" },
  { key: "diwali", label: "Diwali Bonus" },
  { key: "sign_on", label: "Sign-On Bonus" },
  { key: "performance", label: "Performance Bonus" },
  { key: "overtime", label: "Overtime" },
];

// Period helpers — Razorpay uses YYYY-MM strings for the payroll month.
const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

type Kind = "addition" | "deduction";

export default function PayrollInputsPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const paramTab = searchParams.get("tab") === "deduction" ? "deduction" : searchParams.get("tab") === "addition" ? "addition" : null;
  const paramPeriod = searchParams.get("period");
  const lopFocus = searchParams.get("focus") === "lop";
  const [period, setPeriod] = useState(paramPeriod && /^\d{4}-\d{2}$/.test(paramPeriod) ? paramPeriod : currentPeriod());
  const [tab, setTab] = useState<Kind>(lopFocus ? "deduction" : ((paramTab as Kind) ?? "addition"));
  const [form, setForm] = useState({ hr_employee_id: "", label: lopFocus ? "Loss of Pay" : "", amount: "", addition_type: "bonus", taxable: true });
  const [pushConfirm, setPushConfirm] = useState<any>(null);
  const [dnpConfirm, setDnpConfirm] = useState<any>(null);
  const [resetConfirm, setResetConfirm] = useState<any>(null);
  const [unpushConfirm, setUnpushConfirm] = useState<any>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [autoLopOpen, setAutoLopOpen] = useState(false);
  const [compoffOpen, setCompoffOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState("");

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkPushConfirm, setBulkPushConfirm] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  // Comp-off encashment block keeps its own selection (its rows are excluded from the main list).
  const [coSelected, setCoSelected] = useState<Record<string, boolean>>({});
  const [coPushConfirm, setCoPushConfirm] = useState(false);
  const [coDeleteConfirm, setCoDeleteConfirm] = useState(false);

  // Persist the single-entry staging form across refreshes.
  const { clearDraft: clearFormDraftState } = useFormDraftPersistence(
    `payroll-input:${tab}:${period}${lopFocus ? ":lop" : ""}`,
    form,
    (saved: any) => { if (saved) setForm((prev) => ({ ...prev, ...saved })); },
    { isEmpty: (v: any) => !v?.hr_employee_id && !v?.amount && (!v?.label || (lopFocus && v.label === "Loss of Pay")) },
  );

  // Razorpay supports a FIXED catalogue of exactly 10 bonus types — the
  // subtype picker must offer these and nothing else. The settings mirror
  // supplies enabled flags; types missing from the mirror default to enabled
  // (Razorpay's own defaults) so the list is always the complete catalogue.
  const { data: complianceSettings } = useComplianceSettings();
  const enabledBonusTypes = useMemo(() => {
    const mirror = new Map((complianceSettings?.bonus_types ?? []).map(b => [b.key, b.enabled]));
    return RAZORPAY_BONUS_TYPES.map(b => ({ ...b, enabled: mirror.get(b.key) ?? true })).filter(b => b.enabled);
  }, [complianceSettings]);

  // Envelope gate — payroll writes require push_payroll_endpoint_verified on razorpay settings.
  const { data: settings } = useQuery({
    queryKey: ["hr_razorpay_settings_gate"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_razorpay_settings").select("push_payroll_endpoint_verified,push_payroll_envelope_key,push_payroll_envelope_verified_at").limit(1).maybeSingle();
      return data || null;
    },
  });
  const gateOpen = !!settings?.push_payroll_endpoint_verified;

  // Employee roster — only mapped RazorpayX employees are pushable.
  const { data: employees = [] } = useQuery({
    queryKey: ["hr_mapped_employees_for_inputs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_employee_map")
        .select("razorpay_employee_id, hr_employee_id, last_pull_snapshot, hr_employees:hr_employee_id(id, first_name, last_name, badge_id, is_active)")
        .not("hr_employee_id", "is", null)
        .not("razorpay_employee_id", "is", null);
      if (error) throw error;
      return (data || [])
        .filter((r: any) => r.hr_employees && r.hr_employees.is_active !== false)
        // Employee pickers are always alphabetical by full name.
        .sort((a: any, b: any) =>
          `${a.hr_employees?.first_name ?? ""} ${a.hr_employees?.last_name ?? ""}`.trim()
            .localeCompare(`${b.hr_employees?.first_name ?? ""} ${b.hr_employees?.last_name ?? ""}`.trim(), "en", { sensitivity: "base" }));

    },
  });
  const empById = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of employees as any[]) if (r.hr_employees) m.set(r.hr_employee_id, r);
    return m;
  }, [employees]);

  const table = tab === "addition" ? "hr_payroll_input_additions" : "hr_payroll_input_deductions";
  // period_month is a Postgres date and is stored as the first day of the month.
  // Keep the operator-facing value as YYYY-MM, but always query/write its canonical date.
  const periodDate = `${period}-01`;

  // Applied Do-Not-Pay marks for this period — read from the RazorpayX sync log so
  // the button reflects the real state after a reload, not just the toast.
  const { data: dnpMarks = {} } = useQuery({
    queryKey: ["payroll_dnp_marks", period],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_sync_log")
        .select("razorpay_employee_id, created_at, error_text, field_diff_summary, action")
        .in("action", ["payroll_do_not_pay", "payroll_reset_modifications"])
        .order("created_at", { ascending: true })
        .limit(1000);
      if (error) return {};
      const map: Record<string, string> = {};
      for (const r of data || []) {
        const fds = r.field_diff_summary || {};
        if (String(fds.payroll_month || "") !== period) continue;
        const key = String(r.razorpay_employee_id ?? "");
        if (!key) continue;
        if (r.error_text) continue;
        if (r.action === "payroll_reset_modifications") delete map[key];
        else if (fds.do_not_pay !== false) map[key] = r.created_at;
      }
      return map;
    },
  });

  // Reconciliation export — payable roster for the period, excluding anyone
  // marked Do-Not-Pay on RazorpayX or inactive there.
  const exportPayableList = () => {
    const marks = dnpMarks as Record<string, string>;
    const payable = (employees as any[]).filter(
      (r) => !marks[String(r.razorpay_employee_id)] && r.last_pull_snapshot?.is_active !== false,
    );
    if (!payable.length) { toast.error("No payable employees to export for this period"); return; }
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Badge ID", "Employee name", "RazorpayX employee ID", "Payroll month"];
    const lines = [
      header.join(","),
      ...payable
        .map((r) => ({
          badge: r.hr_employees?.badge_id ?? "",
          name: `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.trim(),
          rzp: r.razorpay_employee_id,
        }))
        .sort((a, b) => String(a.badge).localeCompare(String(b.badge), undefined, { numeric: true }))
        .map((e) => [e.badge, e.name, e.rzp, period].map(esc).join(",")),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payable-employees-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${payable.length} payable employee(s) for ${period}`);
  };


  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payroll_inputs", table, period],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from(table).select("*").eq("period_month", periodDate).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Cockpit step 3 deep-links here with focus=lop — narrow the list to loss-of-pay rows.
  // Training-completion CTC corrections live in their own block below, with the
  // full derivation and an HR approval gate, so they are kept out of this list.
  const visibleRows = useMemo(() => {
    // F&F settlement lines are pushed by the settlement approval itself and are
    // shown in their own segregated card below, never in the staging list.
    const all = ((rows as any[]) ?? []).filter(
      (r) => r.source !== "training_ctc_adjustment"
        && r.source !== "ctc_transition_adjustment"
        && r.source !== "fnf_settlement"
        && r.source !== "auto_compoff",
    );

    if (!lopFocus || tab !== "deduction") return all;
    return all.filter((r) => /lop|loss of pay|loss-of-pay/i.test(String(r.label ?? "")));
  }, [rows, lopFocus, tab]);

  // Comp-off encashment lines live in their own block below.
  const compoffRows = useMemo(
    () => ((rows as any[]) ?? []).filter((r) => r.source === "auto_compoff"),
    [rows],
  );





  const stageMutation = useMutation({
    mutationFn: async () => {
      const emp = empById.get(form.hr_employee_id);
      if (!emp) throw new Error("Pick a RazorpayX-mapped employee");
      if (!form.label.trim()) throw new Error("Label is required");
      const amt = parseFloat(form.amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Amount must be > 0");
      const row: any = {
        hr_employee_id: form.hr_employee_id,
        razorpay_employee_id: emp.razorpay_employee_id,
        period_month: periodDate,
        label: form.label.trim(),
        amount: amt,
      };
      if (tab === "addition") { row.addition_type = additionTypeCode(form.addition_type); row.taxable = form.taxable; }
      const { error } = await (supabase as any).from(table).insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_inputs", table, period] });
      clearFormDraftState();
      setForm({ hr_employee_id: "", label: lopFocus ? "Loss of Pay" : "", amount: "", addition_type: "bonus", taxable: true });
      toast.success("Staged. Push to RazorpayX when ready.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      // `.select()` makes the silent case visible: if permissions hide the row,
      // PostgREST reports success with zero rows removed.
      const { data, error } = await (supabase as any).from(table).delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Nothing was removed — the row no longer exists or you do not have permission to remove it. The list has been refreshed.");
      }
      return data.length;
    },
    onSuccess: async () => {
      await qc.refetchQueries({ queryKey: ["payroll_inputs", table, period] });
      toast.success("Staged row deleted");
    },
    onError: async (e: any) => {
      await qc.refetchQueries({ queryKey: ["payroll_inputs", table, period] });
      toast.error(e.message);
    },
  });


  // Single push primitive. The proxy converts additions to RazorpayX's array
  // contract and deductions to its email + aggregate deduction-amount contract.
  // Amounts stay in rupees, and view-payroll read-back proves each live write.
  async function pushGroup(rowsIn: any[], kindIn?: Kind) {
    const group = Array.isArray(rowsIn) ? rowsIn : [rowsIn];
    if (!group.length) return null;
    const kind: Kind = kindIn ?? tab;
    const tbl = kind === "addition" ? "hr_payroll_input_additions" : "hr_payroll_input_deductions";
    const first = group[0];
    const action = kind === "addition" ? "payroll_add_additions" : "payroll_add_deduction";
    const items = group.map((r) => (kind === "addition"
      ? { label: r.label, amount: Number(r.amount), taxable: r.taxable !== false, type: additionTypeSlug(r.addition_type) }
      : { label: r.label, amount: Number(r.amount) }));

    // RazorpayX deduction contract is a SINGLE aggregate `deduction-amount`
    // per employee/month — every add-deduction call REPLACES the previous
    // total (verified: Dilkhush Thakur Aug-2026, ₹720 push overwritten by a
    // later ₹1,452 push). So any deduction push must carry this employee's
    // FULL month total: the rows being pushed now plus every row already
    // pushed for the same employee/month. Additions are a labelled array and
    // upsert per label, so they need no such merge.
    if (kind === "deduction") {
      const ids = new Set(group.map((r) => r.id));
      const { data: alreadyPushed, error: apErr } = await (supabase as any)
        .from("hr_payroll_input_deductions")
        .select("id,label,amount")
        .eq("razorpay_employee_id", first.razorpay_employee_id)
        .eq("period_month", first.period_month)
        .not("pushed_at", "is", null);
      if (apErr) throw apErr;
      for (const r of alreadyPushed || []) {
        if (ids.has(r.id)) continue;
        items.push({ label: r.label, amount: Number(r.amount) } as any);
      }
    }

    const data: any = {
      "employee-id": Number(first.razorpay_employee_id),
      "employee-type": "employee",
      "payroll-month": String(first.period_month).slice(0, 7),
      ...(kind === "addition" ? { additions: items } : { deductions: items }),
    };

    const { data: res, error } = await (supabase as any).functions.invoke("razorpay-payroll-proxy", {
      body: {
        action,
        payload: {
          data,
          readback_ids: group.map((r) => r.id),
          readback_table: kind === "addition" ? "additions" : "deductions",
        },
      },
    });
    if (error) {
      let detail = "";
      try {
        if (typeof error.context?.json === "function") {
          const body = await error.context.json();
          detail = body?.error || body?.body?.message || "";
        } else if (typeof error.context?.text === "function") {
          detail = await error.context.text();
        }
      } catch { /* retain the SDK error below */ }
      throw new Error(detail || error.message || "RazorpayX rejected the payroll input");
    }
    if (!res?.ok) throw new Error(res?.error || `HTTP ${res?.http_status}`);
    // A push counts as done ONLY when the view-payroll read-back proves the
    // modification is on the live RazorpayX run. Unverified writes stay
    // pending here so they can be retried, never silently marked pushed.
    const verified = res?.readback ? res.readback.verified_on_run !== false : true;
    if (!verified) {
      await (supabase as any).from(tbl)
        .update({ push_response: res.body ?? {} })
        .in("id", group.map((r) => r.id));
      throw new Error(res.readback?.error || "Pushed, but not visible on the RazorpayX run — retry or verify in the dashboard.");
    }
    const { error: uErr } = await (supabase as any).from(tbl)
      .update({ pushed_at: new Date().toISOString(), push_response: res.body ?? {} })
      .in("id", group.map((r) => r.id));
    if (uErr) throw uErr;


    // Automatic recoveries (security deposit / error recovery / loan EMI) are
    // staged by the nightly job and only settle in the ledger once HR has
    // reviewed and pushed them here, and the push is verified on the run.
    for (const r of group) {
      if (!r.recovery_kind || !r.recovery_ref_id) continue;
      const { error: rpcErr } = r.recovery_kind === "loan"
        ? await (supabase as any).rpc("hr_apply_loan_push", { p_repayment_id: r.recovery_ref_id, p_razorpay_input_id: null })
        : await (supabase as any).rpc("hr_apply_deposit_collection", { p_schedule_id: r.recovery_ref_id, p_razorpay_input_id: null });
      if (rpcErr) toast.error(`Pushed, but the recovery ledger did not update: ${rpcErr.message}`);
    }
    return res;

  }

  const pushOne = (row: any) => pushGroup([row]);

  const pushRow = useMutation({
    mutationFn: pushOne,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll_inputs", table, period] }); toast.success("Pushed and verified on the RazorpayX run"); setPushConfirm(null); },
    onError: (e: any) => { qc.invalidateQueries({ queryKey: ["payroll_inputs", table, period] }); toast.error(e.message); setPushConfirm(null); },
  });

  // Bulk push — one call per employee (all their rows merged into a single
  // modifications map), sequential so RazorpayX rate limits stay happy.
  const bulkPush = useMutation({
    mutationFn: async (rowsToPush: any[]) => {
      const byEmp = new Map<string, any[]>();
      for (const r of rowsToPush) {
        const k = String(r.razorpay_employee_id);
        byEmp.set(k, [...(byEmp.get(k) || []), r]);
      }
      const failures: string[] = [];
      let ok = 0;
      for (const group of byEmp.values()) {
        try { await pushGroup(group); ok += group.length; }
        catch (e: any) { failures.push(`${empLabel(group[0])}: ${e.message}`); }
      }
      return { ok, failures };
    },
    onSuccess: ({ ok, failures }) => {
      qc.invalidateQueries({ queryKey: ["payroll_inputs", table, period] });
      setBulkPushConfirm(false);
      setCoPushConfirm(false);
      setSelected({});
      setCoSelected({});
      if (failures.length) {
        toast.error(`${ok} pushed, ${failures.length} failed`, { description: failures.slice(0, 3).join(" | ") });
        console.warn("Bulk push failures:", failures);
      } else toast.success(`Pushed ${ok} row${ok === 1 ? "" : "s"} — verified on the RazorpayX run`);
    },
    onError: (e: any) => { toast.error(e.message); setBulkPushConfirm(false); },
  });


  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await (supabase as any).from(table).delete().in("id", ids).select("id");
      if (error) throw error;
      const n = (data ?? []).length;
      if (n === 0) {
        throw new Error("Nothing was removed — those rows no longer exist or you do not have permission to remove them. The list has been refreshed.");
      }
      return n;
    },
    onSuccess: async (n) => {
      await qc.refetchQueries({ queryKey: ["payroll_inputs", table, period] });
      setSelected({}); setCoSelected({}); setBulkDeleteConfirm(false); setCoDeleteConfirm(false);
      toast.success(`Deleted ${n} staged row${n === 1 ? "" : "s"}`);
    },
    onError: async (e: any) => {
      await qc.refetchQueries({ queryKey: ["payroll_inputs", table, period] });
      setSelected({}); setCoSelected({}); setBulkDeleteConfirm(false); setCoDeleteConfirm(false);
      toast.error(e.message);
    },
  });


  // ── Un-push ────────────────────────────────────────────────────────────────
  // RazorpayX has NO endpoint that deletes a single addition/deduction from a
  // run (verified against the Payroll API contract). The only documented way to
  // take one line off the run is `payroll/reset-modifications`, which clears
  // EVERY modification for that employee in that payroll month. So un-pushing
  // one line = reset the employee's month, then re-push the lines that must
  // stay — additions and deductions alike. Any line that fails to go back is
  // left visibly pending so nothing is silently lost.
  const unpushRow = useMutation({
    mutationFn: async (row: any) => {
      const empId = row.razorpay_employee_id;
      if (!empId) throw new Error("This row has no RazorpayX employee mapping.");

      const { data: res, error } = await (supabase as any).functions.invoke("razorpay-payroll-proxy", {
        body: { action: "payroll_reset_modifications", payload: { data: { "employee-id": empId, "payroll-month": period } } },
      });
      if (error) throw new Error(error.message || "RazorpayX rejected the reset request");
      if (!res?.ok) throw new Error(res?.error || `HTTP ${res?.http_status}`);

      // Everything this employee had on the run for this month is now gone.
      const tables: { tbl: string; kind: Kind }[] = [
        { tbl: "hr_payroll_input_additions", kind: "addition" },
        { tbl: "hr_payroll_input_deductions", kind: "deduction" },
      ];
      const survivors: { rows: any[]; kind: Kind }[] = [];
      for (const { tbl, kind } of tables) {
        const { data: pushed } = await (supabase as any)
          .from(tbl).select("*")
          .eq("razorpay_employee_id", empId)
          .eq("period_month", periodDate)
          .not("pushed_at", "is", null);
        const list = (pushed || []) as any[];
        if (list.length) {
          await (supabase as any).from(tbl)
            .update({ pushed_at: null, readback_verified_at: null, push_response: null })
            .in("id", list.map((r) => r.id));
        }
        const keep = list.filter((r) => r.id !== row.id);
        if (keep.length) survivors.push({ rows: keep, kind });
      }

      // Roll the recovery ledger back for the line being pulled off the run.
      if (row.recovery_kind && row.recovery_ref_id) {
        const { error: rpcErr } = row.recovery_kind === "loan"
          ? await (supabase as any).rpc("hr_revert_loan_push", { p_repayment_id: row.recovery_ref_id })
          : await (supabase as any).rpc("hr_revert_deposit_collection", { p_schedule_id: row.recovery_ref_id });
        if (rpcErr) throw new Error(`Taken off the run, but the recovery ledger did not roll back: ${rpcErr.message}`);
      }

      const failures: string[] = [];
      let restored = 0;
      for (const { rows: group, kind } of survivors) {
        try { await pushGroup(group, kind); restored += group.length; }
        catch (e: any) { failures.push(`${group.length} ${kind}(s): ${e.message}`); }
      }
      return { restored, failures };
    },
    onSuccess: async ({ restored, failures }) => {
      await qc.refetchQueries({ queryKey: ["payroll_inputs", "hr_payroll_input_additions", period] });
      await qc.refetchQueries({ queryKey: ["payroll_inputs", "hr_payroll_input_deductions", period] });
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      qc.invalidateQueries({ queryKey: ["hr_loans"] });
      setUnpushConfirm(null);
      if (failures.length) {
        toast.error("Taken off the run, but some other lines could not be put back", { description: failures.join(" | ") });
      } else {
        toast.success(restored ? `Taken off the RazorpayX run — ${restored} other line(s) put back` : "Taken off the RazorpayX run");
      }
    },
    onError: async (e: any) => {
      await qc.refetchQueries({ queryKey: ["payroll_inputs", "hr_payroll_input_additions", period] });
      await qc.refetchQueries({ queryKey: ["payroll_inputs", "hr_payroll_input_deductions", period] });
      setUnpushConfirm(null);
      toast.error(e.message);
    },
  });

  const doNotPay = useMutation({

    mutationFn: async (empRow: any) => {
      if (empRow?.last_pull_snapshot?.is_active === false) {
        throw new Error("This employee is inactive in RazorpayX. Do-Not-Pay is unavailable because RazorpayX cannot locate inactive employees in a monthly payroll run.");
      }
      const { data: res, error } = await (supabase as any).functions.invoke("razorpay-payroll-proxy", {
        body: { action: "payroll_do_not_pay", payload: { data: { "employee-id": Number(empRow.razorpay_employee_id), "employee-type": "employee", "payroll-month": period, "do-not-pay": true } } },
      });
      if (error) {
        let detail = "";
        try {
          if (typeof error.context?.json === "function") {
            const body = await error.context.json();
            detail = body?.error || body?.message || "";
          }
        } catch { /* keep SDK fallback */ }
        throw new Error(detail || error.message || "RazorpayX rejected the Do-Not-Pay request");
      }
      if (!res?.ok) throw new Error(res?.error || `HTTP ${res?.http_status}`);
      return res;
    },
    onSuccess: () => { toast.success("Marked Do-Not-Pay on RazorpayX for this month"); setDnpConfirm(null); qc.invalidateQueries({ queryKey: ["payroll_dnp_marks", period] }); },
    onError: (e: any) => { toast.error(e.message); setDnpConfirm(null); },
  });

  const resetMods = useMutation({
    mutationFn: async (empRow: any) => {
      const { data: res, error } = await (supabase as any).functions.invoke("razorpay-payroll-proxy", {
        body: { action: "payroll_reset_modifications", payload: { data: { "employee-id": empRow.razorpay_employee_id, "payroll-month": period } } },
      });
      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error || `HTTP ${res?.http_status}`);
      return res;
    },
    onSuccess: () => { toast.success("Reset all modifications on RazorpayX for this month"); setResetConfirm(null); qc.invalidateQueries({ queryKey: ["payroll_dnp_marks", period] }); },
    onError: (e: any) => { toast.error(e.message); setResetConfirm(null); },
  });

  const pendingRows = useMemo(() => (visibleRows as any[]).filter((r) => !r.pushed_at), [visibleRows]);
  const selectedPending = useMemo(() => pendingRows.filter((r: any) => selected[r.id]), [pendingRows, selected]);
  const compoffPending = useMemo(() => (compoffRows as any[]).filter((r) => !r.pushed_at), [compoffRows]);
  const compoffSelected = useMemo(() => compoffPending.filter((r: any) => coSelected[r.id]), [compoffPending, coSelected]);

  // Presentation-only roll-ups for the summary strip.
  const sum = (list: any[]) => list.reduce((s, r) => s + Number(r.amount || 0), 0);
  const pushedRows = useMemo(() => (visibleRows as any[]).filter((r) => !!r.pushed_at), [visibleRows]);
  const unverifiedRows = useMemo(
    () => (visibleRows as any[]).filter((r) => r.pushed_at && !r.readback_verified_at),
    [visibleRows],
  );
  const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  // Month stepper for the period toolbar (same YYYY-MM contract as the input).
  const shiftPeriod = (delta: number) => {
    const [y, m] = period.split("-").map(Number);
    if (!y || !m) return;
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setPeriod(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const periodLabel = (() => {
    const [y, m] = period.split("-").map(Number);
    if (!y || !m) return period;
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  })();

  const empLabel = (r: any) => {
    const e = empById.get(r.hr_employee_id)?.hr_employees;
    return e ? `${e.first_name || ""} ${e.last_name || ""}`.trim() + (e.badge_id ? ` · ${e.badge_id}` : "") : r.razorpay_employee_id;
  };
  const initials = (r: any) => {
    const e = empById.get(r.hr_employee_id)?.hr_employees;
    return `${e?.first_name?.[0] ?? ""}${e?.last_name?.[0] ?? ""}`.toUpperCase() || "–";
  };


  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title={lopFocus ? "LOP Deductions" : "Payroll Inputs"}
        actions={<DashboardLink />}
      />


      {!gateOpen && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 text-warning" />
            <div>
              <div className="font-medium">Payroll-write gate is locked</div>
              <div className="text-muted-foreground mt-1">
                Why: the payroll-write envelope has not been verified on this environment yet. Staging still works — pushes are blocked until an operator verifies the envelope in <a href="/hrms/payroll/razorpay-sync" className="underline">RazorpayX Sync → Commissioning</a>.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Period toolbar — month stepper plus this period's roll-up at a glance */}
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payroll period</p>
              <p className="text-sm font-semibold leading-tight">{periodLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous month" onClick={() => shiftPeriod(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026-07"
              aria-label="Payroll month (YYYY-MM)"
              className="w-28 h-8 text-center font-mono text-foreground"
            />
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next month" onClick={() => shiftPeriod(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border">
          {[
            { label: "Pending to push", value: `${pendingRows.length}`, sub: inr(sum(pendingRows)), tone: "text-foreground", tint: pendingRows.length ? "bg-primary/5" : "" },
            { label: "Verified on run", value: `${pushedRows.length - unverifiedRows.length}`, sub: inr(sum(pushedRows.filter((r) => r.readback_verified_at))), tone: "text-success", tint: "bg-success/5" },
            { label: "Pushed · unverified", value: `${unverifiedRows.length}`, sub: inr(sum(unverifiedRows)), tone: unverifiedRows.length ? "text-warning" : "text-muted-foreground", tint: unverifiedRows.length ? "bg-warning/5" : "" },
            { label: `Total staged ${tab}s`, value: `${visibleRows.length}`, sub: inr(sum(visibleRows as any[])), tone: "text-foreground", tint: "" },
          ].map((s) => (
            <div key={s.label} className={`p-3 ${s.tint}`}>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className={`text-xl font-bold tabular-nums leading-tight ${s.tone}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {lopFocus && (
        <div className="flex items-center gap-2 text-xs">
          <Badge className="bg-primary/10 text-primary hover:bg-primary/10">LOP-only view</Badge>
        </div>
      )}



      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
        {!lopFocus && (
          <TabsList className="grid w-full max-w-sm grid-cols-2">
            <TabsTrigger value="addition">Additions</TabsTrigger>
            <TabsTrigger value="deduction">Deductions</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value={tab} className="space-y-4 mt-4">
          <Card className="overflow-hidden border-l-2 border-l-primary/60">
            <CardHeader className="pb-3 bg-muted/40 border-b">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <PlusCircle className="h-4 w-4 text-primary" />
                {lopFocus ? "Stage a manual LOP deduction" : `Stage a new ${tab}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-start">
                <div className="md:col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Employee</Label>
                  <Select value={form.hr_employee_id} onValueChange={(v) => setForm({ ...form, hr_employee_id: v })}>
                    <SelectTrigger className="text-foreground"><SelectValue placeholder="Pick a mapped employee" /></SelectTrigger>
                    <SelectContent>
                      {(employees as any[]).map((r) => (
                        <SelectItem key={r.hr_employee_id} value={r.hr_employee_id}>
                          {`${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.trim()} {r.hr_employees?.badge_id ? `· ${r.hr_employees.badge_id}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{lopFocus ? "Label" : "Payslip label"}</Label>
                  <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={tab === "addition" ? "Performance bonus" : "Advance recovery"} disabled={lopFocus} className={lopFocus ? "text-foreground" : undefined} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Amount</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                    <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" className="pl-6 text-right tabular-nums text-foreground" />
                  </div>
                </div>
                {tab === "addition" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Type</Label>
                    <Select value={form.addition_type} onValueChange={(v) => setForm({ ...form, addition_type: v })}>
                      <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bonus">Bonus</SelectItem>
                        <SelectItem value="arrears">Arrears</SelectItem>
                        <SelectItem value="reimbursement">Reimbursement</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.addition_type === "bonus" && enabledBonusTypes.length > 0 && (
                      <div className="pt-1">
                        <Label className="text-[10px] text-muted-foreground">Bonus subtype (mirrors Razorpay)</Label>
                        <Select
                          value=""
                          onValueChange={(v) => {
                            const bt = enabledBonusTypes.find(b => b.key === v);
                            if (bt) setForm(prev => ({ ...prev, label: bt.label }));
                          }}
                        >
                          <SelectTrigger className="text-foreground h-8 text-xs"><SelectValue placeholder="Pick from catalogue…" /></SelectTrigger>
                          <SelectContent>
                            {enabledBonusTypes.map(b => (
                              <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                ) : <div />}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 mt-4 pt-3 border-t">

                <Button onClick={() => stageMutation.mutate()} disabled={stageMutation.isPending} size="sm">
                  {stageMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlusCircle className="h-4 w-4 mr-1" />}
                  Stage {tab}
                </Button>
              </div>
            </CardContent>
          </Card>


          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-2 flex-wrap space-y-0 bg-muted/40 border-b">
              <div>
                <CardTitle className="text-sm">Staged {lopFocus ? "LOP deductions" : `${tab}s`} — {periodLabel}</CardTitle>
                <div className="flex items-center gap-2 mt-1.5 text-xs">
                  <Badge variant="outline" className="font-normal text-muted-foreground">{pendingRows.length} pending</Badge>
                  <Badge className="bg-success/10 text-success hover:bg-success/10 font-normal">{pushedRows.length} pushed</Badge>
                  <span className="text-muted-foreground tabular-nums">{inr(sum(visibleRows as any[]))} total</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {selectedPending.length > 0 && (
                  <>
                    <Badge variant="secondary" className="text-xs">{selectedPending.length} selected · {inr(sum(selectedPending))}</Badge>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!gateOpen || bulkPush.isPending} onClick={() => setBulkPushConfirm(true)} title={gateOpen ? "" : "Payroll-write gate locked"}>
                      {bulkPush.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />} Push selected
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setBulkDeleteConfirm(true)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Delete selected
                    </Button>
                  </>
                )}
                {selectedPending.length === 0 && pendingRows.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!gateOpen || bulkPush.isPending}
                    title={gateOpen ? "" : "Payroll-write gate locked"}
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      pendingRows.forEach((r: any) => { next[r.id] = true; });
                      setSelected(next);
                      setBulkPushConfirm(true);
                    }}
                  >
                    <Send className="h-3 w-3 mr-1" /> Push all pending ({pendingRows.length})
                  </Button>
                )}

                {tab === "deduction" && (
                  <Button size="sm" className="h-7 text-xs" onClick={() => setAutoLopOpen(true)}>
                    <Calculator className="h-3 w-3 mr-1" /> Auto-calculate LOP from attendance
                  </Button>
                )}
                {!lopFocus && (
                  <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setBulkOpen(true)}>
                    <Layers className="h-3 w-3 mr-1" /> Bulk stage {tab}s
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 w-8">
                      <Checkbox
                        checked={pendingRows.length > 0 && selectedPending.length === pendingRows.length}
                        onCheckedChange={(c) => {
                          if (c) { const next: Record<string, boolean> = {}; pendingRows.forEach((r: any) => { next[r.id] = true; }); setSelected(next); }
                          else setSelected({});
                        }}
                        aria-label="Select all pending"
                      />
                    </th>
                    {[
                      { h: "Employee", align: "text-left" },
                      { h: "Label", align: "text-left" },
                      ...(tab === "addition" ? [{ h: "Type", align: "text-left" }] : []),
                      { h: "Amount", align: "text-right" },
                      { h: "Status", align: "text-left" },
                      { h: "Actions", align: "text-right" },
                    ].map(({ h, align }) => (
                      <th key={h} className={`px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground ${align}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading staged rows…
                    </td></tr>
                  ) : visibleRows.length === 0 ? (
                    <tr><td colSpan={7} className="p-10 text-center">
                      <div className="inline-flex flex-col items-center rounded-xl border border-dashed border-border bg-muted/20 px-8 py-6">
                        <Layers className="h-6 w-6 text-muted-foreground/50 mb-2" />
                        <p className="text-sm font-medium">No staged {lopFocus && tab === "deduction" ? "LOP deductions" : `${tab}s`} for {periodLabel}</p>
                        <p className="text-xs text-muted-foreground mt-1">Stage a line above{tab === "deduction" ? ", or auto-calculate LOP from attendance" : ""}.</p>
                      </div>
                    </td></tr>
                  ) : visibleRows.map((r) => (
                    <tr key={r.id} className={`border-b transition-colors hover:bg-muted/40 ${selected[r.id] ? "bg-primary/5" : ""}`}>
                      <td className="px-3 py-2 align-middle">
                        {!r.pushed_at && (
                          <Checkbox
                            checked={!!selected[r.id]}
                            onCheckedChange={(c) => setSelected((p) => ({ ...p, [r.id]: !!c }))}
                            aria-label="Select row"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-7 w-7 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center text-[10px] font-semibold">
                            {initials(r)}
                          </span>
                          <span className="font-medium">{empLabel(r)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">{r.label}</td>
                      {tab === "addition" && (
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="capitalize font-normal">{additionTypeSlug(r.addition_type)}</Badge>
                          {r.taxable === false && <span className="ml-1 text-[10px] text-muted-foreground">non-tax</span>}
                        </td>
                      )}
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${tab === "deduction" ? "text-destructive" : "text-success"}`}>
                        {tab === "deduction" ? "−" : "+"}{inr(r.amount)}
                      </td>
                      <td className="px-3 py-2">
                        {r.pushed_at && r.readback_verified_at ? (
                          <Badge className="bg-success/10 text-success hover:bg-success/10" title={`Verified on the RazorpayX run at ${new Date(r.readback_verified_at).toLocaleString("en-IN")}`}>Verified on run</Badge>
                        ) : r.pushed_at ? (
                          <Badge className="bg-warning/10 text-warning hover:bg-warning/10" title={String(r.readback_diff?.error || "Pushed, but not confirmed on the run read-back")}>Pushed · unverified</Badge>
                        ) : <Badge variant="outline" className="text-muted-foreground">Pending</Badge>}
                      </td>

                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end">
                          {!r.pushed_at && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!gateOpen} onClick={() => setPushConfirm(r)} title={gateOpen ? "Push this line to RazorpayX" : "Payroll-write gate locked"}>
                              <Send className="h-3 w-3 mr-1" /> Push
                            </Button>
                          )}
                          {!r.pushed_at && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Delete staged row" onClick={() => deleteRow.mutate(r.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                          {r.pushed_at && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!gateOpen || unpushRow.isPending} onClick={() => setUnpushConfirm(r)} title="Take this line off the RazorpayX run">
                                <Undo2 className="h-3 w-3 mr-1" /> Unpush
                              </Button>
                            </>
                          )}

                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {visibleRows.length > 0 && (
                  <tfoot className="bg-muted/40 border-t">
                    <tr>
                      <td colSpan={tab === "addition" ? 4 : 3} className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{inr(sum(visibleRows as any[]))}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>

            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!lopFocus && <FnFSettlementInputsCard period={period} kind={tab} />}
      {!lopFocus && <TrainingCtcAdjustmentsCard period={period} />}
      {!lopFocus && tab === "deduction" && <AutoRecoveriesCard period={period} />}
      {!lopFocus && tab === "addition" && <OtherPayrollInputsCard period={period} />}

      {!lopFocus && tab === "addition" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
            <div>
              <CardTitle className="text-sm">Comp-off encashment — {period}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Comp-off never carries forward. After days taken as leave and days used to cancel this month's LOP,
                the remaining balance is encashed at monthly base ÷ working days and staged as an addition.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {compoffSelected.length > 0 && (
                <>
                  <Badge variant="secondary" className="text-xs">{compoffSelected.length} selected · {inr(sum(compoffSelected))}</Badge>
                  <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!gateOpen || bulkPush.isPending} onClick={() => setCoPushConfirm(true)} title={gateOpen ? "" : "Payroll-write gate locked"}>
                    {bulkPush.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />} Push selected
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" disabled={bulkDelete.isPending} onClick={() => setCoDeleteConfirm(true)}>
                    <Trash2 className="h-3 w-3 mr-1" /> Delete selected
                  </Button>
                </>
              )}
              {compoffSelected.length === 0 && compoffPending.length > 0 && (
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!gateOpen || bulkPush.isPending} onClick={() => { setCoSelected(Object.fromEntries(compoffPending.map((r: any) => [r.id, true]))); setCoPushConfirm(true); }} title={gateOpen ? "" : "Payroll-write gate locked"}>
                  <Send className="h-3 w-3 mr-1" /> Push all pending ({compoffPending.length})
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setCompoffOpen(true)}>
                <Gift className="h-4 w-4 mr-1.5" /> Calculate comp-off encashment
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 border-t overflow-x-auto">
            {compoffRows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                Nothing staged yet for {periodLabel}. Run the calculation to stage encashment lines here.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-3 py-2 w-10">
                      <Checkbox
                        checked={compoffPending.length > 0 && compoffSelected.length === compoffPending.length}
                        onCheckedChange={(v) =>
                          setCoSelected(v ? Object.fromEntries(compoffPending.map((r: any) => [r.id, true])) : {})
                        }
                        disabled={compoffPending.length === 0}
                        aria-label="Select all pending comp-off encashment rows"
                      />
                    </th>
                    {[
                      { h: "Employee", a: "text-left" },
                      { h: "Detail", a: "text-left" },
                      { h: "Amount", a: "text-right" },
                      { h: "Status", a: "text-left" },
                      { h: "Actions", a: "text-right" },
                    ].map(({ h, a }) => (
                      <th key={h} className={`px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground ${a}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compoffRows.map((r: any) => (
                    <tr key={r.id} className={`border-b hover:bg-muted/40 transition-colors ${coSelected[r.id] ? "bg-primary/5" : ""}`}>
                      <td className="px-3 py-2">
                        {!r.pushed_at && (
                          <Checkbox
                            checked={!!coSelected[r.id]}
                            onCheckedChange={(v) => setCoSelected((prev) => ({ ...prev, [r.id]: !!v }))}
                            aria-label={`Select ${empLabel(r)}`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-7 w-7 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center text-[10px] font-semibold">{initials(r)}</span>
                          <span className="font-medium">{empLabel(r)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-success">+{inr(r.amount)}</td>
                      <td className="px-3 py-2">
                        {r.pushed_at && r.readback_verified_at ? (
                          <Badge className="bg-success/10 text-success hover:bg-success/10">Verified on run</Badge>
                        ) : r.pushed_at ? (
                          <Badge className="bg-warning/10 text-warning hover:bg-warning/10">Pushed · unverified</Badge>
                        ) : <Badge variant="outline" className="text-muted-foreground">Pending</Badge>}
                      </td>

                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end">
                          {!r.pushed_at && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!gateOpen} onClick={() => setPushConfirm(r)} title={gateOpen ? "Push this line to RazorpayX" : "Payroll-write gate locked"}>
                                <Send className="h-3 w-3 mr-1" /> Push
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Delete staged row" onClick={() => deleteRow.mutate(r.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {r.pushed_at && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!gateOpen || unpushRow.isPending} onClick={() => setUnpushConfirm(r)} title="Take this line off the RazorpayX run">
                                <Undo2 className="h-3 w-3 mr-1" /> Unpush
                              </Button>
                            </>
                          )}

                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/40 border-t">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Total · {compoffRows.length} line(s)</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{inr(sum(compoffRows as any[]))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </CardContent>
        </Card>

      )}





      {/* Per-employee do-not-pay / reset — operate on RazorpayX directly for the current period */}
      {!lopFocus && (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 flex-wrap bg-muted/40 border-b">
          <div>
            <CardTitle className="text-sm">Per-employee actions — {periodLabel}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Do-Not-Pay excludes someone from this month's RazorpayX run; Reset clears every modification pushed for them this month.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder="Search employee…"
                aria-label="Search employees"
                className="h-8 w-48 pl-8 text-xs text-foreground"
              />
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportPayableList}>
              <Download className="h-3 w-3 mr-1" /> Export payable list
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Employee</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(employees as any[])
                .filter((r) => {
                  const q = empSearch.trim().toLowerCase();
                  if (!q) return true;
                  const name = `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""} ${r.hr_employees?.badge_id || ""}`.toLowerCase();
                  return name.includes(q);
                })
                .slice(0, 200).map((r) => {

                const dnpAt = (dnpMarks as Record<string, string>)[String(r.razorpay_employee_id)];
                const inactive = r.last_pull_snapshot?.is_active === false;
                return (
                <tr key={r.hr_employee_id} className={`border-b hover:bg-muted/30 ${dnpAt ? "bg-muted/40" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="h-7 w-7 shrink-0 rounded-full bg-muted text-muted-foreground grid place-items-center text-[10px] font-semibold">
                        {`${r.hr_employees?.first_name?.[0] ?? ""}${r.hr_employees?.last_name?.[0] ?? ""}`.toUpperCase() || "–"}
                      </span>
                      <span className={dnpAt ? "text-muted-foreground" : "font-medium"}>{`${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.trim()} {r.hr_employees?.badge_id ? `· ${r.hr_employees.badge_id}` : ""}</span>
                      {inactive && <Badge variant="muted">Inactive in RazorpayX</Badge>}
                      {dnpAt && <Badge variant="muted">Do-Not-Pay applied · {new Date(dnpAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 justify-end">

                      <Button
                        size="sm"
                        variant={dnpAt ? "secondary" : "outline"}
                        className={`h-7 text-xs ${dnpAt ? "text-muted-foreground" : ""}`}
                        disabled={!gateOpen || inactive || !!dnpAt}
                        onClick={() => setDnpConfirm(r)}
                        title={!gateOpen ? "Payroll-write gate locked" : inactive ? "Unavailable: employee is inactive in RazorpayX" : dnpAt ? `Already marked Do-Not-Pay for ${period} — use Reset modifications to undo` : ""}
                      >
                        <Ban className="h-3 w-3 mr-1" /> {dnpAt ? `Do-Not-Pay set for ${period}` : "Do-Not-Pay this month"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!gateOpen} onClick={() => setResetConfirm(r)} title={gateOpen ? "" : "Payroll-write gate locked"}>
                        <RotateCcw className="h-3 w-3 mr-1" /> Reset modifications
                      </Button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>

          </table>
        </CardContent>
      </Card>
      )}


      <AlertDialog open={!!pushConfirm} onOpenChange={(o) => !o && setPushConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Push to RazorpayX?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send <strong>{pushConfirm?.label}</strong> (₹{Number(pushConfirm?.amount || 0).toLocaleString("en-IN")}) for <strong>{pushConfirm && empLabel(pushConfirm)}</strong> for period <strong>{pushConfirm?.period_month}</strong>. It will apply on the next RazorpayX payroll run.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pushConfirm && pushRow.mutate(pushConfirm)} disabled={pushRow.isPending}>
              {pushRow.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Push
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!dnpConfirm} onOpenChange={(o) => !o && setDnpConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Do-Not-Pay?</AlertDialogTitle>
            <AlertDialogDescription>
              This tells RazorpayX to exclude <strong>{dnpConfirm?.hr_employees?.first_name} {dnpConfirm?.hr_employees?.last_name}</strong> from the <strong>{period}</strong> payroll run. Reversible via "Reset modifications".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => dnpConfirm && doNotPay.mutate(dnpConfirm)} disabled={doNotPay.isPending}>
              {doNotPay.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!resetConfirm} onOpenChange={(o) => !o && setResetConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all modifications?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears every additions/deductions/DNP applied to <strong>{resetConfirm?.hr_employees?.first_name} {resetConfirm?.hr_employees?.last_name}</strong> for <strong>{period}</strong> on RazorpayX. Rows already marked "Pushed" here will remain in the ledger but stop taking effect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetConfirm && resetMods.mutate(resetConfirm)} disabled={resetMods.isPending}>
              {resetMods.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!unpushConfirm} onOpenChange={(o) => !o && setUnpushConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take this line off the RazorpayX run?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>{empLabel(unpushConfirm || {})}</strong> · {unpushConfirm?.label} · {inr(unpushConfirm?.amount)} for <strong>{period}</strong>.
                </div>
                <div>
                  RazorpayX cannot delete one line on its own. This clears <em>all</em> of this employee's additions and
                  deductions for {period} on the run, then immediately puts every other line back and confirms each one
                  on the run. Anything that fails to go back is left showing as pending here so you can retry it.
                </div>
                <div>
                  If this line was a deposit or loan installment, it returns to "scheduled" — unless it has already been
                  recovered, in which case it cannot be pulled back.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => unpushConfirm && unpushRow.mutate(unpushConfirm)} disabled={unpushRow.isPending}>
              {unpushRow.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Unpush
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkPushConfirm} onOpenChange={setBulkPushConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Push {selectedPending.length} row{selectedPending.length === 1 ? "" : "s"} to RazorpayX?</AlertDialogTitle>
            <AlertDialogDescription>
              Total ₹{selectedPending.reduce((s: number, r: any) => s + Number(r.amount || 0), 0).toLocaleString("en-IN")} for period <strong>{period}</strong>. Rows are pushed one employee at a time and each one is read back from the RazorpayX payroll run — a row is marked Pushed only after that verification succeeds; anything unverified stays pending for retry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkPush.mutate(selectedPending)} disabled={bulkPush.isPending}>
              {bulkPush.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Push all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={coPushConfirm} onOpenChange={setCoPushConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Push {compoffSelected.length} comp-off encashment row{compoffSelected.length === 1 ? "" : "s"} to RazorpayX?</AlertDialogTitle>
            <AlertDialogDescription>
              Total {inr(sum(compoffSelected))} for period <strong>{period}</strong>. Rows are pushed one employee at a time and read back from the RazorpayX payroll run — a row is marked Pushed only after that verification succeeds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPush.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkPush.mutate(compoffSelected)} disabled={bulkPush.isPending}>
              {bulkPush.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Push
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={coDeleteConfirm} onOpenChange={setCoDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {compoffSelected.length} staged comp-off row{compoffSelected.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              These encashment lines will be removed from staging for {period}. Nothing already pushed to RazorpayX is affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDelete.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => bulkDelete.mutate(compoffSelected.map((r: any) => r.id))} disabled={bulkDelete.isPending}>
              {bulkDelete.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedPending.length} staged row{selectedPending.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>Only rows that have not been pushed are deleted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => bulkDelete.mutate(selectedPending.map((r: any) => r.id))} disabled={bulkDelete.isPending}>
              {bulkDelete.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkPayrollInputDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        kind={tab}
        period={period}
        employees={employees as any[]}
        onDone={() => qc.invalidateQueries({ queryKey: ["payroll_inputs", table, period] })}
      />

      <AutoLopDialog open={autoLopOpen} onOpenChange={setAutoLopOpen} period={period} />
      <CompOffEncashmentDialog open={compoffOpen} onOpenChange={setCompoffOpen} period={period} />

    </div>
  );
}
