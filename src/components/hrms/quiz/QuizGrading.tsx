import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, ChevronLeft, ChevronRight, ClipboardCheck, Sparkles, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { fmtIst, quizRpc, useInvalidateQuiz } from "./quizShared";

export type GradingCounts = { needs_check: number; ai_pending: number; ai_graded: number; human: number; ai_this_month: number; ai_today: number };
type Row = {
  id: string; state: "needs_check" | "ai_pending" | "ai_graded" | "human"; created_at: string; updated_at: string;
  prompt: string | null; scenario: string | null; rubric: any; min_words: string | null; max_words: string | null; answer: string;
  total: number | null; comments: string | null; graded_by_kind: "ai" | "human" | null; ai_status: string; ai_model: string | null;
  ai_result: any; ai_suggested_total: number | null; ai_route_reason: string | null; ai_last_error: string | null; ai_graded_at: string | null;
};
type Tab = "needs_check" | "ai_graded" | "human";
const TABS: { key: Tab; label: string; icon: typeof Bot }[] = [
  { key: "needs_check", label: "Needs a check", icon: AlertTriangle },
  { key: "ai_graded", label: "AI graded", icon: Bot },
  { key: "human", label: "Graded by HR", icon: UserCheck },
];
const FLAG_LABEL: Record<string, string> = {
  off_topic: "Off-topic", copies_question: "Mostly copies the question", too_short: "Too short", not_english: "Not in English",
  inappropriate: "Inappropriate", breaks_must_not: "Breaks a must-not rule", instructs_grader: "Tries to instruct the grader",
};
const words = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

export function useGradingCounts(enabled: boolean) {
  return useQuery({ queryKey: ["cbt", "grading-counts"], queryFn: () => quizRpc<GradingCounts>("cbt_grading_counts"), enabled, refetchInterval: 30_000, retry: false });
}

