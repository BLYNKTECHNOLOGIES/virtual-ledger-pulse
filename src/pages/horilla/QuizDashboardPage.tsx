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
import { QuizGrading, useGradingCounts } from "@/components/hrms/quiz/QuizGrading";


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
  const { data: gradingCounts } = useGradingCounts(canEvaluate);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cbt", "staff-workspace", canView],
    queryFn: async () => {
      if (!canView) {
        // grading-only people read answers through cbt_grading_queue (blind); nothing else is loaded
        return { drives: [], candidates: [], attempts: [], questions: [], roles: [], roleSections: [], departments: [], evaluations: [], settings: null, positions: [] } as any;
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
            <TabsTrigger value="results">Results</TabsTrigger><TabsTrigger value="grading">Grading{gradingCounts?.needs_check ? <Badge variant="warning" className="ml-1.5 px-1.5">{gradingCounts.needs_check}</Badge> : null}</TabsTrigger>
            <TabsTrigger value="tests">Tests</TabsTrigger><TabsTrigger value="questions">Question bank</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        ) : (
          <TabsList className="w-full justify-start"><TabsTrigger value="grading">Grading{gradingCounts?.needs_check ? <Badge variant="warning" className="ml-1.5 px-1.5">{gradingCounts.needs_check}</Badge> : null}</TabsTrigger></TabsList>
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

        <TabsContent value="grading" className="space-y-4">{!canEvaluate ? noData(ShieldCheck, "Grading permission required", "Ask a Quiz administrator for grader access.") : <QuizGrading counts={gradingCounts} />}</TabsContent>

        {canView && <><TabsContent value="questions" className="space-y-4"><div><h2 className="text-lg font-semibold">Question bank</h2><p className="text-sm text-muted-foreground">Hiring and Staff pools never mix; skill-drill content can be Shared. Only Approved items are served (sandbox drives may also use Needs review).</p></div><QuestionBankWorkspace canManage={canManage} roleCodes={(data?.roles ?? []).map((r: any) => ({ code: r.code, name: r.name }))} />
        </TabsContent>

        <TabsContent value="tests" className="space-y-8">
          <QuizTests roles={(data?.roles ?? []) as any[]} roleSections={(data?.roleSections ?? []) as any[]} positions={(data?.positions ?? []) as any[]} canManage={canManage} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4"><div><h2 className="text-lg font-semibold">Quiz settings</h2><p className="text-sm text-muted-foreground">Company details, candidate-session timing, warnings and retention. Every change is recorded.</p></div><QuizSettings settings={data?.settings ?? null} canAdmin={canAdmin} canGrade={canEvaluate} /></TabsContent></>}
      </Tabs>




    </div>
  );
}