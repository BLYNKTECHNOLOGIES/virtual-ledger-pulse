import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { quizRpc, useInvalidateQuiz } from "./quizShared";
import type { Subject } from "./QuestionEditor";
import { TEMPLATE_HEADERS, rowToItem } from "@/lib/cbt/quizBank";

type Preview = { rows: { row: number; ok: boolean; error?: string }[]; valid: number; total: number; imported: number };

export function QuestionImport({ open, onOpenChange, subjects }: { open: boolean; onOpenChange: (o: boolean) => void; subjects: Subject[] }) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const [pool, setPool] = useState("hiring");
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("needs_review");
  const [items, setItems] = useState<ReturnType<typeof rowToItem>[]>([]);
  const [sheetRows, setSheetRows] = useState<number[]>([]);
  const [raw, setRaw] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => { if (open) { setItems([]); setRaw([]); setPreview(null); } }, [open]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS,
      ["mcq", "Which number comes next: 2, 4, 8, 16, ?", "24", "30", "32", "36", "", "", "c", "", "", "easy", "1", "Each term doubles."],
      ["numeric", "A shirt costs 800 after a 20% discount. What was the original price?", "", "", "", "", "", "", "", "1000", "0", "medium", "1", ""]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "quiz-question-import-template.xlsx");
  };

  const readFile = async (file: File) => {
    const wb = XLSX.read(await file.arrayBuffer());
    // keep each row's real spreadsheet number (SheetJS __rowNum__ is 0-based, header is row 1)
    const read = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" })
      .map((r) => ({ sheetRow: Number((r as { __rowNum__?: number }).__rowNum__ ?? 0) + 1,
        data: Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v])) }))
      .filter((r) => Object.values(r.data).some((v) => String(v).trim()));
    const rows = read.map((r) => r.data);
    setSheetRows(read.map((r) => r.sheetRow));
    setRaw(rows); setItems(rows.map(rowToItem)); setPreview(null);
  };

  const run = useMutation({
    mutationFn: (dry: boolean) => quizRpc<Preview>("cbt_import_questions", { p_rows: items, p_pool: pool, p_subject: subject, p_status: status, p_dry_run: dry }),
    onSuccess: (res, dry) => {
      setPreview(res);
      if (!dry) { void invalidate(); toast({ title: `Imported ${res.imported} question${res.imported === 1 ? "" : "s"}` }); onOpenChange(false); }
    },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const poolSubjects = subjects.filter((s) => s.pool === pool && !s.is_retired);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import questions from Excel</DialogTitle>
          <DialogDescription>Multiple-choice and numeric questions. Check the preview — nothing is saved until you press Import.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Button variant="outline" size="sm" className="w-fit" onClick={downloadTemplate}><Download className="h-4 w-4" />Download template</Button>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>Pool</Label><Select value={pool} onValueChange={(v) => { setPool(v); setSubject(""); setPreview(null); }}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="hiring">Hiring</SelectItem><SelectItem value="staff">Staff</SelectItem></SelectContent></Select></div>
            <div><Label>Subject</Label><Select value={subject} onValueChange={(v) => { setSubject(v); setPreview(null); }}>
              <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{poolSubjects.map((s) => <SelectItem key={s.key} value={s.key}>{s.display_name}</SelectItem>)}</SelectContent></Select>
              {!poolSubjects.length && <p className="mt-1 text-xs text-muted-foreground">Add a subject for this pool first.</p>}</div>
            <div><Label>Import as</Label><Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="needs_review">Needs review</SelectItem><SelectItem value="approved">Approved</SelectItem></SelectContent></Select></div>
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm hover:bg-muted/50">
            <Upload className="h-4 w-4" />{raw.length ? `${raw.length} rows read — choose another file` : "Choose an .xlsx file"}
            <input type="file" accept=".xlsx,.xls" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) void readFile(file); e.target.value = ""; }} />
          </label>
          {preview && (
            <div className="space-y-2">
              <p className="text-sm"><span className="font-semibold">{preview.valid}</span> of {preview.total} rows are ready{preview.total - preview.valid ? ` · ${preview.total - preview.valid} will be skipped` : ""}.</p>
              <Table>
                <TableHeader><TableRow><TableHead numeric>Row</TableHead><TableHead>Question</TableHead><TableHead>Check</TableHead></TableRow></TableHeader>
                <TableBody>{preview.rows.map((r) => (
                  <TableRow key={r.row}>
                    <TableCell numeric>{sheetRows[r.row - 1] ?? r.row + 1}</TableCell>
                    <TableCell className="max-w-[360px]"><p className="line-clamp-2 text-sm">{String(raw[r.row - 1]?.question ?? "")}</p></TableCell>
                    <TableCell>{r.ok ? <Badge variant="success">Ready</Badge> : <span className="text-sm text-destructive">{r.error}</span>}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">Row numbers match the spreadsheet (row 1 is the header).</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" disabled={!items.length || !subject} loading={run.isPending && !preview} onClick={() => run.mutate(true)}>Check rows</Button>
          <Button disabled={!preview || !preview.valid} loading={run.isPending && Boolean(preview)} onClick={() => run.mutate(false)}>Import {preview?.valid ?? 0}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
