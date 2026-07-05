import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, X, Building2, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";

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

  const inputCls = "w-full border border-border rounded-lg px-3 h-9 text-sm outline-none bg-background focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Departments"
        description={`${filteredDepts.length} department${filteredDepts.length !== 1 ? "s" : ""}`}
        actions={
          <button
            onClick={() => { setForm({ name: "", code: "", description: "", icon: "📁" }); setEditId(null); setAddOpen(true); }}
            className="flex items-center gap-2 h-9 bg-[#E8604C] text-primary-foreground px-4 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Department
          </button>
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
              <button
                onClick={() => { setForm({ name: "", code: "", description: "", icon: "📁" }); setEditId(null); setAddOpen(true); }}
                className="flex items-center gap-2 h-9 bg-[#E8604C] text-primary-foreground px-4 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors"
              >
                <Plus className="h-4 w-4" /> Add Department
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDepts.map((d) => (
            <div key={d.id} className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#E8604C]/10 flex items-center justify-center text-lg">
                    {d.icon || "📁"}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
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
              {d.description && <p className="text-sm text-muted-foreground mt-3">{d.description}</p>}
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {empCounts?.[d.id] || 0} employees
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl w-full max-w-md shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#E8604C]" />
                {editId ? "Edit" : "Add"} Department
              </h2>
              <button onClick={closeDialog} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Code *</label>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} placeholder="e.g. ENG" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm outline-none bg-background focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20 resize-none" rows={2} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={closeDialog} className="h-9 px-4 text-sm font-medium text-muted-foreground rounded-lg hover:bg-muted">Cancel</button>
              <button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.code || saveMutation.isPending}
                className="h-9 px-4 text-sm font-medium text-primary-foreground bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
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
