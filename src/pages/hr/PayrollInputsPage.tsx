import { useMemo, useState } from "react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Send, Trash2, Ban, RotateCcw, Info, ExternalLink } from "lucide-react";
import { SourceTag, DashboardLink } from "@/components/hr/payroll/SourceTag";
import { useComplianceSettings } from "@/hooks/hrms/useComplianceSettings";

// Period helpers — Razorpay uses YYYY-MM strings for the payroll month.
const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

type Kind = "addition" | "deduction";

export default function PayrollInputsPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [tab, setTab] = useState<Kind>("addition");
  const [form, setForm] = useState({ hr_employee_id: "", label: "", amount: "", addition_type: "bonus", taxable: true });
  const [pushConfirm, setPushConfirm] = useState<any>(null);
  const [dnpConfirm, setDnpConfirm] = useState<any>(null);
  const [resetConfirm, setResetConfirm] = useState<any>(null);

  // Envelope gate — payroll writes require push_payroll_endpoint_verified on razorpay settings.
  const { data: settings } = useQuery({
    queryKey: ["hr_razorpay_settings_gate"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_razorpay_settings").select("push_payroll_endpoint_verified,push_payroll_envelope_key,push_payroll_envelope_verified_at").limit(1).maybeSingle();
      return data || null;
    },
  });
  const gateOpen = !!settings?.push_payroll_endpoint_verified;

  // Employee roster — only mapped RazorpayX employees are pushable.
  const { data: employees = [] } = useQuery({
    queryKey: ["hr_mapped_employees_for_inputs"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_razorpay_employee_map")
        .select("razorpay_employee_id, hr_employee_id, hr_employees:hr_employee_id(id, first_name, last_name, employee_id, status)")
        .not("hr_employee_id", "is", null)
        .not("razorpay_employee_id", "is", null);
      return (data || []).filter((r: any) => r.hr_employees && r.hr_employees.status !== "dismissed");
    },
  });
  const empById = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of employees as any[]) if (r.hr_employees) m.set(r.hr_employee_id, r);
    return m;
  }, [employees]);

  const table = tab === "addition" ? "hr_payroll_input_additions" : "hr_payroll_input_deductions";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payroll_inputs", table, period],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from(table).select("*").eq("period_month", period).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

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
        period_month: period,
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

  const pushRow = useMutation({
    mutationFn: async (row: any) => {
      const action = tab === "addition" ? "payroll_add_additions" : "payroll_add_deduction";
      const data: any = tab === "addition"
        ? { "employee-id": row.razorpay_employee_id, "payroll-month": row.period_month, additions: [{ label: row.label, amount: Math.round(row.amount * 100), taxable: !!row.taxable, type: row.addition_type || "bonus" }] }
        : { "employee-id": row.razorpay_employee_id, "payroll-month": row.period_month, deductions: [{ label: row.label, amount: Math.round(row.amount * 100) }] };
      const { data: res, error } = await (supabase as any).functions.invoke("razorpay-payroll-proxy", { body: { action, payload: { data } } });
      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error || `HTTP ${res?.http_status}`);
      const { error: uErr } = await (supabase as any).from(table).update({ pushed_at: new Date().toISOString(), push_response: res.body ?? {} }).eq("id", row.id);
      if (uErr) throw uErr;
      return res;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll_inputs", table, period] }); toast.success("Pushed to RazorpayX"); setPushConfirm(null); },
    onError: (e: any) => { toast.error(e.message); setPushConfirm(null); },
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

  const empLabel = (r: any) => {
    const e = empById.get(r.hr_employee_id)?.hr_employees;
    return e ? `${e.first_name || ""} ${e.last_name || ""}`.trim() + (e.employee_id ? ` · ${e.employee_id}` : "") : r.razorpay_employee_id;
  };

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Payroll Inputs"
        description="Stage one-off additions, deductions, do-not-pay and reset-modifications, then push to RazorpayX. RazorpayX computes payroll; HRMS is the input feeder."
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
        <TabsList>
          <TabsTrigger value="addition">Additions</TabsTrigger>
          <TabsTrigger value="deduction">Deductions</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Stage a new {tab}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div className="md:col-span-2">
                  <Label className="text-xs">Employee</Label>
                  <Select value={form.hr_employee_id} onValueChange={(v) => setForm({ ...form, hr_employee_id: v })}>
                    <SelectTrigger className="text-foreground"><SelectValue placeholder="Pick a mapped employee" /></SelectTrigger>
                    <SelectContent>
                      {(employees as any[]).map((r) => (
                        <SelectItem key={r.hr_employee_id} value={r.hr_employee_id}>
                          {`${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.trim()} {r.hr_employees?.employee_id ? `· ${r.hr_employees.employee_id}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={tab === "addition" ? "Performance bonus" : "Advance recovery"} />
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
            <CardHeader><CardTitle className="text-sm">Staged {tab}s for {period}</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    {["Employee", "Label", tab === "addition" ? "Type" : "", "Amount", "Status", "Actions"].filter(Boolean).map((h) => (
                      <th key={h as string} className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
                  ) : (rows as any[]).length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No staged {tab}s for {period}.</td></tr>
                  ) : (rows as any[]).map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2">{empLabel(r)}</td>
                      <td className="px-3 py-2">{r.label}</td>
                      {tab === "addition" && <td className="px-3 py-2">{r.addition_type}{r.taxable === false ? " · non-tax" : ""}</td>}
                      <td className="px-3 py-2 tabular-nums">₹{Number(r.amount).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2">
                        {r.pushed_at ? <Badge className="bg-success/10 text-success">Pushed</Badge> : <Badge variant="outline">Pending</Badge>}
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
                  <td className="px-3 py-2">{`${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.trim()} {r.hr_employees?.employee_id ? `· ${r.hr_employees.employee_id}` : ""}</td>
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
    </div>
  );
}
