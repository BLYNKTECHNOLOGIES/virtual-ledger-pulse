import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search, Users } from "lucide-react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { AttemptPanel } from "./AttemptPanel";
import { fmtIst, pretty, quizRpc, statusLabel, statusVariant } from "./quizShared";

export type ResultRow = {
  id: string; public_ref: string; person: string | null; mobile: string | null; test: string | null; drive: string | null;
  status: string; total_score: number | null; decision: string; decision_source: string; decision_reason: string | null;
  warning_count: number; is_sandbox: boolean; created_at: string; started_at: string | null; submitted_at: string | null;
};
type Page = { total: number; rows: ResultRow[] };
const PAGE = 50;
const ALL = "__all";

export function QuizResults({ drives, tests, canManage }: { drives: { id: string; name: string }[]; tests: { id: string; name: string }[]; canManage: boolean }) {
  const { toast } = useToast();
  const [f, setF] = useState({ drive: ALL, test: ALL, status: ALL, decision: ALL, from: "", to: "", sandbox: false });
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(0); }, [f, debounced]);

  const args = (limit: number, offset: number) => ({
    p_drive_id: f.drive === ALL ? null : f.drive, p_job_role_id: f.test === ALL ? null : f.test,
    p_status: f.status === ALL ? null : f.status, p_decision: f.decision === ALL ? null : f.decision,
    p_from: f.from || null, p_to: f.to || null, p_search: debounced.trim() || null, p_include_sandbox: f.sandbox,
    p_limit: limit, p_offset: offset,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cbt", "results", f, debounced, page],
    queryFn: () => quizRpc<Page>("cbt_results", args(PAGE, page * PAGE)),
    placeholderData: (prev) => prev,
  });

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const all: ResultRow[] = [];
      for (let off = 0; ; off += 1000) {
        const res = await quizRpc<Page>("cbt_results", args(1000, off));
        all.push(...res.rows);
        if (all.length >= res.total || !res.rows.length) break;
      }
      const sheet = XLSX.utils.json_to_sheet(all.map((r) => ({
        Reference: r.public_ref, Person: r.person ?? "Anonymized", Mobile: r.mobile ?? "", Test: r.test ?? "", Drive: r.drive ?? "",
        Status: statusLabel(r.status), Total: r.total_score, Decision: pretty(r.decision),
        "Decision by": r.decision_source === "manual" ? "HR" : "Automatic", "Decision reason": r.decision_reason ?? "",
        Warnings: r.warning_count, Sandbox: r.is_sandbox ? "Yes" : "No",
        "Registered (IST)": fmtIst(r.created_at), "Submitted (IST)": fmtIst(r.submitted_at),
      })));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Results");
      XLSX.writeFile(book, `quiz-results-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const sel = (key: keyof typeof f, label: string, options: [string, string][]) => (
    <div className="min-w-0">
      <Label className="text-xs">{label}</Label>
      <Select value={String(f[key])} onValueChange={(v) => setF((x) => ({ ...x, [key]: v }))}>
        <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>All</SelectItem>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-lg font-semibold">Results</h2><p className="text-sm text-muted-foreground">Every attempt, with scores and decisions. Open one for the full breakdown.</p></div>
        <Button variant="outline" loading={exporting} disabled={!total} onClick={exportXlsx}><Download className="h-4 w-4" />Export Excel</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <div className="col-span-2 md:col-span-4 xl:col-span-2">
          <Label className="text-xs">Search</Label>
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reference, name or mobile" className="pl-9 text-foreground" /></div>
        </div>
        {sel("drive", "Drive", drives.map((d) => [d.id, d.name]))}
        {sel("test", "Test", tests.map((t) => [t.id, t.name]))}
        {sel("status", "Status", [["registered", "Registered"], ["in_progress", "Testing"], ["submitted", "Submitted"], ["abandoned", "Abandoned"], ["invalidated", "Invalidated"]])}
        {sel("decision", "Decision", [["shortlisted", "Shortlisted"], ["hold", "Hold"], ["rejected", "Rejected"], ["pending_evaluation", "Pending evaluation"], ["incomplete", "Incomplete"]])}
        <div className="flex items-end gap-2 pb-2"><Switch id="sb" checked={f.sandbox} onCheckedChange={(v) => setF((x) => ({ ...x, sandbox: v }))} /><Label htmlFor="sb" className="text-xs">Show sandbox</Label></div>
        <div><Label className="text-xs">From (IST)</Label><Input type="date" className="text-foreground" value={f.from} onChange={(e) => setF((x) => ({ ...x, from: e.target.value }))} /></div>
        <div><Label className="text-xs">To (IST)</Label><Input type="date" className="text-foreground" value={f.to} onChange={(e) => setF((x) => ({ ...x, to: e.target.value }))} /></div>
      </div>

      {isError ? <p className="text-sm text-destructive">Results could not be loaded.</p> : !isLoading && !total ? (
        <div className="rounded-lg border border-border bg-card"><EmptyState icon={Users} title="No attempts match" description={f.sandbox ? "Try clearing a filter." : "Sandbox attempts are hidden — switch on Show sandbox to see them."} /></div>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Person</TableHead><TableHead>Test · drive</TableHead><TableHead>Status</TableHead><TableHead numeric>Total</TableHead><TableHead>Decision</TableHead><TableHead numeric>Warnings</TableHead><TableHead>Registered</TableHead></TableRow></TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <TableCell className="font-mono text-xs">{r.public_ref}{r.is_sandbox && <Badge variant="muted" className="ml-1">Sandbox</Badge>}</TableCell>
                    <TableCell className="font-medium">{r.person ?? "Anonymized"}</TableCell>
                    <TableCell><p>{r.test ?? "—"}</p><p className="text-xs text-muted-foreground">{r.drive}</p></TableCell>
                    <TableCell><Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge></TableCell>
                    <TableCell numeric>{r.total_score ?? "—"}</TableCell>
                    <TableCell><Badge variant={statusVariant(r.decision)}>{pretty(r.decision)}</Badge>{r.decision_source === "manual" && <span className="ml-1 text-xs text-muted-foreground">HR</span>}</TableCell>
                    <TableCell numeric>{r.warning_count}</TableCell>
                    <TableCell className="text-xs">{fmtIst(r.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-2 md:hidden">
            {(data?.rows ?? []).map((r) => (
              <button key={r.id} className="rounded-lg border border-border bg-card p-3 text-left" onClick={() => setOpenId(r.id)}>
                <div className="flex items-center justify-between gap-2"><p className="font-medium">{r.person ?? "Anonymized"}</p><Badge variant={statusVariant(r.decision)}>{pretty(r.decision)}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground">{r.public_ref} · {r.test} · {statusLabel(r.status)} · total {r.total_score ?? "—"}</p>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} attempt{total === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span>Page {page + 1} of {pages}</span>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
      <AttemptPanel attemptId={openId} onClose={() => setOpenId(null)} canManage={canManage} />
    </div>
  );
}
