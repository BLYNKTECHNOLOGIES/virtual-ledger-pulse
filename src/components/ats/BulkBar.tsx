import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Download, Pause, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { atsKeys, useAtsReasons, useAtsStages } from "@/lib/ats/api";
import { runBulk, type BulkAction, type BulkResult } from "@/lib/ats/bulk";
import { candKeys, candidateHref, type AtsAppRow } from "@/lib/ats/candidates";

const verb = (a: BulkAction) => (a.kind === "move" ? "moved" : a.kind === "hold" ? "put on hold" : "rejected");
const title = (a: BulkAction) => (a.kind === "move" ? `Move to ${a.stageName}` : a.kind === "hold" ? "Put on hold" : "Reject");

export function BulkBar({ rows, onClear, onExport, exporting }: { rows: AtsAppRow[]; onClear: () => void; onExport: () => void; exporting: boolean }) {
  const qc = useQueryClient();
  const stages = useAtsStages();
  const reasons = useAtsReasons();
  const [pending, setPending] = useState<BulkAction | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rid, setRid] = useState("");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<{ n: number; total: number } | null>(null);
  const [result, setResult] = useState<{ action: BulkAction; res: BulkResult } | null>(null);
  const signal = useRef({ cancelled: false });
  const running = !!progress;
  useEffect(() => { if (rejectOpen) { setRid(""); setNote(""); } }, [rejectOpen]);

  const start = async (action: BulkAction) => {
    setPending(null);
    signal.current = { cancelled: false };
    setProgress({ n: 0, total: rows.length });
    const res = await runBulk(action, rows, { signal: signal.current, onProgress: (n, total) => setProgress({ n, total }), concurrency: 4 });
    setProgress(null);
    setResult({ action, res });
    qc.invalidateQueries({ queryKey: candKeys.all });
    qc.invalidateQueries({ queryKey: atsKeys.jobSummary });
    qc.invalidateQueries({ queryKey: atsKeys.overview });
  };

  const activeStages = (stages.data ?? []).filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const rejectReasons = (reasons.data ?? []).filter((r) => r.is_active && r.applies_to === "rejected");

  return (
    <>
      <div className="sticky bottom-2 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-lg" role="region" aria-label="Selection">
        <span className="px-1 text-sm font-medium tabular-nums text-foreground">{rows.length} selected</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={running} className="gap-1">Move to stage… <ChevronDown className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            {activeStages.filter((s) => s.code !== "hired").map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => setPending({ kind: "move", stageId: s.id, stageName: s.name })}>{s.name}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="outline" disabled={running} className="gap-1.5" onClick={() => setPending({ kind: "hold" })}><Pause className="h-4 w-4" /> Hold</Button>
        <Button size="sm" variant="outline" disabled={running} className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setRejectOpen(true)}><XCircle className="h-4 w-4" /> Reject…</Button>
        <Button size="sm" variant="outline" disabled={running || exporting} className="gap-1.5" onClick={onExport}><Download className="h-4 w-4" /> Export selected</Button>
        <Button size="sm" variant="ghost" disabled={running} className="ml-auto gap-1" onClick={onClear}><X className="h-4 w-4" /> Clear</Button>
        {progress && (
          <div className="flex w-full items-center gap-3 pt-1">
            <Progress value={(progress.n / Math.max(1, progress.total)) * 100} className="h-2 flex-1" />
            <span className="text-xs tabular-nums text-muted-foreground">{progress.n} / {progress.total}</span>
            <Button size="sm" variant="ghost" onClick={() => { signal.current.cancelled = true; }}>Cancel</Button>
          </div>
        )}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending && `${title(pending)}: ${rows.length} application${rows.length === 1 ? "" : "s"}?`}</AlertDialogTitle>
            <AlertDialogDescription>Applications this can't apply to are skipped and listed at the end.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && start(pending)}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResponsiveDialog open={rejectOpen} onOpenChange={setRejectOpen} title={`Reject ${rows.length} application${rows.length === 1 ? "" : "s"}`}
        description="The same reason is applied to every selected application."
        footer={<>
          <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button variant="destructive" type="submit" form="ats-bulk-reject" disabled={!rid}>Reject {rows.length}</Button>
        </>}>
        <form id="ats-bulk-reject" className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!rid) return; setRejectOpen(false); start({ kind: "reject", reasonId: rid, note: note.trim() }); }}>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={rid} onValueChange={setRid}>
              <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
              <SelectContent>{rejectReasons.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ats-bulk-note">Note (optional)</Label>
            <Textarea id="ats-bulk-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="text-foreground" />
          </div>
        </form>
      </ResponsiveDialog>

      <ResponsiveDialog open={!!result} onOpenChange={(o) => !o && setResult(null)} title="Bulk action finished"
        footer={<Button onClick={() => { setResult(null); onClear(); }}>Done</Button>}>
        {result && (
          <div className="space-y-3 text-sm">
            <p className="text-foreground">
              {result.res.done} {verb(result.action)}, {result.res.skipped.length} skipped
              {result.res.failed.length > 0 && `, ${result.res.failed.length} failed`}
              {result.res.cancelled && " · cancelled before finishing"}
            </p>
            {[...result.res.skipped, ...result.res.failed].length > 0 && (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {[...result.res.failed, ...result.res.skipped].map(({ row, reason }) => (
                  <li key={row.application_id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <Link to={candidateHref(row)} className="truncate text-primary hover:underline">{row.full_name} <span className="t-mono text-xs text-muted-foreground">{row.ref_no}</span></Link>
                    <span className="shrink-0 text-xs text-muted-foreground">{reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
}

export function exportToast() {
  return toast.loading("Preparing export…");
}
