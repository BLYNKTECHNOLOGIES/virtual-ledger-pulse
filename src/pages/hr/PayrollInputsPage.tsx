import { useMemo, useState } from "react";
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
import { Loader2, Send, Trash2, Ban, RotateCcw, Info, ExternalLink, Layers, Calculator } from "lucide-react";
import { SourceTag, DashboardLink } from "@/components/hr/payroll/SourceTag";
import { BulkPayrollInputDialog } from "@/components/hr/payroll/BulkPayrollInputDialog";
import { AutoLopDialog } from "@/components/hr/payroll/AutoLopDialog";
import { useComplianceSettings } from "@/hooks/hrms/useComplianceSettings";

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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [autoLopOpen, setAutoLopOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkPushConfirm, setBulkPushConfirm] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Mirror of Razorpay bonus catalogue — filters the Bonus subtype dropdown.
  const { data: complianceSettings } = useComplianceSettings();
  const enabledBonusTypes = useMemo(
    () => (complianceSettings?.bonus_types ?? []).filter(b => b.enabled),
    [complianceSettings],
  );

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
        .select("razorpay_employee_id, hr_employee_id, hr_employees:hr_employee_id(id, first_name, last_name, badge_id, is_active)")
        .not("hr_employee_id", "is", null)
        .not("razorpay_employee_id", "is", null);
      if (error) throw error;
      return (data || []).filter((r: any) => r.hr_employees && r.hr_employees.is_active !== false);
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

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payroll_inputs", table, period],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from(table).select("*").eq("period_month", periodDate).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Cockpit step 3 deep-links here with focus=lop — narrow the list to loss-of-pay rows.
  const visibleRows = useMemo(() => {
    const all = (rows as any[]) ?? [];
    if (!lopFocus || tab !== "deduction") return all;
    return all.filter((r) => /lop|loss of pay|loss-of-pay/i.test(String(r.label ?? "")));
  }, [rows, lopFocus, tab]);



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
      if (tab === "addition") { row.addition_type = form.addition_type; row.taxable = form.taxable; }
      const { error } = await (supabase as any).from(table).insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_inputs", table, period] });
      setForm({ hr_employee_id: "", label: "", amount: "", addition_type: "bonus", taxable: true });
      toast.success("Staged. Push to RazorpayX when ready.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll_inputs", table, period] }),
    onError: (e: any) => toast.error(e.message),
  });

  // Single push primitive. RazorpayX takes a label-keyed MAP of modifications in
  // plain rupees, and acknowledges with an opaque 200 — so every push asks the
  // proxy for a view-payroll read-back that proves the amount is on the run.
  async function pushGroup(rowsIn: any[]) {
    const group = Array.isArray(rowsIn) ? rowsIn : [rowsIn];
    if (!group.length) return null;
    const first = group[0];
    const action = tab === "addition" ? "payroll_add_additions" : "payroll_add_deduction";
    const items = group.map((r) => (tab === "addition"
      ? { label: r.label, amount: Number(r.amount), taxable: r.taxable !== false, type: r.addition_type || "bonus" }
      : { label: r.label, amount: Number(r.amount) }));
    const data: any = {
      "employee-id": Number(first.razorpay_employee_id),
      "employee-type": "employee",
      "payroll-month": String(first.period_month).slice(0, 7),
      ...(tab === "addition" ? { additions: items } : { deductions: items }),
    };
    const { data: res, error } = await (supabase as any).functions.invoke("razorpay-payroll-proxy", {
      body: {
        action,
        payload: {
          data,
          readback_ids: group.map((r) => r.id),
          readback_table: tab === "addition" ? "additions" : "deductions",
        },
      },
    });
    if (error) throw error;
    if (!res?.ok) throw new Error(res?.error || `HTTP ${res?.http_status}`);
    const { error: uErr } = await (supabase as any).from(table)
      .update({ pushed_at: new Date().toISOString(), push_response: res.body ?? {} })
      .in("id", group.map((r) => r.id));
    if (uErr) throw uErr;
    if (res?.readback && res.readback.verified_on_run === false) {
      throw new Error(res.readback.error || "Pushed, but not visible on the RazorpayX run — verify in the dashboard.");
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
      setSelected({});
      if (failures.length) {
        toast.error(`${ok} pushed, ${failures.length} failed`, { description: failures.slice(0, 3).join(" | ") });
        console.warn("Bulk push failures:", failures);
      } else toast.success(`Pushed ${ok} row${ok === 1 ? "" : "s"} — verified on the RazorpayX run`);
    },
    onError: (e: any) => { toast.error(e.message); setBulkPushConfirm(false); },
  });


  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase as any).from(table).delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["payroll_inputs", table, period] });
      setSelected({}); setBulkDeleteConfirm(false);
      toast.success(`Deleted ${n} staged row${n === 1 ? "" : "s"}`);
    },
    onError: (e: any) => { toast.error(e.message); setBulkDeleteConfirm(false); },
  });

  const doNotPay = useMutation({
    mutationFn: async (empRow: any) => {
      const { data: res, error } = await (supabase as any).functions.invoke("razorpay-payroll-proxy", {
        body: { action: "payroll_do_not_pay", payload: { data: { "employee-id": empRow.razorpay_employee_id, "payroll-month": period } } },
      });
      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error || `HTTP ${res?.http_status}`);
      return res;
    },
    onSuccess: () => { toast.success("Marked Do-Not-Pay on RazorpayX for this month"); setDnpConfirm(null); },
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
    onSuccess: () => { toast.success("Reset all modifications on RazorpayX for this month"); setResetConfirm(null); },
    onError: (e: any) => { toast.error(e.message); setResetConfirm(null); },
  });

  const pendingRows = useMemo(() => (visibleRows as any[]).filter((r) => !r.pushed_at), [visibleRows]);
  const selectedPending = useMemo(() => pendingRows.filter((r: any) => selected[r.id]), [pendingRows, selected]);

  const empLabel = (r: any) => {
    const e = empById.get(r.hr_employee_id)?.hr_employees;
    return e ? `${e.first_name || ""} ${e.last_name || ""}`.trim() + (e.badge_id ? ` · ${e.badge_id}` : "") : r.razorpay_employee_id;
  };

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title={lopFocus ? "LOP Deductions — push to RazorpayX" : "Payroll Inputs"}
        description={lopFocus
          ? "Cockpit step 3: stage loss-of-pay deductions for the period and push them to RazorpayX. This view handles LOP only."
          : "Stage one-off additions, deductions, do-not-pay and reset-modifications, then push to RazorpayX. RazorpayX computes payroll; HRMS is the input feeder."}
        actions={<DashboardLink />}
      />

      {/* Doctrine strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
        <SourceTag source="razorpay" />
        <span className="text-muted-foreground">
          These inputs land in RazorpayX and are applied on the next payroll run there. Pay-run and payslip PDFs live on the RazorpayX dashboard.
        </span>
      </div>

      {!gateOpen && (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm">Period</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Month (YYYY-MM)</Label>
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-07" className="w-32 h-8" />
          </div>
        </CardHeader>
      </Card>

      {lopFocus && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          <div className="font-medium">LOP-only view</div>
          <div className="text-muted-foreground mt-1">
            Only loss-of-pay deductions for {period} are staged, listed and pushed here. Additions, bonuses and other deductions are intentionally hidden — open Payroll Inputs from the cockpit tools to manage those.
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
        {!lopFocus && (
          <TabsList>
            <TabsTrigger value="addition">Additions</TabsTrigger>
            <TabsTrigger value="deduction">Deductions</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value={tab} className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">{lopFocus ? "Stage a manual LOP deduction" : `Stage a new ${tab}`}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div className="md:col-span-2">
                  <Label className="text-xs">Employee</Label>
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
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={tab === "addition" ? "Performance bonus" : "Advance recovery"} disabled={lopFocus} className={lopFocus ? "text-foreground" : undefined} />
                  {lopFocus && <p className="text-[10px] text-muted-foreground mt-1">Locked to the LOP head so the row stays inside this view.</p>}
                </div>
                <div>
                  <Label className="text-xs">Amount (₹)</Label>
                  <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
                </div>
                {tab === "addition" ? (
                  <div>
                    <Label className="text-xs">Type</Label>
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
                      <div className="mt-2">
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
              <div className="flex justify-end mt-3">
                <Button onClick={() => stageMutation.mutate()} disabled={stageMutation.isPending} size="sm">
                  {stageMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Stage
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm">Staged {lopFocus ? "LOP deductions" : `${tab}s`} for {period}</CardTitle>
              <div className="flex items-center gap-2">
                {selectedPending.length > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground">{selectedPending.length} selected</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!gateOpen || bulkPush.isPending} onClick={() => setBulkPushConfirm(true)} title={gateOpen ? "" : "Payroll-write gate locked"}>
                      {bulkPush.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />} Push selected
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setBulkDeleteConfirm(true)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Delete selected
                    </Button>
                  </>
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
                <thead className="bg-muted/50 border-b">
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
                    {["Employee", "Label", tab === "addition" ? "Type" : "", "Amount", "Status", "Actions"].filter(Boolean).map((h) => (
                      <th key={h as string} className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
                  ) : visibleRows.length === 0 ? (
                    <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No staged {lopFocus && tab === "deduction" ? "LOP deductions" : `${tab}s`} for {period}.</td></tr>
                  ) : visibleRows.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2">
                        {!r.pushed_at && (
                          <Checkbox
                            checked={!!selected[r.id]}
                            onCheckedChange={(c) => setSelected((p) => ({ ...p, [r.id]: !!c }))}
                            aria-label="Select row"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">{empLabel(r)}</td>
                      <td className="px-3 py-2">{r.label}</td>
                      {tab === "addition" && <td className="px-3 py-2">{r.addition_type}{r.taxable === false ? " · non-tax" : ""}</td>}
                      <td className="px-3 py-2 tabular-nums">₹{Number(r.amount).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2">
                        {r.readback_verified_at ? (
                          <Badge className="bg-success/10 text-success" title={`Verified on the RazorpayX run at ${new Date(r.readback_verified_at).toLocaleString("en-IN")}`}>Verified on run</Badge>
                        ) : r.pushed_at ? (
                          <Badge className="bg-warning/10 text-warning" title={String(r.readback_diff?.error || "Pushed, but not confirmed on the run read-back")}>Pushed · unverified</Badge>
                        ) : <Badge variant="outline">Pending</Badge>}

                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {!r.pushed_at && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!gateOpen} onClick={() => setPushConfirm(r)} title={gateOpen ? "" : "Payroll-write gate locked"}>
                              <Send className="h-3 w-3 mr-1" /> Push
                            </Button>
                          )}
                          {!r.pushed_at && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteRow.mutate(r.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                          {r.pushed_at && (
                            <a className="text-xs underline text-muted-foreground inline-flex items-center gap-1" href="https://x.razorpay.com/payroll" target="_blank" rel="noreferrer">verify <ExternalLink className="h-3 w-3" /></a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Per-employee do-not-pay / reset — operate on RazorpayX directly for the current period */}
      {!lopFocus && (
      <Card>
        <CardHeader><CardTitle className="text-sm">Per-employee actions for {period}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Employee</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(employees as any[]).slice(0, 200).map((r) => (
                <tr key={r.hr_employee_id} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-2">{`${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.trim()} {r.hr_employees?.badge_id ? `· ${r.hr_employees.badge_id}` : ""}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!gateOpen} onClick={() => setDnpConfirm(r)} title={gateOpen ? "" : "Payroll-write gate locked"}>
                        <Ban className="h-3 w-3 mr-1" /> Do-Not-Pay this month
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!gateOpen} onClick={() => setResetConfirm(r)} title={gateOpen ? "" : "Payroll-write gate locked"}>
                        <RotateCcw className="h-3 w-3 mr-1" /> Reset modifications
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
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
      <AlertDialog open={bulkPushConfirm} onOpenChange={setBulkPushConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Push {selectedPending.length} row{selectedPending.length === 1 ? "" : "s"} to RazorpayX?</AlertDialogTitle>
            <AlertDialogDescription>
              Total ₹{selectedPending.reduce((s: number, r: any) => s + Number(r.amount || 0), 0).toLocaleString("en-IN")} for period <strong>{period}</strong>. Rows are pushed one by one; any failures are reported and stay pending.
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
    </div>
  );
}
