import { useMemo, useState } from "react";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Activity, BookOpen, BookOpenCheck, Brain, BriefcaseBusiness, Calculator, ClipboardCheck, FileQuestion,
  Lightbulb, Puzzle, Shapes, SpellCheck,
  Gauge, Keyboard, ListChecks, Pencil, Plus, Search, Settings, ShieldCheck, Table2, Trash2, Users,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { QuestionBankWorkspace } from "@/components/hrms/quiz/QuestionBankWorkspace";
import { QuizOverview } from "@/components/hrms/quiz/QuizOverview";
import { QuizDrives } from "@/components/hrms/quiz/QuizDrives";
import { QuizResults } from "@/components/hrms/quiz/QuizResults";
import { QuizSettings } from "@/components/hrms/quiz/QuizSettings";
import { QuizTests } from "@/components/hrms/quiz/QuizTests";


type QuizView = "overview" | "drives" | "results" | "grading" | "tests" | "questions" | "settings";
type EvaluationRow = {
  id: string;
  attempt_item_id: string;
  total: number | null;
  comments: string | null;
  updated_at: string;
  cbt_attempt_items?: {
    response?: { text?: string } | null;
    cbt_question_versions?: { content?: { prompt?: string; marks?: number } | null } | null;
  } | null;
};
const views: QuizView[] = ["overview", "drives", "results", "grading", "tests", "questions", "settings"];
// Old ?view= links keep landing on the right place.
const LEGACY_VIEWS: Record<string, QuizView> = { dashboard: "overview", attempts: "results", evaluations: "grading", skills: "tests", roles: "tests" };

const statusVariant = (status: string) => {
  if (["live", "submitted", "auto_submitted", "shortlisted", "approved"].includes(status)) return "success" as const;
  if (["in_progress", "pending_evaluation", "needs_review", "hold"].includes(status)) return "warning" as const;
  if (["invalidated", "rejected", "retired", "closed"].includes(status)) return "destructive-soft" as const;
  return "muted" as const;
};

const pretty = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (value?: string | null) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "—";

