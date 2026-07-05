import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Target, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";

interface Objective {
  id: string;
  title: string;
  description: string | null;
  objective_type: string;
  status: string;
  priority: string;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  review_cycle: string | null;
  key_results: any[];
  employee_id: string | null;
  created_at: string;
}

interface Employee {
  id: string;
  badge_id: string;
  first_name: string;
  last_name: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-foreground border border-muted-foreground/20",
  active: "bg-info/10 text-info border border-info/20",
  completed: "bg-success/10 text-success border border-success/20",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/20",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground border border-muted-foreground/20",
  medium: "bg-warning/10 text-warning border border-warning/20",
  high: "bg-warning/10 text-warning border border-warning/20",
  critical: "bg-destructive/10 text-destructive border border-destructive/20",
};

const emptyForm = {
  title: "", description: "", objective_type: "individual", status: "draft",
  priority: "medium", progress: 0, start_date: "", due_date: "", review_cycle: "", employee_id: "",
};

export default function ObjectivesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: objectives = [], isLoading: objLoading } = useQuery({
    queryKey: ['hr_objectives'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_objectives").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Objective[];
    },
  });

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ['hr_employees_active'],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() => (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true));
      return data as Employee[];
    },
  });

  const loading = objLoading || empLoading;

  function openCreate() { setEditId(null); setForm(emptyForm); setDialogOpen(true); }

  function openEdit(obj: Objective) {
    setEditId(obj.id);
    setForm({
      title: obj.title, description: obj.description || "", objective_type: obj.objective_type,
      status: obj.status, priority: obj.priority, progress: obj.progress,
      start_date: obj.start_date || "", due_date: obj.due_date || "",
      review_cycle: obj.review_cycle || "", employee_id: obj.employee_id || "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const payload: any = {
      title: form.title.trim(), description: form.description || null,
      objective_type: form.objective_type, status: form.status, priority: form.priority,
      progress: Number(form.progress), start_date: form.start_date || null,
      due_date: form.due_date || null, review_cycle: form.review_cycle || null,
      employee_id: form.employee_id || null,
    };
    if (form.status === "completed" && !editId) payload.completed_at = new Date().toISOString();
    let error;
    if (editId) {
      ({ error } = await (supabase as any).from("hr_objectives").update(payload).eq("id", editId));
    } else {
      ({ error } = await (supabase as any).from("hr_objectives").insert(payload));
    }
    if (error) { toast.error(error.message); return; }
    toast.success(editId ? "Objective updated" : "Objective created");
    setDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['hr_objectives'] });
  }

  async function executeDelete(id: string) {
    const { error } = await (supabase as any).from("hr_objectives").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    queryClient.invalidateQueries({ queryKey: ['hr_objectives'] });
    setDeleteTarget(null);
  }

  const filtered = objectives.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search && !o.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const empMap = Object.fromEntries(employees.map((e) => [e.id, `${e.first_name} ${e.last_name}`]));

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <TableSkeleton rows={6} columns={4} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Objectives & Key Results"
        description="Set and track OKRs for individuals, teams, and the company"
        actions={
          <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f] text-primary-foreground" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> New Objective
          </Button>
        }
      />

      <div className="flex gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search objectives..." className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Target} title="No objectives found" description="Try adjusting filters or create a new objective." action={<Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f] text-primary-foreground" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />New Objective</Button>} />
      ) : (
        <div className="space-y-3">
          {filtered.map((obj) => (
            <Card key={obj.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-[#E8604C] shrink-0" />
                      <h3 className="font-semibold text-foreground truncate">{obj.title}</h3>
                    </div>
                    {obj.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{obj.description}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[obj.status]}`}>{obj.status}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[obj.priority]}`}>{obj.priority}</span>
                      <span className="text-xs text-muted-foreground capitalize">{obj.objective_type}</span>
                      {obj.employee_id && empMap[obj.employee_id] && (
                        <span className="text-xs text-muted-foreground">• {empMap[obj.employee_id]}</span>
                      )}
                      {obj.review_cycle && <span className="text-xs text-muted-foreground">• {obj.review_cycle}</span>}
                      {obj.due_date && <span className="text-xs text-muted-foreground tabular-nums">• Due: {obj.due_date}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-28">
                      <div className="flex items-center gap-2">
                        <Progress value={obj.progress} className="h-2" />
                        <span className="text-xs font-medium text-muted-foreground tabular-nums w-8">{obj.progress}%</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(obj)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(obj.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4 text-[#E8604C]" />
              {editId ? "Edit Objective" : "New Objective"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Title *</Label><Input className="h-9 mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea className="mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label><Select value={form.objective_type} onValueChange={(v) => setForm({ ...form, objective_type: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="individual">Individual</SelectItem><SelectItem value="team">Team</SelectItem><SelectItem value="company">Company</SelectItem></SelectContent></Select></div>
              <div><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
              <div><Label>Progress (%)</Label><Input className="h-9 mt-1" type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input className="h-9 mt-1" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>Due Date</Label><Input className="h-9 mt-1" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Review Cycle</Label><Input className="h-9 mt-1" placeholder="e.g. Q1-2026" value={form.review_cycle} onChange={(e) => setForm({ ...form, review_cycle: e.target.value })} /></div>
              <div><Label>Assign To</Label><Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}><SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>)}</SelectContent></Select></div>
            </div>
            <Button className="w-full h-9 bg-[#E8604C] hover:bg-[#d4553f] text-primary-foreground" onClick={handleSave}>
              {editId ? "Update Objective" : "Create Objective"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Objective</AlertDialogTitle>
            <AlertDialogDescription>Delete this objective? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-9" onClick={() => { if (deleteTarget) executeDelete(deleteTarget); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
