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
type SkillLevel = "beginner" | "intermediate" | "advanced";
type SectionType = "typing" | "data_entry" | "match_pairs" | "objective" | "written" | "mental_maths" | "memory_recall" | "logical_reasoning" | "problem_solving" | "pattern_recognition" | "grammar" | "vocabulary";
type BlueprintSectionForm = {
  id?: string;
  sectionCode: string;
  sectionType: SectionType;
  title: string;
  categoryTags: string;
  itemCount: string;
  durationMinutes: string;
  weight: string;
  negativeMark: string;
  gateMinScore: string;
  fullMarksWpm: string;
  gateMinNetWpm: string;
  gateMinAccuracy: string;
  practiceMinutes: string;
  skillLevel: SkillLevel | "";
};
const emptySection = (): BlueprintSectionForm => ({
  sectionCode: "", sectionType: "objective", title: "", categoryTags: "",
  itemCount: "1", durationMinutes: "10", weight: "0", negativeMark: "0", gateMinScore: "",
  fullMarksWpm: "", gateMinNetWpm: "", gateMinAccuracy: "", practiceMinutes: "", skillLevel: "",
});

const SKILL_SECTION_TYPES: SectionType[] = ["typing", "data_entry", "match_pairs", "mental_maths", "memory_recall", "logical_reasoning", "problem_solving", "pattern_recognition", "grammar", "vocabulary"];
const MCQ_SKILL_TYPES: SectionType[] = ["logical_reasoning", "problem_solving", "pattern_recognition", "grammar", "vocabulary"];
const SKILL_LEVELS: { id: SkillLevel; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];
// Level presets — the pace, length and pass targets a drill runs at for a role.
const LEVEL_PRESETS: Record<SectionType, Partial<Record<SkillLevel, Partial<BlueprintSectionForm>>>> = {
  typing: {
    beginner: { itemCount: "1", durationMinutes: "2", fullMarksWpm: "30", gateMinNetWpm: "20", gateMinAccuracy: "90" },
    intermediate: { itemCount: "1", durationMinutes: "3", fullMarksWpm: "40", gateMinNetWpm: "25", gateMinAccuracy: "90" },
    advanced: { itemCount: "1", durationMinutes: "4", fullMarksWpm: "55", gateMinNetWpm: "40", gateMinAccuracy: "95" },
  },
  mental_maths: {
    beginner: { itemCount: "8", durationMinutes: "4" },
    intermediate: { itemCount: "10", durationMinutes: "4" },
    advanced: { itemCount: "12", durationMinutes: "4" },
  },
  memory_recall: {
    beginner: { itemCount: "5", durationMinutes: "3.5" },
    intermediate: { itemCount: "6", durationMinutes: "4" },
    advanced: { itemCount: "8", durationMinutes: "4" },
  },
  data_entry: {
    beginner: { itemCount: "3", durationMinutes: "5" },
    intermediate: { itemCount: "4", durationMinutes: "5" },
    advanced: { itemCount: "6", durationMinutes: "5" },
  },
  match_pairs: {
    beginner: { itemCount: "6", durationMinutes: "2.5" },
    intermediate: { itemCount: "8", durationMinutes: "4" },
    advanced: { itemCount: "10", durationMinutes: "2.5" },
  },
  logical_reasoning: {
    beginner: { itemCount: "6", durationMinutes: "6" },
    intermediate: { itemCount: "6", durationMinutes: "5" },
    advanced: { itemCount: "6", durationMinutes: "4" },
  },
  problem_solving: {
    beginner: { itemCount: "6", durationMinutes: "6" },
    intermediate: { itemCount: "6", durationMinutes: "5" },
    advanced: { itemCount: "6", durationMinutes: "4" },
  },
  pattern_recognition: {
    beginner: { itemCount: "6", durationMinutes: "6" },
    intermediate: { itemCount: "6", durationMinutes: "5" },
    advanced: { itemCount: "6", durationMinutes: "4" },
  },
  grammar: {
    beginner: { itemCount: "6", durationMinutes: "6" },
    intermediate: { itemCount: "6", durationMinutes: "5" },
    advanced: { itemCount: "6", durationMinutes: "4" },
  },
  vocabulary: {
    beginner: { itemCount: "6", durationMinutes: "6" },
    intermediate: { itemCount: "6", durationMinutes: "5" },
    advanced: { itemCount: "6", durationMinutes: "4" },
  },
  objective: {},
  written: {},
};
const views: QuizView[] = ["overview", "drives", "results", "grading", "tests", "questions", "settings"];
// Old ?view= links keep landing on the right place.
const LEGACY_VIEWS: Record<string, QuizView> = { dashboard: "overview", attempts: "results", evaluations: "grading", skills: "tests", roles: "tests" };

