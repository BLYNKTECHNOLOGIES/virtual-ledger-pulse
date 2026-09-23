import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, BookOpenCheck, ChevronDown, ChevronRight, CircleHelp, Search, Target, TrendingDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { supabase } from "@/integrations/supabase/client";

export type QuestionAnalyticsRow = {
  question_id: string;
  type: string;
  category_tag: string;
  difficulty: string;
  status: string;
  times_served: number | null;
  applicable_role_codes: string[] | null;
  created_at: string;
  version_no: number | null;
  prompt: string | null;
  marks: number | null;
  options: { id?: string; text?: string }[] | null;
  correct_option_id: string | null;
  numeric_answer: number | null;
  explanation: string | null;
  served_items: number;
  answered_items: number;
  correct_items: number;
  wrong_items: number;
  skipped_items: number;
  accuracy: number | null;
  avg_marks: number | null;
  last_served_at: string | null;
  option_tally: Record<string, number> | null;
};

const pretty = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value))
    : "—";

const statusVariant = (status: string) => {
  if (status === "approved") return "success" as const;
  if (status === "needs_review" || status === "draft") return "warning" as const;
  if (status === "retired") return "destructive-soft" as const;
  return "muted" as const;
};

const difficultyVariant = (difficulty: string) => {
  if (difficulty === "easy") return "success" as const;
  if (difficulty === "medium") return "warning" as const;
  return "destructive-soft" as const;
};

// Accuracy colouring — how hard candidates find the question.
const accuracyTone = (accuracy: number | null) => {
  if (accuracy === null) return "text-muted-foreground";
  if (accuracy < 40) return "text-destructive font-semibold";
  if (accuracy < 70) return "text-warning font-medium";
  return "text-success font-medium";
};

type SortKey = "hardest" | "most_served" | "newest" | "alphabetical";

