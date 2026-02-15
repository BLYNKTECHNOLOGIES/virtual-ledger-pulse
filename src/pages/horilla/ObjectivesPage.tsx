import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Target, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  name: string;
  employee_id: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const emptyForm = {
  title: "",
  description: "",
  objective_type: "individual",
  status: "draft",
  priority: "medium",
  progress: 0,
  start_date: "",
  due_date: "",
  review_cycle: "",
  employee_id: "",
};

export default function ObjectivesPage() {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [objRes, empRes] = await Promise.all([
      (supabase as any).from("hr_objectives").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("hr_employees").select("id, name, employee_id").eq("status", "active"),
    ]);
    if (objRes.data) setObjectives(objRes.data);
    if (empRes.data) setEmployees(empRes.data);
    setLoading(false);
  }

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(obj: Objective) {
    setEditId(obj.id);
    setForm({
      title: obj.title,
      description: obj.description || "",
      objective_type: obj.objective_type,
      status: obj.status,
      priority: obj.priority,
      progress: obj.progress,
      start_date: obj.start_date || "",
      due_date: obj.due_date || "",
      review_cycle: obj.review_cycle || "",
      employee_id: obj.employee_id || "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const payload: any = {
      title: form.title.trim(),
      description: form.description || null,
      objective_type: form.objective_type,
      status: form.status,
      priority: form.priority,
      progress: Number(form.progress),
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      review_cycle: form.review_cycle || null,
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
    fetchAll();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this objective?")) return;
    const { error } = await (supabase as any).from("hr_objectives").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    fetchAll();
  }

  const filtered = objectives.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search && !o.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const empMap = Object.fromEntries(employees.map((e) => [e.id, e.name]));

  if (loading) return <div className="flex items-center justify-center py-24 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Objectives & Key Results</h1>
          <p className="text-gray-500 text-sm">Set and track OKRs for individuals, teams, and the company</p>
        </div>
        <Button className="bg-[#E8604C] hover:bg-[#d4553f] text-white" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> New Objective
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input placeholder="Search objectives..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Objectives List */}
      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400">No objectives found</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((obj) => (
            <Card key={obj.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-[#E8604C]" />
                      <h3 className="font-semibold text-gray-900">{obj.title}</h3>
                    </div>
                    {obj.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{obj.description}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant="outline" className={STATUS_COLORS[obj.status]}>{obj.status}</Badge>
                      <Badge variant="outline" className={PRIORITY_COLORS[obj.priority]}>{obj.priority}</Badge>
                      <span className="text-xs text-gray-500 capitalize">{obj.objective_type}</span>
                      {obj.employee_id && empMap[obj.employee_id] && (
                        <span className="text-xs text-gray-400">• {empMap[obj.employee_id]}</span>
                      )}
                      {obj.review_cycle && <span className="text-xs text-gray-400">• {obj.review_cycle}</span>}
                      {obj.due_date && <span className="text-xs text-gray-400">• Due: {obj.due_date}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <div className="w-28">
                      <div className="flex items-center gap-2">
                        <Progress value={obj.progress} className="h-2" />
                        <span className="text-xs font-medium text-gray-600 w-8">{obj.progress}%</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(obj)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(obj.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Objective" : "New Objective"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.objective_type} onValueChange={(v) => setForm({ ...form, objective_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Progress (%)</Label>
                <Input type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Review Cycle</Label>
                <Input placeholder="e.g. Q1-2026" value={form.review_cycle} onChange={(e) => setForm({ ...form, review_cycle: e.target.value })} />
              </div>
              <div>
                <Label>Assign To</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name} ({e.employee_id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full bg-[#E8604C] hover:bg-[#d4553f] text-white" onClick={handleSave}>
              {editId ? "Update Objective" : "Create Objective"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