export default function QuizDashboardPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasAnyPermission } = usePermissions();
  const [params, setParams] = useSearchParams();
  const rawView = params.get("view") ?? "";
  const activeView: QuizView = views.includes(rawView as QuizView) ? (rawView as QuizView) : LEGACY_VIEWS[rawView] ?? "overview";
  const driveId = params.get("drive");
  const canManage = hasAnyPermission(["hrms_quiz_manage", "hrms_quiz_admin"]);
  const canAdmin = hasAnyPermission(["hrms_quiz_admin"]);
  const canEvaluate = hasAnyPermission(["hrms_quiz_evaluate", "hrms_quiz_manage", "hrms_quiz_admin"]);
  // Evaluate-only people (no view/manage/admin) see Grading only — blind, nothing else.
  const canView = hasAnyPermission(["hrms_quiz_view", "hrms_quiz_manage", "hrms_quiz_admin"]);
  const visibleView: QuizView = canView ? activeView : "grading";
  const [gradingRow, setGradingRow] = useState<EvaluationRow | null>(null);
  const [gradingForm, setGradingForm] = useState({ score: "", comments: "" });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cbt", "staff-workspace", canView],
    queryFn: async () => {
      if (!canView) {
        const ev = await supabase.from("cbt_written_evaluations").select("*, cbt_attempt_items(response, cbt_question_versions(content))").order("created_at", { ascending: false }).limit(100);
        if (ev.error) throw ev.error;
        return { drives: [], candidates: [], attempts: [], questions: [], roles: [], roleSections: [], departments: [], evaluations: ev.data ?? [], settings: null, positions: [] } as any;
      }
      const [drives, candidates, attempts, questions, roles, roleSections, departments, evaluations, settingsRow, positions] = await Promise.all([
        supabase.from("cbt_drives").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("cbt_candidates").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("cbt_attempts").select("*, cbt_candidates(full_name), cbt_job_roles(name), cbt_drives(name)").order("created_at", { ascending: false }).limit(100),
        fetchAllPaginated<any>(() => supabase.from("cbt_questions").select("*").order("created_at", { ascending: false }).order("id", { ascending: false })).then((rows) => ({ data: rows, error: null }), (error) => ({ data: null, error })),
        supabase.from("cbt_job_roles").select("*, positions(id, title, is_active, departments:department_id(code, name))").order("name").limit(100),
        supabase.from("cbt_role_sections").select("*").order("order_index"),
        supabase.from("cbt_departments").select("*").order("name"),
        supabase.from("cbt_written_evaluations").select("*, cbt_attempt_items(response, cbt_question_versions(content))").order("created_at", { ascending: false }).limit(100),
        supabase.from("cbt_settings").select("*").eq("id", true).maybeSingle(),
        supabase.from("positions").select("id, title, is_active, departments:department_id(code, name)").eq("is_active", true).order("title"),
      ]);
      const errors = [drives.error, candidates.error, attempts.error, questions.error, roles.error, roleSections.error, departments.error, evaluations.error, settingsRow.error, positions.error].filter(Boolean);
      if (errors.length) throw errors[0];
      return {
        drives: drives.data ?? [], candidates: candidates.data ?? [], attempts: attempts.data ?? [],
        questions: questions.data ?? [], roles: roles.data ?? [], roleSections: roleSections.data ?? [], departments: departments.data ?? [],
        evaluations: evaluations.data ?? [], settings: settingsRow.data, positions: positions.data ?? [],
      };
    },
  });

  const gradeResponse = useMutation({
    mutationFn: async () => {
      if (!gradingRow) throw new Error("Select a written response to grade.");
      const score = Number(gradingForm.score);
      if (!Number.isFinite(score) || score < 0 || score > 20) throw new Error("Enter a score from 0 to 20.");
      const { error } = await supabase.rpc("cbt_grade_written_response", {
        p_evaluation_id: gradingRow.id,
        p_total: score,
        p_comments: gradingForm.comments.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cbt", "staff-workspace"] });
      setGradingRow(null);
      setGradingForm({ score: "", comments: "" });
      toast({ title: "Written response graded" });
    },
    onError: (error: Error) => toast({ title: "Response not graded", description: error.message, variant: "destructive" }),
  });

  const openGrading = (row: EvaluationRow) => {
    setGradingRow(row);
    setGradingForm({ score: row.total === null ? "" : String(row.total), comments: row.comments ?? "" });
  };

  const changeView = (value: string) => setParams(value === "overview" ? {} : { view: value });
  const openDrive = (id: string | null) => setParams(id ? { view: "drives", drive: id } : { view: "drives" });

  const noData = (icon: typeof Users, title: string, description: string, action?: React.ReactNode) => (
    <div className="rounded-lg border border-border bg-card"><EmptyState icon={icon} title={title} description={description} action={action} /></div>
  );

  return (
    <div className="page-mount space-y-5 p-2 sm:p-3 md:p-0">
      <PageHeader title="Quiz" description="Role-based candidate screening, scoring, evaluation, and test administration." />

      <Tabs value={visibleView} onValueChange={changeView}>
        {canView ? (
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="drives">Drives</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger><TabsTrigger value="grading">Grading</TabsTrigger>
            <TabsTrigger value="tests">Tests</TabsTrigger><TabsTrigger value="questions">Question bank</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        ) : (
          <TabsList className="w-full justify-start"><TabsTrigger value="grading">Grading</TabsTrigger></TabsList>
        )}

        {canView && <><TabsContent value="overview" className="space-y-5">
          <QuizOverview onOpenDrive={(id) => openDrive(id)} onOpenView={changeView} />
        </TabsContent>

        <TabsContent value="drives" className="space-y-4">
          <QuizDrives tests={(data?.roles ?? []) as any} canManage={canManage} driveId={driveId} onOpenDrive={openDrive} />
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          <QuizResults drives={(data?.drives ?? []).map((d: any) => ({ id: d.id, name: d.name }))} tests={(data?.roles ?? []).map((r: any) => ({ id: r.id, name: r.name }))} canManage={canManage} />
        </TabsContent></>}

        <TabsContent value="grading" className="space-y-4"><div><h2 className="text-lg font-semibold">Blind written evaluations</h2><p className="text-sm text-muted-foreground">Written responses are graded without exposing candidate identity.</p></div>{!canEvaluate ? noData(ShieldCheck, "Evaluation permission required", "Ask a Quiz administrator for evaluator access.") : !data?.evaluations.length ? noData(ClipboardCheck, "No responses await grading", "Submitted written responses will enter this queue automatically.") : <div className="grid gap-3">{(data.evaluations as EvaluationRow[]).map((row) => { const prompt = row.cbt_attempt_items?.cbt_question_versions?.content?.prompt ?? "Written response"; const answer = row.cbt_attempt_items?.response?.text?.trim() || "No answer submitted"; return <Card key={row.id}><CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><p className="text-sm font-medium">{prompt}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{answer}</p><div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant={row.total === null ? "warning" : "success"}>{row.total === null ? "Awaiting grading" : `${row.total}/20`}</Badge><span className="text-xs text-muted-foreground">Updated {fmtDate(row.updated_at)}</span></div></div><Button variant={row.total === null ? "default" : "outline"} onClick={() => openGrading(row)}>{row.total === null ? "Grade response" : "Review grade"}</Button></CardContent></Card>; })}</div>}
        </TabsContent>

        {canView && <><TabsContent value="questions" className="space-y-4"><div><h2 className="text-lg font-semibold">Question bank</h2><p className="text-sm text-muted-foreground">Hiring and Staff pools never mix; skill-drill content can be Shared. Only Approved items are served (sandbox drives may also use Needs review).</p></div><QuestionBankWorkspace canManage={canManage} roleCodes={(data?.roles ?? []).map((r: any) => ({ code: r.code, name: r.name }))} />
        </TabsContent>

        <TabsContent value="tests" className="space-y-8">
          <QuizTests roles={(data?.roles ?? []) as any[]} roleSections={(data?.roleSections ?? []) as any[]} positions={(data?.positions ?? []) as any[]} canManage={canManage} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4"><div><h2 className="text-lg font-semibold">Quiz settings</h2><p className="text-sm text-muted-foreground">Company details, candidate-session timing, warnings and retention. Every change is recorded.</p></div><QuizSettings settings={data?.settings ?? null} canAdmin={canAdmin} /></TabsContent></>}
      </Tabs>



      <Dialog open={Boolean(gradingRow)} onOpenChange={(open) => !open && setGradingRow(null)}><DialogContent><DialogHeader><DialogTitle>Grade written response</DialogTitle><DialogDescription>Candidate identity is hidden during evaluation.</DialogDescription></DialogHeader>{gradingRow && <div className="grid gap-4"><div className="rounded-lg border border-border bg-muted/30 p-3"><p className="text-sm font-medium">{gradingRow.cbt_attempt_items?.cbt_question_versions?.content?.prompt ?? "Written response"}</p><p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{gradingRow.cbt_attempt_items?.response?.text?.trim() || "No answer submitted"}</p></div><div><Label htmlFor="written-score">Score out of 20</Label><Input id="written-score" type="number" min="0" max="20" step="0.5" inputMode="decimal" value={gradingForm.score} onChange={(event) => setGradingForm((value) => ({ ...value, score: event.target.value }))} /></div><div><Label htmlFor="written-comments">Evaluator comments</Label><Textarea id="written-comments" value={gradingForm.comments} onChange={(event) => setGradingForm((value) => ({ ...value, comments: event.target.value }))} placeholder="Optional internal comments" /></div></div>}<DialogFooter><Button variant="outline" onClick={() => setGradingRow(null)}>Cancel</Button><Button loading={gradeResponse.isPending} disabled={!gradingForm.score} onClick={() => gradeResponse.mutate()}>Save grade</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}