export function QuestionBankWorkspace({ onAddQuestion }: { onAddQuestion?: () => void }) {
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("__all");
  const [difficulty, setDifficulty] = useState("__all");
  const [status, setStatus] = useState("__all");
  const [sort, setSort] = useState<SortKey>("hardest");
  const [openSubjects, setOpenSubjects] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<QuestionAnalyticsRow | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["cbt", "question-bank-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cbt_question_bank_analytics" as never);
      if (error) throw error;
      return (data ?? []) as unknown as QuestionAnalyticsRow[];
    },
  });

  const rows = data ?? [];

  const subjects = useMemo(
    () => Array.from(new Set(rows.map((row) => row.category_tag).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (subject !== "__all" && row.category_tag !== subject) return false;
      if (difficulty !== "__all" && row.difficulty !== difficulty) return false;
      if (status !== "__all" && row.status !== status) return false;
      if (!needle) return true;
      return [row.prompt, row.category_tag, row.type, row.explanation]
        .some((value) => String(value ?? "").toLowerCase().includes(needle));
    });
  }, [rows, search, subject, difficulty, status]);

  const sortRows = (list: QuestionAnalyticsRow[]) =>
    [...list].sort((a, b) => {
      if (sort === "most_served") return (b.served_items ?? 0) - (a.served_items ?? 0);
      if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === "alphabetical") return (a.prompt ?? "").localeCompare(b.prompt ?? "");
      // hardest first: unanswered questions sink to the bottom
      const aAcc = a.answered_items ? (a.accuracy ?? 0) : 1000;
      const bAcc = b.answered_items ? (b.accuracy ?? 0) : 1000;
      if (aAcc !== bAcc) return aAcc - bAcc;
      return (b.served_items ?? 0) - (a.served_items ?? 0);
    });

  const bySubject = useMemo(() => {
    const groups = new Map<string, QuestionAnalyticsRow[]>();
    filtered.forEach((row) => {
      const key = row.category_tag || "Untagged";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    });
    return Array.from(groups.entries())
      .map(([name, list]) => {
        const answered = list.reduce((sum, row) => sum + row.answered_items, 0);
        const correct = list.reduce((sum, row) => sum + row.correct_items, 0);
        const wrong = list.reduce((sum, row) => sum + row.wrong_items, 0);
        const skipped = list.reduce((sum, row) => sum + row.skipped_items, 0);
        const served = list.reduce((sum, row) => sum + row.served_items, 0);
        return {
          name,
          questions: sortRows(list),
          total: list.length,
          approved: list.filter((row) => row.status === "approved").length,
          pending: list.filter((row) => row.status !== "approved").length,
          served,
          answered,
          correct,
          wrong,
          skipped,
          accuracy: answered ? Math.round((1000 * correct) / answered) / 10 : null,
          easy: list.filter((row) => row.difficulty === "easy").length,
          medium: list.filter((row) => row.difficulty === "medium").length,
          hard: list.filter((row) => row.difficulty === "hard").length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered, sort]);

  const weakest = useMemo(
    () =>
      filtered
        .filter((row) => row.answered_items > 0)
        .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || b.wrong_items - a.wrong_items)
        .slice(0, 8),
    [filtered],
  );

  const totals = useMemo(() => {
    const answered = filtered.reduce((sum, row) => sum + row.answered_items, 0);
    const correct = filtered.reduce((sum, row) => sum + row.correct_items, 0);
    return {
      questions: filtered.length,
      subjects: new Set(filtered.map((row) => row.category_tag || "Untagged")).size,
      answered,
      accuracy: answered ? Math.round((1000 * correct) / answered) / 10 : null,
      unserved: filtered.filter((row) => row.served_items === 0).length,
      pending: filtered.filter((row) => row.status !== "approved").length,
    };
  }, [filtered]);

  if (isError) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          icon={AlertTriangle}
          title="Question analytics could not be loaded"
          description={(error as Error)?.message ?? "Please try again."}
        />
      </div>
    );
  }

  if (!isLoading && !rows.length) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          icon={CircleHelp}
          title="Question bank is empty"
          description="Add approved questions; unapproved questions are never served to candidates."
          action={onAddQuestion ? <Button onClick={onAddQuestion}>Add question</Button> : undefined}
        />
      </div>
    );
  }

  const summary = [
    { label: "Questions", value: totals.questions, hint: `${totals.subjects} subjects` },
    { label: "Answers recorded", value: totals.answered, hint: "across all attempts" },
    { label: "Overall accuracy", value: totals.accuracy === null ? "—" : `${totals.accuracy}%`, hint: "correct of answered" },
    { label: "Never served", value: totals.unserved, hint: `${totals.pending} awaiting approval` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold tabular-nums">{isLoading ? "—" : card.value}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search question text or subject" className="pl-9 text-foreground" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="w-[190px] text-foreground"><SelectValue placeholder="Subject" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All subjects</SelectItem>
              {subjects.map((tag) => <SelectItem key={tag} value={tag}>{pretty(tag)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger className="w-[150px] text-foreground"><SelectValue placeholder="Difficulty" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All difficulty</SelectItem>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px] text-foreground"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All statuses</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="needs_review">Needs review</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
            <SelectTrigger className="w-[190px] text-foreground"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hardest">Most wrong first</SelectItem>
              <SelectItem value="most_served">Most served first</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="alphabetical">A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {weakest.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <h3 className="font-semibold">Where candidates go wrong most</h3>
            </div>
            <div className="space-y-2">
              {weakest.map((row) => (
                <button
                  key={row.question_id}
                  onClick={() => setDetail(row)}
                  className="flex w-full flex-col gap-1 rounded-md border border-border p-3 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium">{row.prompt ?? "(no text)"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {pretty(row.category_tag || "Untagged")} · {pretty(row.difficulty)} · {row.answered_items} answered · {row.wrong_items} wrong
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm tabular-nums ${accuracyTone(row.accuracy)}`}>{row.accuracy}% correct</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {bySubject.map((group) => {
          const open = openSubjects[group.name] ?? false;
          return (
            <Card key={group.name}>
              <CardContent className="p-0">
                <button
                  className="flex w-full flex-col gap-3 p-4 text-left md:flex-row md:items-center md:justify-between"
                  onClick={() => setOpenSubjects((prev) => ({ ...prev, [group.name]: !open }))}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <BookOpenCheck className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{pretty(group.name)}</p>
                        <Badge variant="muted">{group.total} question{group.total === 1 ? "" : "s"}</Badge>
                        {group.pending > 0 && <Badge variant="warning">{group.pending} awaiting approval</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {group.easy} easy · {group.medium} medium · {group.hard} hard · served {group.served} time{group.served === 1 ? "" : "s"} · {group.answered} answered · {group.wrong} wrong · {group.skipped} skipped
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-40">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Accuracy</span>
                        <span className={`tabular-nums ${accuracyTone(group.accuracy)}`}>{group.accuracy === null ? "No data" : `${group.accuracy}%`}</span>
                      </div>
                      <Progress value={group.accuracy ?? 0} className="mt-1 h-2" />
                    </div>
                    {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                {open && (
                  <div className="border-t border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Question</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Difficulty</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead numeric>Served</TableHead>
                          <TableHead numeric>Answered</TableHead>
                          <TableHead numeric>Wrong</TableHead>
                          <TableHead numeric>Accuracy</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.questions.map((row) => (
                          <TableRow key={row.question_id} className="cursor-pointer" onClick={() => setDetail(row)}>
                            <TableCell className="max-w-[420px]">
                              <p className="line-clamp-2 font-medium">{row.prompt ?? "(no text)"}</p>
                            </TableCell>
                            <TableCell>{pretty(row.type)}</TableCell>
                            <TableCell><Badge variant={difficultyVariant(row.difficulty)}>{pretty(row.difficulty)}</Badge></TableCell>
                            <TableCell><Badge variant={statusVariant(row.status)}>{pretty(row.status)}</Badge></TableCell>
                            <TableCell numeric>{row.served_items}</TableCell>
                            <TableCell numeric>{row.answered_items}</TableCell>
                            <TableCell numeric>{row.wrong_items}</TableCell>
                            <TableCell numeric className={accuracyTone(row.accuracy)}>{row.accuracy === null ? "—" : `${row.accuracy}%`}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!isLoading && !bySubject.length && (
          <div className="rounded-lg border border-border bg-card">
            <EmptyState icon={Search} title="No questions match these filters" description="Clear the search or filters to see the full bank." />
          </div>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Question detail</DialogTitle>
            <DialogDescription>
              {detail ? `${pretty(detail.category_tag || "Untagged")} · ${pretty(detail.type)} · ${pretty(detail.difficulty)} · version ${detail.version_no ?? 1}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <p className="whitespace-pre-wrap text-sm font-medium">{detail.prompt ?? "(no text)"}</p>

              {Array.isArray(detail.options) && detail.options.length > 0 && (
                <div className="space-y-2">
                  {detail.options.map((option, index) => {
                    const id = option.id ?? String(index);
                    const picks = detail.option_tally?.[id] ?? 0;
                    const totalPicks = Object.values(detail.option_tally ?? {}).reduce((sum, value) => sum + value, 0);
                    const share = totalPicks ? Math.round((100 * picks) / totalPicks) : 0;
                    const isCorrect = detail.correct_option_id === id;
                    return (
                      <div key={id} className={`rounded-md border p-3 ${isCorrect ? "border-success bg-success/5" : "border-border"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm"><span className="font-mono uppercase text-muted-foreground">{id}.</span> {option.text}</p>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{picks} pick{picks === 1 ? "" : "s"} · {share}%</span>
                        </div>
                        <Progress value={share} className="mt-2 h-1.5" />
                        {isCorrect && <p className="mt-1 text-xs font-medium text-success">Correct answer</p>}
                      </div>
                    );
                  })}
                </div>
              )}

              {detail.numeric_answer !== null && (
                <p className="text-sm"><span className="text-muted-foreground">Correct numeric answer: </span><span className="font-medium tabular-nums">{detail.numeric_answer}</span></p>
              )}

              {detail.explanation && (
                <div className="rounded-md border border-border bg-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Explanation</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{detail.explanation}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Served", value: detail.served_items },
                  { label: "Answered", value: detail.answered_items },
                  { label: "Correct", value: detail.correct_items },
                  { label: "Wrong", value: detail.wrong_items },
                  { label: "Skipped", value: detail.skipped_items },
                  { label: "Accuracy", value: detail.accuracy === null ? "—" : `${detail.accuracy}%` },
                  { label: "Avg marks", value: detail.avg_marks ?? "—" },
                  { label: "Marks", value: detail.marks ?? "—" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-md border border-border p-3">
                    <p className="text-lg font-semibold tabular-nums">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={statusVariant(detail.status)}>{pretty(detail.status)}</Badge>
                <span className="inline-flex items-center gap-1"><Target className="h-3 w-3" />{detail.applicable_role_codes?.length ? detail.applicable_role_codes.join(", ") : "All roles"}</span>
                <span>Added {fmtDate(detail.created_at)}</span>
                <span>Last served {fmtDate(detail.last_served_at)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
