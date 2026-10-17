import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePositionPlanningStatus } from "@/hooks/hrms/useWorkforcePlanning";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { fullName } from "@/lib/hrms/employeeFields";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, Building2, Search, Users } from "lucide-react";
import { getDepartmentVisual } from "@/lib/departmentIcon";

import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "", icon: "", head_employee_id: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: departments, isLoading } = useQuery({
    queryKey: ["hr_departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { hasPermission } = usePermissions();
  const canManageHeads = hasPermission("hrms_manage");
  const navigate = useNavigate();
  const { data: planningStatus } = usePositionPlanningStatus(canManageHeads);
  const { data: deptPositions = [] } = useQuery({
    queryKey: ["hr_positions", "dept-planning"],
    enabled: canManageHeads,
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("id, department_id");
      if (error) throw error;
      return data || [];
    },
  });
  const undecidedIn = (deptId: string) =>
    (deptPositions as any[]).filter((p) => p.department_id === deptId && planningStatus?.get(p.id)?.status === "undecided").length;
  const { data: activeEmployees = [] } = useQuery({
    queryKey: ["dept_head_choices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_employees").select("id, first_name, last_name, badge_id").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data || [];
    },
  });
  // Heads who have since left: the picker lists active employees only, so name them separately.
  const { data: departedHeads = [] } = useQuery({
    queryKey: ["dept_departed_heads"],
    queryFn: async () => {
      const { data: depts } = await supabase.from("departments").select("head_employee_id").not("head_employee_id", "is", null);
      const ids = [...new Set((depts || []).map((d: any) => d.head_employee_id as string))];
      if (!ids.length) return [];
      const { data, error } = await supabase.from("hr_employees").select("id, first_name, last_name, badge_id").in("id", ids).eq("is_active", false);
      if (error) throw error;
      return data || [];
    },
  });
  const departed = (id?: string | null) => (departedHeads as any[]).find((x) => x.id === id);
  const headName = (id?: string | null) => {
    const e: any = activeEmployees.find((x: any) => x.id === id);
    if (e) return fullName(e);
    const gone = departed(id);
    return gone ? `${fullName(gone)} (left) — choose a new head` : null;
  };

  const { data: empCounts } = useQuery({
    queryKey: ["dept_emp_counts"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employee_work_info").select("department_id");
      const counts: Record<string, number> = {};
      (data || []).forEach((w) => {
        if (w.department_id) counts[w.department_id] = (counts[w.department_id] || 0) + 1;
      });
      return counts;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("departments").update({
          name: form.name, code: form.code, description: form.description, icon: form.icon,
          ...(canManageHeads ? { head_employee_id: form.head_employee_id || null } : {}),
        } as any).eq("id", editId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("departments").insert({
          name: form.name, code: form.code, description: form.description, icon: form.icon,
          ...(canManageHeads && form.head_employee_id ? { head_employee_id: form.head_employee_id } : {}),
        } as any).select("id").single();
        if (error) throw error;
        return data?.id as string;
      }
    },
    onSuccess: (newId) => {
      if (!editId && newId && canManageHeads) {
        toast.success("Department created", {
          action: { label: "Add a position to it", onClick: () => navigate(`/hrms/employee/positions?add=1&department=${newId}`) },
          duration: 10000,
        });
      } else toast.success(editId ? "Department updated" : "Department created");
      queryClient.invalidateQueries({ queryKey: ["hr_departments"] });
      closeDialog();
    },
    onError: (e: any) => toast.error(e?.message?.includes("head") ? e.message : "Failed to save department"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Department deleted");
      queryClient.invalidateQueries({ queryKey: ["hr_departments"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to delete department"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("departments").update({ is_active: !isActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_departments"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e?.message || "Could not change the status"),
  });

  const closeDialog = () => {
    setAddOpen(false);
    setEditId(null);
    setForm({ name: "", code: "", description: "", icon: "", head_employee_id: "" });
  };

  const openEdit = (d: any) => {
    setForm({ name: d.name, code: d.code, description: d.description || "", icon: d.icon || "", head_employee_id: d.head_employee_id || "" });
    setEditId(d.id);
    setAddOpen(true);
  };

  const filteredDepts = (departments || []).filter(d => {
    const term = searchTerm.toLowerCase();
    return d.name.toLowerCase().includes(term) || d.code.toLowerCase().includes(term);
  });

  return (
    <div className="hrms-page space-y-4">
      <PageHeader
        title="Departments"
        description={`${filteredDepts.length} department${filteredDepts.length !== 1 ? "s" : ""}`}
        actions={
          <Button
            onClick={() => { setForm({ name: "", code: "", description: "", icon: "", head_employee_id: "" }); setEditId(null); setAddOpen(true); }}
            className="h-9 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Add Department
          </Button>
        }
      />

      {/* Search bar */}
      <div className="flex items-center bg-card rounded-lg border border-border h-9 px-3 w-full max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
        <input
          type="text"
          placeholder="Search departments..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filteredDepts.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={searchTerm ? "No departments matching your search" : "No departments yet"}
          description={searchTerm ? "Try a different search term." : "Create your first department to get started."}
          action={
            !searchTerm ? (
              <Button
                onClick={() => { setForm({ name: "", code: "", description: "", icon: "", head_employee_id: "" }); setEditId(null); setAddOpen(true); }}
                className="h-9"
              >
                <Plus className="h-4 w-4" /> Add Department
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDepts.map((d) => {
            const { Icon: DeptIcon, tone } = getDepartmentVisual(d.name, d.code);
            return (
            <div key={d.id} className="bg-card rounded-xl border border-border p-4 sm:p-5 hover:shadow-md transition-shadow min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tone}`} title={d.name}>
                    <DeptIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground break-words">{d.name}</p>
                    <p className="text-xs text-muted-foreground break-words">{d.code}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleActiveMutation.mutate({ id: d.id, isActive: d.is_active })}
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border cursor-pointer ${
                      d.is_active
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : "bg-destructive/10 text-destructive border-destructive/20"
                    }`}
                  >
                    {d.is_active ? "Active" : "Inactive"}
                  </button>
                  <button onClick={() => openEdit(d)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget({ id: d.id, name: d.name })} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {d.head_employee_id && <p className="text-xs text-muted-foreground mt-2">Head: {headName(d.head_employee_id) || "—"}</p>}
              {d.description && <p className="text-sm text-muted-foreground mt-3 break-words">{d.description}</p>}
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {empCounts?.[d.id] || 0} employee{(empCounts?.[d.id] || 0) === 1 ? "" : "s"}
              </div>
              {canManageHeads && undecidedIn(d.id) > 0 && (
                <Link to={`/hrms/employee/positions?department=${d.id}&planning=undecided`}
                  className="mt-2 inline-block text-xs font-medium text-amber-600 underline-offset-2 hover:underline">
                  {undecidedIn(d.id)} role{undecidedIn(d.id) === 1 ? "" : "s"} not decided for workforce planning
                </Link>
              )}
            </div>
          );})}

        </div>
      )}

      <ResponsiveDialog
        open={addOpen}
        onOpenChange={(open) => (open ? setAddOpen(true) : closeDialog())}
        title={<span className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />{editId ? "Edit" : "Add"} Department</span>}
        footer={
          <>
            <Button variant="outline" className="h-9" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.code || saveMutation.isPending} className="h-9">
              {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9 mt-1" />
          </div>
          <div>
            <Label>Code *</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="h-9 mt-1" placeholder="e.g. ENG" />
          </div>
          {canManageHeads && (
            <div>
              <Label>Head of department</Label>
              <Select value={form.head_employee_id || "none"} onValueChange={(v) => setForm({ ...form, head_employee_id: v === "none" ? "" : v })}>
                <SelectTrigger className="h-9 mt-1 text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No head</SelectItem>
                  {departed(form.head_employee_id) && (
                    <SelectItem value={form.head_employee_id}>{headName(form.head_employee_id)}</SelectItem>
                  )}
                  {activeEmployees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{fullName(e)}{e.badge_id ? ` (${e.badge_id})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">The head sees this department's staffing in their profile and can request more people.</p>
            </div>
          )}
          <div>
            <Label>Description</Label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 min-h-[76px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </ResponsiveDialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" /> Delete Department
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(empCounts?.[deleteTarget?.id ?? ""] || 0) > 0
                ? `"${deleteTarget?.name}" can't be deleted while ${empCounts?.[deleteTarget?.id ?? ""]} employee(s) are assigned to it — move them to another department first, or switch it to Inactive instead.`
                : `Delete "${deleteTarget?.name}"? Its positions and forecast assumptions are deleted with it. Deleting is refused while it still has active staffing lines, desk groups, open requests, jobs or people. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-9 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTarget) { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); } }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
