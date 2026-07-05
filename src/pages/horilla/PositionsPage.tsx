import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, X, Briefcase, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

export default function PositionsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", department_id: "", description: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: positions, isLoading } = useQuery({
    queryKey: ["hr_positions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("*").order("title");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["hr_departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        department_id: form.department_id || null,
        description: form.description || null,
      };
      if (editId) {
        const { error } = await supabase.from("positions").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("positions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Position updated" : "Position created");
      queryClient.invalidateQueries({ queryKey: ["hr_positions"] });
      closeDialog();
    },
    onError: () => toast.error("Failed to save position"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("positions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Position deleted");
      queryClient.invalidateQueries({ queryKey: ["hr_positions"] });
    },
    onError: () => toast.error("Failed to delete position"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("positions").update({ is_active: !isActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_positions"] });
      toast.success("Status updated");
    },
  });

  const closeDialog = () => { setAddOpen(false); setEditId(null); setForm({ title: "", department_id: "", description: "" }); };

  const getDeptName = (id: string | null) => departments?.find((d) => d.id === id)?.name || "—";

  const inputCls = "w-full border border-border rounded-lg px-3 h-9 text-sm outline-none bg-background focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  const filteredPositions = (positions || []).filter(p => {
    const term = searchTerm.toLowerCase();
    return p.title.toLowerCase().includes(term) || (p.description || "").toLowerCase().includes(term);
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Positions"
        description={`${filteredPositions.length} position${filteredPositions.length !== 1 ? "s" : ""}`}
        actions={
          <button
            onClick={() => { setForm({ title: "", department_id: "", description: "" }); setEditId(null); setAddOpen(true); }}
            className="flex items-center gap-2 h-9 bg-[#E8604C] text-primary-foreground px-4 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Position
          </button>
        }
      />

      {/* Search bar */}
      <div className="flex items-center bg-card rounded-lg border border-border h-9 px-3 w-full max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
        <input
          type="text"
          placeholder="Search positions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
        />
      </div>

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden p-4">
          <TableSkeleton rows={5} columns={5} />
        </div>
      ) : filteredPositions.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={searchTerm ? "No positions matching your search" : "No positions yet"}
          description={searchTerm ? "Try a different search term." : "Create your first position to get started."}
          action={
            !searchTerm ? (
              <button
                onClick={() => { setForm({ title: "", department_id: "", description: "" }); setEditId(null); setAddOpen(true); }}
                className="flex items-center gap-2 h-9 bg-[#E8604C] text-primary-foreground px-4 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors"
              >
                <Plus className="h-4 w-4" /> Add Position
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Position</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Department</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Description</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Status</th>
                <th className="text-right py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPositions.map((p) => (
                <tr key={p.id} className="border-b border-muted/20 hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-[#E8604C]" />
                      <span className="font-medium text-foreground">{p.title}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{getDeptName(p.department_id)}</td>
                  <td className="py-3 px-4 text-muted-foreground truncate max-w-xs">{p.description || "—"}</td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: p.id, isActive: p.is_active })}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border cursor-pointer ${
                        p.is_active
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : "bg-destructive/10 text-destructive border-destructive/20"
                      }`}
                    >
                      {p.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setForm({ title: p.title, department_id: p.department_id || "", description: p.description || "" }); setEditId(p.id); setAddOpen(true); }}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><Edit className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setDeleteTarget({ id: p.id, name: p.title })}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl w-full max-w-md shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-[#E8604C]" />
                {editId ? "Edit" : "Add"} Position
              </h2>
              <button onClick={closeDialog} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Department</label>
                <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className={inputCls}>
                  <option value="">Select</option>
                  {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm outline-none bg-background focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20 resize-none" rows={2} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={closeDialog} className="h-9 px-4 text-sm font-medium text-muted-foreground rounded-lg hover:bg-muted">Cancel</button>
              <button onClick={() => saveMutation.mutate()} disabled={!form.title || saveMutation.isPending}
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
              <Trash2 className="h-4 w-4 text-destructive" /> Delete Position
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
