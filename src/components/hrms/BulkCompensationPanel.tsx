import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Upload, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  applyCompensationRow,
  buildFailureCsv,
  buildTemplateCsv,
  downloadCsv,
  fetchRazorpayMap,
  MODE_LABEL,
  parseCsv,
  validateRows,
  type BulkMode,
  type EmployeeLite,
  type ParsedRow,
} from "@/lib/hrms/bulkCompensationCsv";

interface Props {
  mode: BulkMode;
  employees: EmployeeLite[];
  approvedBy: string;
  userId?: string | null;
  onDone: () => void;
}

export function BulkCompensationPanel({ mode, employees, approvedBy, userId, onDone }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [rzpMap, setRzpMap] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ applied: number; failed: number; skipped: number } | null>(null);

  const counts = useMemo(() => {
    const r = rows ?? [];
    return {
      apply: r.filter((x) => x.status === "apply").length,
      skip: r.filter((x) => x.status === "skip").length,
      error: r.filter((x) => x.status === "error").length,
    };
  }, [rows]);

  const reset = () => {
    setRows(null);
    setFileName("");
    setResult(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleTemplate = () => {
    downloadCsv(
      `bulk-${mode}-template-${new Date().toISOString().slice(0, 10)}.csv`,
      buildTemplateCsv(mode, employees),
    );
    toast.success(`${MODE_LABEL[mode]} template downloaded with ${employees.length} employees`);
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const { header, rows: raw } = parseCsv(text);
      if (!header.includes("badge_id")) {
        toast.error("This file has no badge_id column — download the template for this category first.");
        return;
      }
      const map = await fetchRazorpayMap(employees.map((e) => e.id));
      setRzpMap(map);
      const parsed = validateRows(mode, header, raw, employees, map);
      setRows(parsed);
      setResult(null);
      setFileName(file.name);
    } catch (e: any) {
      toast.error(`Could not read the file: ${e?.message || e}`);
    }
  };

  const handleApply = async () => {
    if (!rows) return;
    const todo = rows.filter((r) => r.status === "apply");
    if (!todo.length) return;
    setRunning(true);
    setProgress(0);
    const failures: { row: ParsedRow; error: string }[] = [];
    let applied = 0;

    for (let i = 0; i < todo.length; i++) {
      const row = todo[i];
      try {
        const res = await applyCompensationRow(mode, row, { approvedBy, userId, razorpayMap: rzpMap });
        if (mode === "recurring" && !res.scheduled && res.expectedTotal) {
          const m = await import("@/lib/razorpayPushback");
          const push = await m.pushSalaryToRazorpay(row.employee!.id, {
            triggeredFrom: "bulk_compensation_csv",
            silent: true,
            expectedTotal: res.expectedTotal,
          });
          if (!push.ok || typeof push.verifiedTotal !== "number" || Math.abs(push.verifiedTotal - res.expectedTotal) > 1) {
            failures.push({
              row,
              error: `Saved in HRMS but RazorpayX push NOT verified: ${(push.error || "mismatch").slice(0, 160)}`,
            });
            setProgress(Math.round(((i + 1) / todo.length) * 100));
            continue;
          }
        }
        if (mode === "statutory" && !res.scheduled) {
          const m = await import("@/lib/razorpayPushback");
          await m.pushStatutoryToRazorpay(row.employee!.id, { triggeredFrom: "bulk_compensation_csv" });
        }
        applied++;
      } catch (e: any) {
        failures.push({ row, error: String(e?.message || e).slice(0, 200) });
      }
      setProgress(Math.round(((i + 1) / todo.length) * 100));
    }

    [
      "hr_salary_revisions",
      "hr_employees",
      "employee-compensation-history",
      "hr_employees_for_revision",
      "data_health_unknown_enrollment",
      "hr_salary_push_latest",
      "payroll_input_additions",
      "payroll_input_deductions",
      "gate_lop",
    ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

    setRunning(false);
    setResult({ applied, failed: failures.length, skipped: counts.skip });
    if (failures.length) {
      setRows((prev) =>
        (prev ?? []).map((r) => {
          const f = failures.find((x) => x.row.line === r.line);
          return f ? { ...r, status: "error", error: f.error } : r.status === "apply" ? { ...r, status: "skip", summary: "Applied" } : r;
        }),
      );
      downloadCsv(`bulk-${mode}-failures-${Date.now()}.csv`, buildFailureCsv(mode, failures));
      toast.warning(`${applied} applied · ${failures.length} failed`, {
        description: "A corrections CSV with the failed rows was downloaded.",
      });
    } else {
      toast.success(`${applied} ${MODE_LABEL[mode].toLowerCase()} row${applied === 1 ? "" : "s"} applied`);
      onDone();
    }
  };

  return (
    <div className="space-y-3">
      <Alert>
        <AlertDescription className="text-xs">
          Download the <strong>{MODE_LABEL[mode]}</strong> template — it lists every employee with their
          badge ID and name. Fill in only the rows you want to change; a row left blank means no change
          for that employee.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleTemplate}>
          <Download className="h-4 w-4 mr-1.5" />
          Download template
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4 mr-1.5" />
          Upload filled CSV
        </Button>
        {rows && (
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Clear
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      {rows && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground truncate max-w-[180px]">{fileName}</span>
            <Badge variant="default">{counts.apply} to apply</Badge>
            <Badge variant="secondary">{counts.skip} unchanged</Badge>
            {counts.error > 0 && <Badge variant="destructive">{counts.error} errors</Badge>}
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
            {rows
              .filter((r) => r.status !== "skip")
              .map((r) => (
                <div key={r.line} className="flex items-start gap-2 p-2 text-xs">
                  {r.status === "apply" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {r.badge_id} · {r.employee_name || r.employee?.first_name}
                    </div>
                    <div className={cn("truncate", r.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                      {r.status === "error" ? r.error : r.summary}
                    </div>
                  </div>
                </div>
              ))}
            {rows.every((r) => r.status === "skip") && (
              <div className="p-3 text-xs text-muted-foreground">
                No filled rows found — every employee row is blank, so nothing would change.
              </div>
            )}
          </div>

          {counts.error > 0 && (
            <p className="text-xs text-destructive">
              Rows with errors are never applied. Fix them in the CSV and upload again.
            </p>
          )}

          {running && <Progress value={progress} className="h-1.5" />}

          {result && (
            <p className="text-xs text-muted-foreground">
              {result.applied} applied · {result.failed} failed · {result.skipped} unchanged
            </p>
          )}

          <Button type="button" className="w-full" disabled={running || counts.apply === 0} onClick={handleApply}>
            {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {running ? `Applying… ${progress}%` : `Apply ${counts.apply} row${counts.apply === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
    </div>
  );
}
