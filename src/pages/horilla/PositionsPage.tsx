import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, Briefcase, Search, FileText, Library } from "lucide-react";
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
import { JobDescriptionViewer } from "@/components/horilla/positions/JobDescriptionViewer";
import { JobDescriptionLibraryDialog } from "@/components/horilla/positions/JobDescriptionLibraryDialog";


export default function PositionsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", department_id: "", is_active: true });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "tentative">("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [viewingJd, setViewingJd] = useState<JobDescriptionRow | null>(null);


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
        is_active: form.is_active,
      };
      if (editId) {
        const { data, error } = await supabase.from("positions").update(payload).eq("id", editId).select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("No row updated (permission denied or position missing)");
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
    onError: (e: any) => toast.error(`Failed to save position: ${e?.message || "unknown error"}`),
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
    onError: (e: any) => toast.error(`Failed to delete position: ${e?.message || "unknown error"}`),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("positions").update({ is_active: !isActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_positions"] });
      toast.success("Position status updated");
    },
  });

  const closeDialog = () => { setAddOpen(false); setEditId(null); setForm({ title: "", department_id: "", is_active: true }); };

  const getDeptName = (id: string | null) => departments?.find((d) => d.id === id)?.name || "—";

  const { data: jobDescriptions } = useJobDescriptions();
  const jdForPosition = (positionId: string) =>
    (jobDescriptions || []).find((j) => j.position_id === positionId) || null;

  const activeCount = (positions || []).filter((p: any) => p.is_active !== false).length;
  const tentativeCount = (positions || []).length - activeCount;

  const filteredPositions = (positions || []).filter(p => {
    const term = searchTerm.toLowerCase();
    const matchesTerm = p.title.toLowerCase().includes(term);
    const isActive = (p as any).is_active !== false;
    const matchesStatus =
      statusFilter === "all" || (statusFilter === "active" ? isActive : !isActive);
    return matchesTerm && matchesStatus;
  });

  return (
    <div className="hrms-page space-y-4">
      <PageHeader
        title="Positions"
        description={`${filteredPositions.length} position${filteredPositions.length !== 1 ? "s" : ""} · ${activeCount} active in the organisation · ${tentativeCount} tentative · ${(jobDescriptions || []).length} job descriptions available`}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" className="h-9 w-full sm:w-auto" onClick={() => setLibraryOpen(true)}>
              <Library className="h-4 w-4" />
              JD Library
            </Button>
            <Button
              onClick={() => { setForm({ title: "", department_id: "", is_active: true }); setEditId(null); setAddOpen(true); }}
              className="h-9 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Add Position
            </Button>
          </div>
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
          title={searchTerm ? "No positions matching your search" : "No positions yet"}
          description={searchTerm ? "Try a different search term." : "Create your first position to get started."}
          action={
            !searchTerm ? (
              <Button
                onClick={() => { setForm({ title: "", department_id: "", is_active: true }); setEditId(null); setAddOpen(true); }}
                className="h-9"
              >
                <Plus className="h-4 w-4" /> Add Position
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveList
          items={filteredPositions}
          isLoading={isLoading}
          columns={[
            { key: "position", label: "Position" },
            { key: "department", label: "Department" },
            { key: "jd", label: "Job Description" },
            { key: "status", label: "Status" },

            { key: "actions", label: "Actions", className: "text-right" },
          ]}
          keyFor={(p: any) => p.id}
          renderRow={(p: any) => (
            <>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Briefcase className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium text-foreground break-words">{p.title}</span>
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
                <div
                  className="flex items-center gap-2"
                  title={
                    p.is_active
                      ? "Active in the organisation — filled or actively being filled. Switch off to mark tentative."
                      : "Tentative — planned on paper, not being filled right now. Switch on to mark active."
                  }
                >
                  <Switch
                    checked={p.is_active !== false}
                    disabled={toggleActiveMutation.isPending}
                    onCheckedChange={() => toggleActiveMutation.mutate({ id: p.id, isActive: p.is_active })}
                  />
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    p.is_active
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  }`}>
                    {p.is_active ? "Active" : "Tentative"}
                  </span>
                </div>
              </td>
              <td className="py-3 px-4 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => { setForm({ title: p.title, department_id: p.department_id || "", is_active: p.is_active !== false }); setEditId(p.id); setAddOpen(true); }}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><Edit className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setDeleteTarget({ id: p.id, name: p.title })}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
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
                    <p className="font-medium text-foreground break-words">{p.title}</p>
                    <p className="text-xs text-muted-foreground break-words">{getDeptName(p.department_id)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={p.is_active !== false}
                    disabled={toggleActiveMutation.isPending}
                    onCheckedChange={() => toggleActiveMutation.mutate({ id: p.id, isActive: p.is_active })}
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

                <button onClick={() => { setForm({ title: p.title, department_id: p.department_id || "", is_active: p.is_active !== false }); setEditId(p.id); setAddOpen(true); }}
                  className="p-2 rounded-md hover:bg-muted text-muted-foreground"><Edit className="h-4 w-4" /></button>
                <button onClick={() => setDeleteTarget({ id: p.id, name: p.title })}
                  className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

            </div>
          )}
        />
      )}

      <ResponsiveDialog
        open={addOpen}
        onOpenChange={(open) => (open ? setAddOpen(true) : closeDialog())}
        title={<span className="text-sm font-semibold flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" />{editId ? "Edit" : "Add"} Position</span>}
        footer={
          <>
            <Button variant="outline" className="h-9" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.title || saveMutation.isPending} className="h-9">
              {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 mt-1" />
          </div>
          <div>
            <Label>Department</Label>
            <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Select</option>
              {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            New positions start Active. Use the switch in the list to mark a role tentative (planned on paper, not being filled right now).
          </p>
        </div>
      </ResponsiveDialog>

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
