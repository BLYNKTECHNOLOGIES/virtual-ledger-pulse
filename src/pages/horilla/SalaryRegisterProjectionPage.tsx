/**
 * In-Progress / Upcoming Salary Register — PILOT, READ-ONLY.
 *
 * Projects the RazorpayX "Salary Register" layout from HRMS data alone so HR
 * can tally mid-month against RazorpayX before payroll is processed. Nothing on
 * this page writes to the HRMS: it calls a select-only edge function and
 * renders the result.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { Download, Eye, RefreshCw, Info, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";

const inr0 = (n: any) => {
  const v = Number(n ?? 0);
  if (!v) return "0";
  return Math.round(v).toLocaleString("en-IN");
};
const dmy = (d: any) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB") : "");

/** Column model mirrors the RazorpayX salary-register layout. */
type Col = { key: string; label: string; kind?: "num" | "date" | "text"; group: string };
const COLUMNS: Col[] = [
  { key: "emp_code", label: "Emp Id", group: "Identity" },
  { key: "name", label: "Name", group: "Identity" },
  { key: "dob", label: "Date Of Birth", kind: "date", group: "Identity" },
  { key: "hire_date", label: "Hire Date", kind: "date", group: "Identity" },
  { key: "gender", label: "Gender", group: "Identity" },
  { key: "department", label: "Department", group: "Identity" },
  { key: "designation", label: "Designation", group: "Identity" },
  { key: "location", label: "Location", group: "Identity" },
  { key: "pt_location", label: "PT Location", group: "Identity" },
  { key: "email", label: "Email", group: "Identity" },
  { key: "has_left", label: "Has Left The Organization", group: "Identity" },
  { key: "working_days", label: "Working Days", kind: "num", group: "Identity" },
  { key: "relieving_date", label: "Relieving Date", kind: "date", group: "Identity" },
  { key: "pan", label: "Pan", group: "Statutory Ids" },
  { key: "uan", label: "PF UAN", group: "Statutory Ids" },
  { key: "esi_number", label: "ESI Number", group: "Statutory Ids" },
  { key: "basic", label: "Basic Salary", kind: "num", group: "Earnings" },
  { key: "da", label: "DA Salary", kind: "num", group: "Earnings" },
  { key: "hra", label: "HRA Salary", kind: "num", group: "Earnings" },
  { key: "sa", label: "SA Salary", kind: "num", group: "Earnings" },
  { key: "lta", label: "LTA Salary", kind: "num", group: "Earnings" },
  { key: "employer_esi", label: "Employer ESI Contr.", kind: "num", group: "Earnings" },
  { key: "employer_pf", label: "Employer PF Contr.", kind: "num", group: "Earnings" },
  { key: "regular_additions", label: "Other Additions", kind: "num", group: "Earnings" },
  { key: "gross", label: "Gross Salary", kind: "num", group: "Earnings" },
  { key: "esi_ee", label: "ESI (EE)", kind: "num", group: "Deductions" },
  { key: "esi_er", label: "ESI (ER)", kind: "num", group: "Deductions" },
  { key: "pf_ee", label: "PF (EE)", kind: "num", group: "Deductions" },
  { key: "pf_er", label: "PF (ER)", kind: "num", group: "Deductions" },
  { key: "vpf", label: "VPF", kind: "num", group: "Deductions" },
  { key: "pt", label: "PT", kind: "num", group: "Deductions" },
  { key: "tds", label: "TDS", kind: "num", group: "Deductions" },
  { key: "loan_emi", label: "Loan Emi", kind: "num", group: "Deductions" },
  { key: "deposit_recovery", label: "Deposit Recovery", kind: "num", group: "Deductions" },
  { key: "other_recovery", label: "Other Recovery", kind: "num", group: "Deductions" },
  { key: "lop_days", label: "LOP Days", kind: "num", group: "Deductions" },
  { key: "lop_amount", label: "LOP Amount", kind: "num", group: "Deductions" },
  { key: "one_time_payments", label: "One-time Payments", kind: "num", group: "Deductions" },
  { key: "net_pay", label: "Net Pay", kind: "num", group: "Deductions" },
  { key: "off_payroll_payouts", label: "Off-payroll Payouts (not in net)", kind: "num", group: "Off-cycle" },
  { key: "bank_account", label: "Bank Acc. No", group: "Payout" },
  { key: "ifsc", label: "IFSC Code", group: "Payout" },
  { key: "salary_base_source", label: "Salary Base Source", group: "Provenance" },
];

const DEFAULT_HIDDEN = new Set(["dob", "email", "pt_location", "relieving_date", "bank_account", "ifsc", "da"]);

function monthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 3; i >= -6; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push({
      value: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
    });
  }
  return out;
}

