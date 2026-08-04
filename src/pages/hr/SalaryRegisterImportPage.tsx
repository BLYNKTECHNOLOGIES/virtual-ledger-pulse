import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Info, Loader2, BarChart3 } from "lucide-react";

/**
 * SalaryRegisterImportPage — closes the RazorpayX API gap by ingesting the
 * monthly dashboard CSV Salary Register into hr_razorpay_payslip_records.reg_*
 * columns. The API does NOT expose PF/ESI/PT splits, LWF, employer contribs,
 * overtime, PLI or identity fields; this CSV is the only path to parity.
 *
 * Match key: RazorpayX "Employee ID" (column 1 of the CSV) → razorpay_employee_id.
 * Period: from filename (…-YYYY-MM-DD.csv → period_month = YYYY-MM-01) or manual.
 */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { inQuote = false; }
      } else cell += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c === "\r") { /* skip */ }
      else cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c !== ""));
}

function toNum(v: string): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/^'/, "").replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toStr(v: string | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/^'/, "");
  return s === "" ? null : s;
}

/** Parse DD/MM/YYYY → YYYY-MM-DD (ISO date). */
function toIsoDate(v: string | undefined): string | null {
  const s = toStr(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

function extractPeriodFromFilename(name: string): string | null {
  const m = name.match(/(\d{4})-(\d{2})-\d{2}/);
  return m ? `${m[1]}-${m[2]}-01` : null;
}

interface ParsedRow {
  razorpay_employee_id: string;
  name: string;
  // earnings
  reg_working_days: number | null;
  reg_basic: number | null;
  reg_da: number | null;
  reg_hra: number | null;
  reg_sa: number | null;
  reg_lta: number | null;
  reg_employer_esi_contr: number | null;
  reg_employer_pf_contr: number | null;
  reg_overtime: number | null;
  reg_refund_security_deposit: number | null;
  reg_performance_incentive: number | null;
  reg_gross_salary: number | null;
  // deductions
  reg_esi_ee: number | null;
  reg_esi_er: number | null;
  reg_pf_ee: number | null;
  reg_pf_er: number | null;
  reg_lwf_ee: number | null;
  reg_lwf_er: number | null;
  reg_pt: number | null;
  reg_tds: number | null;
  reg_advance_salary: number | null;
  reg_loan_emi: number | null;
  reg_one_time_payments: number | null;
  reg_net_pay: number | null;
  // separation
  reg_has_left: boolean | null;
  reg_relieving_date: string | null;
  // identity snapshots
  reg_pan: string | null;
  reg_pf_uan: string | null;
  reg_esi_number: string | null;
  reg_bank_acc_no: string | null;
  reg_ifsc: string | null;
  reg_personal_phone: string | null;
  reg_personal_email: string | null;
  // demographics snapshots
  reg_department: string | null;
  reg_designation: string | null;
  reg_location: string | null;
  reg_pt_location: string | null;
  reg_gender: string | null;
  reg_dob: string | null;
  reg_hire_date: string | null;
}

function parseRows(text: string): { header: string[]; rows: ParsedRow[]; error?: string } {
  const grid = parseCsv(text);
  if (grid.length < 2) return { header: [], rows: [], error: "CSV appears empty" };
  const header = grid[0].map(h => h.trim());
  const idx = (label: string) => header.indexOf(label);
  const iEmp = idx("Employee ID");
  const iName = idx("Name");
  if (iEmp < 0 || iName < 0) return { header, rows: [], error: "Missing required column 'Employee ID' or 'Name'" };
  const col = (label: string) => idx(label);
  const rows: ParsedRow[] = grid.slice(1).map(r => ({
    razorpay_employee_id: (r[iEmp] ?? "").trim(),
    name: (r[iName] ?? "").replace(/\*$/, "").trim(),
    reg_working_days: toNum(r[col("Working Days")] ?? ""),
    reg_basic: toNum(r[col("Basic Salary")] ?? ""),
    reg_da: toNum(r[col("DA")] ?? ""),
    reg_hra: toNum(r[col("HRA")] ?? ""),
    reg_sa: toNum(r[col("SA")] ?? ""),
    reg_lta: toNum(r[col("LTA")] ?? ""),
    reg_employer_esi_contr: toNum(r[col("Employer ESI Contr.")] ?? ""),
    reg_employer_pf_contr: toNum(r[col("Employer PF Contr.")] ?? ""),
    reg_overtime: toNum(r[col("Overtime")] ?? ""),
    reg_refund_security_deposit: toNum(r[col("Refund Of Security Deposit")] ?? ""),
    reg_performance_incentive: toNum(r[col("Performance Linked Incentive")] ?? ""),
    reg_gross_salary: toNum(r[col("Gross Salary")] ?? ""),
    reg_esi_ee: toNum(r[col("ESI(EE)")] ?? ""),
    reg_esi_er: toNum(r[col("ESI(ER)")] ?? ""),
    reg_pf_ee: toNum(r[col("PF(EE)")] ?? ""),
    reg_pf_er: toNum(r[col("PF(ER)")] ?? ""),
    reg_lwf_ee: toNum(r[col("LWF(EE)")] ?? ""),
    reg_lwf_er: toNum(r[col("LWF(ER)")] ?? ""),
    reg_pt: toNum(r[col("PT")] ?? ""),
    reg_tds: toNum(r[col("TDS")] ?? ""),
    reg_advance_salary: toNum(r[col("Advance Salary")] ?? ""),
    reg_loan_emi: toNum(r[col("Loan Emi")] ?? ""),
    reg_one_time_payments: toNum(r[col("One-time Payments")] ?? ""),
    reg_net_pay: toNum(r[col("Net Pay")] ?? ""),
    reg_has_left: (() => {
      const v = toStr(r[col("Has Left The Organization")] ?? "");
      if (v == null) return null;
      return /^y(es)?$/i.test(v);
    })(),
    reg_relieving_date: toIsoDate(r[col("Relieving Date")] ?? ""),
    reg_pan: toStr(r[col("Pan")] ?? ""),
    reg_pf_uan: toStr(r[col("PF UAN")] ?? ""),
    reg_esi_number: toStr(r[col("ESI Number")] ?? ""),
    reg_bank_acc_no: toStr(r[col("Bank Acc. No.")] ?? ""),
    reg_ifsc: toStr(r[col("IFSC Code")] ?? ""),
    reg_personal_phone: toStr(r[col("Personal Phone Number")] ?? ""),
    reg_personal_email: toStr(r[col("Personal Email Address")] ?? ""),
    reg_department: toStr(r[col("Department")] ?? ""),
    reg_designation: toStr(r[col("Designation")] ?? ""),
    reg_location: toStr(r[col("Location")] ?? ""),
    reg_pt_location: toStr(r[col("PT Location")] ?? ""),
    reg_gender: toStr(r[col("Gender")] ?? ""),
    reg_dob: toIsoDate(r[col("Date Of Birth")] ?? ""),
    reg_hire_date: toIsoDate(r[col("Hire Date")] ?? ""),
  })).filter(r => r.razorpay_employee_id);
  return { header, rows };
}

const INR = (n: number | null | undefined) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function computeInsights(rows: ParsedRow[]) {
  const sum = (k: keyof ParsedRow) =>
    rows.reduce((a, r) => a + Math.abs(Number(r[k] ?? 0) || 0), 0);
  const positiveSum = (k: keyof ParsedRow) =>
    rows.reduce((a, r) => a + (Number(r[k] ?? 0) > 0 ? Number(r[k]) : 0), 0);
  const count = (pred: (r: ParsedRow) => boolean) => rows.filter(pred).length;
  const gross = positiveSum("reg_gross_salary");
  const net = positiveSum("reg_net_pay");
  const totalPf = sum("reg_pf_ee") + sum("reg_pf_er");
  const totalEsi = sum("reg_esi_ee") + sum("reg_esi_er");
  const totalLwf = sum("reg_lwf_ee") + sum("reg_lwf_er");
  const totalPt = sum("reg_pt");
  const totalTds = sum("reg_tds");
  const overtime = positiveSum("reg_overtime");
  const pli = positiveSum("reg_performance_incentive");
  const employerCost = net + sum("reg_pf_er") + sum("reg_esi_er") + sum("reg_lwf_er") + totalTds + sum("reg_pf_ee") + sum("reg_esi_ee") + sum("reg_lwf_ee") + totalPt + sum("reg_advance_salary") + sum("reg_loan_emi");
  return {
    headcount: rows.length,
    gross,
    net,
    totalPf,
    totalEsi,
    totalLwf,
    totalPt,
    totalTds,
    overtime,
    pli,
    employerCost,
    withUan: count(r => !!r.reg_pf_uan),
    withEsi: count(r => !!r.reg_esi_number),
    withPan: count(r => !!r.reg_pan),
    withPt: count(r => Number(r.reg_pt ?? 0) > 0),
    separated: count(r => r.reg_has_left === true),
  };
}

export default function SalaryRegisterImportPage({
  initialMonth,
  embedded = false,
  onImported,
}: {
  initialMonth?: string;
  embedded?: boolean;
  onImported?: () => void;
} = {}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [periodMonth, setPeriodMonth] = useState<string>(initialMonth ?? "");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ updated: number; missing: string[]; mismatch: { name: string; api: number | null; csv: number | null }[] } | null>(null);

  const { data: existingPayslips } = useQuery({
    queryKey: ["payslip_records_for_period", periodMonth],
    queryFn: async () => {
      if (!periodMonth) return [];
      const { data, error } = await supabase
        .from("hr_razorpay_payslip_records")
        .select("id, razorpay_employee_id, employee_name_snapshot, net_pay, gross_earnings, hr_employee_id")
        .eq("period_month", periodMonth);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!periodMonth,
  });

  const insights = useMemo(() => (parsed.length ? computeInsights(parsed) : null), [parsed]);

  const preview = useMemo(() => {
    if (!parsed.length || !existingPayslips) return { matched: 0, missing: [] as string[] };
    const known = new Set(existingPayslips.map((p: any) => String(p.razorpay_employee_id)));
    const matched = parsed.filter(r => known.has(r.razorpay_employee_id)).length;
    const missing = parsed.filter(r => !known.has(r.razorpay_employee_id)).map(r => `${r.name} (#${r.razorpay_employee_id})`);
    return { matched, missing };
  }, [parsed, existingPayslips]);

  const handleFile = async (f: File) => {
    setFile(f);
    setResult(null);
    const t = await f.text();
    const { rows, error } = parseRows(t);
    if (error) { setParseError(error); setParsed([]); return; }
    setParseError(null);
    setParsed(rows);
    const auto = extractPeriodFromFilename(f.name);
    if (auto && initialMonth && auto !== initialMonth) {
      toast.warning(`Filename suggests ${auto} but this cockpit month is ${initialMonth} — importing into ${initialMonth}.`);
      setPeriodMonth(initialMonth);
    } else if (auto) {
      setPeriodMonth(auto);
    }
    toast.success(`Parsed ${rows.length} employee rows from ${f.name}`);
  };

  const handleImport = async () => {
    if (!periodMonth) { toast.error("Set the period month first"); return; }
    if (!parsed.length) { toast.error("No rows to import"); return; }
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;
      const uploadedAt = new Date().toISOString();
      const missing: string[] = [];
      const mismatch: { name: string; api: number | null; csv: number | null }[] = [];
      let updated = 0;

      const knownMap = new Map<string, any>();
      (existingPayslips ?? []).forEach((p: any) => knownMap.set(String(p.razorpay_employee_id), p));

      for (const row of parsed) {
        const existing = knownMap.get(row.razorpay_employee_id);
        if (!existing) { missing.push(`${row.name} (#${row.razorpay_employee_id})`); continue; }

        const patch: Record<string, any> = {
          reg_basic: row.reg_basic,
          reg_da: row.reg_da,
          reg_hra: row.reg_hra,
          reg_sa: row.reg_sa,
          reg_lta: row.reg_lta,
          reg_overtime: row.reg_overtime,
          reg_refund_security_deposit: row.reg_refund_security_deposit,
          reg_performance_incentive: row.reg_performance_incentive,
          reg_pf_ee: row.reg_pf_ee != null ? Math.abs(row.reg_pf_ee) : null,
          reg_pf_er: row.reg_pf_er != null ? Math.abs(row.reg_pf_er) : null,
          reg_esi_ee: row.reg_esi_ee != null ? Math.abs(row.reg_esi_ee) : null,
          reg_esi_er: row.reg_esi_er != null ? Math.abs(row.reg_esi_er) : null,
          reg_lwf_ee: row.reg_lwf_ee != null ? Math.abs(row.reg_lwf_ee) : null,
          reg_lwf_er: row.reg_lwf_er != null ? Math.abs(row.reg_lwf_er) : null,
          reg_pt: row.reg_pt != null ? Math.abs(row.reg_pt) : null,
          reg_tds: row.reg_tds != null ? Math.abs(row.reg_tds) : null,
          reg_advance_salary: row.reg_advance_salary != null ? Math.abs(row.reg_advance_salary) : null,
          reg_loan_emi: row.reg_loan_emi != null ? Math.abs(row.reg_loan_emi) : null,
          reg_one_time_payments: row.reg_one_time_payments,
          reg_employer_esi_contr: row.reg_employer_esi_contr,
          reg_employer_pf_contr: row.reg_employer_pf_contr,
          reg_gross_salary: row.reg_gross_salary,
          reg_net_pay: row.reg_net_pay,
          reg_working_days: row.reg_working_days,
          reg_has_left: row.reg_has_left,
          reg_relieving_date: row.reg_relieving_date,
          reg_pan: row.reg_pan,
          reg_pf_uan: row.reg_pf_uan,
          reg_esi_number: row.reg_esi_number,
          reg_bank_acc_no: row.reg_bank_acc_no,
          reg_ifsc: row.reg_ifsc,
          reg_personal_phone: row.reg_personal_phone,
          reg_personal_email: row.reg_personal_email,
          reg_department: row.reg_department,
          reg_designation: row.reg_designation,
          reg_location: row.reg_location,
          reg_pt_location: row.reg_pt_location,
          reg_gender: row.reg_gender,
          reg_dob: row.reg_dob,
          reg_hire_date: row.reg_hire_date,
          reg_source_filename: file?.name ?? null,
          reg_source_uploaded_at: uploadedAt,
          reg_source_uploaded_by: uid,
          updated_at: uploadedAt,
        };
        const { error } = await supabase
          .from("hr_razorpay_payslip_records")
          .update(patch)
          .eq("id", existing.id);
        if (error) throw new Error(`${row.name}: ${error.message}`);
        updated++;

        const apiNet = Number(existing.net_pay ?? 0);
        const csvNet = Number(row.reg_net_pay ?? 0);
        if (Math.abs(apiNet - csvNet) > 1) {
          mismatch.push({ name: row.name, api: existing.net_pay, csv: row.reg_net_pay });
        }
      }

      const affectedEmployeeIds = Array.from(
        new Set(
          (existingPayslips ?? [])
            .filter((p: any) => parsed.some((r) => r.razorpay_employee_id === String(p.razorpay_employee_id)))
            .map((p: any) => p.hr_employee_id)
            .filter(Boolean),
        ),
      );
      let derivedCount = 0;
      for (const empId of affectedEmployeeIds) {
        const { data: derived } = await supabase.rpc("hr_derive_statutory_enrollment_from_history", { p_employee_id: empId });
        if ((derived as any)?.status === "derived") derivedCount++;
      }

      setResult({ updated, missing, mismatch });
      toast.success(
        `Imported ${updated} rows${derivedCount ? ` · derived statutory enrollment for ${derivedCount} employees` : ""}. ${missing.length ? `${missing.length} not matched.` : "All matched."}`,
      );
      await qc.invalidateQueries({ queryKey: ["payslip_records_for_period", periodMonth] });
      await qc.invalidateQueries({ queryKey: ["payslip_email_roster", periodMonth] });
      await qc.invalidateQueries({ queryKey: ["hr_cockpit_month_state", periodMonth] });
      onImported?.();

    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={embedded ? "space-y-4" : "p-4 md:p-6 space-y-4 page-mount"}>
      {!embedded && (
        <PageHeader
          title="Import Salary Register (CSV)"
          description="Ingest statutory splits (PF/ESI/PT/TDS/LWF/employer contributions), variable pay (Overtime, PLI), separation and identity snapshots from the monthly RazorpayX dashboard CSV. The API does not expose these fields; this is the only source of parity."
        />
      )}

      <Alert>
        <Info className="w-4 h-4" />
        <AlertTitle>How this works</AlertTitle>
        <AlertDescription className="text-xs space-y-1">
          <div>1. In the RazorpayX dashboard, download <strong>Salary Register</strong> for the closed month as CSV.</div>
          <div>2. Drop the file below. We match rows by <strong>Employee ID</strong> to existing payslip records for that month.</div>
          <div>3. Statutory splits, LWF, employer contributions, overtime, performance incentive, refund of security deposit, separation flags and identity snapshots (PAN/UAN/ESI/Bank/IFSC) land in the <code>reg_*</code> columns. API-side fields are never overwritten.</div>
          <div>4. Company-wide totals derived from the CSV are also shown below the file before you import — useful for a sanity check.</div>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Upload</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">CSV file</Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {file && <p className="text-xs text-muted-foreground mt-1">{file.name} — {parsed.length} rows parsed</p>}
            </div>
            <div>
              <Label className="text-xs">Period month (YYYY-MM-01)</Label>
              <Input
                type="date"
                value={periodMonth}
                onChange={e => setPeriodMonth(e.target.value)}
                placeholder="Auto-detected from filename"
              />
            </div>
          </div>

          {parseError && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {insights && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BarChart3 className="w-4 h-4 text-primary" /> Register Insights (from parsed file)
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <InsightTile label="Headcount" value={String(insights.headcount)} />
                <InsightTile label="Gross" value={INR(insights.gross)} />
                <InsightTile label="Net Pay" value={INR(insights.net)} />
                <InsightTile label="Employer Cost" value={INR(insights.employerCost)} />
                <InsightTile label="PF (EE+ER)" value={INR(insights.totalPf)} />
                <InsightTile label="ESI (EE+ER)" value={INR(insights.totalEsi)} />
                <InsightTile label="LWF (EE+ER)" value={INR(insights.totalLwf)} />
                <InsightTile label="PT" value={INR(insights.totalPt)} />
                <InsightTile label="TDS" value={INR(insights.totalTds)} />
                <InsightTile label="Overtime" value={INR(insights.overtime)} />
                <InsightTile label="Performance Incentive" value={INR(insights.pli)} />
                <InsightTile label="Separated this month" value={String(insights.separated)} tone={insights.separated ? "warn" : undefined} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <CoverageTile label="With PAN" value={insights.withPan} total={insights.headcount} />
                <CoverageTile label="With UAN (PF)" value={insights.withUan} total={insights.headcount} />
                <CoverageTile label="With ESI Number" value={insights.withEsi} total={insights.headcount} />
                <CoverageTile label="With PT" value={insights.withPt} total={insights.headcount} />
              </div>
            </div>
          )}

          {parsed.length > 0 && periodMonth && (
            <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center gap-3 flex-wrap text-sm">
                <Badge variant="outline">{parsed.length} CSV rows</Badge>
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">{preview.matched} matched to payslip records</Badge>
                {preview.missing.length > 0 && (
                  <Badge variant="destructive" className="bg-amber-500/10 text-amber-600 border-amber-500/40">{preview.missing.length} unmatched</Badge>
                )}
              </div>
              {preview.missing.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <strong>Unmatched:</strong> {preview.missing.slice(0, 6).join(", ")}{preview.missing.length > 6 ? ` +${preview.missing.length - 6} more` : ""}
                  <div className="mt-1 italic">Unmatched rows are usually employees whose RazorpayX payslip hasn't been pulled yet for this month. Run the payslip sync for the period first.</div>
                </div>
              )}
              <Button onClick={handleImport} disabled={busy || preview.matched === 0} size="sm">
                {busy ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Upload className="w-3 h-3 mr-2" />}
                Import {preview.matched} rows
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Result</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">{result.updated} rows updated</Badge>
              {result.missing.length > 0 && <Badge variant="outline">{result.missing.length} skipped (no matching payslip)</Badge>}
              {result.mismatch.length > 0 && <Badge variant="destructive">{result.mismatch.length} net-pay variance</Badge>}
            </div>

            {result.mismatch.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">Net-pay variance (API vs CSV, &gt; ₹1)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1 px-2">Employee</th>
                        <th className="text-right py-1 px-2">API net_pay</th>
                        <th className="text-right py-1 px-2">CSV Net Pay</th>
                        <th className="text-right py-1 px-2">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.mismatch.map((m, i) => (
                        <tr key={i} className="border-b border-border/40">
                          <td className="py-1 px-2">{m.name}</td>
                          <td className="py-1 px-2 text-right">{INR(m.api)}</td>
                          <td className="py-1 px-2 text-right">{INR(m.csv)}</td>
                          <td className="py-1 px-2 text-right font-medium">{INR((m.csv ?? 0) - (m.api ?? 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InsightTile({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={`rounded border p-2 ${tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-background"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function CoverageTile({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const tone = pct >= 90 ? "emerald" : pct >= 60 ? "amber" : "rose";
  const cls =
    tone === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/10"
      : tone === "amber"
      ? "border-amber-500/40 bg-amber-500/10"
      : "border-rose-500/40 bg-rose-500/10";
  return (
    <div className={`rounded border p-2 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">{value} / {total} · {pct}%</p>
    </div>
  );
}
