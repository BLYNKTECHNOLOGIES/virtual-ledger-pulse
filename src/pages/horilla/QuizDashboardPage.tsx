import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Activity, BookOpenCheck, BriefcaseBusiness, ClipboardCheck, FileQuestion,
  Plus, Search, Settings, ShieldCheck, Users,
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
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";

type QuizView = "dashboard" | "drives" | "attempts" | "evaluations" | "questions" | "roles" | "settings";
const views: QuizView[] = ["dashboard", "drives", "attempts", "evaluations", "questions", "roles", "settings"];

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
  const [dialog, setDialog] = useState<"drive" | "role" | null>(null);
  const [driveForm, setDriveForm] = useState({ name: "", accessCode: "", mode: "on_site", startsAt: "", endsAt: "" });
  const [roleForm, setRoleForm] = useState({ name: "", code: "", department: "OPERATIONS", shortlist: "65", hold: "50" });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cbt", "staff-workspace"],
    queryFn: async () => {
      const [drives, candidates, attempts, questions, roles, departments, evaluations, settingsRow] = await Promise.all([
        supabase.from("cbt_drives").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("cbt_candidates").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("cbt_attempts").select("*, cbt_candidates(full_name), cbt_job_roles(name), cbt_drives(name)").order("created_at", { ascending: false }).limit(100),
        supabase.from("cbt_questions").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("cbt_job_roles").select("*").order("name").limit(100),
        supabase.from("cbt_departments").select("*").order("name"),
        supabase.from("cbt_written_evaluations").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("cbt_settings").select("*").eq("id", true).maybeSingle(),
      ]);
      const errors = [drives.error, candidates.error, attempts.error, questions.error, roles.error, departments.error, evaluations.error, settingsRow.error].filter(Boolean);
      if (errors.length) throw errors[0];
      return {
        drives: drives.data ?? [], candidates: candidates.data ?? [], attempts: attempts.data ?? [],
        questions: questions.data ?? [], roles: roles.data ?? [], departments: departments.data ?? [],
        evaluations: evaluations.data ?? [], settings: settingsRow.data,
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

  const createRole = useMutation({
    mutationFn: async () => {
      const code = roleForm.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      if (!roleForm.name.trim() || !code || !roleForm.department) throw new Error("Enter the role name, code, and department.");
      const { error } = await supabase.from("cbt_job_roles").insert({
        name: roleForm.name.trim(), code, department_code: roleForm.department,
        shortlist_cutoff: Number(roleForm.shortlist), hold_cutoff: Number(roleForm.hold),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cbt", "staff-workspace"] });
      setDialog(null); setRoleForm({ name: "", code: "", department: "OPERATIONS", shortlist: "65", hold: "50" });
      toast({ title: "Role blueprint created" });
    },
    onError: (error: Error) => toast({ title: "Role not created", description: error.message, variant: "destructive" }),
  });

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

  return (
    <div className="page-mount space-y-5 p-2 sm:p-3 md:p-0">
      <PageHeader title="Quiz" description="Role-based candidate screening, scoring, evaluation, and test administration." />

      <Tabs value={activeView} onValueChange={changeView}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="drives">Drives</TabsTrigger>
          <TabsTrigger value="attempts">Candidates & Attempts</TabsTrigger><TabsTrigger value="evaluations">Evaluations</TabsTrigger>
          <TabsTrigger value="questions">Question Bank</TabsTrigger><TabsTrigger value="roles">Roles & Blueprints</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
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

        <TabsContent value="evaluations" className="space-y-4"><div><h2 className="text-lg font-semibold">Blind written evaluations</h2><p className="text-sm text-muted-foreground">Written responses are graded without exposing candidate identity.</p></div>{!canEvaluate ? noData(ShieldCheck, "Evaluation permission required", "Ask a Quiz administrator for evaluator access.") : !data?.evaluations.length ? noData(ClipboardCheck, "No responses await grading", "Submitted written responses will enter this queue automatically.") : <Table><TableHeader><TableRow><TableHead>Response item</TableHead><TableHead numeric>Total</TableHead><TableHead>Comments</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader><TableBody>{data.evaluations.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.attempt_item_id.slice(0, 8)}</TableCell><TableCell numeric>{row.total ?? "—"}</TableCell><TableCell>{row.comments || "—"}</TableCell><TableCell>{fmtDate(row.updated_at)}</TableCell></TableRow>)}</TableBody></Table>}
        </TabsContent>

        <TabsContent value="questions" className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Question bank</h2><p className="text-sm text-muted-foreground">Versioned content, review status, difficulty, and usage.</p></div>{canManage && <Button variant="outline" disabled><Plus />Add question</Button>}</div>{!data?.questions.length ? noData(FileQuestion, "Question bank is empty", "Seed content and the question editor are not yet installed; no unapproved question will be served.") : <Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Category</TableHead><TableHead>Difficulty</TableHead><TableHead>Status</TableHead><TableHead numeric>Times served</TableHead></TableRow></TableHeader><TableBody>{data.questions.map((question) => <TableRow key={question.id}><TableCell>{pretty(question.type)}</TableCell><TableCell>{question.category_tag}</TableCell><TableCell>{pretty(question.difficulty)}</TableCell><TableCell><Badge variant={statusVariant(question.status)}>{pretty(question.status)}</Badge></TableCell><TableCell numeric>{question.times_served}</TableCell></TableRow>)}</TableBody></Table>}
        </TabsContent>

        <TabsContent value="roles" className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Roles & blueprints</h2><p className="text-sm text-muted-foreground">Define role cut-offs before adding ordered test sections.</p></div>{canManage && <Button onClick={() => setDialog("role")}><Plus />New role</Button>}</div>{!data?.roles.length ? noData(BriefcaseBusiness, "No role blueprints", "Create the first hiring role, then configure its assessment sections.", canManage ? <Button onClick={() => setDialog("role")}><Plus />Create role</Button> : undefined) : <Table><TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Department</TableHead><TableHead numeric>Shortlist</TableHead><TableHead numeric>Hold</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{data.roles.map((role) => <TableRow key={role.id}><TableCell><p className="font-medium">{role.name}</p><p className="text-xs text-muted-foreground font-mono">{role.code}</p></TableCell><TableCell>{role.department_code}</TableCell><TableCell numeric>{role.shortlist_cutoff}%</TableCell><TableCell numeric>{role.hold_cutoff}%</TableCell><TableCell><Badge variant={role.is_active ? "success" : "muted"}>{role.is_active ? "Active" : "Inactive"}</Badge></TableCell></TableRow>)}</TableBody></Table>}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4"><div><h2 className="text-lg font-semibold">Quiz settings</h2><p className="text-sm text-muted-foreground">Global candidate-session, warning, and retention controls.</p></div>{data?.settings ? <div className="grid gap-x-8 gap-y-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">{[["Company", data.settings.company_name], ["HR contact", data.settings.hr_email], ["Retention", `${data.settings.retention_days} days`], ["Warning limit", data.settings.max_warnings], ["Heartbeat", `${data.settings.heartbeat_seconds} seconds`], ["Abandon after", `${data.settings.abandon_after_minutes} minutes`]].map(([label, value]) => <div key={String(label)}><p className="text-xs font-medium uppercase text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>)}</div> : noData(Settings, "Settings unavailable", "Quiz settings have not been initialized.")}{!canAdmin && <p className="text-xs text-muted-foreground">Only Quiz administrators can change global settings.</p>}</TabsContent>
      </Tabs>

      <Dialog open={dialog === "drive"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>Create assessment drive</DialogTitle><DialogDescription>Creates a draft. Candidates cannot enter until it is configured and made live.</DialogDescription></DialogHeader><div className="grid gap-4"><div><Label htmlFor="drive-name">Drive name</Label><Input id="drive-name" value={driveForm.name} onChange={(e) => setDriveForm((v) => ({ ...v, name: e.target.value }))} /></div><div><Label htmlFor="drive-code">Access code</Label><Input id="drive-code" maxLength={6} className="uppercase font-mono" value={driveForm.accessCode} onChange={(e) => setDriveForm((v) => ({ ...v, accessCode: e.target.value }))} placeholder="ABC123" /></div><div><Label>Mode</Label><Select value={driveForm.mode} onValueChange={(mode) => setDriveForm((v) => ({ ...v, mode }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="on_site">On-site</SelectItem><SelectItem value="remote">Remote</SelectItem></SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="drive-start">Starts</Label><Input id="drive-start" type="datetime-local" value={driveForm.startsAt} onChange={(e) => setDriveForm((v) => ({ ...v, startsAt: e.target.value }))} /></div><div><Label htmlFor="drive-end">Ends</Label><Input id="drive-end" type="datetime-local" value={driveForm.endsAt} onChange={(e) => setDriveForm((v) => ({ ...v, endsAt: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button loading={createDrive.isPending} onClick={() => createDrive.mutate()}>Create draft</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={dialog === "role"} onOpenChange={(open) => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>Create role blueprint</DialogTitle><DialogDescription>Creates the role shell. Assessment sections are configured separately.</DialogDescription></DialogHeader><div className="grid gap-4"><div><Label htmlFor="role-name">Role name</Label><Input id="role-name" value={roleForm.name} onChange={(e) => setRoleForm((v) => ({ ...v, name: e.target.value }))} /></div><div><Label htmlFor="role-code">Role code</Label><Input id="role-code" value={roleForm.code} onChange={(e) => setRoleForm((v) => ({ ...v, code: e.target.value }))} placeholder="OPS_ASSOCIATE" /></div><div><Label>Department</Label><Select value={roleForm.department} onValueChange={(department) => setRoleForm((v) => ({ ...v, department }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{data?.departments.map((department) => <SelectItem key={department.code} value={department.code}>{department.name}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="shortlist">Shortlist %</Label><Input id="shortlist" type="number" min="0" max="100" value={roleForm.shortlist} onChange={(e) => setRoleForm((v) => ({ ...v, shortlist: e.target.value }))} /></div><div><Label htmlFor="hold">Hold %</Label><Input id="hold" type="number" min="0" max="100" value={roleForm.hold} onChange={(e) => setRoleForm((v) => ({ ...v, hold: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button loading={createRole.isPending} onClick={() => createRole.mutate()}>Create role</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}