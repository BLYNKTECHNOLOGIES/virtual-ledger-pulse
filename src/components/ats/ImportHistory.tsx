import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { atsKeys } from "@/lib/ats/api";
import { candKeys } from "@/lib/ats/candidates";
import { atsErrorMessage } from "@/lib/ats/errors";
import { fmtDateTime } from "@/lib/ats/format";
import {
  IMPORT_ROWS_PAGE, OUTCOME_LABEL, UNDO_DAYS, importKeys, reasonLabel, removeStoredFiles, undoImport,
  useImportRows, useImports, type ImportListRow, type Outcome,
} from "@/lib/ats/imports";
import { QueryError, RowsSkeleton, SectionCard } from "./AtsBits";

const fileLabel = (r: ImportListRow) => (r.kind === "resumes" ? "Resumes" : r.file_name ?? "—");

function jobLabel(r: ImportListRow) {
  if (r.job_mode === "match") return "Matched by job title";
  if (r.job_mode === "general") return "General";
  return r.ats_jobs?.title ?? "Job removed";
}

function resultsLabel(r: ImportListRow) {
  const parts = ([
    [r.created_count, "new"], [r.added_count, "added"], [r.existing_count, "already applied"],
    [r.skipped_count, "skipped"], [r.error_count, "not imported"],
  ] as [number, string][]).filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`);
  return parts.length ? parts.join(" · ") : "Nothing imported";
}

function StatusBadge({ r }: { r: any }) {
  if (r.status === "undone") {
    return (
      <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><Badge variant="outline">Undone</Badge></TooltipTrigger>
        <TooltipContent>
          Undone by {r.undone_by_name ?? "—"} on {fmtDateTime(r.undone_at)}
          {Number(r.undo_kept) > 0 ? ` · kept ${r.undo_kept} worked on since` : ""}
        </TooltipContent>
      </Tooltip>
      </TooltipProvider>
    );
  }
  if (r.status === "running") {
    const stale = Date.now() - new Date(r.created_at).getTime() > 30 * 60_000;
    return <Badge variant="secondary">{stale ? "Not finished" : "Running"}</Badge>;
  }
  return <Badge>Done</Badge>;
}

const canUndo = (r: ImportListRow) =>
  r.status !== "undone" && Date.now() - new Date(r.created_at).getTime() < UNDO_DAYS * 86_400_000;

export function ImportHistory() {
  const q = useImports();
  const isMobile = useIsMobile();
  const [viewing, setViewing] = useState<ImportListRow | null>(null);
  const [undoing, setUndoing] = useState<ImportListRow | null>(null);
  const rows = q.data ?? [];

  const actions = (r: ImportListRow) => (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setViewing(r)}>View rows</Button>
      {canUndo(r) && <Button size="sm" variant="outline" className="text-destructive" onClick={() => setUndoing(r)}>Undo import</Button>}
    </div>
  );

  return (
    <SectionCard title="Recent imports">
      {q.isLoading ? <RowsSkeleton /> : q.error ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : !rows.length ? (
        <p className="text-sm text-muted-foreground">No imports yet.</p>
      ) : isMobile ? (
        <div className="space-y-3">
          {rows.map((r: any) => (
            <div key={r.id} className="space-y-1 rounded-lg border border-border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words font-medium text-foreground">{fileLabel(r)}</span>
                <StatusBadge r={r} />
              </div>
              <div className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)} · by {r.created_by_name ?? "—"}</div>
              <div className="text-muted-foreground">{r.ats_sources?.name ?? "—"} · {jobLabel(r)}</div>
              <div>{resultsLabel(r)}</div>
              {actions(r)}
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                {["When", "File", "Source", "Job", "Results", "Status", ""].map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-2 py-2 whitespace-nowrap">
                    {fmtDateTime(r.created_at)}
                    <div className="text-xs text-muted-foreground">by {r.created_by_name ?? "—"}</div>
                  </td>
                  <td className="max-w-[220px] px-2 py-2 break-words">{fileLabel(r)}</td>
                  <td className="px-2 py-2">{r.ats_sources?.name ?? "—"}</td>
                  <td className="px-2 py-2">{jobLabel(r)}</td>
                  <td className="px-2 py-2">{resultsLabel(r)}</td>
                  <td className="px-2 py-2"><StatusBadge r={r} /></td>
                  <td className="px-2 py-2">{actions(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ImportRowsDialog imp={viewing} onClose={() => setViewing(null)} />
      <UndoImportDialog imp={undoing} onClose={() => setUndoing(null)} />
    </SectionCard>
  );
}

function ImportRowsDialog({ imp, onClose }: { imp: ImportListRow | null; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | "all">("all");
  const q = useImportRows(imp?.id ?? null, page, outcome);
  const total = q.data?.total ?? 0;
  const from = total ? page * IMPORT_ROWS_PAGE + 1 : 0;
  const to = Math.min(total, (page + 1) * IMPORT_ROWS_PAGE);
  return (
    <ResponsiveDialog
      open={!!imp}
      onOpenChange={(o) => { if (!o) { onClose(); setPage(0); setOutcome("all"); } }}
      title={`Rows of ${imp ? fileLabel(imp) : ""}`}
      contentClassName="max-w-3xl"
    >
      <div className="space-y-3">
        <Select value={outcome} onValueChange={(v) => { setOutcome(v as Outcome | "all"); setPage(0); }}>
          <SelectTrigger className="w-56 text-foreground"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rows</SelectItem>
            {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => <SelectItem key={o} value={o}>{OUTCOME_LABEL[o]}</SelectItem>)}
          </SelectContent>
        </Select>
        {q.isLoading ? <RowsSkeleton /> : q.error ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : (
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border"><th className="px-2 py-2">Row</th><th className="px-2 py-2">Result</th><th className="px-2 py-2">Candidate</th></tr>
              </thead>
              <tbody>
                {(q.data?.rows ?? []).map((r: any) => (
                  <tr key={r.id ?? r.row_no} className="border-b border-border last:border-0">
                    <td className="px-2 py-2">{r.row_no}</td>
                    <td className="px-2 py-2">{OUTCOME_LABEL[r.outcome as Outcome] ?? r.outcome}{r.error ? ` · ${reasonLabel(r.error)}` : ""}</td>
                    <td className="px-2 py-2">
                      {r.ats_candidates ? (
                        <Link className="text-primary hover:underline" to={`/hrms/ats/candidates/${r.candidate_id}`}>
                          {r.ats_candidates.full_name} ({r.ats_candidates.ref_no})
                        </Link>
                      ) : ["created", "added", "existing"].includes(r.outcome) ? (
                        <span className="text-muted-foreground">Removed by undo</span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Rows {from}–{to} of {total.toLocaleString("en-IN")}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={to >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function UndoImportDialog({ imp, onClose }: { imp: ImportListRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!imp) return;
    setBusy(true);
    try {
      const r = await undoImport(imp.id);
      const failed = await removeStoredFiles(r.storage_paths ?? []);
      toast.success(`Removed ${r.deleted_candidates} ${r.deleted_candidates === 1 ? "candidate" : "candidates"} and ${r.deleted_applications} ${r.deleted_applications === 1 ? "application" : "applications"}.${r.kept > 0 ? ` Kept ${r.kept} that were worked on since.` : ""}`);
      if (failed > 0) toast.warning("Some stored files couldn't be removed.");
      for (const k of [candKeys.all, atsKeys.overview, atsKeys.jobSummary, importKeys.all]) qc.invalidateQueries({ queryKey: k });
      onClose();
    } catch (e) {
      toast.error(atsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog open={!!imp} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo this import?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the candidates and applications this import created, with their files. Anything someone has worked on since the import (moved, rejected, noted, rated, emailed, interviewed or edited) is kept. Candidates who were already in the ATS stay; only the application from this import is removed. This can't be reversed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => { e.preventDefault(); void go(); }}
          >
            {busy ? "Undoing…" : "Undo import"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