// Skill Test catalogue — the practical drills that measure ability rather than knowledge.
const SKILL_TYPES = [
  { type: "typing", title: "Typing test", icon: Keyboard, blurb: "Live net/gross WPM, accuracy, errors and character count, scored on the server.", tags: "Passage from the question bank (Typing Passage)" },
  { type: "mental_maths", title: "Mental maths", icon: Calculator, blurb: "Freshly generated timed sums for every attempt, so nothing can be memorised.", tags: "Generated per attempt — no question bank content needed" },
  { type: "memory_recall", title: "Memory recall", icon: Brain, blurb: "A sequence flashes on screen, then the candidate types it back. Spaces and case ignored.", tags: "Generated per attempt — no question bank content needed" },
  { type: "data_entry", title: "Data entry accuracy", icon: Table2, blurb: "Copy banking-style records field by field; accuracy and speed are both marked.", tags: "Records from the question bank (Data Entry Record)" },
  { type: "match_pairs", title: "Match pairs", icon: ListChecks, blurb: "Decide whether two records match — measures attention to detail under time.", tags: "Pairs from the question bank (Match Pair)" },
  { type: "logical_reasoning", title: "Logical reasoning", icon: Lightbulb, blurb: "Syllogisms, deduction, coding-decoding and seating logic.", tags: "Objective questions from the question bank (tag: logical reasoning) — 6 per level seeded" },
  { type: "problem_solving", title: "Problem solving", icon: Puzzle, blurb: "Situational and quantitative problems — percentages, ratios, work and speed.", tags: "Objective questions from the question bank (tag: problem solving) — 6 per level seeded" },
  { type: "pattern_recognition", title: "Pattern recognition", icon: Shapes, blurb: "Number and letter sequences — find what comes next.", tags: "Objective questions from the question bank (tag: pattern recognition) — 6 per level seeded" },
  { type: "grammar", title: "Grammar", icon: SpellCheck, blurb: "Error spotting, sentence correction, voice and narration.", tags: "Objective questions from the question bank (tag: grammar) — 6 per level seeded" },
  { type: "vocabulary", title: "Vocabulary", icon: BookOpen, blurb: "Synonyms, antonyms and word usage in context.", tags: "Objective questions from the question bank (tag: vocabulary) — 6 per level seeded" },
] as const;

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
  const [dialog, setDialog] = useState<"role" | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [gradingRow, setGradingRow] = useState<EvaluationRow | null>(null);
  const [gradingForm, setGradingForm] = useState({ score: "", comments: "" });
  const [roleForm, setRoleForm] = useState({ positionId: "", code: "", shortlist: "65", hold: "50" });
  const [roleActive, setRoleActive] = useState(true);
  const [blueprintSections, setBlueprintSections] = useState<BlueprintSectionForm[]>([]);

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

  const selectedPosition = useMemo(
    () => (data?.positions ?? []).find((position: any) => position.id === roleForm.positionId),
    [data?.positions, roleForm.positionId],
  );

  const availablePositions = useMemo(() => {
    const taken = new Set((data?.roles ?? []).map((role: any) => role.position_id));
    return (data?.positions ?? []).filter((position: any) => !taken.has(position.id));
  }, [data?.positions, data?.roles]);

  const createRole = useMutation({
    mutationFn: async () => {
      const currentRole = (data?.roles ?? []).find((role: any) => role.id === editingRoleId);
      if (!editingRoleId && !selectedPosition) throw new Error("Select the company position this hiring role belongs to.");
      const department = (selectedPosition as any)?.departments;
      if (!editingRoleId && !department?.code) throw new Error("This position has no department assigned. Set its department first.");
      const code = (roleForm.code.trim() || `${department?.code ?? ""}_${selectedPosition?.title ?? ""}`)
        .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
      const sections = blueprintSections.map((section, index) => ({
        order_index: index + 1,
        section_code: section.sectionCode.trim(),
        section_type: section.sectionType,
        title: section.title.trim(),
        category_tags: section.categoryTags.split(",").map((tag) => tag.trim()).filter(Boolean),
        item_count: Number(section.itemCount),
        duration_seconds: Math.round(Number(section.durationMinutes) * 60),
        weight: Number(section.weight),
        negative_mark: Number(section.negativeMark),
        gate_min_score: section.gateMinScore.trim() || null,
        full_marks_wpm: section.sectionType === "typing" ? section.fullMarksWpm.trim() || null : null,
        gate_min_net_wpm: section.sectionType === "typing" ? section.gateMinNetWpm.trim() || null : null,
        gate_min_accuracy: section.sectionType === "typing" ? section.gateMinAccuracy.trim() || null : null,
        practice_seconds: section.sectionType === "typing" && section.practiceMinutes.trim()
          ? Math.round(Number(section.practiceMinutes) * 60) : 0,
        skill_level: SKILL_SECTION_TYPES.includes(section.sectionType) ? (section.skillLevel || "intermediate") : null,
      }));
      const { error } = await supabase.rpc("cbt_save_role_blueprint" as never, {
        p_role_id: editingRoleId,
        p_position_id: editingRoleId ? currentRole?.position_id ?? null : selectedPosition?.id ?? null,
        p_code: code,
        p_shortlist_cutoff: Number(roleForm.shortlist),
        p_hold_cutoff: Number(roleForm.hold),
        p_is_active: roleActive,
        p_sections: sections,
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cbt", "staff-workspace"] });
      setDialog(null); setEditingRoleId(null); setRoleForm({ positionId: "", code: "", shortlist: "65", hold: "50" });
      setRoleActive(true); setBlueprintSections([]);
      toast({ title: editingRoleId ? "Role blueprint updated" : "Role blueprint created" });
    },
    onError: (error: Error) => toast({ title: editingRoleId ? "Role not updated" : "Role not created", description: error.message, variant: "destructive" }),
  });

  const openNewRole = () => {
    setEditingRoleId(null);
    setRoleForm({ positionId: "", code: "", shortlist: "65", hold: "50" });
    setRoleActive(true);
    setBlueprintSections([]);
    setDialog("role");
  };

  const openRoleEditor = (role: any) => {
    setEditingRoleId(role.id);
    setRoleForm({ positionId: role.position_id, code: role.code, shortlist: String(role.shortlist_cutoff), hold: String(role.hold_cutoff) });
    setRoleActive(role.is_active);
    setBlueprintSections((data?.roleSections ?? []).filter((section: any) => section.job_role_id === role.id).map((section: any) => ({
      id: section.id,
      sectionCode: section.section_code,
      sectionType: section.section_type,
      title: section.title,
      categoryTags: (section.category_tags ?? []).join(", "),
      itemCount: String(section.item_count),
      durationMinutes: String(section.duration_seconds / 60),
      weight: String(section.weight),
      negativeMark: String(section.negative_mark),
      gateMinScore: section.gate_min_score === null ? "" : String(section.gate_min_score),
      fullMarksWpm: section.full_marks_wpm === null || section.full_marks_wpm === undefined ? "" : String(section.full_marks_wpm),
      gateMinNetWpm: section.gate_min_net_wpm === null || section.gate_min_net_wpm === undefined ? "" : String(section.gate_min_net_wpm),
      gateMinAccuracy: section.gate_min_accuracy === null || section.gate_min_accuracy === undefined ? "" : String(section.gate_min_accuracy),
      practiceMinutes: section.practice_seconds ? String(section.practice_seconds / 60) : "",
      skillLevel: (section.skill_level ?? "") as SkillLevel | "",
    })));
    setDialog("role");
  };

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

  // Where each skill drill is already in use, and the content backing it.
  const skillUsage = useMemo(() => {
    const roleById = new Map((data?.roles ?? []).map((role: any) => [role.id, role]));
    return SKILL_TYPES.map((skill) => {
      const sections = (data?.roleSections ?? []).filter((section: any) => section.section_type === skill.type);
      const contentCount = (data?.questions ?? []).filter((question: any) =>
        (skill.type === "typing" && question.type === "typing_passage") ||
        (skill.type === "data_entry" && question.type === "data_entry_record") ||
        (skill.type === "match_pairs" && question.type === "match_pair")
      ).length;
      return {
        ...skill,
        sections: sections.map((section: any) => ({ ...section, role: roleById.get(section.job_role_id) })),
        contentCount,
        needsContent: ["typing", "data_entry", "match_pairs"].includes(skill.type),
      };
    });
  }, [data?.roleSections, data?.roles, data?.questions]);

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
          <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Skill test</h2><p className="text-sm text-muted-foreground">Practical drills that measure ability — typing speed, mental maths, memory recall, data entry and match pairs. Add any of these as a section to a role blueprint; all marking happens on the server.</p></div><Button asChild variant="outline" size="sm"><a href="/test/practice"><Gauge className="h-4 w-4" />Take demo skill test</a></Button></div>
          <div className="grid gap-3 lg:grid-cols-2">
            {skillUsage.map((skill) => (
              <Card key={skill.type}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><skill.icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{skill.title}</p>
                        <Badge variant={skill.sections.length ? "success" : "muted"}>{skill.sections.length ? `In ${skill.sections.length} role${skill.sections.length > 1 ? "s" : ""}` : "Not in use"}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{skill.blurb}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{skill.tags}{skill.needsContent ? ` · ${skill.contentCount} item${skill.contentCount === 1 ? "" : "s"} available` : ""}</p>
                    </div>
                  </div>
                  {skill.sections.length > 0 && (
                    <div className="space-y-2 border-t border-border pt-3">
                      {skill.sections.map((section: any) => (
                        <div key={section.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium">{section.role?.name ?? "Unlinked role"}</p>
                            <p className="text-xs text-muted-foreground">
                              {section.title || pretty(skill.type)} · {Math.round((section.duration_seconds ?? 0) / 60)} min · {section.item_count ?? 1} item{(section.item_count ?? 1) === 1 ? "" : "s"} · weight {section.weight}{section.skill_level ? ` · ${pretty(section.skill_level)} level` : ""}
                              {skill.type === "typing" && section.full_marks_wpm ? ` · target ${section.full_marks_wpm} WPM` : ""}
                              {skill.type === "typing" && section.gate_min_net_wpm ? ` · pass ${section.gate_min_net_wpm} WPM` : ""}
                              {skill.type === "typing" && section.gate_min_accuracy ? ` / ${section.gate_min_accuracy}% accuracy` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!skill.sections.length && canManage && (
                    <div className="border-t border-border pt-3">
                      <Button variant="outline" size="sm" onClick={() => { const first = (data?.roles ?? [])[0]; if (first) openRoleEditor(first); else openNewRole(); }}><Gauge className="h-4 w-4" />Add to a role blueprint</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          {!canManage && <p className="text-xs text-muted-foreground">Quiz management access is needed to change where these drills are used.</p>}
          </div>
          <div className="space-y-4 border-t border-border pt-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Roles & blueprints</h2><p className="text-sm text-muted-foreground">Define role cut-offs and ordered test sections.</p></div>{canManage && <Button onClick={openNewRole}><Plus />New role</Button>}</div>{!data?.roles.length ? noData(BriefcaseBusiness, "No role blueprints", "Create the first hiring role, then configure its assessment sections.", canManage ? <Button onClick={openNewRole}><Plus />Create role</Button> : undefined) : <Table><TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Department</TableHead><TableHead numeric>Sections</TableHead><TableHead numeric>Shortlist</TableHead><TableHead numeric>Hold</TableHead><TableHead>Status</TableHead>{canManage && <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader><TableBody>{data.roles.map((role) => <TableRow key={role.id}><TableCell><p className="font-medium">{role.name}</p><p className="text-xs text-muted-foreground font-mono">{role.code}</p></TableCell><TableCell>{(role as any).positions?.departments?.name ?? role.department_code}</TableCell><TableCell numeric>{(data.roleSections ?? []).filter((section: any) => section.job_role_id === role.id).length}</TableCell><TableCell numeric>{role.shortlist_cutoff}%</TableCell><TableCell numeric>{role.hold_cutoff}%</TableCell><TableCell><Badge variant={role.is_active ? "success" : "muted"}>{role.is_active ? "Active" : "Inactive"}</Badge></TableCell>{canManage && <TableCell><Button variant="ghost" size="icon" title={`Edit ${role.name}`} aria-label={`Edit ${role.name}`} onClick={() => openRoleEditor(role)}><Pencil className="h-4 w-4" /></Button></TableCell>}</TableRow>)}</TableBody></Table>}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4"><div><h2 className="text-lg font-semibold">Quiz settings</h2><p className="text-sm text-muted-foreground">Company details, candidate-session timing, warnings and retention. Every change is recorded.</p></div><QuizSettings settings={data?.settings ?? null} canAdmin={canAdmin} /></TabsContent></>}
      </Tabs>


      <Dialog open={dialog === "role"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{editingRoleId ? "Edit role & blueprint" : "Create role blueprint"}</DialogTitle><DialogDescription>The role identity stays linked to the company position. Configure its cut-offs and ordered test sections here.</DialogDescription></DialogHeader><div className="grid gap-5"><div className="grid gap-4 sm:grid-cols-2"><div><Label>Company position</Label><Select disabled={Boolean(editingRoleId)} value={roleForm.positionId} onValueChange={(positionId) => setRoleForm((v) => ({ ...v, positionId }))}><SelectTrigger className="text-foreground"><SelectValue placeholder="Select a position" /></SelectTrigger><SelectContent>{editingRoleId && (data?.roles ?? []).filter((role: any) => role.id === editingRoleId).map((role: any) => <SelectItem key={role.position_id} value={role.position_id}>{role.name}</SelectItem>)}{availablePositions.map((position: any) => <SelectItem key={position.id} value={position.id}>{position.title}{position.departments?.code ? ` — ${position.departments.code}` : ""}</SelectItem>)}</SelectContent></Select>{!editingRoleId && !availablePositions.length && <p className="mt-1 text-xs text-muted-foreground">Every active position already has a role blueprint.</p>}</div><div><Label htmlFor="role-code">Role code</Label><Input id="role-code" className="text-foreground" value={roleForm.code} onChange={(e) => setRoleForm((v) => ({ ...v, code: e.target.value }))} placeholder="Auto-generated if left blank" /></div><div><Label htmlFor="shortlist">Shortlist %</Label><Input id="shortlist" className="text-foreground" type="number" min="0" max="100" value={roleForm.shortlist} onChange={(e) => setRoleForm((v) => ({ ...v, shortlist: e.target.value }))} /></div><div><Label htmlFor="hold">Hold %</Label><Input id="hold" className="text-foreground" type="number" min="0" max="100" value={roleForm.hold} onChange={(e) => setRoleForm((v) => ({ ...v, hold: e.target.value }))} /></div><div><Label>Status</Label><Select value={roleActive ? "active" : "inactive"} onValueChange={(value) => setRoleActive(value === "active")}><SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div></div><div className="space-y-3 border-t border-border pt-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Assessment sections</h3><p className="text-xs text-muted-foreground">The displayed order is the candidate’s test order.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setBlueprintSections((sections) => [...sections, emptySection()])}><Plus className="h-4 w-4" />Add section</Button></div>{!blueprintSections.length && <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No sections configured yet.</p>}{blueprintSections.map((section, index) => <div key={section.id ?? `new-${index}`} className="grid gap-3 rounded-md border border-border p-3"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Section {index + 1}</p><Button type="button" variant="ghost" size="icon" title="Remove section" aria-label={`Remove section ${index + 1}`} onClick={() => setBlueprintSections((sections) => sections.filter((_, position) => position !== index))}><Trash2 className="h-4 w-4" /></Button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div><Label>Code</Label><Input className="text-foreground" value={section.sectionCode} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, sectionCode: event.target.value } : value))} placeholder="OBJ" /></div><div><Label>Type</Label><Select value={section.sectionType} onValueChange={(value: BlueprintSectionForm["sectionType"]) => setBlueprintSections((sections) => sections.map((item, position) => position === index ? { ...item, sectionType: value } : item))}><SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="objective">Objective</SelectItem><SelectItem value="written">Written</SelectItem><SelectItem value="typing">Typing</SelectItem><SelectItem value="data_entry">Data entry</SelectItem><SelectItem value="match_pairs">Match pairs</SelectItem><SelectItem value="mental_maths">Skill Box — mental maths</SelectItem><SelectItem value="memory_recall">Skill Box — memory recall</SelectItem><SelectItem value="logical_reasoning">Skill — Logical reasoning</SelectItem><SelectItem value="problem_solving">Skill — Problem solving</SelectItem><SelectItem value="pattern_recognition">Skill — Pattern recognition</SelectItem><SelectItem value="grammar">Skill — Grammar</SelectItem><SelectItem value="vocabulary">Skill — Vocabulary</SelectItem></SelectContent></Select></div>{SKILL_SECTION_TYPES.includes(section.sectionType) && <div><Label>Level</Label><Select value={section.skillLevel || "intermediate"} onValueChange={(value: SkillLevel) => setBlueprintSections((sections) => sections.map((item, position) => position === index ? { ...item, skillLevel: value, ...(LEVEL_PRESETS[item.sectionType]?.[value] ?? {}) } : item))}><SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger><SelectContent>{SKILL_LEVELS.map((lvl) => <SelectItem key={lvl.id} value={lvl.id}>{lvl.label}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">Sets the pace, length and pass targets for this drill.</p></div>}<div><Label>Title</Label><Input className="text-foreground" value={section.title} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, title: event.target.value } : value))} /></div><div className="sm:col-span-2 lg:col-span-3"><Label>Question category tags</Label><Input className="text-foreground" value={section.categoryTags} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, categoryTags: event.target.value } : value))} placeholder="aptitude, banking (comma separated)" /></div><div><Label>Questions</Label><Input className="text-foreground" type="number" min="1" value={section.itemCount} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, itemCount: event.target.value } : value))} /></div><div><Label>Minutes</Label><Input className="text-foreground" inputMode="decimal" value={section.durationMinutes} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, durationMinutes: event.target.value } : value))} /></div><div><Label>Weight %</Label><Input className="text-foreground" inputMode="decimal" value={section.weight} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, weight: event.target.value } : value))} /></div><div><Label>Negative mark</Label><Input className="text-foreground" inputMode="decimal" value={section.negativeMark} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, negativeMark: event.target.value } : value))} /></div><div><Label>Minimum score %</Label><Input className="text-foreground" inputMode="decimal" value={section.gateMinScore} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, gateMinScore: event.target.value } : value))} placeholder="Optional" /></div>{section.sectionType === "typing" && <><div><Label>Target net WPM (full marks)</Label><Input className="text-foreground" inputMode="decimal" value={section.fullMarksWpm} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, fullMarksWpm: event.target.value } : value))} placeholder="e.g. 40" /></div><div><Label>Minimum net WPM to pass</Label><Input className="text-foreground" inputMode="decimal" value={section.gateMinNetWpm} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, gateMinNetWpm: event.target.value } : value))} placeholder="Optional" /></div><div><Label>Minimum accuracy %</Label><Input className="text-foreground" inputMode="decimal" value={section.gateMinAccuracy} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, gateMinAccuracy: event.target.value } : value))} placeholder="Optional" /></div><div><Label>Warm-up minutes</Label><Input className="text-foreground" inputMode="decimal" value={section.practiceMinutes} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, practiceMinutes: event.target.value } : value))} placeholder="0" /></div></>}</div></div>)}</div></div><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button loading={createRole.isPending} disabled={!roleForm.positionId} onClick={() => createRole.mutate()}>{editingRoleId ? "Save changes" : "Create role"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(gradingRow)} onOpenChange={(open) => !open && setGradingRow(null)}><DialogContent><DialogHeader><DialogTitle>Grade written response</DialogTitle><DialogDescription>Candidate identity is hidden during evaluation.</DialogDescription></DialogHeader>{gradingRow && <div className="grid gap-4"><div className="rounded-lg border border-border bg-muted/30 p-3"><p className="text-sm font-medium">{gradingRow.cbt_attempt_items?.cbt_question_versions?.content?.prompt ?? "Written response"}</p><p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{gradingRow.cbt_attempt_items?.response?.text?.trim() || "No answer submitted"}</p></div><div><Label htmlFor="written-score">Score out of 20</Label><Input id="written-score" type="number" min="0" max="20" step="0.5" inputMode="decimal" value={gradingForm.score} onChange={(event) => setGradingForm((value) => ({ ...value, score: event.target.value }))} /></div><div><Label htmlFor="written-comments">Evaluator comments</Label><Textarea id="written-comments" value={gradingForm.comments} onChange={(event) => setGradingForm((value) => ({ ...value, comments: event.target.value }))} placeholder="Optional internal comments" /></div></div>}<DialogFooter><Button variant="outline" onClick={() => setGradingRow(null)}>Cancel</Button><Button loading={gradeResponse.isPending} disabled={!gradingForm.score} onClick={() => gradeResponse.mutate()}>Save grade</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}