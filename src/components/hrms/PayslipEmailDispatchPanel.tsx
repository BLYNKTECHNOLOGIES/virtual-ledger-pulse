import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Upload, Mail, RefreshCw, CheckCircle2, AlertTriangle, FileText, Send, CalendarDays, FileArchive, FileSpreadsheet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lazy, Suspense } from "react";

const SalaryRegisterImportPage = lazy(() => import("@/pages/hr/SalaryRegisterImportPage"));
import { readPayslipArchive, readEmployeeCodeFromPdf } from "@/lib/payslipZip";


interface DispatchRow {
  employee_id: string;
  razorpay_employee_id: string | null;
  name: string;
  email: string | null;
  gross: number;
  deductions: number;
  net: number;
  basis: "register_csv" | "razorpay";
  lop_days: number;
  lop_amount: number;
  bonuses: { label: string; amount: number }[];
  bonus_total: number;
  other_additions?: { label: string; amount: number }[];
  other_additions_total?: number;
  paid_days: number | null;
  month_days: number;
  bank_last4: string | null;
  employer_contrib?: number;
  deduction_breakdown?: { label: string; amount: number }[];
  pdf_path: string | null;
  already_sent_at: string | null;
  not_processed?: boolean;
  not_processed_reason?: string | null;

  blockers: string[];
  sendable: boolean;

}

interface RosterResponse {
  month: string;
  register_present: boolean;
  processed_on: string | null;
  rows: DispatchRow[];
}

const inr = (n: number) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Match an uploaded filename to exactly one roster row, or return null. */
function matchRow(filename: string, rows: DispatchRow[]): DispatchRow | null {
  const key = normalize(filename.replace(/\.pdf$/i, ""));
  const byRzp = rows.filter((r) => r.razorpay_employee_id && key.includes(normalize(r.razorpay_employee_id)));
  if (byRzp.length === 1) return byRzp[0];
  const byName = rows.filter((r) => key.includes(normalize(r.name)));
  if (byName.length === 1) return byName[0];
  // last resort: all name tokens present
  const byTokens = rows.filter((r) =>
    r.name.split(/\s+/).filter((t) => t.length > 2).every((t) => key.includes(normalize(t))),
  );
  return byTokens.length === 1 ? byTokens[0] : null;
}

interface ZipReport {
  fileName: string;
  total: number;
  matched: { code: string; name: string; group: string; verified: boolean }[];
  unmapped: { code: string; name: string; group: string }[];
  conflicts: { file: string; reason: string }[];
  failures: { file: string; reason: string }[];
  missingInZip: string[];
}

