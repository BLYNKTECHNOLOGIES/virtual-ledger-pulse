import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Download, RefreshCw, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { buildBulkSheet, downloadBulkSheet, markBulkUploaded, type BulkSheet } from "@/lib/hrms/razorpayBulkSheet";

export function RazorpayBulkSheetDialog({ open, onOpenChange, period }: { open: boolean; onOpenChange: (o: boolean) => void; period: string }) {
  const [sheet, setSheet] = useState<BulkSheet | null>(null);
  const qc = useQueryClient();
  const build = useMutation({ mutationFn: () => buildBulkSheet(period), onSuccess: setSheet, onError: (e: any) => toast.error(e.message || "Could not build the sheet") });
  const mark = useMutation({
    mutationFn: () => {
      if (!sheet) throw new Error("Prepare the sheet before marking it as uploaded");
      return markBulkUploaded(sheet);
    },
    onSuccess: (n) => { toast.success(`${n} line(s) marked as sent via bulk sheet`); qc.invalidateQueries(); setSheet(null); },
    onError: (e: any) => toast.error(e.message || "Could not mark as uploaded"),
  });
  const blocked = (sheet?.blocked.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSheet(null); }}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] min-w-0 flex-col gap-3 overflow-hidden md:!w-[min(48rem,calc(100vw-2rem))] md:!max-w-none">
        <DialogHeader className="min-w-0 shrink-0 pr-7">
          <DialogTitle className="flex min-w-0 items-start gap-2 leading-snug"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> <span className="min-w-0">RazorpayX bulk addition/deduction sheet</span></DialogTitle>
          <DialogDescription>Every unpushed Step 6 line in RazorpayX's own upload format, using only your RazorpayX names. Upload it on the RazorpayX dashboard.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
          {!sheet ? (
            <div className="rounded-md border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
              {build.isPending ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Collecting Step 6 lines…</span> : "Prepare the sheet to preview it."}
            </div>
          ) : (
          <div className="min-w-0 space-y-3">
            <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4">
              {[["Rows", sheet.rows.length], ["Additions ₹", sheet.totals.additions], ["Deductions ₹", sheet.totals.deductions], ["LOP deduction ₹", sheet.totals.lopDeduction]].map(([l, v]) => (
                <div key={String(l)} className="min-w-0 rounded-md border bg-muted/30 px-3 py-2">
                  <div className="break-words text-[11px] uppercase tracking-wide text-muted-foreground">{l}</div>
                  <div className="break-all text-lg font-semibold t-mono">{String(v)}</div>
                </div>
              ))}
            </div>
            {blocked && (
              <div className="min-w-0 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Fix these before downloading</div>
                <ul className="mt-1 space-y-1 text-xs text-foreground">{sheet.blocked.map((b, i) => <li key={i} className="break-words"><b>{b.name}</b> — {b.what}: {b.reason}</li>)}</ul>
              </div>
            )}
            <div className="min-w-0 divide-y rounded-md border text-xs">
              {sheet.rows.map((r, i) => (
                <div key={i} className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_minmax(6rem,1.35fr)_4.5rem] items-center gap-2 px-3 py-1.5">
                  <span className="truncate t-mono text-muted-foreground">{r.badge}</span>
                  <span className="min-w-0 truncate">{r.name}</span>
                  <span className="min-w-0 truncate text-right sm:text-left" title={r.component}>{r.component}</span>
                  <span className="truncate text-right t-mono">{r.days != null ? `${r.days} d` : `₹${r.amount}`}</span>
                </div>
              ))}
            </div>
            {sheet.alreadyPushed.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <div className="flex items-center gap-1 font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> Already in RazorpayX (left out)</div>
                <ul>{sheet.alreadyPushed.map((p, i) => <li key={i}>{p.name} — {p.what} ₹{p.amount}</li>)}</ul>
              </div>
            )}
          </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-wrap gap-2 sm:space-x-0 [&>button]:min-w-0">
          <Button variant="outline" onClick={() => build.mutate()} disabled={build.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${build.isPending ? "animate-spin" : ""}`} /> {sheet ? "Refresh" : "Prepare sheet"}
          </Button>
          {sheet && (
            <>
              <Button disabled={blocked || !sheet.rows.length} onClick={() => downloadBulkSheet(sheet)}><Download className="h-4 w-4 mr-1.5" /> Download sheet</Button>
              <Button variant="outline" disabled={blocked || !sheet.rows.length || mark.isPending} onClick={() => mark.mutate()}>Mark as uploaded to RazorpayX</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
