import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Activity, BookOpenCheck, Brain, BriefcaseBusiness, Calculator, ClipboardCheck, FileQuestion,
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

type QuizView = "dashboard" | "drives" | "attempts" | "evaluations" | "questions" | "skills" | "roles" | "settings";
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
type SectionType = "typing" | "data_entry" | "match_pairs" | "objective" | "written" | "mental_maths" | "memory_recall";
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

const SKILL_SECTION_TYPES: SectionType[] = ["typing", "data_entry", "match_pairs", "mental_maths", "memory_recall"];
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
  objective: {},
  written: {},
};
const views: QuizView[] = ["dashboard", "drives", "attempts", "evaluations", "questions", "skills", "roles", "settings"];

// Skill Test catalogue — the practical drills that measure ability rather than knowledge.
const SKILL_TYPES = [
  { type: "typing", title: "Typing test", icon: Keyboard, blurb: "Live net/gross WPM, accuracy, errors and character count, scored on the server.", tags: "Passage from the question bank (Typing Passage)" },
  { type: "mental_maths", title: "Mental maths", icon: Calculator, blurb: "Freshly generated timed sums for every attempt, so nothing can be memorised.", tags: "Generated per attempt — no question bank content needed" },
  { type: "memory_recall", title: "Memory recall", icon: Brain, blurb: "A sequence flashes on screen, then the candidate types it back. Spaces and case ignored.", tags: "Generated per attempt — no question bank content needed" },
  { type: "data_entry", title: "Data entry accuracy", icon: Table2, blurb: "Copy banking-style records field by field; accuracy and speed are both marked.", tags: "Records from the question bank (Data Entry Record)" },
  { type: "match_pairs", title: "Match pairs", icon: ListChecks, blurb: "Decide whether two records match — measures attention to detail under time.", tags: "Pairs from the question bank (Match Pair)" },
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
  const requestedView = params.get("view") as QuizView | null;
  const activeView = requestedView && views.includes(requestedView) ? requestedView : "dashboard";
  const canManage = hasAnyPermission(["hrms_quiz_manage", "hrms_quiz_admin"]);
  const canAdmin = hasAnyPermission(["hrms_quiz_admin"]);
  const canEvaluate = hasAnyPermission(["hrms_quiz_evaluate", "hrms_quiz_manage", "hrms_quiz_admin"]);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<"drive" | "role" | "question" | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [gradingRow, setGradingRow] = useState<EvaluationRow | null>(null);
  const [gradingForm, setGradingForm] = useState({ score: "", comments: "" });
  const [driveForm, setDriveForm] = useState({ name: "", accessCode: "", mode: "on_site", startsAt: "", endsAt: "" });
  const [roleForm, setRoleForm] = useState({ positionId: "", code: "", shortlist: "65", hold: "50" });
  const [roleActive, setRoleActive] = useState(true);
  const [blueprintSections, setBlueprintSections] = useState<BlueprintSectionForm[]>([]);
  const emptyQuestion = {
    type: "mcq", categoryTag: "", difficulty: "medium", prompt: "", marks: "1",
    options: ["", "", "", ""], correct: "a", numericAnswer: "", tolerance: "0",
    roleCode: "__any", explanation: "", approve: true,
  };
  const [questionForm, setQuestionForm] = useState(emptyQuestion);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cbt", "staff-workspace"],
    queryFn: async () => {
      const [drives, candidates, attempts, questions, roles, roleSections, departments, evaluations, settingsRow, positions] = await Promise.all([
        supabase.from("cbt_drives").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("cbt_candidates").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("cbt_attempts").select("*, cbt_candidates(full_name), cbt_job_roles(name), cbt_drives(name)").order("created_at", { ascending: false }).limit(100),
        supabase.from("cbt_questions").select("*").order("created_at", { ascending: false }).limit(100),
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

  const createDrive = useMutation({
    mutationFn: async () => {
      const code = driveForm.accessCode.trim().toUpperCase();
      if (!driveForm.name.trim() || !/^[A-Z0-9]{6}$/.test(code) || !driveForm.startsAt || !driveForm.endsAt) throw new Error("Enter a name, six-character code, start, and end time.");
      if (new Date(driveForm.endsAt) <= new Date(driveForm.startsAt)) throw new Error("End time must be after the start time.");
      const { error } = await supabase.from("cbt_drives").insert({
        name: driveForm.name.trim(), access_code: code, mode: driveForm.mode as "on_site" | "remote",
        starts_at: new Date(driveForm.startsAt).toISOString(), ends_at: new Date(driveForm.endsAt).toISOString(), status: "draft",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cbt", "staff-workspace"] });
      setDialog(null); setDriveForm({ name: "", accessCode: "", mode: "on_site", startsAt: "", endsAt: "" });
      toast({ title: "Draft drive created" });
    },
    onError: (error: Error) => toast({ title: "Drive not created", description: error.message, variant: "destructive" }),
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

  const optionIds = ["a", "b", "c", "d"];
  const createQuestion = useMutation({
    mutationFn: async () => {
      const marks = Number(questionForm.marks);
      if (!questionForm.categoryTag.trim()) throw new Error("Enter the category tag used by the section blueprint.");
      if (!questionForm.prompt.trim()) throw new Error(questionForm.type === "typing_passage" ? "Enter the passage text." : "Enter the question text.");
      if (questionForm.type === "typing_passage" && questionForm.prompt.trim().split(/\s+/).length < 40) {
        throw new Error("A typing passage needs at least 40 words.");
      }
      if (!Number.isFinite(marks) || marks <= 0) throw new Error("Marks must be greater than zero.");
      const payload: Record<string, unknown> = {
        p_type: questionForm.type,
        p_category_tag: questionForm.categoryTag.trim(),
        p_difficulty: questionForm.difficulty,
        p_prompt: questionForm.prompt.trim(),
        p_marks: marks,
        p_role_codes: questionForm.roleCode === "__any" ? null : [questionForm.roleCode],
        p_explanation: questionForm.explanation.trim() || null,
        p_approve: questionForm.approve,
      };
      if (questionForm.type === "mcq") {
        const options = questionForm.options
          .map((text, index) => ({ id: optionIds[index], text: text.trim() }))
          .filter((option) => option.text.length > 0);
        if (options.length < 2) throw new Error("Enter at least two options.");
        if (!options.some((option) => option.id === questionForm.correct)) throw new Error("The correct option must have text.");
        payload.p_options = options;
        payload.p_correct_option_id = questionForm.correct;
      } else if (questionForm.type === "numeric") {
        const answer = Number(questionForm.numericAnswer);
        const tolerance = Number(questionForm.tolerance || "0");
        if (!Number.isFinite(answer)) throw new Error("Enter the correct numeric answer.");
        if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error("Tolerance must be zero or more.");
        payload.p_numeric_answer = answer;
        payload.p_numeric_tolerance = tolerance;
      }
      const { error } = await supabase.rpc("cbt_create_question" as never, payload as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cbt", "staff-workspace"] });
      setDialog(null);
      setQuestionForm(emptyQuestion);
      toast({ title: "Question added" });
    },
    onError: (error: Error) => toast({ title: "Question not added", description: error.message, variant: "destructive" }),
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

  const filteredAttempts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data?.attempts ?? [];
    return (data?.attempts ?? []).filter((attempt: any) =>
      [attempt.public_ref, attempt.cbt_candidates?.full_name, attempt.cbt_job_roles?.name, attempt.status, attempt.decision]
        .some((value) => String(value ?? "").toLowerCase().includes(needle))
    );
  }, [data?.attempts, search]);

  const changeView = (value: string) => setParams(value === "dashboard" ? {} : { view: value });
  const stats = [
    { label: "Assessment drives", value: data?.drives.length ?? 0, icon: BriefcaseBusiness, tone: "text-info bg-info/10" },
    { label: "Candidates", value: data?.candidates.length ?? 0, icon: Users, tone: "text-success bg-success/10" },
    { label: "Attempts", value: data?.attempts.length ?? 0, icon: ClipboardCheck, tone: "text-warning bg-warning/10" },
    { label: "Question bank", value: data?.questions.length ?? 0, icon: BookOpenCheck, tone: "text-primary bg-primary/10" },
  ];

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

      <Tabs value={activeView} onValueChange={changeView}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="drives">Drives</TabsTrigger>
          <TabsTrigger value="attempts">Candidates & Attempts</TabsTrigger><TabsTrigger value="evaluations">Evaluations</TabsTrigger>
          <TabsTrigger value="questions">Question Bank</TabsTrigger><TabsTrigger value="skills">Skill Test</TabsTrigger>
          <TabsTrigger value="roles">Roles & Blueprints</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((stat) => <Card key={stat.label}><CardContent className="flex items-center gap-3 p-4"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${stat.tone}`}><stat.icon className="h-5 w-5" /></span><div><p className="text-2xl font-semibold tabular-nums">{isLoading ? "—" : stat.value}</p><p className="text-xs text-muted-foreground">{stat.label}</p></div></CardContent></Card>)}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="border-t border-border pt-4"><h2 className="font-semibold">Current activity</h2><p className="mt-1 text-sm text-muted-foreground">{isError ? "Quiz data could not be loaded." : `${data?.attempts.filter((a) => a.status === "in_progress").length ?? 0} attempts in progress and ${data?.drives.filter((d) => d.status === "live").length ?? 0} live drives.`}</p></section>
            <section className="border-t border-border pt-4"><h2 className="font-semibold">Content readiness</h2><p className="mt-1 text-sm text-muted-foreground">{data?.questions.filter((q) => q.status === "approved").length ?? 0} approved questions; {data?.questions.filter((q) => q.status === "needs_review").length ?? 0} await review.</p></section>
          </div>
        </TabsContent>

        <TabsContent value="drives" className="space-y-4">
          <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Assessment drives</h2><p className="text-sm text-muted-foreground">Issue six-character candidate access codes and control test windows.</p></div>{canManage && <Button onClick={() => setDialog("drive")}><Plus />New drive</Button>}</div>
          {!data?.drives.length ? noData(BriefcaseBusiness, "No assessment drives", "Create a draft drive, assign roles, then publish it when the question bank is ready.", canManage ? <Button onClick={() => setDialog("drive")}><Plus />Create drive</Button> : undefined) : <Table><TableHeader><TableRow><TableHead>Drive</TableHead><TableHead>Code</TableHead><TableHead>Mode</TableHead><TableHead>Window</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{data.drives.map((drive) => <TableRow key={drive.id}><TableCell className="font-medium">{drive.name}</TableCell><TableCell className="font-mono">{drive.access_code}</TableCell><TableCell>{pretty(drive.mode)}</TableCell><TableCell>{fmtDate(drive.starts_at)} – {fmtDate(drive.ends_at)}</TableCell><TableCell><Badge variant={statusVariant(drive.status)}>{pretty(drive.status)}</Badge></TableCell></TableRow>)}</TableBody></Table>}
        </TabsContent>

        <TabsContent value="attempts" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Candidates & attempts</h2><p className="text-sm text-muted-foreground">Track progress, scores, decisions, warnings, and submission state.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search candidate or reference" className="pl-9" /></div></div>
          {!filteredAttempts.length ? noData(Users, "No candidate attempts", "Attempts appear here after a candidate registers with a live drive code.") : <Table><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Candidate</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead numeric>Score</TableHead><TableHead>Decision</TableHead><TableHead numeric>Warnings</TableHead></TableRow></TableHeader><TableBody>{filteredAttempts.map((attempt: any) => <TableRow key={attempt.id}><TableCell className="font-mono text-xs">{attempt.public_ref}</TableCell><TableCell className="font-medium">{attempt.cbt_candidates?.full_name ?? "Anonymized"}</TableCell><TableCell>{attempt.cbt_job_roles?.name ?? "—"}</TableCell><TableCell><Badge variant={statusVariant(attempt.status)}>{pretty(attempt.status)}</Badge></TableCell><TableCell numeric>{attempt.total_score ?? "—"}</TableCell><TableCell><Badge variant={statusVariant(attempt.decision)}>{pretty(attempt.decision)}</Badge></TableCell><TableCell numeric>{attempt.warning_count}</TableCell></TableRow>)}</TableBody></Table>}
        </TabsContent>

        <TabsContent value="evaluations" className="space-y-4"><div><h2 className="text-lg font-semibold">Blind written evaluations</h2><p className="text-sm text-muted-foreground">Written responses are graded without exposing candidate identity.</p></div>{!canEvaluate ? noData(ShieldCheck, "Evaluation permission required", "Ask a Quiz administrator for evaluator access.") : !data?.evaluations.length ? noData(ClipboardCheck, "No responses await grading", "Submitted written responses will enter this queue automatically.") : <div className="grid gap-3">{(data.evaluations as EvaluationRow[]).map((row) => { const prompt = row.cbt_attempt_items?.cbt_question_versions?.content?.prompt ?? "Written response"; const answer = row.cbt_attempt_items?.response?.text?.trim() || "No answer submitted"; return <Card key={row.id}><CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><p className="text-sm font-medium">{prompt}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{answer}</p><div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant={row.total === null ? "warning" : "success"}>{row.total === null ? "Awaiting grading" : `${row.total}/20`}</Badge><span className="text-xs text-muted-foreground">Updated {fmtDate(row.updated_at)}</span></div></div><Button variant={row.total === null ? "default" : "outline"} onClick={() => openGrading(row)}>{row.total === null ? "Grade response" : "Review grade"}</Button></CardContent></Card>; })}</div>}
        </TabsContent>

        <TabsContent value="questions" className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Question bank</h2><p className="text-sm text-muted-foreground">Versioned content, review status, difficulty, and usage.</p></div>{canManage && <Button variant="outline" onClick={() => setDialog("question")}><Plus />Add question</Button>}</div>{!data?.questions.length ? noData(FileQuestion, "Question bank is empty", "Use Add question to create approved content; unapproved questions are never served.") : <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Category</TableHead><TableHead>Difficulty</TableHead><TableHead>Status</TableHead><TableHead numeric>Times served</TableHead></TableRow></TableHeader><TableBody>{data.questions.map((question) => <TableRow key={question.id}><TableCell>{pretty(question.type)}</TableCell><TableCell>{question.category_tag}</TableCell><TableCell>{pretty(question.difficulty)}</TableCell><TableCell><Badge variant={statusVariant(question.status)}>{pretty(question.status)}</Badge></TableCell><TableCell numeric>{question.times_served}</TableCell></TableRow>)}</TableBody></Table>}
        </TabsContent>

        <TabsContent value="skills" className="space-y-4">
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
                      <Button variant="outline" size="sm" onClick={() => changeView("roles")}><Gauge className="h-4 w-4" />Add to a role blueprint</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          {!canManage && <p className="text-xs text-muted-foreground">Quiz management access is needed to change where these drills are used.</p>}
        </TabsContent>


        <TabsContent value="roles" className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Roles & blueprints</h2><p className="text-sm text-muted-foreground">Define role cut-offs and ordered test sections.</p></div>{canManage && <Button onClick={openNewRole}><Plus />New role</Button>}</div>{!data?.roles.length ? noData(BriefcaseBusiness, "No role blueprints", "Create the first hiring role, then configure its assessment sections.", canManage ? <Button onClick={openNewRole}><Plus />Create role</Button> : undefined) : <Table><TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Department</TableHead><TableHead numeric>Sections</TableHead><TableHead numeric>Shortlist</TableHead><TableHead numeric>Hold</TableHead><TableHead>Status</TableHead>{canManage && <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader><TableBody>{data.roles.map((role) => <TableRow key={role.id}><TableCell><p className="font-medium">{role.name}</p><p className="text-xs text-muted-foreground font-mono">{role.code}</p></TableCell><TableCell>{(role as any).positions?.departments?.name ?? role.department_code}</TableCell><TableCell numeric>{(data.roleSections ?? []).filter((section: any) => section.job_role_id === role.id).length}</TableCell><TableCell numeric>{role.shortlist_cutoff}%</TableCell><TableCell numeric>{role.hold_cutoff}%</TableCell><TableCell><Badge variant={role.is_active ? "success" : "muted"}>{role.is_active ? "Active" : "Inactive"}</Badge></TableCell>{canManage && <TableCell><Button variant="ghost" size="icon" title={`Edit ${role.name}`} aria-label={`Edit ${role.name}`} onClick={() => openRoleEditor(role)}><Pencil className="h-4 w-4" /></Button></TableCell>}</TableRow>)}</TableBody></Table>}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4"><div><h2 className="text-lg font-semibold">Quiz settings</h2><p className="text-sm text-muted-foreground">Global candidate-session, warning, and retention controls.</p></div>{data?.settings ? <div className="grid gap-x-8 gap-y-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">{[["Company", data.settings.company_name], ["HR contact", data.settings.hr_email], ["Retention", `${data.settings.retention_days} days`], ["Warning limit", data.settings.max_warnings], ["Heartbeat", `${data.settings.heartbeat_seconds} seconds`], ["Abandon after", `${data.settings.abandon_after_minutes} minutes`]].map(([label, value]) => <div key={String(label)}><p className="text-xs font-medium uppercase text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>)}</div> : noData(Settings, "Settings unavailable", "Quiz settings have not been initialized.")}{!canAdmin && <p className="text-xs text-muted-foreground">Only Quiz administrators can change global settings.</p>}</TabsContent>
      </Tabs>

      <Dialog open={dialog === "drive"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>Create assessment drive</DialogTitle><DialogDescription>Creates a draft. Candidates cannot enter until it is configured and made live.</DialogDescription></DialogHeader><div className="grid gap-4"><div><Label htmlFor="drive-name">Drive name</Label><Input id="drive-name" value={driveForm.name} onChange={(e) => setDriveForm((v) => ({ ...v, name: e.target.value }))} /></div><div><Label htmlFor="drive-code">Access code</Label><Input id="drive-code" maxLength={6} className="uppercase font-mono" value={driveForm.accessCode} onChange={(e) => setDriveForm((v) => ({ ...v, accessCode: e.target.value }))} placeholder="ABC123" /></div><div><Label>Mode</Label><Select value={driveForm.mode} onValueChange={(mode) => setDriveForm((v) => ({ ...v, mode }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="on_site">On-site</SelectItem><SelectItem value="remote">Remote</SelectItem></SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="drive-start">Starts</Label><Input id="drive-start" type="datetime-local" value={driveForm.startsAt} onChange={(e) => setDriveForm((v) => ({ ...v, startsAt: e.target.value }))} /></div><div><Label htmlFor="drive-end">Ends</Label><Input id="drive-end" type="datetime-local" value={driveForm.endsAt} onChange={(e) => setDriveForm((v) => ({ ...v, endsAt: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button loading={createDrive.isPending} onClick={() => createDrive.mutate()}>Create draft</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={dialog === "role"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{editingRoleId ? "Edit role & blueprint" : "Create role blueprint"}</DialogTitle><DialogDescription>The role identity stays linked to the company position. Configure its cut-offs and ordered test sections here.</DialogDescription></DialogHeader><div className="grid gap-5"><div className="grid gap-4 sm:grid-cols-2"><div><Label>Company position</Label><Select disabled={Boolean(editingRoleId)} value={roleForm.positionId} onValueChange={(positionId) => setRoleForm((v) => ({ ...v, positionId }))}><SelectTrigger className="text-foreground"><SelectValue placeholder="Select a position" /></SelectTrigger><SelectContent>{editingRoleId && (data?.roles ?? []).filter((role: any) => role.id === editingRoleId).map((role: any) => <SelectItem key={role.position_id} value={role.position_id}>{role.name}</SelectItem>)}{availablePositions.map((position: any) => <SelectItem key={position.id} value={position.id}>{position.title}{position.departments?.code ? ` — ${position.departments.code}` : ""}</SelectItem>)}</SelectContent></Select>{!editingRoleId && !availablePositions.length && <p className="mt-1 text-xs text-muted-foreground">Every active position already has a role blueprint.</p>}</div><div><Label htmlFor="role-code">Role code</Label><Input id="role-code" className="text-foreground" value={roleForm.code} onChange={(e) => setRoleForm((v) => ({ ...v, code: e.target.value }))} placeholder="Auto-generated if left blank" /></div><div><Label htmlFor="shortlist">Shortlist %</Label><Input id="shortlist" className="text-foreground" type="number" min="0" max="100" value={roleForm.shortlist} onChange={(e) => setRoleForm((v) => ({ ...v, shortlist: e.target.value }))} /></div><div><Label htmlFor="hold">Hold %</Label><Input id="hold" className="text-foreground" type="number" min="0" max="100" value={roleForm.hold} onChange={(e) => setRoleForm((v) => ({ ...v, hold: e.target.value }))} /></div><div><Label>Status</Label><Select value={roleActive ? "active" : "inactive"} onValueChange={(value) => setRoleActive(value === "active")}><SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div></div><div className="space-y-3 border-t border-border pt-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Assessment sections</h3><p className="text-xs text-muted-foreground">The displayed order is the candidate’s test order.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setBlueprintSections((sections) => [...sections, emptySection()])}><Plus className="h-4 w-4" />Add section</Button></div>{!blueprintSections.length && <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No sections configured yet.</p>}{blueprintSections.map((section, index) => <div key={section.id ?? `new-${index}`} className="grid gap-3 rounded-md border border-border p-3"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Section {index + 1}</p><Button type="button" variant="ghost" size="icon" title="Remove section" aria-label={`Remove section ${index + 1}`} onClick={() => setBlueprintSections((sections) => sections.filter((_, position) => position !== index))}><Trash2 className="h-4 w-4" /></Button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div><Label>Code</Label><Input className="text-foreground" value={section.sectionCode} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, sectionCode: event.target.value } : value))} placeholder="OBJ" /></div><div><Label>Type</Label><Select value={section.sectionType} onValueChange={(value: BlueprintSectionForm["sectionType"]) => setBlueprintSections((sections) => sections.map((item, position) => position === index ? { ...item, sectionType: value } : item))}><SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="objective">Objective</SelectItem><SelectItem value="written">Written</SelectItem><SelectItem value="typing">Typing</SelectItem><SelectItem value="data_entry">Data entry</SelectItem><SelectItem value="match_pairs">Match pairs</SelectItem><SelectItem value="mental_maths">Skill Box — mental maths</SelectItem><SelectItem value="memory_recall">Skill Box — memory recall</SelectItem></SelectContent></Select></div>{SKILL_SECTION_TYPES.includes(section.sectionType) && <div><Label>Level</Label><Select value={section.skillLevel || "intermediate"} onValueChange={(value: SkillLevel) => setBlueprintSections((sections) => sections.map((item, position) => position === index ? { ...item, skillLevel: value, ...(LEVEL_PRESETS[item.sectionType]?.[value] ?? {}) } : item))}><SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger><SelectContent>{SKILL_LEVELS.map((lvl) => <SelectItem key={lvl.id} value={lvl.id}>{lvl.label}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">Sets the pace, length and pass targets for this drill.</p></div>}<div><Label>Title</Label><Input className="text-foreground" value={section.title} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, title: event.target.value } : value))} /></div><div className="sm:col-span-2 lg:col-span-3"><Label>Question category tags</Label><Input className="text-foreground" value={section.categoryTags} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, categoryTags: event.target.value } : value))} placeholder="aptitude, banking (comma separated)" /></div><div><Label>Questions</Label><Input className="text-foreground" type="number" min="1" value={section.itemCount} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, itemCount: event.target.value } : value))} /></div><div><Label>Minutes</Label><Input className="text-foreground" inputMode="decimal" value={section.durationMinutes} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, durationMinutes: event.target.value } : value))} /></div><div><Label>Weight %</Label><Input className="text-foreground" inputMode="decimal" value={section.weight} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, weight: event.target.value } : value))} /></div><div><Label>Negative mark</Label><Input className="text-foreground" inputMode="decimal" value={section.negativeMark} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, negativeMark: event.target.value } : value))} /></div><div><Label>Minimum score %</Label><Input className="text-foreground" inputMode="decimal" value={section.gateMinScore} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, gateMinScore: event.target.value } : value))} placeholder="Optional" /></div>{section.sectionType === "typing" && <><div><Label>Target net WPM (full marks)</Label><Input className="text-foreground" inputMode="decimal" value={section.fullMarksWpm} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, fullMarksWpm: event.target.value } : value))} placeholder="e.g. 40" /></div><div><Label>Minimum net WPM to pass</Label><Input className="text-foreground" inputMode="decimal" value={section.gateMinNetWpm} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, gateMinNetWpm: event.target.value } : value))} placeholder="Optional" /></div><div><Label>Minimum accuracy %</Label><Input className="text-foreground" inputMode="decimal" value={section.gateMinAccuracy} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, gateMinAccuracy: event.target.value } : value))} placeholder="Optional" /></div><div><Label>Warm-up minutes</Label><Input className="text-foreground" inputMode="decimal" value={section.practiceMinutes} onChange={(event) => setBlueprintSections((sections) => sections.map((value, position) => position === index ? { ...value, practiceMinutes: event.target.value } : value))} placeholder="0" /></div></>}</div></div>)}</div></div><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button loading={createRole.isPending} disabled={!roleForm.positionId} onClick={() => createRole.mutate()}>{editingRoleId ? "Save changes" : "Create role"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={dialog === "question"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Add question</DialogTitle><DialogDescription>The answer key is stored privately and is never shown to candidates.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><div><Label>Question type</Label><Select value={questionForm.type} onValueChange={(value) => setQuestionForm((form) => ({ ...form, type: value }))}><SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mcq">Multiple choice</SelectItem><SelectItem value="numeric">Numeric answer</SelectItem><SelectItem value="written">Written answer</SelectItem><SelectItem value="typing_passage">Typing passage</SelectItem></SelectContent></Select></div><div><Label>Difficulty</Label><Select value={questionForm.difficulty} onValueChange={(value) => setQuestionForm((form) => ({ ...form, difficulty: value }))}><SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem></SelectContent></Select></div></div><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="question-tag">Category tag</Label><Input id="question-tag" className="text-foreground" value={questionForm.categoryTag} onChange={(event) => setQuestionForm((form) => ({ ...form, categoryTag: event.target.value }))} placeholder="Must match the section blueprint tag, e.g. demo" /></div><div><Label>Applies to role</Label><Select value={questionForm.roleCode} onValueChange={(value) => setQuestionForm((form) => ({ ...form, roleCode: value }))}><SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__any">All roles</SelectItem>{(data?.roles ?? []).map((role: any) => <SelectItem key={role.id} value={role.code}>{role.name} ({role.code})</SelectItem>)}</SelectContent></Select></div></div><div><Label htmlFor="question-prompt">{questionForm.type === "typing_passage" ? "Passage the candidate must type (40 words or more)" : "Question text"}</Label><Textarea id="question-prompt" rows={questionForm.type === "typing_passage" ? 8 : 4} className="text-foreground" value={questionForm.prompt} onChange={(event) => setQuestionForm((form) => ({ ...form, prompt: event.target.value }))} placeholder={questionForm.type === "typing_passage" ? "Paste the passage exactly as it should be typed" : "What the candidate will read"} /></div>{questionForm.type === "mcq" && <div className="grid gap-3">{questionForm.options.map((option, index) => <div key={optionIds[index]} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><div><Label htmlFor={`question-option-${optionIds[index]}`}>Option {optionIds[index].toUpperCase()}</Label><Input id={`question-option-${optionIds[index]}`} className="text-foreground" value={option} onChange={(event) => setQuestionForm((form) => ({ ...form, options: form.options.map((value, position) => position === index ? event.target.value : value) }))} placeholder={index < 2 ? "Required" : "Optional"} /></div><Button type="button" variant={questionForm.correct === optionIds[index] ? "default" : "outline"} onClick={() => setQuestionForm((form) => ({ ...form, correct: optionIds[index] }))}>{questionForm.correct === optionIds[index] ? "Correct" : "Mark correct"}</Button></div>)}</div>}{questionForm.type === "numeric" && <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="question-answer">Correct answer</Label><Input id="question-answer" className="text-foreground" inputMode="decimal" value={questionForm.numericAnswer} onChange={(event) => setQuestionForm((form) => ({ ...form, numericAnswer: event.target.value }))} /></div><div><Label htmlFor="question-tolerance">Allowed difference</Label><Input id="question-tolerance" className="text-foreground" inputMode="decimal" value={questionForm.tolerance} onChange={(event) => setQuestionForm((form) => ({ ...form, tolerance: event.target.value }))} /></div></div>}<div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="question-marks">Marks</Label><Input id="question-marks" className="text-foreground" inputMode="decimal" value={questionForm.marks} onChange={(event) => setQuestionForm((form) => ({ ...form, marks: event.target.value }))} /></div><div><Label>Review status</Label><Select value={questionForm.approve ? "approved" : "needs_review"} onValueChange={(value) => setQuestionForm((form) => ({ ...form, approve: value === "approved" }))}><SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="approved">Approved (can be served)</SelectItem><SelectItem value="needs_review">Needs review</SelectItem></SelectContent></Select></div></div><div><Label htmlFor="question-explanation">Internal note</Label><Textarea id="question-explanation" className="text-foreground" value={questionForm.explanation} onChange={(event) => setQuestionForm((form) => ({ ...form, explanation: event.target.value }))} placeholder="Optional, visible to staff only" /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button loading={createQuestion.isPending} onClick={() => createQuestion.mutate()}>Add question</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(gradingRow)} onOpenChange={(open) => !open && setGradingRow(null)}><DialogContent><DialogHeader><DialogTitle>Grade written response</DialogTitle><DialogDescription>Candidate identity is hidden during evaluation.</DialogDescription></DialogHeader>{gradingRow && <div className="grid gap-4"><div className="rounded-lg border border-border bg-muted/30 p-3"><p className="text-sm font-medium">{gradingRow.cbt_attempt_items?.cbt_question_versions?.content?.prompt ?? "Written response"}</p><p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{gradingRow.cbt_attempt_items?.response?.text?.trim() || "No answer submitted"}</p></div><div><Label htmlFor="written-score">Score out of 20</Label><Input id="written-score" type="number" min="0" max="20" step="0.5" inputMode="decimal" value={gradingForm.score} onChange={(event) => setGradingForm((value) => ({ ...value, score: event.target.value }))} /></div><div><Label htmlFor="written-comments">Evaluator comments</Label><Textarea id="written-comments" value={gradingForm.comments} onChange={(event) => setGradingForm((value) => ({ ...value, comments: event.target.value }))} placeholder="Optional internal comments" /></div></div>}<DialogFooter><Button variant="outline" onClick={() => setGradingRow(null)}>Cancel</Button><Button loading={gradeResponse.isPending} disabled={!gradingForm.score} onClick={() => gradeResponse.mutate()}>Save grade</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}