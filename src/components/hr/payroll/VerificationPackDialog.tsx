import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Download, FileSpreadsheet, RefreshCw, AlertTriangle } from "lucide-react";
import {
  buildVerificationPack, downloadCsv, downloadWorkbook, type VerificationPack,
} from "@/lib/hrms/payrollVerificationPack";

/**
 * Pre-payroll verification pack — three sheets covering the whole month.
 * Read-only: the LOP and comp-off engines are called in dry-run mode.
 */
export function VerificationPackDialog({
  open, onOpenChange, period,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  period: string;
}) {
  const [pack, setPack] = useState<VerificationPack | null>(null);

  const build = useMutation({
    mutationFn: () => buildVerificationPack(period),
    onSuccess: (p) => setPack(p),
    onError: (e: any) => toast.error(e.message || "Could not build the verification pack"),
  });

  const downloadAllCsv = () => {
    if (!pack) return;
    pack.sheets.forEach((s, i) => setTimeout(() => downloadCsv(s), i * 400));
    toast.success("Downloading 3 CSV sheets");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setPack(null); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Pre-payroll verification pack
          </DialogTitle>
          <DialogDescription>
            Three sheets covering everything this month's payroll is built on — leave and comp-off,
            every addition and deduction, and a per-employee summary. Nothing is staged or pushed.
          </DialogDescription>
        </DialogHeader>

        {!pack ? (
          <div className="rounded-md border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
            {build.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Collecting the month…
              </span>
            ) : (
              "Generate the pack to preview what it contains, then download."
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                ["Employees", pack.counts.employees],
                ["Leave rows", pack.counts.leaveRows],
                ["Money lines", pack.counts.moneyLines],
                ["Flagged", pack.counts.flagged],
              ].map(([l, v]) => (
                <div key={String(l)} className="rounded-md border bg-muted/30 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</div>
                  <div className="text-lg font-semibold t-mono">{String(v)}</div>
                </div>
              ))}
            </div>

            <div className="rounded-md border divide-y">
              {pack.sheets.map((s, i) => (
                <div key={s.name} className="flex items-center gap-3 px-3 py-2">
                  <span className="t-mono text-[11px] text-muted-foreground">Sheet {i + 1}</span>
                  <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.rows.length} rows</span>
                  <Button size="sm" variant="ghost" onClick={() => downloadCsv(s)}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
                  </Button>
                </div>
              ))}
            </div>

            {pack.warnings.length > 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Verify against these before running payroll
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {pack.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              {pack.monthLabel} · generated {pack.generatedAt}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => build.mutate()} disabled={build.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${build.isPending ? "animate-spin" : ""}`} />
            {pack ? "Regenerate" : "Generate pack"}
          </Button>
          {pack && (
            <>
              <Button variant="outline" onClick={() => downloadWorkbook(pack.sheets, `payroll_verification_${period.slice(0, 7)}`)}>
                <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel (3 tabs)
              </Button>
              <Button onClick={downloadAllCsv}>
                <Download className="h-4 w-4 mr-1.5" /> Download 3 CSVs
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
