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
    mutationFn: () => markBulkUploaded(sheet!),
    onSuccess: (n) => { toast.success(`${n} line(s) marked as sent via bulk sheet`); qc.invalidateQueries(); setSheet(null); },
    onError: (e: any) => toast.error(e.message || "Could not mark as uploaded"),
  });
  const blocked = (sheet?.blocked.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSheet(null); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-primary" /> RazorpayX bulk addition/deduction sheet</DialogTitle>
          <DialogDescription>Every unpushed Step 6 line in RazorpayX's own upload format, using only your RazorpayX names. Upload it on the RazorpayX dashboard.</DialogDescription>
        </DialogHeader>

        {!sheet ? (
          <div className="rounded-md border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
            {build.isPending ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Collecting Step 6 lines…</span> : "Prepare the sheet to preview it."}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[["Rows", sheet.rows.length], ["Additions ₹", sheet.totals.additions], ["Deductions ₹", sheet.totals.deductions], ["LOP days", sheet.totals.lopDays]].map(([l, v]) => (
                <div key={String(l)} className="rounded-md border bg-muted/30 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</div>
                  <div className="text-lg font-semibold t-mono">{String(v)}</div>
                </div>
              ))}
            </div>
            {blocked && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Fix these before downloading</div>
                <ul className="mt-1 space-y-0.5 text-xs text-foreground">{sheet.blocked.map((b, i) => <li key={i}><b>{b.name}</b> — {b.what}: {b.reason}</li>)}</ul>
              </div>
            )}
            <div className="rounded-md border divide-y text-xs">
              {sheet.rows.map((r, i) => (
                <div key={i} className="flex gap-2 px-3 py-1.5">
                  <span className="t-mono w-8 text-muted-foreground">{r.badge}</span>
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="truncate">{r.component}</span>
                  <span className="t-mono w-20 text-right">{r.days != null ? `${r.days} d` : `₹${r.amount}`}</span>
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

        <DialogFooter className="gap-2">
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