function Guide({ rubric }: { rubric: any }) {
  const covers: string[] = (Array.isArray(rubric?.covers) ? rubric.covers : Array.isArray(rubric?.criteria) ? rubric.criteria : [])
    .map((c: any) => (typeof c === "string" ? c : c?.point ?? c?.name ?? "")).filter(Boolean);
  const mustNot: string[] = Array.isArray(rubric?.must_not) ? rubric.must_not : [];
  if (!covers.length && !mustNot.length) return <p className="text-sm text-muted-foreground">No marking guide — graded against the question and word limits.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {covers.length > 0 && <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">A good answer covers</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{covers.map((c) => <li key={c}>{c}</li>)}</ul></div>}
      {mustNot.length > 0 && <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Must not appear</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-destructive">{mustNot.map((c) => <li key={c}>{c}</li>)}</ul></div>}
      {rubric?.max_marks && <p className="text-xs text-muted-foreground sm:col-span-2">Guide is out of {rubric.max_marks}; every grade is stored out of 20.</p>}
    </div>
  );
}

export function QuizGrading({ counts }: { counts?: GradingCounts }) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const [tab, setTab] = useState<Tab>("needs_check");
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");
  const { data: rows = [], isLoading, isError } = useQuery({
    queryKey: ["cbt", "grading", tab],
    queryFn: () => quizRpc<Row[]>("cbt_grading_queue", { p_tab: tab }),
    refetchInterval: 30_000,
  });
  const list = useMemo(() => rows.filter((r) => tab !== "needs_check" || r.state !== "ai_pending").concat(tab === "needs_check" ? rows.filter((r) => r.state === "ai_pending") : []), [rows, tab]);
  const row = list[Math.min(idx, Math.max(0, list.length - 1))];
  useEffect(() => { setIdx(0); }, [tab]);
  useEffect(() => {
    setScore(row?.total != null ? String(row.total) : row?.ai_suggested_total != null ? String(row.ai_suggested_total) : "");
    setComment(row?.comments ?? "");
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = useMutation({
    mutationFn: (acceptAi: boolean) => {
      const n = Number(score);
      if (!acceptAi && (!Number.isFinite(n) || n < 0 || n > 20 || n * 2 !== Math.round(n * 2))) throw new Error("Enter a score from 0 to 20 in steps of 0.5.");
      return quizRpc("cbt_grade_written_response", { p_evaluation_id: row!.id, p_total: acceptAi ? row!.ai_suggested_total : n, p_comments: comment.trim() || null, p_accept_ai: acceptAi });
    },
    onSuccess: (_d, acceptAi) => { toast({ title: acceptAi ? "AI grade accepted" : "Grade saved" }); void invalidate(); },
    onError: (e: Error) => toast({ title: "Not saved", description: e.message, variant: "destructive" }),
  });

  const canAccept = !!row && row.ai_suggested_total != null && row.total == null;
  // an answer with the AI for over 5 minutes may be graded by a person (a person's grade wins if the AI finishes later)
  const pending = row?.state === "ai_pending" && Date.now() - new Date(row.updated_at).getTime() < 5 * 60_000;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const editable = t && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable || t.getAttribute?.("role") === "combobox");
      if (editable) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && row && !pending) grade.mutate(false); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "j" || e.key === "s") setIdx((i) => Math.min(i + 1, list.length - 1));
      else if (e.key === "ArrowLeft" || e.key === "k") setIdx((i) => Math.max(i - 1, 0));
      else if (e.key === "a" && canAccept && !pending) grade.mutate(true);
      else if (e.key === "g") document.getElementById("grade-score")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list.length, canAccept, pending, row, grade]);

  const ai = row?.ai_result;
  const flags: string[] = Array.isArray(ai?.flags) ? ai.flags : [];
  const countOf = (k: Tab) => counts ? (k === "needs_check" ? counts.needs_check : counts[k]) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Grading</h2><p className="text-sm text-muted-foreground">AI grades written answers; you check only the flagged ones. Candidate identity is never shown.</p></div>
        {counts && <p className="text-xs text-muted-foreground">AI gradings: {counts.ai_today} today · {counts.ai_this_month} this month{counts.ai_pending ? ` · ${counts.ai_pending} being graded now` : ""}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "default" : "outline"} onClick={() => setTab(t.key)}>
            <t.icon className="mr-1.5 h-4 w-4" />{t.label}{countOf(t.key) != null && <Badge variant={tab === t.key ? "secondary" : "muted"} className="ml-2">{countOf(t.key)}</Badge>}
          </Button>
        ))}
      </div>

      {isError ? <p className="text-sm text-destructive">The grading list could not be loaded.</p>
        : isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : !row ? <div className="rounded-lg border border-border bg-card"><EmptyState icon={ClipboardCheck} title={tab === "needs_check" ? "Nothing needs a check" : "Nothing here yet"} description={tab === "needs_check" ? "Answers the AI is unsure about, or that hit a flag, will appear here." : "Graded answers appear here."} /></div>
        : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Card><CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Answer {Math.min(idx, list.length - 1) + 1} of {list.length} · submitted {fmtIst(row.created_at)}</span>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" aria-label="Previous" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Next" disabled={idx >= list.length - 1} onClick={() => setIdx((i) => Math.min(list.length - 1, i + 1))}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
                <p className="font-medium">{row.prompt ?? "Written question"}</p>
                {row.scenario && <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{row.scenario}</p>}
                <p className="text-xs text-muted-foreground">Word limits: {row.min_words ?? "—"}–{row.max_words ?? "—"}</p>
              </CardContent></Card>
              <Card><CardContent className="space-y-2 p-4"><p className="text-sm font-medium">Marking guide</p><Guide rubric={row.rubric} /></CardContent></Card>
              <Card><CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between"><p className="text-sm font-medium">Answer</p><span className="text-xs text-muted-foreground">{words(row.answer)} words</span></div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{row.answer.trim() || "No answer submitted"}</p>
              </CardContent></Card>
            </div>

            <div className="space-y-4">
              <Card><CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="text-sm font-medium">AI view</p>
                  {row.ai_model && <span className="ml-auto font-mono text-[11px] text-muted-foreground">{row.ai_model}</span>}</div>
                {pending ? <p className="text-sm text-muted-foreground">The AI is grading this answer.</p>
                  : row.ai_status === "unavailable" && !ai ? <Badge variant="warning">AI unavailable{row.ai_last_error ? ` — ${row.ai_last_error}` : ""}</Badge>
                  : ai ? (
                    <>
                      <div className="flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums">{row.ai_suggested_total ?? ai.total_20}</span><span className="text-sm text-muted-foreground">/ 20</span>
                        {ai.confidence != null && <span className="ml-auto text-xs text-muted-foreground">confidence {Math.round(Number(ai.confidence) * 100)}%</span>}</div>
                      {row.ai_route_reason && <p className="text-xs text-warning">{row.ai_route_reason}</p>}
                      {flags.length > 0 && <div className="flex flex-wrap gap-1">{flags.map((f) => <Badge key={f} variant="destructive-soft">{FLAG_LABEL[f] ?? f}</Badge>)}</div>}
                      {Array.isArray(ai.points) && ai.points.length > 0 && <ul className="space-y-1.5 text-sm">{ai.points.map((p: any, i: number) => (
                        <li key={i} className="border-b border-border/60 pb-1.5"><div className="flex justify-between gap-2"><span className="font-medium">{p.point}</span><span className="shrink-0 tabular-nums">{p.score}/{p.max}</span></div><p className="text-xs text-muted-foreground">{p.reason}</p></li>
                      ))}</ul>}
                      {Array.isArray(ai.must_not_broken) && ai.must_not_broken.length > 0 && <p className="text-xs text-destructive">Broke: {ai.must_not_broken.join("; ")}</p>}
                      {ai.summary && <p className="text-sm italic text-muted-foreground">{ai.summary}</p>}
                    </>
                  ) : <p className="text-sm text-muted-foreground">No AI grade.</p>}
              </CardContent></Card>

              <Card><CardContent className="space-y-3 p-4">
                {row.total != null && <p className="text-sm">Current grade <span className="font-semibold tabular-nums">{row.total}/20</span> · {row.graded_by_kind === "ai" ? "applied by AI" : "by HR"} · {fmtIst(row.updated_at)}</p>}
                <div><Label htmlFor="grade-score">Score out of 20</Label>
                  <Input id="grade-score" inputMode="decimal" className="text-foreground" value={score} disabled={pending} onChange={(e) => setScore(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0–20, steps of 0.5" /></div>
                <div><Label htmlFor="grade-comment">Comment (optional)</Label>
                  <Textarea id="grade-comment" rows={2} className="text-foreground" value={comment} disabled={pending} onChange={(e) => setComment(e.target.value)} /></div>
                <div className="flex flex-wrap gap-2">
                  {canAccept && <Button disabled={pending} loading={grade.isPending && grade.variables === true} onClick={() => grade.mutate(true)}>Accept AI grade</Button>}
                  <Button variant={canAccept ? "outline" : "default"} disabled={pending || !score} loading={grade.isPending && grade.variables === false} onClick={() => grade.mutate(false)}>{row.total != null ? "Change score" : "Save score"}</Button>
                  <Button variant="ghost" disabled={idx >= list.length - 1} onClick={() => setIdx((i) => i + 1)}>Skip</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Keys: A accept · G score · Ctrl+Enter save · ←/→ previous/next · S skip</p>
              </CardContent></Card>
            </div>
          </div>
        )}
    </div>
  );
}
