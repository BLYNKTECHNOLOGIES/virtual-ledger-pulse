import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DesignationLink } from "@/components/horilla/workforce/DesignationStory";
import { REQ_STATUS_LABEL } from "@/lib/hrms/workforce";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, Briefcase, Search, FileText, Library, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { ResponsiveList } from "@/components/horilla/primitives/ResponsiveList";
import { useJobDescriptions, type JobDescriptionRow } from "@/hooks/useJobDescriptions";
import { invalidatePlanning, useHeadcountPlans, usePositionPlanningStatus, useSeatOccupancy, useStaffingMatrix, type PositionPlanningStatus } from "@/hooks/hrms/useWorkforcePlanning";
import { usePermissions } from "@/hooks/usePermissions";
import { JobDescriptionViewer } from "@/components/horilla/positions/JobDescriptionViewer";
import { JobDescriptionLibraryDialog } from "@/components/horilla/positions/JobDescriptionLibraryDialog";
import { GRADE_OPTIONS, designationSubtree, compareDesignations, deleteRefusalText, gradeLabel, gradeShort, invalidateDesignationCopies } from "@/lib/hrms/designations";


type PlanningChoice = "" | "plan" | "no_staff" | "outside";
type MovePreview = { lines: number; desk_groups: number; requests: number; jobs: number; people: number; onboarding: number; users: number; total: number; refusal: string | null; can_move: boolean };

