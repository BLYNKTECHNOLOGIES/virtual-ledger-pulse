import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, CheckCircle2, ChevronLeft, Pencil, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TYPE_LABEL, POOL_LABEL, type ItemType, type Subject } from "./QuestionEditor";
import { pretty, quizRpc, useInvalidateQuiz } from "./quizShared";
import type { QuestionAnalyticsRow } from "./QuestionBankWorkspace";
import { isReviewShortcut, pairDifference } from "@/lib/cbt/reviewQueue";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ready = { ready: boolean };
const ALL = "__all";
const words = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

function useTestReadiness(enabled: boolean) {
  return useQuery({
    queryKey: ["cbt", "review-readiness"],
    enabled,
    queryFn: async () => {
      const [{ data: roles }, { data: secs }] = await Promise.all([
        supabase.from("cbt_job_roles").select("id, name, code, pool, is_active").order("name"),
        supabase.from("cbt_role_sections").select("*").order("order_index"),
      ]);
      const out: Record<string, { name: string; active: boolean; ready: boolean }> = {};
      await Promise.all((roles ?? []).map(async (r: any) => {
        const sections = (secs ?? []).filter((s: any) => s.job_role_id === r.id);
        if (!sections.length) { out[r.id] = { name: r.name, active: r.is_active, ready: false }; return; }
        const res = await quizRpc<Ready[]>("cbt_blueprint_readiness", { p_pool: r.pool ?? "hiring", p_role_code: r.code, p_sections: sections, p_is_sandbox: false });
        out[r.id] = { name: r.name, active: r.is_active, ready: (res ?? []).every((x) => x.ready) };
      }));
      return out;
    },
  });
}

function Mark({ text, d, side }: { text: string; d: ReturnType<typeof pairDifference>; side: "l" | "r" }) {
  if (!d) return <>{text}</>;
  const end = side === "l" ? d.endL : d.endR;
  return <>{text.slice(0, d.start)}<mark className="rounded bg-warning/30 px-0.5 text-foreground">{text.slice(d.start, end) || "∅"}</mark>{text.slice(end)}</>;
}