export default function PayslipEmailDispatchPanel({ month }: { month: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [zipBusy, setZipBusy] = useState<string | null>(null);
  const [zipReport, setZipReport] = useState<ZipReport | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processedOnDraft, setProcessedOnDraft] = useState<string>("");
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [showExcluded, setShowExcluded] = useState(false);

  const [registerOpen, setRegisterOpen] = useState(false);


  const rosterQ = useQuery({
    queryKey: ["payslip_email_roster", month],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("hr-send-payslip-emails", {
        body: { mode: "roster", period_month: month },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as RosterResponse;
    },
  });

  const rows = rosterQ.data?.rows ?? [];
  const registerPresent = rosterQ.data?.register_present ?? false;
  const processedOn = rosterQ.data?.processed_on ?? null;

  /**
   * Fallback identity map: RazorpayX employee code -> HRMS employee.
   * The archive import must not depend on this month's payroll having been
   * pulled already — the code map is the durable matcher.
   */
  const codeMapQ = useQuery({
    queryKey: ["razorpay_code_map"],
    queryFn: async () => {
      const [{ data: map, error }, { data: emps }] = await Promise.all([
        (supabase as any).from("hr_razorpay_employee_map").select("razorpay_employee_id, hr_employee_id"),
        supabase.from("hr_employees").select("id, first_name, last_name"),
      ]);
      if (error) throw error;
      const nameById = new Map((emps ?? []).map((e: any) => [e.id, `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim()]));
      const out = new Map<string, { employee_id: string; name: string }>();
      for (const m of map ?? []) {
        const code = String((m as any).razorpay_employee_id ?? "").trim();
        if (!code || !(m as any).hr_employee_id) continue;
        out.set(code, { employee_id: (m as any).hr_employee_id, name: nameById.get((m as any).hr_employee_id) || code });
      }
      return out;
    },
    staleTime: 5 * 60 * 1000,
  });

  /** Seed the run + pull this month's payroll from RazorpayX (read-only pull). */
  const pullMonth = useMutation({
    mutationFn: async () => {
      const ym = month.slice(0, 7);
      await supabase.functions.invoke("razorpay-payroll-proxy", {
        body: { action: "discover_and_seed_runs", period_from: ym, period_to: ym },
      });
      const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
        body: { action: "pull_payslips_for_period", period_month: ym },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    onSuccess: (d) => {
      const s = d?.summary;
      toast.success(s ? `Pulled ${s.pulled ?? s.total ?? 0} payslip record(s) from RazorpayX` : "Payroll pulled");
      qc.invalidateQueries({ queryKey: ["payslip_email_roster", month] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not pull this month from RazorpayX"),
  });


  const sendable = useMemo(() => rows.filter((r) => r.sendable && !r.already_sent_at), [rows]);
  // Employees whose salary was not processed this month are not payslip recipients
  // at all — keep them out of the roster unless HR explicitly asks to see them.
  const excludedRows = useMemo(() => rows.filter((r) => r.not_processed), [rows]);
  const payrollRows = useMemo(() => rows.filter((r) => !r.not_processed), [rows]);
  const visibleRows = showExcluded ? rows : payrollRows;
  const sentCount = rows.filter((r) => r.already_sent_at).length;

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  const setProcessed = useMutation({
    mutationFn: async (d: string) => {
      const { error } = await (supabase as any).rpc("hr_set_payroll_processed_on", {
        _month: month, _processed_on: d, _notes: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Credit date saved");
      qc.invalidateQueries({ queryKey: ["payslip_email_roster", month] });
      qc.invalidateQueries({ queryKey: ["hr_cockpit_month_state", month] });
    },
    onError: (e: any) => toast.error(e.message || "Could not save credit date"),
  });

  const send = useMutation({
    mutationFn: async (args: { ids: string[]; mode: "send" | "preview" }) => {
      const agg = { sent: 0, failed: 0, results: [] as { name: string; ok: boolean; error?: string }[] };

      const invoke = async (ids: string[]) => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const { data, error } = await supabase.functions.invoke("hr-send-payslip-emails", {
              body: { mode: args.mode, period_month: month, employee_ids: ids, chunk_size: ids.length },
            });
            if (error) throw error;
            if ((data as any)?.error) throw new Error((data as any).error);
            return data as { sent: number; failed: number; results: { name: string; ok: boolean; error?: string }[] };
          } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : "Send batch failed";
            if (/no sendable recipients/i.test(message)) return { sent: 0, failed: 0, results: [] };
            if (args.mode === "preview" || attempt === 3) break;
            toast.message(`Retrying a payslip batch… (${attempt}/3)`);
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        }
        throw lastError;
      };

      if (args.mode === "preview") {
        const result = await invoke(args.ids.slice(0, 1));
        agg.sent = result.sent ?? 0;
        agg.failed = result.failed ?? 0;
        agg.results.push(...(result.results ?? []));
        return agg;
      }

      // A sequential mobile run could exceed the browser request window after
      // three batches and leave the final recipients untouched. Keep each Edge
      // invocation small, but use two workers so the complete selection finishes
      // well inside that window. Database claims still prevent duplicate emails.
      const batches: string[][] = [];
      for (let i = 0; i < args.ids.length; i += 3) batches.push(args.ids.slice(i, i + 3));
      let nextBatch = 0;
      const worker = async () => {
        for (;;) {
          const index = nextBatch;
          nextBatch += 1;
          const ids = batches[index];
          if (!ids) return;
          try {
            const result = await invoke(ids);
            agg.sent += result.sent ?? 0;
            agg.failed += result.failed ?? 0;
            agg.results.push(...(result.results ?? []));
            toast.message(`Sent ${agg.sent} of ${args.ids.length}…`);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Send batch failed";
            agg.failed += ids.length;
            for (const id of ids) {
              agg.results.push({
                name: rows.find((row) => row.employee_id === id)?.name ?? "Employee",
                ok: false,
                error: message,
              });
            }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, batches.length) }, () => worker()));
      return agg;
    },

    onSuccess: (r, vars) => {
      if (vars.mode === "preview") toast.success("Preview sent to your email");
      else {
        toast.success(`${r.sent} payslip email(s) sent${r.failed ? `, ${r.failed} failed` : ""}`);
        r.results.filter((x) => !x.ok).forEach((x) => toast.error(`${x.name}: ${x.error}`));
        setSelected({});
      }
      qc.invalidateQueries({ queryKey: ["payslip_email_roster", month] });
      qc.invalidateQueries({ queryKey: ["hr_cockpit_month_state", month] });
    },
    onError: (e: any) => {
      toast.error(e.message || "Send failed");
      setSelected({});
      qc.invalidateQueries({ queryKey: ["payslip_email_roster", month] });
    },
  });

  /** After a step that can unblock recipients, re-read the roster and, if anyone is
   *  ready, pre-select everyone and open the send confirmation immediately. */
  async function autoDispatchAfterStep() {
    const res = await rosterQ.refetch();
    const fresh = (res.data?.rows ?? []).filter((r) => r.sendable && !r.already_sent_at);
    if (fresh.length === 0) return;
    const next: Record<string, boolean> = {};
    fresh.forEach((r) => (next[r.employee_id] = true));
    setSelected(next);
    setConfirmOpen(true);
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const missed: string[] = [];
    let ok = 0;
    try {
      for (const file of Array.from(files)) {
        const row = matchRow(file.name, rows);
        if (!row) { missed.push(file.name); continue; }
        const path = `${month}/${row.employee_id}.pdf`;
        const up = await supabase.storage.from("payslips").upload(path, file, {
          upsert: true, contentType: "application/pdf",
        });
        if (up.error) { missed.push(`${file.name} (${up.error.message})`); continue; }
        const { error } = await supabase
          .from("hr_razorpay_payslip_records")
          .update({ pdf_storage_path: path })
          .eq("period_month", month)
          .eq("hr_employee_id", row.employee_id);
        if (error) { missed.push(`${file.name} (${error.message})`); continue; }
        ok++;
      }
      setUnmatched(missed);
      if (ok) toast.success(`${ok} payslip PDF(s) attached to employees`);
      if (missed.length) toast.warning(`${missed.length} file(s) could not be matched`);
      qc.invalidateQueries({ queryKey: ["hr_cockpit_month_state", month] });
      await autoDispatchAfterStep();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleZip(file: File | null | undefined) {
    if (!file) return;
    setZipReport(null);
    setZipBusy("Reading archive…");
    try {
      const entries = await readPayslipArchive(file);
      if (entries.length === 0) {
        toast.error("No payslip PDFs found inside this archive");
        return;
      }

      // Period guard — every file must belong to the cockpit month.
      const wrong = entries.filter((e) => e.period && e.period !== month);
      if (wrong.length > 0) {
        const labels = Array.from(new Set(wrong.map((e) => e.periodLabel))).join(", ");
        toast.error(
          `Archive is for ${labels}, but you are on ${month.slice(0, 7)}. Import blocked — switch the cycle month or upload the right archive.`,
        );
        return;
      }

      const report: ZipReport = {
        fileName: file.name,
        total: entries.length,
        matched: [],
        unmapped: [],
        conflicts: [],
        failures: [],
        missingInZip: [],
      };

      let done = 0;
      for (const e of entries) {
        done++;
        setZipBusy(`Matching & uploading ${done}/${entries.length}…`);

        const code = e.folderCode ?? e.fileCode;
        if (!code) {
          report.conflicts.push({ file: e.path, reason: "No employee code in folder or file name" });
          continue;
        }
        if (e.folderCode && e.fileCode && e.folderCode !== e.fileCode) {
          report.conflicts.push({
            file: e.path,
            reason: `Folder code ${e.folderCode} does not match file-name code ${e.fileCode}`,
          });
          continue;
        }

        const pdfCode = await readEmployeeCodeFromPdf(e.bytes);
        if (pdfCode && pdfCode !== code) {
          report.conflicts.push({
            file: e.path,
            reason: `PDF says employee code ${pdfCode} but path says ${code}`,
          });
          continue;
        }

        // Match on the roster first; fall back to the durable RazorpayX code map
        // so the archive can be imported before this month's payroll pull.
        const rosterRow = rows.find((r) => String(r.razorpay_employee_id ?? "") === code);
        const mapped = rosterRow
          ? { employee_id: rosterRow.employee_id, name: rosterRow.name }
          : codeMapQ.data?.get(code);
        if (!mapped) {
          report.unmapped.push({ code, name: e.folderName ?? e.fileName, group: e.group });
          continue;
        }

        const path = `${month}/${mapped.employee_id}.pdf`;
        const blob = new Blob([e.bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
        const up = await supabase.storage.from("payslips").upload(path, blob, {
          upsert: true, contentType: "application/pdf",
        });
        if (up.error) {
          report.failures.push({ file: e.path, reason: up.error.message });
          continue;
        }
        // Upsert, not update: when the month has not been pulled yet there is no
        // record row to attach the PDF to, and a silent 0-row update would look
        // like success while linking nothing.
        const { error } = await (supabase as any)
          .from("hr_razorpay_payslip_records")
          .upsert({
            period_month: month,
            razorpay_employee_id: code,
            hr_employee_id: mapped.employee_id,
            employee_name_snapshot: mapped.name,
            pdf_storage_path: path,
          }, { onConflict: "period_month,razorpay_employee_id" });
        if (error) {
          report.failures.push({ file: e.path, reason: error.message });
          continue;
        }
        report.matched.push({ code, name: mapped.name, group: e.group, verified: !!pdfCode });

      }

      const codesInZip = new Set(entries.map((e) => e.folderCode ?? e.fileCode).filter(Boolean) as string[]);
      report.missingInZip = rows
        .filter((r) => !r.pdf_path && !codesInZip.has(String(r.razorpay_employee_id ?? "")))
        .map((r) => r.name);

      setZipReport(report);
      setUnmatched([]);
      if (report.matched.length) toast.success(`${report.matched.length} payslip(s) linked from the archive`);
      if (report.unmapped.length || report.conflicts.length || report.failures.length) {
        toast.warning(
          `${report.unmapped.length + report.conflicts.length + report.failures.length} file(s) need attention`,
        );
      }
      qc.invalidateQueries({ queryKey: ["hr_cockpit_month_state", month] });
      await autoDispatchAfterStep();
    } catch (err: any) {
      toast.error(err?.message || "Could not read the archive");
    } finally {
      setZipBusy(null);
      if (zipRef.current) zipRef.current.value = "";
    }
  }



  async function assignFile(employeeId: string, file: File) {
    const path = `${month}/${employeeId}.pdf`;
    const up = await supabase.storage.from("payslips").upload(path, file, { upsert: true, contentType: "application/pdf" });
    if (up.error) return toast.error(up.error.message);
    const { error } = await supabase
      .from("hr_razorpay_payslip_records")
      .update({ pdf_storage_path: path })
      .eq("period_month", month)
      .eq("hr_employee_id", employeeId);
    if (error) return toast.error(error.message);
    toast.success("Payslip attached");
    await autoDispatchAfterStep();
  }

  return (
    <div className="space-y-4">
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="md:max-w-6xl md:w-[min(98vw,80rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Import Salary Register (CSV) — {month}
            </DialogTitle>
          </DialogHeader>
          <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading importer…</div>}>
            <SalaryRegisterImportPage
              embedded
              initialMonth={month}
              onImported={() => {
                setRegisterOpen(false);
                autoDispatchAfterStep();
              }}
            />
          </Suspense>
        </DialogContent>
      </Dialog>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" /> Payslip email dispatch
            </div>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => rosterQ.refetch()}>
              <RefreshCw className={`h-3.5 w-3.5 ${rosterQ.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRegisterOpen(true)}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> {registerPresent ? "Re-import Salary Register" : "Import Salary Register"}
            </Button>
            {excludedRows.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs"
                onClick={() => setShowExcluded((v) => !v)}
              >
                {showExcluded ? "Hide" : "Show"} {excludedRows.length} not paid this month
              </Button>
            )}
            <div className="ml-auto text-xs text-muted-foreground">
              {sentCount}/{payrollRows.length} sent · {sendable.length} ready
              {excludedRows.length > 0 && ` · ${excludedRows.length} not in this month's payroll`}
            </div>

          </div>

          {!registerPresent && (
            <div className="flex flex-wrap items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="flex-1 min-w-[240px]">
                Salary Register CSV has not been imported for this month. Payslip emails are blocked until the register
                is imported — statutory splits and register-based gross/net are required.
              </span>
              <Button size="sm" className="gap-1.5" onClick={() => setRegisterOpen(true)}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Import Salary Register CSV
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Salary credit date
              </Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  className="h-9 w-[170px] text-foreground"
                  value={processedOnDraft || processedOn || ""}
                  onChange={(e) => setProcessedOnDraft(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!processedOnDraft || setProcessed.isPending}
                  onClick={() => setProcessed.mutate(processedOnDraft)}
                >
                  Save
                </Button>
              </div>
              
            </div>

            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1.5">
                <FileArchive className="h-3.5 w-3.5" /> RazorpayX payslip archive (.zip)
              </Label>
              <input
                ref={zipRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => handleZip(e.target.files?.[0])}
              />
              <Button size="sm" disabled={!!zipBusy} onClick={() => zipRef.current?.click()}>
                {zipBusy ?? "Import ZIP"}
              </Button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> This month from RazorpayX
              </Label>
              <Button
                size="sm"
                variant="outline"
                disabled={pullMonth.isPending}
                onClick={() => pullMonth.mutate()}
              >
                {pullMonth.isPending ? "Pulling…" : "Pull payroll"}
              </Button>
              {rows.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No payroll pulled for this month yet.
                </p>
              )}
            </div>


            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Individual PDFs
              </Label>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? "Uploading…" : "Select PDFs"}
              </Button>
            </div>
          </div>

          {zipReport && (
            <div className="rounded-md border p-3 text-xs space-y-2">
              <div className="font-medium text-foreground">
                Import report — {zipReport.fileName} ({zipReport.total} PDF(s))
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-success border-success/40">
                  {zipReport.matched.length} linked
                </Badge>
                {zipReport.unmapped.length > 0 && (
                  <Badge variant="outline" className="text-warning border-warning/40">
                    {zipReport.unmapped.length} not in HRMS
                  </Badge>
                )}
                {zipReport.conflicts.length > 0 && (
                  <Badge variant="destructive">{zipReport.conflicts.length} conflicts</Badge>
                )}
                {zipReport.failures.length > 0 && (
                  <Badge variant="destructive">{zipReport.failures.length} upload failures</Badge>
                )}
                {zipReport.matched.some((m) => !m.verified) && (
                  <Badge variant="outline">
                    {zipReport.matched.filter((m) => !m.verified).length} code not verified inside PDF
                  </Badge>
                )}
              </div>
              {zipReport.unmapped.length > 0 && (
                <div className="text-warning">
                  <div className="font-medium">No HRMS employee for these RazorpayX codes:</div>
                  {zipReport.unmapped.map((u) => (
                    <div key={u.code} className="pl-3 border-l-2 border-border">{u.code} — {u.name} ({u.group})</div>
                  ))}
                </div>
              )}
              {zipReport.conflicts.map((c) => (
                <div key={c.file} className="text-destructive pl-3 border-l-2 border-destructive/40">{c.file}: {c.reason}</div>
              ))}
              {zipReport.failures.map((f) => (
                <div key={f.file} className="text-destructive pl-3 border-l-2 border-destructive/40">{f.file}: {f.reason}</div>
              ))}
              {zipReport.missingInZip.length > 0 && (
                <div className="text-muted-foreground">
                  <span className="font-medium">Still without a PDF:</span> {zipReport.missingInZip.join(", ")}
                </div>
              )}
            </div>
          )}


          {unmatched.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
              <div className="font-medium">Unmatched files — attach them manually in the table below:</div>
              {unmatched.map((f) => <div key={f}>{f}</div>)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2 w-8">
                    <Checkbox
                      checked={sendable.length > 0 && sendable.every((r) => selected[r.employee_id])}
                      onCheckedChange={(v) => {
                        const next: Record<string, boolean> = {};
                        if (v) sendable.forEach((r) => (next[r.employee_id] = true));
                        setSelected(next);
                      }}
                    />
                  </th>
                  <th className="p-2 text-left">Employee</th>
                  <th className="p-2 text-right">Gross</th>
                  <th className="p-2 text-right">Deductions</th>
                  <th className="p-2 text-right">Net</th>
                  <th className="p-2 text-right">LOP</th>
                  <th className="p-2 text-right">Bonus</th>
                  <th className="p-2 text-left">PDF</th>
                  <th className="p-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rosterQ.isLoading && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading roster…</td></tr>
                )}
                {!rosterQ.isLoading && visibleRows.length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">
                    {rows.length === 0
                      ? "No payslip records imported for this month yet."
                      : "No employee had salary processed for this month."}
                  </td></tr>
                )}
                {visibleRows.map((r) => (

                  <tr
                    key={r.employee_id}
                    className={`border-t ${r.sendable ? "" : "bg-destructive/[0.04]"}`}
                  >
                    <td className="p-2 align-top">
                      <Checkbox
                        disabled={!r.sendable || !!r.already_sent_at}
                        checked={!!selected[r.employee_id]}
                        onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.employee_id]: !!v }))}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <div className="font-medium text-foreground">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.email ?? "no email"}</div>
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        {r.basis === "register_csv" ? "register CSV" : "razorpay API"}
                      </Badge>
                      {r.not_processed && (
                        <Badge variant="destructive" className="mt-1 ml-1 text-[10px]">
                          not processed
                        </Badge>
                      )}
                    </td>

                    <td className="p-2 text-right align-top tabular-nums">{inr(r.gross)}</td>
                    <td
                      className="p-2 text-right align-top tabular-nums"
                      title={(r.deduction_breakdown ?? []).map((d) => `${d.label}: ${inr(d.amount)}`).join("\n") || undefined}
                    >
                      {inr(r.deductions)}
                      {!!r.employer_contrib && (
                        <div className="text-[10px] text-muted-foreground">+{inr(r.employer_contrib)} employer</div>
                      )}
                    </td>
                    <td className="p-2 text-right align-top tabular-nums font-semibold">{inr(r.net)}</td>
                    <td className="p-2 text-right align-top tabular-nums">
                      {r.lop_days > 0 ? `${r.lop_days.toFixed(1)}d · ${inr(r.lop_amount)}` : "—"}
                    </td>
                    <td className="p-2 text-right align-top tabular-nums">
                      {r.bonus_total > 0 ? inr(r.bonus_total) : "—"}
                      {(r.other_additions_total ?? 0) > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          +{inr(r.other_additions_total ?? 0)} other additions
                        </div>
                      )}
                    </td>
                    <td className="p-2 align-top">
                      {r.pdf_path ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <FileText className="h-3.5 w-3.5" /> attached
                        </span>
                      ) : (
                        <label className="text-xs underline cursor-pointer text-muted-foreground">
                          attach
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && assignFile(r.employee_id, e.target.files[0])}
                          />
                        </label>
                      )}
                    </td>
                    <td className="p-2 align-top">
                      {r.already_sent_at ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> sent
                        </span>
                      ) : r.sendable ? (
                        <span className="text-xs text-muted-foreground">ready</span>
                      ) : (
                        <ul className="text-[11px] text-destructive space-y-0.5">
                          {r.blockers.map((b) => <li key={b} className="pl-3 border-l-2 border-border">{b}</li>)}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={selectedIds.length !== 1 || send.isPending}
          onClick={() => send.mutate({ ids: selectedIds, mode: "preview" })}
        >
          <Mail className="h-4 w-4" /> Preview my copy (1 selected)
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={selectedIds.length === 0 || send.isPending || !registerPresent}
          onClick={() => setConfirmOpen(true)}
        >
          <Send className="h-4 w-4" />
          {send.isPending ? "Sending…" : `Send payslip emails (${selectedIds.length})`}
        </Button>
        {selectedIds.length === 0 && sendable.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={() =>
              setSelected(Object.fromEntries(sendable.map((r) => [r.employee_id, true])))
            }
          >
            Select all {sendable.length} ready
          </Button>
        )}
        {(selectedIds.length === 0 || !registerPresent) && (
          <span className="text-xs text-muted-foreground">
            {!registerPresent
              ? "Import the Salary Register for this month to enable sending."
              : sendable.length === 0
                ? "No employees are ready to send (all sent, excluded, or blocked)."
                : "Tick at least one employee row to enable sending."}
          </span>
        )}
      </div>


      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send payslip emails?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.length} employee(s) will receive their payslip email with the uploaded PDF attached.
              Employees already emailed for this month are skipped automatically.
              {processedOn
                ? ` The email will state ${processedOn} as the salary credit date.`
                : " No salary credit date is recorded — set it above; sending is blocked until then."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => send.mutate({ ids: selectedIds, mode: "send" })}>
              Send now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
