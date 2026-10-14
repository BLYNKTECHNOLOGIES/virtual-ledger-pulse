import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { quizRpc, useInvalidateQuiz } from "./quizShared";
import { POOL_LABEL, type Subject } from "./QuestionEditor";

export function SubjectsManager({ open, onOpenChange, subjects, counts, canManage }: {
  open: boolean; onOpenChange: (o: boolean) => void; subjects: Subject[]; counts: Record<string, number>; canManage: boolean;
}) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const [editing, setEditing] = useState<Subject | "new" | null>(null);
  const [form, setForm] = useState({ name: "", description: "", pool: "hiring" });
  useEffect(() => {
    if (editing === "new") setForm({ name: "", description: "", pool: "hiring" });
    else if (editing) setForm({ name: editing.display_name, description: editing.description ?? "", pool: editing.pool });
  }, [editing]);

  const act = useMutation({
    mutationFn: async (v: { fn: string; args: Record<string, unknown>; ok: string }) => { await quizRpc(v.fn, v.args); return v.ok; },
    onSuccess: (ok) => { toast({ title: ok }); setEditing(null); void invalidate(); },
    onError: (e: Error) => toast({ title: "Not done", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Subjects</DialogTitle>
          <DialogDescription>Renaming changes only the name people see; the key that questions and tests use never changes. A subject in use can be retired, not deleted.</DialogDescription>
        </DialogHeader>
        {editing ? (
          <div className="grid gap-4">
            {editing !== "new" && <p className="text-xs text-muted-foreground">Key <span className="font-mono">{editing.key}</span> · {POOL_LABEL[editing.pool]} pool</p>}
            <div><Label htmlFor="sj-n">Name</Label><Input id="sj-n" className="text-foreground" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label htmlFor="sj-d">Description</Label><Textarea id="sj-d" rows={2} className="text-foreground" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
            {editing === "new" && (
              <div className="max-w-[220px]"><Label>Pool</Label><Select value={form.pool} onValueChange={(pool) => setForm((f) => ({ ...f, pool }))}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="hiring">Hiring</SelectItem><SelectItem value="staff">Staff</SelectItem><SelectItem value="shared">Shared (skill drills)</SelectItem></SelectContent></Select></div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Back</Button>
              <Button disabled={!form.name.trim()} loading={act.isPending} onClick={() => act.mutate({
                fn: "cbt_save_subject",
                args: { p_key: editing === "new" ? null : editing.key, p_pool: form.pool, p_display_name: form.name, p_description: form.description },
                ok: editing === "new" ? "Subject added" : "Subject saved",
              })}>Save</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {canManage && <Button size="sm" className="w-fit" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />New subject</Button>}
            <Table>
              <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Pool</TableHead><TableHead numeric>Items</TableHead><TableHead>Status</TableHead>{canManage && <TableHead><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
              <TableBody>{subjects.map((s) => (
                <TableRow key={s.key}>
                  <TableCell><p className="font-medium">{s.display_name}</p><p className="font-mono text-xs text-muted-foreground">{s.key}</p></TableCell>
                  <TableCell>{POOL_LABEL[s.pool]}</TableCell>
                  <TableCell numeric>{counts[s.key] ?? 0}</TableCell>
                  <TableCell><Badge variant={s.is_retired ? "muted" : "success"}>{s.is_retired ? "Retired" : "Active"}</Badge></TableCell>
                  {canManage && (
                    <TableCell><div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Rename ${s.display_name}`} title="Rename" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={s.is_retired ? "Restore" : "Retire"} title={s.is_retired ? "Restore" : "Retire"}
                        onClick={() => act.mutate({ fn: "cbt_set_subject_retired", args: { p_key: s.key, p_retired: !s.is_retired }, ok: s.is_retired ? "Subject restored" : "Subject retired" })}>
                        {s.is_retired ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      </Button>
                      {!(counts[s.key] ?? 0) && (
                        <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${s.display_name}`} title="Delete"
                          onClick={() => act.mutate({ fn: "cbt_delete_subject", args: { p_key: s.key }, ok: "Subject deleted" })}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div></TableCell>
                  )}
                </TableRow>
              ))}</TableBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
