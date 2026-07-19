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
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Info, Loader2 } from "lucide-react";

/**
 * SalaryRegisterImportPage — closes the RazorpayX API gap by ingesting the
 * monthly dashboard CSV Salary Register into hr_razorpay_payslip_records.reg_*
 * columns. The API does NOT expose PF/ESI/PT splits or employer contributions;
 * this CSV is the only path to statutory-split parity.
 *
 * Match key: RazorpayX "Employee ID" (column 1 of the CSV) → razorpay_employee_id.
 * Period: from the filename (…-YYYY-MM-DD.csv → period_month = YYYY-MM-01) or manual override.
 */

const NUM_COLS = new Set([
  "Working Days","Basic Salary","DA","HRA","SA","LTA","Employer ESI Contr.","Employer PF Contr.",
  "Employee Engagement","Legal fees","Legal fees pay","Legal fees repay","Gross Salary",
  "ESI(EE)","ESI(ER)","PF(EE)","PF(ER)","PT","TDS","Advance Salary","Loan Emi","One-time Payments","Net Pay",
]);

/** Minimal CSV parser that respects quoted fields (register uses "…" for text and Excel-style '<num> for bank a/c). */
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

function extractPeriodFromFilename(name: string): string | null {
  const m = name.match(/(\d{4})-(\d{2})-\d{2}/);
  return m ? `${m[1]}-${m[2]}-01` : null;
}

interface ParsedRow {
  razorpay_employee_id: string;
  name: string;
  reg_working_days: number | null;
  reg_basic: number | null;
  reg_da: number | null;
  reg_hra: number | null;
  reg_sa: number | null;
  reg_lta: number | null;
  reg_employer_esi_contr: number | null;
  reg_employer_pf_contr: number | null;
  reg_gross_salary: number | null;
  reg_esi_ee: number | null;
  reg_esi_er: number | null;
  reg_pf_ee: number | null;
  reg_pf_er: number | null;
  reg_pt: number | null;
  reg_tds: number | null;
  reg_advance_salary: number | null;
  reg_loan_emi: number | null;
  reg_one_time_payments: number | null;
  reg_net_pay: number | null;
}

function parseRows(text: string): { header: string[]; rows: ParsedRow[]; error?: string } {
  const grid = parseCsv(text);
  if (grid.length < 2) return { header: [], rows: [], error: "CSV appears empty" };
  const header = grid[0].map(h => h.trim());
  const idx = (label: string) => header.indexOf(label);
  const iEmp = idx("Employee ID");
  const iName = idx("Name");
  if (iEmp < 0 || iName < 0) return { header, rows: [], error: "Missing required column 'Employee ID' or 'Name'" };
  // Absolutely all statutory columns must be numeric — pull by label so column order changes don't break us.
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
    reg_gross_salary: toNum(r[col("Gross Salary")] ?? ""),
    reg_esi_ee: toNum(r[col("ESI(EE)")] ?? ""),
    reg_esi_er: toNum(r[col("ESI(ER)")] ?? ""),
    reg_pf_ee: toNum(r[col("PF(EE)")] ?? ""),
    reg_pf_er: toNum(r[col("PF(ER)")] ?? ""),
    reg_pt: toNum(r[col("PT")] ?? ""),
    reg_tds: toNum(r[col("TDS")] ?? ""),
    reg_advance_salary: toNum(r[col("Advance Salary")] ?? ""),
    reg_loan_emi: toNum(r[col("Loan Emi")] ?? ""),
    reg_one_time_payments: toNum(r[col("One-time Payments")] ?? ""),
    reg_net_pay: toNum(r[col("Net Pay")] ?? ""),
  })).filter(r => r.razorpay_employee_id);
  return { header, rows };
}

const INR = (n: number | null | undefined) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function SalaryRegisterImportPage() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState<string>("");
  const [periodMonth, setPeriodMonth] = useState<string>("");
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
        .select("id, razorpay_employee_id, employee_name_snapshot, net_pay, gross_earnings")
        .eq("period_month", periodMonth);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!periodMonth,
  });

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
    setText(t);
    const { rows, error } = parseRows(t);
    if (error) { setParseError(error); setParsed([]); return; }
    setParseError(null);
    setParsed(rows);
    const auto = extractPeriodFromFilename(f.name);
    if (auto) setPeriodMonth(auto);
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

      // Sequential updates (small monthly batches, ~40 rows) — keeps errors easy to attribute.
      for (const row of parsed) {
        const existing = knownMap.get(row.razorpay_employee_id);
        if (!existing) { missing.push(`${row.name} (#${row.razorpay_employee_id})`); continue; }

        const patch = {
          reg_basic: row.reg_basic,
          reg_da: row.reg_da,
          reg_hra: row.reg_hra,
          reg_sa: row.reg_sa,
          reg_lta: row.reg_lta,
          reg_pf_ee: row.reg_pf_ee != null ? Math.abs(row.reg_pf_ee) : null,
          reg_pf_er: row.reg_pf_er != null ? Math.abs(row.reg_pf_er) : null,
          reg_esi_ee: row.reg_esi_ee != null ? Math.abs(row.reg_esi_ee) : null,
          reg_esi_er: row.reg_esi_er != null ? Math.abs(row.reg_esi_er) : null,
          reg_pt: row.reg_pt != null ? Math.abs(row.reg_pt) : null,
          reg_tds: row.reg_tds != null ? Math.abs(row.reg_tds) : null,
          reg_advance_salary: row.reg_advance_salary,
          reg_loan_emi: row.reg_loan_emi,
          reg_one_time_payments: row.reg_one_time_payments,
          reg_employer_esi_contr: row.reg_employer_esi_contr,
          reg_employer_pf_contr: row.reg_employer_pf_contr,
          reg_gross_salary: row.reg_gross_salary,
          reg_net_pay: row.reg_net_pay,
          reg_working_days: row.reg_working_days,
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

        // Reconciliation diff: compare CSV Net Pay to API net_pay (already stored).
        const apiNet = Number(existing.net_pay ?? 0);
        const csvNet = Number(row.reg_net_pay ?? 0);
        if (Math.abs(apiNet - csvNet) > 1) {
          mismatch.push({ name: row.name, api: existing.net_pay, csv: row.reg_net_pay });
        }
      }

      setResult({ updated, missing, mismatch });
      toast.success(`Imported ${updated} rows. ${missing.length ? `${missing.length} not matched.` : "All matched."}`);
      await qc.invalidateQueries({ queryKey: ["payslip_records_for_period", periodMonth] });
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Import Salary Register (CSV)"
        description="Ingest statutory splits (PF/ESI/PT/TDS/employer contributions) from the monthly RazorpayX dashboard CSV. The API does not expose these fields; this is the only source of parity."
      />

      <Alert>
        <Info className="w-4 h-4" />
        <AlertTitle>How this works</AlertTitle>
        <AlertDescription className="text-xs space-y-1">
          <div>1. In the RazorpayX dashboard, download <strong>Salary Register</strong> for the closed month as CSV.</div>
          <div>2. Drop the file below. We match rows by <strong>Employee ID</strong> to existing payslip records for that month.</div>
          <div>3. Statutory splits (PF/ESI/PT/TDS/employer contributions) land in the <code>reg_*</code> columns and show in the payslip detail dialog. API-side fields are never overwritten.</div>
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