export default function SalaryRegisterProjectionPage() {
  const months = useMemo(monthOptions, []);
  const [period, setPeriod] = useState(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString().slice(0, 10);
  });
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set(DEFAULT_HIDDEN));
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [compare, setCompare] = useState(false);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["projected_salary_register", period],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("hr-projected-salary-register", {
        body: { period_month: period },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
  });

  const rows: any[] = data?.rows ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.name} ${r.emp_code} ${r.department} ${r.designation}`.toLowerCase().includes(q));
  }, [rows, search]);

  const visibleCols = COLUMNS.filter((c) => !hidden.has(c.key));

  const cell = (r: any, c: Col) => {
    const v = r[c.key];
    if (c.kind === "date") return dmy(v);
    if (c.kind === "num") return inr0(v);
    return v ?? "";
  };

  const exportXlsx = () => {
    const sheet = filtered.map((r) => {
      const o: Record<string, any> = {};
      for (const c of visibleCols) o[c.label] = c.kind === "num" ? Number(r[c.key] ?? 0) : (c.kind === "date" ? dmy(r[c.key]) : (r[c.key] ?? ""));
      return o;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Projected Register");
    XLSX.writeFile(wb, `projected-salary-register-${period.slice(0, 7)}.xlsx`);
  };

  const totals = data?.totals;
  const readiness = data?.readiness;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Salary Register (In Progress)"
        description="Pilot · read-only projection of the current/upcoming month, inferred from HRMS data in the RazorpayX salary-register format."
      />

      <Alert>
        <Eye className="h-4 w-4" />
        <AlertTitle>View-only pilot</AlertTitle>
        <AlertDescription className="text-xs">
          Every figure here is computed live from HRMS (salary base ladder, attendance/LOP, staged
          payroll inputs, statutory profiles). Nothing is written back — no payslips, no inputs, no
          RazorpayX pushes. One-time payments already staged for the month appear immediately, the
          same way RazorpayX shows them in an unprocessed month.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <label className="text-xs text-muted-foreground">Payroll Month</label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-[300px] overflow-y-auto">
              {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Input
          placeholder="Search name / id / department"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs text-foreground"
        />
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Recompute
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowColumnPicker((v) => !v)}>Columns</Button>
        <Button variant="outline" size="sm" onClick={exportXlsx} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-2" /> Export
        </Button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={compare} onCheckedChange={(v) => setCompare(!!v)} />
          Compare with RazorpayX (when the actual register exists)
        </label>
      </div>

      {showColumnPicker && (
        <Card>
          <CardContent className="pt-4 flex flex-wrap gap-x-6 gap-y-2">
            {COLUMNS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={!hidden.has(c.key)}
                  onCheckedChange={(v) => {
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (v) next.delete(c.key); else next.add(c.key);
                      return next;
                    });
                  }}
                />
                {c.label}
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not build the projection</AlertTitle>
          <AlertDescription className="text-xs">{String((error as Error).message)}</AlertDescription>
        </Alert>
      )}

      {totals && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {[
            ["Employees", totals.employees, false],
            ["Projected Gross", totals.gross, true],
            ["One-time (in payroll)", totals.one_time_payments, true],
            ["Off-payroll Payouts", totals.off_payroll_payouts, true],
            ["PF (EE+ER)", totals.pf_ee + totals.pf_er, true],
            ["Projected Net", totals.net_pay, true],
          ].map(([label, value, money]: any) => (
            <Card key={label}>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
              <CardContent className="text-lg font-semibold">{money ? `₹${inr0(value)}` : inr0(value)}</CardContent>
            </Card>
          ))}
        </div>
      )}

      {readiness && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Attendance coverage: {readiness.attendance_coverage_pct}%</Badge>
          <Badge variant="outline">Staged additions: {readiness.staged_additions}</Badge>
          <Badge variant="outline">Staged deductions: {readiness.staged_deductions}</Badge>
          <Badge variant={readiness.actual_register_rows ? "default" : "secondary"}>
            {readiness.actual_register_rows
              ? `RazorpayX register present (${readiness.actual_register_rows} rows)`
              : "RazorpayX register not yet available for this month"}
          </Badge>
          {!readiness.month_ended && <Badge variant="secondary">Month still in progress — figures are a projection</Badge>}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isFetching && !rows.length ? (
            <div className="p-4 space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : (
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    {visibleCols.map((c) => (
                      <th key={c.key} className={`px-3 py-2 font-medium whitespace-nowrap ${c.kind === "num" ? "text-right" : "text-left"}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const a = r.actual;
                    const diff = compare && a ? Math.round(Number(a.net ?? 0) - Number(r.net_pay ?? 0)) : null;
                    return (
                      <tr key={r.employee_id} className="border-t border-border hover:bg-muted/40">
                        {visibleCols.map((c) => (
                          <td key={c.key} className={`px-3 py-2 whitespace-nowrap ${c.kind === "num" ? "text-right tabular-nums" : ""}`}>
                            {c.key === "name" ? (
                              <span className="flex items-center gap-2">
                                {r.name}
                                {r.do_not_pay && <Badge variant="destructive" className="text-[10px]">Do not pay</Badge>}
                                {!!r.one_time_payments && <Badge variant="secondary" className="text-[10px]">One-time</Badge>}
                                {!!r.off_payroll_payouts && <Badge variant="outline" className="text-[10px]">Off-payroll ₹{inr0(r.off_payroll_payouts)}</Badge>}
                                {diff !== null && diff !== 0 && (
                                  <Badge variant="outline" className="text-[10px] text-destructive">
                                    Δ net {diff > 0 ? "+" : ""}{inr0(diff)}
                                  </Badge>
                                )}
                              </span>
                            ) : cell(r, c)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {!filtered.length && !isFetching && (
                    <tr><td colSpan={visibleCols.length} className="p-6 text-center text-muted-foreground">No projectable employees for this month.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!!data?.notes?.length && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Info className="h-4 w-4" /> Excluded / flagged employees ({data.notes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            {data.notes.map((n: any) => <div key={n.employee_id + n.note}><span className="text-foreground">{n.name}</span> — {n.note}</div>)}
          </CardContent>
        </Card>
      )}

      <p className="text-[10px] text-muted-foreground">
        Source: hr_employees · hr_employee_work_info · salary-base ladder (structure assignment →
        RazorpayX CTC → mirror → register → onboarding) · hr_compute_lop_days ·
        hr_payroll_input_additions/deductions · hr_payroll_auto_recoveries · hr_salary_revisions ·
        hr_employee_statutory_profiles · hr_pt_slabs. Computed with the CTC-inclusive doctrine
        (employer PF/EDLI/ESI carved out of CTC). Read-only.
      </p>
    </div>
  );
}