const PLANNING_LABEL: Record<PositionPlanningStatus, string> = {
  planned: "Planned", no_staff_needed: "No staff needed", outside: "Outside planning", undecided: "Not decided",
};
const PLANNING_CLASS: Record<PositionPlanningStatus, string> = {
  planned: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  no_staff_needed: "bg-muted text-muted-foreground border-border",
  outside: "bg-muted text-muted-foreground border-border",
  undecided: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

/** Designations setup (rows of public.positions). Shown on Organization › Designations (embedded); the old route redirects there. */
export default function PositionsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const deptFilter = params.get("department") || "";
  const planningFilter = params.get("planning") === "undecided";
  const [planningChoice, setPlanningChoice] = useState<PlanningChoice>("");
  const [movePreview, setMovePreview] = useState<MovePreview | null>(null);
  const [editOriginalDept, setEditOriginalDept] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const EMPTY_FORM = { title: "", department_id: "", is_active: true, grade: "", reports_to: "" };
  const [form, setForm] = useState(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState("");
  // ?status=active|tentative opens the list with that filter (the Departments cards link with status=active).
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "tentative">(() => {
    const s = params.get("status");
    return s === "active" || s === "tentative" ? s : "all";
  });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [viewingJd, setViewingJd] = useState<JobDescriptionRow | null>(null);
  const { hasPermission } = usePermissions();
  const canManagePlanning = hasPermission("hrms_manage");
  const [confirmSwitch, setConfirmSwitch] = useState<null | { p: any; kind: "planning" | "active"; value: boolean }>(null);
  const { data: planningStatus } = usePositionPlanningStatus();

  // ?add=1&department=<id> opens Add designation with that department chosen (from the Departments tab).
  useEffect(() => {
    if (params.get("add") === "1") {
      setForm({ ...EMPTY_FORM, department_id: params.get("department") || "" });
      setEditId(null); setPlanningChoice(""); setAddOpen(true);
      const next = new URLSearchParams(params); next.delete("add"); setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const { data: positions, isLoading } = useQuery({
    queryKey: ["hr_positions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("*").order("title");
      if (error) throw error;
      return data || [];
    },
  });

  // Its own key: the Departments tab keeps every department, with all its fields, under ["hr_departments"].
  const { data: departments } = useQuery({
    queryKey: ["hr_departments", "active-names"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (): Promise<{ id: string | null; choice: PlanningChoice }> => {
      const payload: any = {
        title: form.title.trim(),
        department_id: form.department_id || null,
        is_active: form.is_active,
        hierarchy_level: form.grade ? Number(form.grade) : null,
        reports_to_position_id: form.reports_to || null,
      };
      if (editId) {
        const { data, error } = await supabase.from("positions").update(payload).eq("id", editId).select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("No row updated (permission denied or designation missing)");
        return { id: editId, choice: "" };
      }
      if (canManagePlanning && planningChoice === "outside") payload.in_workforce_planning = false;
      const { data, error } = await supabase.from("positions").insert(payload).select("id").single();
      if (error) throw error;
      if (canManagePlanning && planningChoice === "no_staff") {
        const { error: e2 } = await (supabase.rpc as any)("hr_wf_set_no_staff_needed", { p_position: data.id, p_on: true });
        if (e2) throw e2;
      }
      return { id: data.id, choice: canManagePlanning ? planningChoice : "" };
    },
    onSuccess: (res) => {
      toast.success(editId ? "Designation updated" : "Designation created");
      invalidateDesignationCopies(queryClient);
      invalidatePlanning(queryClient);
      closeDialog();
      if (res.choice === "plan" && res.id) navigate(`/hrms/workforce-planning/staffing-plan?plan_role=${res.id}`);
    },
    onError: (e: any) => toast.error(`Failed to save the designation: ${e?.message || "unknown error"}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("positions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Designation deleted");
      invalidateDesignationCopies(queryClient);
    },
    onError: (e: any) => toast.error(deleteRefusalText(e, "designation")),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("positions").update({ is_active: !isActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateDesignationCopies(queryClient);
      invalidatePlanning(queryClient);
      toast.success("Designation status updated");
    },
    onError: (e: any) => toast.error(e?.message || "Could not update the designation"),
  });

  const closeDialog = () => { setAddOpen(false); setEditId(null); setForm(EMPTY_FORM); setPlanningChoice(""); setMovePreview(null); setEditOriginalDept(""); };

  // Editing a department: preview what moves with the designation (lines, desk groups, requests, jobs, people) and confirm once.
  const submitPosition = async () => {
    // Clearing the department would move the designation's lines, desks, requests and people to "no department".
    if (editId && editOriginalDept && !form.department_id) {
      const { data, error } = await (supabase.rpc as any)("hr_wf_position_move_preview", { p_position: editId, p_new_department: null });
      if (error) { toast.error(error.message); return; }
      const pv = data as MovePreview;
      if (pv.total > 0 || pv.users > 0) {
        toast.error(`${form.title.trim() || "This designation"} has staffing lines, desk groups, requests or people in its department. Pick the department to move them to, instead of none.`);
        return;
      }
    }
    if (editId && (form.department_id || "") !== editOriginalDept && form.department_id) {
      const { data, error } = await (supabase.rpc as any)("hr_wf_position_move_preview", { p_position: editId, p_new_department: form.department_id });
      if (error) { toast.error(error.message); return; }
      const pv = data as MovePreview;
      if (pv.refusal) { toast.error(pv.refusal); return; }
      if (pv.total > 0 || pv.users > 0) {
        if (!pv.can_move) { toast.error("Only HRMS managers can move a designation that has staffing lines, desk groups, requests, jobs or people."); return; }
        setMovePreview(pv); return;
      }
    }
    saveMutation.mutate();
  };

  const getDeptName = (id: string | null) => departments?.find((d) => d.id === id)?.name || "—";

  const { data: jobDescriptions } = useJobDescriptions();
  const jdForPosition = (positionId: string) =>
    (jobDescriptions || []).find((j) => j.position_id === positionId) || null;

  // People currently on roll against each designation (active employees only).
  const { data: occupancy } = useSeatOccupancy(false);
  const headcountByPosition = (occupancy || []).reduce<Record<string, number>>((acc, row: any) => {
    if (row.job_position_id) acc[row.job_position_id] = (acc[row.job_position_id] || 0) + 1;
    return acc;
  }, {});
  const hiredCount = (positionId: string) => headcountByPosition[positionId] || 0;

  // Planned figures per designation, straight from the staffing matrix (shared lines count for each designation in them).
  const { rows: matrixRows } = useStaffingMatrix();
  const { data: planRows = [] } = useHeadcountPlans();
  const plannedByPosition = (() => {
    const planRoles = new Map((planRows as any[]).map((pl) => [pl.id, pl.eligible_position_ids?.length ? pl.eligible_position_ids : [pl.position_id]]));
    const m: Record<string, { required: number; current: number; shared: boolean }> = {};
    matrixRows.forEach((r) => {
      const roles: string[] = planRoles.get(r.plan_id) || (r.position_id ? [r.position_id] : []);
      roles.forEach((id) => {
        const e = m[id] || { required: 0, current: 0, shared: false };
        e.required += r.required_hc; e.current += r.current_hc; e.shared = e.shared || roles.length > 1;
        m[id] = e;
      });
    });
    return m;
  })();
  const planningMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("positions").update({ in_workforce_planning: value } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["hr_positions"] });
      invalidatePlanning(queryClient);
      toast.success(v.value ? "Designation is now part of workforce planning" : "Designation left out of workforce planning");
    },
    onError: (e: any) => toast.error(e?.message || "Could not update the designation"),
  });
  const noStaffMutation = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const { error } = await (supabase.rpc as any)("hr_wf_set_no_staff_needed", { p_position: id, p_on: on });
      if (error) throw error;
    },
    onSuccess: () => { invalidatePlanning(queryClient); toast.success("Planning decision saved"); },
    onError: (e: any) => toast.error(e?.message || "Could not save the decision"),
  });
  const PlanningControl = ({ p }: { p: any }) => {
    const inPlan = p.in_workforce_planning !== false;
    const planned = plannedByPosition[p.id];
    const st = planningStatus?.get(p.id);
    return (
      <div className="mt-1.5 space-y-0.5">
        <div className="flex items-center gap-2" title="Leadership and contract designations without a desk are left out of staffing.">
          <Switch
            checked={inPlan}
            disabled={planningMutation.isPending || !canManagePlanning}
            onCheckedChange={(v) => setConfirmSwitch({ p, kind: "planning", value: v })}
            aria-label="In workforce planning"
          />
          <span className="text-[10px] text-muted-foreground">In workforce planning</span>
          {st && (
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${PLANNING_CLASS[st.status]}`}>
              {st.status === "planned" ? `Planned · ${st.line_count} line${st.line_count === 1 ? "" : "s"}` : PLANNING_LABEL[st.status]}
            </span>
          )}
        </div>
        {canManagePlanning && st && (st.status === "undecided" || st.status === "no_staff_needed") && (
          <div className="flex flex-wrap gap-2 text-[10px]">
            <button className="text-primary underline-offset-2 hover:underline" onClick={() => navigate(`/hrms/workforce-planning/staffing-plan?plan_role=${p.id}`)}>Plan its lines</button>
            {st.status === "undecided" ? (
              <button className="text-muted-foreground underline-offset-2 hover:underline" disabled={noStaffMutation.isPending}
                onClick={() => noStaffMutation.mutate({ id: p.id, on: true })}>No staff needed now</button>
            ) : (
              <button className="text-muted-foreground underline-offset-2 hover:underline" disabled={noStaffMutation.isPending}
                onClick={() => noStaffMutation.mutate({ id: p.id, on: false })}>Undo "no staff needed"</button>
            )}
          </div>
        )}
        {inPlan && planned && (
          <p className="text-[10px] text-muted-foreground">
            Planned: required {planned.required} · on roll {planned.current}{planned.shared ? " (shared line)" : ""}
          </p>
        )}
      </div>
    );
  };

  const linesOf = (positionId: string) => {
    const planRoles = new Map((planRows as any[]).map((pl) => [pl.id, pl.eligible_position_ids?.length ? pl.eligible_position_ids : [pl.position_id]]));
    return matrixRows.filter((r) => (planRoles.get(r.plan_id) || []).includes(positionId));
  };
  const confirmLines = confirmSwitch ? linesOf(confirmSwitch.p.id) : [];
  const leaving = !!confirmSwitch && !confirmSwitch.value;
  // Only lines left with no other designation are switched off; shared lines keep their requests.
  // Same rule as the database (hr_wf_position_lines_follow): from the hr_headcount_plans rows, a line is switched off
  // (and its pending requests cancelled) only when this designation is its only designation.
  const confirmPlanIds = confirmSwitch
    ? (planRows as any[]).filter((pl) => pl.is_active !== false).filter((pl) => {
        const roles: string[] = pl.eligible_position_ids?.length ? pl.eligible_position_ids : [pl.position_id];
        return roles.includes(confirmSwitch.p.id) && roles.filter((x) => x !== confirmSwitch.p.id).length === 0;
      }).map((pl) => pl.id as string)
    : [];
  // Same scope as the database's check (hr_wf_position_guard): requests for this designation or on its own lines, and its live ATS jobs.
  const leavingId = leaving ? confirmSwitch!.p.id as string : null;
  const openOnLines = useQuery({
    queryKey: ["workforce_hiring_requirements", "open-on-lines", leavingId, confirmPlanIds.join(",")],
    enabled: !!leavingId,
    queryFn: async () => {
      const statuses = ["draft", "pending_approval", "approved", "recruitment_active", "partially_fulfilled"];
      const cols = "id, requirement_no, status, number_required, shift_label, source, staffing_plan_id";
      const [own, onLines, jobs] = await Promise.all([
        supabase.from("hr_hiring_requirements").select(cols).eq("position_id", leavingId!).in("status", statuses),
        confirmPlanIds.length
          ? supabase.from("hr_hiring_requirements").select(cols).in("staffing_plan_id", confirmPlanIds).in("status", statuses)
          : Promise.resolve({ data: [] as any[], error: null }),
        supabase.from("ats_jobs").select("id, job_code, title, status").eq("position_id", leavingId!).in("status", ["draft", "open", "paused"]),
      ]);
      if (own.error) throw own.error;
      if (onLines.error) throw onLines.error;
      if (jobs.error) throw jobs.error;
      const seen = new Set<string>();
      const reqs = [...(own.data ?? []), ...(onLines.data ?? [])].filter((q: any) => (seen.has(q.id) ? false : (seen.add(q.id), true)));
      return { reqs, jobs: jobs.data ?? [] };
    },
  });
  const leaveCheck = (() => {
    const reqs = (openOnLines.data?.reqs ?? []) as any[];
    const onRemoved = (q: any) => !!q.staffing_plan_id && confirmPlanIds.includes(q.staffing_plan_id);
    const hiring = reqs.filter((q) => ["approved", "recruitment_active", "partially_fulfilled"].includes(q.status));
    const jobs = (openOnLines.data?.jobs ?? []) as any[];
    return {
      pend: reqs.filter((q) => q.status === "pending_approval" && onRemoved(q)),
      drafts: reqs.filter((q) => q.status === "draft" && onRemoved(q)),
      hiring, jobs, blocked: hiring.length > 0 || jobs.length > 0,
    };
  })();

  const blockIfOccupied = (p: any, action: "tentative" | "delete") => {
    const count = hiredCount(p.id);
    const below = action === "delete" ? ((positions || []) as any[]).filter((x) => x.reports_to_position_id === p.id).length : 0;
    if (count === 0 && below > 0) {
      toast.error(`${below} designation${below === 1 ? " reports" : "s report"} to ${p.title} — change ${below === 1 ? "its" : "their"} Reports to first.`);
      return true;
    }
    if (count === 0) return false;
    toast.error(
      action === "tentative"
        ? `${p.title} has ${count} ${count === 1 ? "person" : "people"} on roll — it cannot be marked tentative. Move or offboard them first.`
        : `${p.title} has ${count} ${count === 1 ? "person" : "people"} on roll — it cannot be deleted. Move or offboard them first.`,
    );
    return true;
  };


  const titleOf = (id?: string | null) => (positions || []).find((x: any) => x.id === id)?.title as string | undefined;
  // "Reports to" choices: active designations except this one and everything below it (no loops).
  const reportsToChoices = (() => {
    const blocked = editId ? designationSubtree((positions || []) as any[], editId) : new Set<string>();
    return ((positions || []) as any[]).filter((x) => x.is_active !== false && !blocked.has(x.id)).sort(compareDesignations);
  })();
  const openEdit = (p: any) => {
    setForm({ title: p.title, department_id: p.department_id || "", is_active: p.is_active !== false,
      grade: p.hierarchy_level ? String(p.hierarchy_level) : "", reports_to: p.reports_to_position_id || "" });
    setEditOriginalDept(p.department_id || ""); setEditId(p.id); setAddOpen(true);
  };
  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setPlanningChoice(""); setAddOpen(true); };
  const GradeChip = ({ p }: { p: any }) => (
    <span title={gradeLabel(p.hierarchy_level)}
      className={`shrink-0 rounded border px-1.5 py-px text-[10px] font-medium tabular-nums ${p.hierarchy_level ? "border-border text-foreground" : "border-dashed border-border text-muted-foreground"}`}>
      {gradeShort(p.hierarchy_level) ?? "No grade"}
    </span>
  );

  const activeCount = (positions || []).filter((p: any) => p.is_active !== false).length;
  const tentativeCount = (positions || []).length - activeCount;

  const filteredPositions = (positions || []).filter(p => {
    const term = searchTerm.toLowerCase();
    const matchesTerm = p.title.toLowerCase().includes(term);
    const isActive = (p as any).is_active !== false;
    const matchesStatus =
      statusFilter === "all" || (statusFilter === "active" ? isActive : !isActive);
    const matchesDept = !deptFilter || p.department_id === deptFilter;
    const matchesPlanning = !planningFilter || planningStatus?.get(p.id)?.status === "undecided";
    return matchesTerm && matchesStatus && matchesDept && matchesPlanning;
  });

  const summary = `${filteredPositions.length} designation${filteredPositions.length !== 1 ? "s" : ""} · ${activeCount} active in the organisation · ${tentativeCount} tentative · ${(jobDescriptions || []).length} job descriptions available`;
  const headerActions = (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <Button variant="outline" className="h-9 w-full sm:w-auto" onClick={() => setLibraryOpen(true)}>
        <Library className="h-4 w-4" />
        JD Library
      </Button>
      <Button onClick={openAdd} className="h-9 w-full sm:w-auto">
        <Plus className="h-4 w-4" />
        Add Designation
      </Button>
    </div>
  );

  return (
    <div className={embedded ? "space-y-4" : "hrms-page space-y-4"}>
      {embedded ? (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <p className="text-sm text-muted-foreground">{summary}</p>
          {headerActions}
        </div>
      ) : (
        <PageHeader title="Designations" description={summary} actions={headerActions} />
      )}


      {/* Search bar */}
      <div className="flex items-center bg-card rounded-lg border border-border h-9 px-3 w-full max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
        <input
          type="text"
          placeholder="Search designations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: "all", label: `All (${(positions || []).length})` },
          { key: "active", label: `Active in organisation (${activeCount})` },
          { key: "tentative", label: `Tentative (${tentativeCount})` },
        ] as const).map((chip) => (
          <button
            key={chip.key}
            onClick={() => setStatusFilter(chip.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === chip.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {chip.label}
          </button>
        ))}
        <button
          onClick={() => { const n = new URLSearchParams(params); if (planningFilter) n.delete("planning"); else n.set("planning", "undecided"); setParams(n, { replace: true }); }}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            planningFilter ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
        >
          Not decided ({(positions || []).filter((p: any) => planningStatus?.get(p.id)?.status === "undecided").length})
        </button>
        {deptFilter && (
          <button onClick={() => { const n = new URLSearchParams(params); n.delete("department"); setParams(n, { replace: true }); }}
            className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {getDeptName(deptFilter)} ✕
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : filteredPositions.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={searchTerm ? "No designations matching your search" : "No designations yet"}
          description={searchTerm ? "Try a different search term." : "Create your first designation to get started."}
          action={
            !searchTerm ? (
              <Button onClick={openAdd} className="h-9">
                <Plus className="h-4 w-4" /> Add Designation
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveList
          items={filteredPositions}
          isLoading={isLoading}
          columns={[
            { key: "position", label: "Designation" },
            { key: "department", label: "Department" },
            { key: "jd", label: "Job Description" },
            { key: "people", label: "People on Roll" },
            { key: "status", label: "Status" },


            { key: "actions", label: "Actions", className: "text-right" },
          ]}
          keyFor={(p: any) => p.id}
          renderRow={(p: any) => (
            <>
              <td className="py-3 px-4">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2">
                  <Briefcase className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <DesignationLink id={p.id} label={p.title} className="font-medium text-foreground break-words">{p.title}</DesignationLink>
                      <GradeChip p={p} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground break-words">
                      {p.reports_to_position_id ? `Reports to ${titleOf(p.reports_to_position_id) ?? "a designation that was removed"}` : p.is_active === false ? "Tentative, not in the structure" : "Top of the structure"}
                    </p>
                  </div>
                </div>
              </td>
              <td className="py-3 px-4 text-muted-foreground">{getDeptName(p.department_id)}</td>
              <td className="py-3 px-4">
                {jdForPosition(p.id) ? (
                  <Button variant="outline" className="h-7 text-xs" onClick={() => setViewingJd(jdForPosition(p.id))}>
                    <FileText className="h-3.5 w-3.5" /> View JD
                  </Button>
                ) : (
                  <button onClick={() => setLibraryOpen(true)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                    Link JD
                  </button>
                )}
              </td>

              <td className="py-3 px-4">
                {hiredCount(p.id) > 0 ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                    title={`${hiredCount(p.id)} active ${hiredCount(p.id) === 1 ? "employee holds" : "employees hold"} this designation`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    {hiredCount(p.id)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground" title="Nobody is on roll against this designation">
                    None
                  </span>
                )}
              </td>

              <td className="py-3 px-4">
                <div
                  className="flex items-center gap-2"
                  title={
                    hiredCount(p.id) > 0
                      ? `${hiredCount(p.id)} ${hiredCount(p.id) === 1 ? "person is" : "people are"} on roll — this designation cannot be marked tentative.`
                      : p.is_active
                        ? "Active in the organisation — filled or actively being filled. Switch off to mark tentative."
                        : "Tentative — planned on paper, not being filled right now. Switch on to mark active."
                  }
                >
                  <Switch
                    checked={p.is_active !== false}
                    aria-label={`${p.title} active`}
                    disabled={toggleActiveMutation.isPending || !canManagePlanning || !occupancy || (p.is_active !== false && hiredCount(p.id) > 0)}
                    onCheckedChange={() => {
                      if (p.is_active !== false && blockIfOccupied(p, "tentative")) return;
                      setConfirmSwitch({ p, kind: "active", value: p.is_active === false });
                    }}
                  />
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    p.is_active
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  }`}>
                    {p.is_active ? "Active" : "Tentative"}
                  </span>
                </div>
                <PlanningControl p={p} />
              </td>
              <td className="py-3 px-4 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => openEdit(p)} aria-label={`Edit ${p.title}`} title="Edit"
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><Edit className="h-3.5 w-3.5" /></button>
                  <button
                    onClick={() => { if (!blockIfOccupied(p, "delete")) setDeleteTarget({ id: p.id, name: p.title }); }}
                    disabled={hiredCount(p.id) > 0}
                    aria-label={`Delete ${p.title}`}
                    title={hiredCount(p.id) > 0 ? "People are on roll against this designation" : "Delete designation"}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </td>
            </>
          )}
          renderCard={(p: any) => (
            <div className="hrms-mobile-card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Briefcase className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-medium text-foreground break-words"><DesignationLink id={p.id} label={p.title}>{p.title}</DesignationLink></p>
                      <GradeChip p={p} />
                    </div>
                    <p className="text-xs text-muted-foreground break-words">{getDeptName(p.department_id)}</p>
                    <p className="text-xs text-muted-foreground break-words">
                      {p.reports_to_position_id ? `Reports to ${titleOf(p.reports_to_position_id) ?? "a designation that was removed"}` : p.is_active === false ? "Tentative, not in the structure" : "Top of the structure"}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Users className="h-3 w-3" />
                      {hiredCount(p.id) > 0
                        ? `${hiredCount(p.id)} on roll`
                        : "Nobody on roll"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={p.is_active !== false}
                    aria-label={`${p.title} active`}
                    disabled={toggleActiveMutation.isPending || !canManagePlanning || !occupancy || (p.is_active !== false && hiredCount(p.id) > 0)}
                    onCheckedChange={() => {
                      if (p.is_active !== false && blockIfOccupied(p, "tentative")) return;
                      setConfirmSwitch({ p, kind: "active", value: p.is_active === false });
                    }}
                  />
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    p.is_active
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  }`}>
                    {p.is_active ? "Active" : "Tentative"}
                  </span>
                </div>
              </div>
              <PlanningControl p={p} />
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                {jdForPosition(p.id) ? (
                  <Button variant="outline" className="h-8 text-xs" onClick={() => setViewingJd(jdForPosition(p.id))}>
                    <FileText className="h-3.5 w-3.5" /> View JD
                  </Button>
                ) : (
                  <button onClick={() => setLibraryOpen(true)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                    Link JD
                  </button>
                )}
                <div className="flex items-center gap-1">

                <button onClick={() => openEdit(p)} aria-label={`Edit ${p.title}`}
                  className="p-2 rounded-md hover:bg-muted text-muted-foreground"><Edit className="h-4 w-4" /></button>
                <button
                  onClick={() => { if (!blockIfOccupied(p, "delete")) setDeleteTarget({ id: p.id, name: p.title }); }}
                  disabled={hiredCount(p.id) > 0}
                  aria-label={`Delete ${p.title}`}
                  className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

            </div>
          )}
        />
      )}

      <ResponsiveDialog
        open={addOpen}
        onOpenChange={(open) => (open ? setAddOpen(true) : closeDialog())}
        title={<span className="text-sm font-semibold flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" />{editId ? "Edit" : "Add"} Designation</span>}
        footer={
          <>
            <Button variant="outline" className="h-9" onClick={closeDialog}>Cancel</Button>
            <Button onClick={submitPosition} disabled={!form.title.trim() || saveMutation.isPending || (!editId && canManagePlanning && !planningChoice)} className="h-9">
              {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="designation-title">Title *</Label>
            <Input id="designation-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 mt-1" />
          </div>
          <div>
            <Label htmlFor="designation-department">Department</Label>
            <select id="designation-department" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Select</option>
              {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">People holding this designation are in this department.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Grade</Label>
              <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} aria-label="Grade" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Not graded</option>
                {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}
              </select>
            </div>
            <div>
              <Label>Reports to</Label>
              <select value={form.reports_to} onChange={(e) => setForm({ ...form, reports_to: e.target.value })} aria-label="Reports to" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Nobody — top of the structure</option>
                {form.reports_to && !reportsToChoices.some((x: any) => x.id === form.reports_to) && (
                  <option value={form.reports_to}>{titleOf(form.reports_to) ?? "Removed designation"} (inactive)</option>
                )}
                {reportsToChoices.map((x: any) => <option key={x.id} value={x.id}>{x.title}{x.hierarchy_level ? ` (L${x.hierarchy_level})` : ""}</option>)}
              </select>
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">Grade and "reports to" form the designed structure on Organization › Structure. A person's own manager is set on their profile.</p>
          {!editId && canManagePlanning && (
            <div>
              <Label>Workforce planning *</Label>
              <div className="mt-1 space-y-1.5">
                {([
                  { v: "plan", t: "Plan its staffing lines now", d: "Opens the staffing plan to add its lines after saving." },
                  { v: "no_staff", t: "In planning, no staff needed now", d: "Hiring stays blocked until it gets a line." },
                  { v: "outside", t: "Not part of workforce planning", d: "Leadership or designations without a desk." },
                ] as const).map((o) => (
                  <label key={o.v} className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${planningChoice === o.v ? "border-primary bg-primary/5" : "border-border"}`}>
                    <input type="radio" name="planning-choice" className="mt-1" checked={planningChoice === o.v} onChange={() => setPlanningChoice(o.v)} />
                    <span><span className="text-foreground">{o.t}</span><span className="block text-xs text-muted-foreground">{o.d}</span></span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {!editId && !canManagePlanning && (
            <p className="text-xs text-muted-foreground">An HRMS manager decides how this designation is planned before anyone can hire for it.</p>
          )}
          <p className="text-xs text-muted-foreground">
            New designations start Active. Use the switch in the list to mark one tentative (planned on paper, not being filled right now).
          </p>
        </div>
      </ResponsiveDialog>

      <AlertDialog open={!!movePreview} onOpenChange={(o) => !o && setMovePreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {form.title} to {getDeptName(form.department_id)}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Everything belonging to this designation moves with it, and each moved record gets a history entry:</p>
                <ul className="list-disc space-y-0.5 pl-5 text-foreground">
                  <li>{movePreview?.lines ?? 0} staffing line(s)</li>
                  <li>{movePreview?.desk_groups ?? 0} desk group(s)</li>
                  <li>{movePreview?.requests ?? 0} open hiring request(s)</li>
                  <li>{movePreview?.jobs ?? 0} draft/open/paused job(s)</li>
                  <li>{movePreview?.people ?? 0} active people{movePreview?.onboarding ? ` and ${movePreview.onboarding} onboarding in progress` : ""}</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-9" onClick={() => { setMovePreview(null); saveMutation.mutate(); }}>Move everything</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <JobDescriptionLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        positions={(positions || []).map((p: any) => ({ id: p.id, title: p.title }))}
      />
      <JobDescriptionViewer
        open={!!viewingJd}
        onOpenChange={(o) => !o && setViewingJd(null)}
        title={viewingJd?.role_title || ""}
        subtitle={viewingJd?.reference}
        storagePath={viewingJd?.storage_path || null}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" /> Delete Designation
            </AlertDialogTitle>
            <AlertDialogDescription>Delete "{deleteTarget?.name}"? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-9 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTarget) { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); } }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!confirmSwitch} onOpenChange={(o) => !o && setConfirmSwitch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmSwitch?.kind === "planning"
                ? (confirmSwitch.value ? `Put ${confirmSwitch.p.title} into workforce planning?` : `Take ${confirmSwitch?.p.title} out of workforce planning?`)
                : (confirmSwitch?.value ? `Mark ${confirmSwitch?.p.title} active?` : `Mark ${confirmSwitch?.p.title} tentative?`)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {leaving
                ? confirmLines.length
                  ? "These staffing lines stop counting (lines shared with other designations keep the others):"
                  : "No staffing line uses this designation."
                : "Its earlier staffing lines stay removed. After this, add its lines again from the Staffing Plan (Add line, or Plan these desks on its desk group)."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {leaving && confirmLines.length > 0 && (
            <ul className="space-y-0.5 text-sm text-foreground">
              {confirmLines.map((r) => <li key={r.plan_id}>{r.position_title} · {r.shiftLabel} — required {r.required_hc}, on roll {r.current_hc}</li>)}
            </ul>
          )}
          {leaving && (leaveCheck.blocked || leaveCheck.pend.length > 0 || leaveCheck.drafts.length > 0) && (
            <div className="space-y-2 text-sm">
              {leaveCheck.blocked && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
                <p>
                  {confirmSwitch?.p.title} still has live hiring, so it can't {confirmSwitch?.kind === "planning" ? "leave workforce planning" : "become tentative"} yet.
                  First {[leaveCheck.hiring.length ? "cancel these requests" : null, leaveCheck.jobs.length ? "close these ATS jobs" : null].filter(Boolean).join(" and ")} (an approved request can't move to another designation):
                </p>
                <ul className="text-foreground">
                  {leaveCheck.hiring.map((q: any) => <li key={q.id}>{q.requirement_no} · {REQ_STATUS_LABEL[q.status] ?? q.status} · {q.shift_label || "Any shift"} ×{q.number_required}</li>)}
                  {leaveCheck.jobs.map((j: any) => <li key={j.id}>{j.job_code ?? j.title} · {j.status === "draft" ? "Draft" : j.status === "paused" ? "Paused" : "Open"} ATS job</li>)}
                </ul>
              </div>}
              {!leaveCheck.blocked && leaveCheck.pend.length > 0 && <div>
                <p className="text-muted-foreground">
                  These requests awaiting approval will be cancelled (reason: “{confirmSwitch?.kind === "planning" ? "Position taken out of planning" : "Position marked tentative"}”):
                </p>
                <ul className="text-foreground">{leaveCheck.pend.map((q: any) => <li key={q.id}>{q.requirement_no} · {q.shift_label || "Any shift"} ×{q.number_required}</li>)}</ul>
              </div>}
              {!leaveCheck.blocked && leaveCheck.drafts.length > 0 && <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-warning">
                <p>These drafts stay on the removed lines — move them to another line or cancel them in Hiring requests:</p>
                <ul>{leaveCheck.drafts.map((q: any) => <li key={q.id}>{q.requirement_no ?? "Draft"} · {q.shift_label || "Any shift"} ×{q.number_required}</li>)}</ul>
              </div>}
            </div>
          )}
          {leaving && openOnLines.isError && (
            <p className="text-sm text-destructive">Couldn't check this designation's open hiring requests and ATS jobs, so this can't be confirmed now. Go back and try again.</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction disabled={leaving && (openOnLines.isLoading || openOnLines.isError || leaveCheck.blocked)} onClick={() => {
              const c = confirmSwitch; setConfirmSwitch(null);
              if (!c) return;
              if (c.kind === "planning") planningMutation.mutate({ id: c.p.id, value: c.value });
              else toggleActiveMutation.mutate({ id: c.p.id, isActive: !c.value });
            }}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