function ItemView({ row }: { row: QuestionAnalyticsRow }) {
  const c = row.content ?? {};
  const k = row.answer_key ?? {};
  if (row.type === "mcq") {
    return (
      <div className="space-y-3">
        <p className="whitespace-pre-wrap text-base font-medium">{c.prompt}</p>
        <ul className="space-y-1.5">
          {(c.options ?? []).map((o: any) => {
            const right = o.id === k.correct_option_id;
            return (
              <li key={o.id} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${right ? "border-success bg-success/10 font-medium" : "border-border"}`}>
                <span className="font-mono text-xs uppercase text-muted-foreground">{o.id}</span><span className="flex-1">{o.text}</span>
                {right && <Badge variant="success">Correct</Badge>}
              </li>
            );
          })}
        </ul>
        {k.explanation && <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">Explanation: </span>{k.explanation}</p>}
      </div>
    );
  }
  if (row.type === "numeric") {
    return <div className="space-y-2"><p className="whitespace-pre-wrap text-base font-medium">{c.prompt}</p><p className="text-sm">Answer: <span className="font-mono font-semibold">{k.numeric_answer}</span>{k.numeric_tolerance ? ` ± ${k.numeric_tolerance}` : ""} {c.unit ?? ""}</p>{k.explanation && <p className="text-sm text-muted-foreground">{k.explanation}</p>}</div>;
  }
  if (row.type === "typing_passage") {
    const p = String(c.passage ?? "");
    return <div className="space-y-2"><div className="flex gap-2"><Badge variant="outline">{pretty(String(c.level ?? "intermediate"))}</Badge><Badge variant="outline">{words(p)} words</Badge></div><p className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-sm leading-relaxed">{p}</p></div>;
  }
  if (row.type === "written") {
    const r = k.rubric ?? {};
    const covers: any[] = Array.isArray(r.covers) ? r.covers : Array.isArray(r.criteria) ? r.criteria : [];
    return (
      <div className="space-y-3">
        <p className="whitespace-pre-wrap text-base font-medium">{c.prompt}</p>
        {c.scenario && <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{c.scenario}</p>}
        <p className="text-xs text-muted-foreground">Word limits: {c.min_words ?? "—"} to {c.max_words ?? "—"} · out of {r.max_marks ?? 20}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">A good answer covers</p><ul className="list-disc space-y-1 pl-5 text-sm">{covers.map((x, i) => <li key={i}>{typeof x === "string" ? x : x.point ?? x.name}</li>)}</ul></div>
          <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Must not appear</p><ul className="list-disc space-y-1 pl-5 text-sm">{(r.must_not ?? []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>
        </div>
      </div>
    );
  }
  if (row.type === "data_entry_record") {
    const rec = c.record ?? {};
    return <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-border p-3 text-sm">{Object.entries(rec).map(([f, v]) => <><dt key={`${f}-k`} className="text-muted-foreground">{pretty(f)}</dt><dd key={`${f}-v`} className="font-mono">{String(v)}</dd></>)}</dl>;
  }
  if (row.type === "match_pair") {
    const l = String(c.left ?? ""), r = String(c.right ?? "");
    const d = pairDifference(l, r);
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{c.prompt}</p>
        <p className="rounded-md border border-border p-2 font-mono text-sm"><Mark text={l} d={d} side="l" /></p>
        <p className="rounded-md border border-border p-2 font-mono text-sm"><Mark text={r} d={d} side="r" /></p>
        <p className="text-sm">Key: <span className="font-semibold">{k.pair_is_match ? "Match" : "Not a match"}</span>{d ? " · the difference is highlighted" : " · the two texts are identical"}</p>
        {k.pair_is_match && d && <p className="text-sm text-destructive">Keyed as a match but the texts differ — fix before approving.</p>}
      </div>
    );
  }
  return <pre className="text-xs">{JSON.stringify(c, null, 2)}</pre>;
}

export function QuestionReviewQueue({ open, onOpenChange, rows, subjects, onEdit }: {
  open: boolean; onOpenChange: (o: boolean) => void; rows: QuestionAnalyticsRow[]; subjects: Subject[];
  onEdit: (row: QuestionAnalyticsRow) => void;
}) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const [subject, setSubject] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [queue, setQueue] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const readiness = useTestReadiness(open);

  const pending = useMemo(() => rows.filter((r) => r.status === "needs_review"
    && (subject === ALL || r.category_tag === subject) && (type === ALL || r.type === type)), [rows, subject, type]);
  // the queue is fixed when it opens or the filters change, so approving doesn't reshuffle it
  useEffect(() => {
    if (!open) return;
    setQueue(pending.map((r) => r.question_id)); setPos(0); setDone(new Set());
  }, [open, subject, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const left = queue.filter((id) => !done.has(id));
  const currentId = queue[pos] && !done.has(queue[pos]) ? queue[pos] : left[0];
  const row = rows.find((r) => r.question_id === currentId) ?? null;
  const subjectName = (key: string) => subjects.find((s) => s.key === key)?.display_name ?? pretty(key || "Untagged");

  const advance = useCallback((fromId: string | undefined, markDone: boolean) => {
    setDone((prev) => { const n = new Set(prev); if (markDone && fromId) n.add(fromId); return n; });
    setPos((p) => {
      const start = Math.max(0, queue.indexOf(fromId ?? "") );
      for (let i = 1; i <= queue.length; i++) {
        const j = (start + i) % queue.length;
        if (!(markDone ? new Set([...done, fromId]) : done).has(queue[j])) return j;
      }
      return p;
    });
  }, [queue, done]);

  const act = useMutation({
    mutationFn: async (v: { id: string; action: "approve" | "retire" }) => {
      const before = readiness.data ?? {};
      await quizRpc<string>("cbt_set_question_status", { p_question_id: v.id, p_action: v.action });
      return { v, before };
    },
    onSuccess: async ({ v, before }) => {
      toast({ title: v.action === "approve" ? "Approved" : "Retired" });
      advance(v.id, true);
      void invalidate();
      if (v.action === "approve") {
        const after = (await readiness.refetch()).data ?? {};
        Object.entries(after).forEach(([id, a]) => {
          if (a.ready && before[id] && !before[id].ready) {
            toast({ title: `${a.name} is now ready for real drives`, description: a.active ? undefined : "It is still switched off — turn it on in Tests when you're ready." });
          }
        });
      }
    },
    onError: (e: Error) => toast({ title: "Not changed", description: e.message.replace(/^CONFIRM_RETIRE:\s*/, ""), variant: "destructive" }),
  });

  useEffect(() => {
    if (!open || !row) return;
    // eslint-disable-next-line prefer-const
    let shownAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !isReviewShortcut(e) || act.isPending) return;
      const k = e.key.toLowerCase();
      // QZ7c: A/R act only once the item has been on screen for about a second
      if ((k === "a" || k === "r") && Date.now() - shownAt < 1000) return;
      if (k === "a") { e.preventDefault(); act.mutate({ id: row.question_id, action: "approve" }); }
      else if (k === "e") { e.preventDefault(); onEdit(row); }
      else if (k === "r") { e.preventDefault(); act.mutate({ id: row.question_id, action: "retire" }); }
      else if (k === "s" || e.key === "ArrowRight") { e.preventDefault(); advance(row.question_id, false); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setPos((p) => Math.max(0, p - 1)); }
    };
    shownAt = Date.now();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, row, act, onEdit, advance]);

  const types = Array.from(new Set(rows.filter((r) => r.status === "needs_review").map((r) => r.type)));
  const subjectKeys = Array.from(new Set(rows.filter((r) => r.status === "needs_review").map((r) => r.category_tag)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review queue</DialogTitle>
          <DialogDescription>{left.length ? `${left.length} of ${queue.length} left` : "Nothing left to review with these filters."} · Approving makes an item servable in real drives.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Select value={subject} onValueChange={setSubject}><SelectTrigger className="h-9 w-48 text-foreground" aria-label="Subject"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All subjects</SelectItem>{subjectKeys.map((s) => <SelectItem key={s} value={s}>{subjectName(s)}</SelectItem>)}</SelectContent></Select>
          <Select value={type} onValueChange={setType}><SelectTrigger className="h-9 w-48 text-foreground" aria-label="Type"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All types</SelectItem>{types.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t as ItemType] ?? pretty(t)}</SelectItem>)}</SelectContent></Select>
        </div>
        {!row ? (
          <EmptyState icon={CheckCircle2} title="All reviewed" description="Every item with these filters has been handled." />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{TYPE_LABEL[row.type as ItemType] ?? pretty(row.type)}</Badge>
              <Badge variant="outline">{subjectName(row.category_tag)}</Badge>
              <Badge variant="outline">{pretty(row.difficulty)}</Badge>
              <Badge variant="outline">{POOL_LABEL[row.pool] ?? pretty(row.pool)} pool</Badge>
              <span className="ml-auto text-muted-foreground">Item {queue.indexOf(row.question_id) + 1} of {queue.length}</span>
            </div>
            <div className="rounded-lg border border-border bg-card p-4"><ItemView row={row} /></div>
            <div className="flex flex-wrap items-center gap-2">
              <Button loading={act.isPending && act.variables?.action === "approve"} disabled={act.isPending} onClick={() => act.mutate({ id: row.question_id, action: "approve" })}><CheckCircle2 className="h-4 w-4" />Approve <kbd className="ml-1 rounded border border-primary-foreground/40 px-1 text-[10px]">A</kbd></Button>
              <Button variant="outline" disabled={act.isPending} onClick={() => onEdit(row)}><Pencil className="h-4 w-4" />Edit <kbd className="ml-1 rounded border px-1 text-[10px]">E</kbd></Button>
              <Button variant="outline" className="text-destructive" loading={act.isPending && act.variables?.action === "retire"} disabled={act.isPending} onClick={() => act.mutate({ id: row.question_id, action: "retire" })}><Archive className="h-4 w-4" />Retire <kbd className="ml-1 rounded border px-1 text-[10px]">R</kbd></Button>
              <Button variant="ghost" disabled={act.isPending} onClick={() => advance(row.question_id, false)}><SkipForward className="h-4 w-4" />Skip <kbd className="ml-1 rounded border px-1 text-[10px]">S</kbd></Button>
              <Button variant="ghost" size="sm" disabled={pos === 0} onClick={() => setPos((p) => Math.max(0, p - 1))} aria-label="Previous item"><ChevronLeft className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Shortcuts: A approve · E edit · R retire · S or → skip · ← back. They are ignored while you type or hold Ctrl, Cmd or Alt.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
