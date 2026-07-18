import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, Building2, Search } from "lucide-react";
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
  const [form, setForm] = useState({ name: "", code: "", description: "", icon: "📁" });
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
        }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("departments").insert({
          name: form.name, code: form.code, description: form.description, icon: form.icon,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Department updated" : "Department created");
      queryClient.invalidateQueries({ queryKey: ["hr_departments"] });
      closeDialog();
    },
    onError: () => toast.error("Failed to save department"),
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
    onError: () => toast.error("Failed to delete department"),
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
  });

  const closeDialog = () => {
    setAddOpen(false);
    setEditId(null);
    setForm({ name: "", code: "", description: "", icon: "📁" });
  };

  const openEdit = (d: any) => {
    setForm({ name: d.name, code: d.code, description: d.description || "", icon: d.icon || "📁" });
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
            onClick={() => { setForm({ name: "", code: "", description: "", icon: "📁" }); setEditId(null); setAddOpen(true); }}
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
                onClick={() => { setForm({ name: "", code: "", description: "", icon: "📁" }); setEditId(null); setAddOpen(true); }}
                className="h-9"
              >
                <Plus className="h-4 w-4" /> Add Department
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDepts.map((d) => (
            <div key={d.id} className="bg-card rounded-xl border border-border p-4 sm:p-5 hover:shadow-md transition-shadow min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-lg shrink-0">
                    {d.icon || "📁"}
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
              {d.description && <p className="text-sm text-muted-foreground mt-3 break-words">{d.description}</p>}
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {empCounts?.[d.id] || 0} employees
              </div>
            </div>
          ))}
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
            <AlertDialogDescription>Delete "{deleteTarget?.name}"? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-9" onClick={() => { if (deleteTarget) { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); } }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
