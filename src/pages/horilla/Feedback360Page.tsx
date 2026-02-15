import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Star, MessageSquare, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Feedback {
  id: string;
  employee_id: string;
  reviewer_id: string | null;
  review_cycle: string;
  feedback_type: string;
  rating: number | null;
  strengths: string | null;
  improvements: string | null;
  comments: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
}

interface Employee {
  id: string;
  name: string;
  employee_id: string;
}

const TYPE_COLORS: Record<string, string> = {
  self: "bg-purple-100 text-purple-700",
  peer: "bg-blue-100 text-blue-700",
  manager: "bg-amber-100 text-amber-700",
  subordinate: "bg-emerald-100 text-emerald-700",
};

const emptyForm = {
  employee_id: "",
  reviewer_id: "",
  review_cycle: "",
  feedback_type: "peer",
  rating: "",
  strengths: "",
  improvements: "",
  comments: "",
};

export default function Feedback360Page() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [fbRes, empRes] = await Promise.all([
      (supabase as any).from("hr_feedback_360").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("hr_employees").select("id, name, employee_id").eq("status", "active"),
    ]);
    if (fbRes.data) setFeedbacks(fbRes.data);
    if (empRes.data) setEmployees(empRes.data);
    setLoading(false);
  }

  async function handleCreate() {
    if (!form.employee_id || !form.review_cycle.trim()) {
      toast.error("Employee and review cycle are required");
      return;
    }
    const payload: any = {
      employee_id: form.employee_id,
      reviewer_id: form.reviewer_id || null,
      review_cycle: form.review_cycle.trim(),
      feedback_type: form.feedback_type,
      rating: form.rating ? Number(form.rating) : null,
      strengths: form.strengths || null,
      improvements: form.improvements || null,
      comments: form.comments || null,
      status: form.rating ? "submitted" : "pending",
      submitted_at: form.rating ? new Date().toISOString() : null,
    };

    const { error } = await (supabase as any).from("hr_feedback_360").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Feedback created");
    setDialogOpen(false);
    setForm(emptyForm);
    fetchAll();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this feedback?")) return;
    const { error } = await (supabase as any).from("hr_feedback_360").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    fetchAll();
  }

  const empMap = Object.fromEntries(employees.map((e) => [e.id, e.name]));

  const filtered = feedbacks.filter((f) => {
    if (typeFilter !== "all" && f.feedback_type !== typeFilter) return false;
    const empName = empMap[f.employee_id] || "";
    if (search && !empName.toLowerCase().includes(search.toLowerCase()) && !f.review_cycle.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function renderStars(rating: number | null) {
    if (!rating) return <span className="text-xs text-gray-400">Not rated</span>;
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star key={s} className={`h-3.5 w-3.5 ${s <= rating ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
        ))}
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center py-24 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">360° Feedback</h1>
          <p className="text-gray-500 text-sm">Multi-directional performance feedback</p>
        </div>
        <Button className="bg-[#E8604C] hover:bg-[#d4553f] text-white" onClick={() => { setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Feedback
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input placeholder="Search by name or cycle..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="self">Self</SelectItem>
            <SelectItem value="peer">Peer</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="subordinate">Subordinate</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400">No feedback records found</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((fb) => (
            <Card key={fb.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{empMap[fb.employee_id] || "Unknown"}</p>
                    <p className="text-xs text-gray-500">{fb.review_cycle}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(fb.id)}>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={TYPE_COLORS[fb.feedback_type]}>{fb.feedback_type}</Badge>
                  <Badge variant="outline" className={fb.status === "submitted" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                    {fb.status}
                  </Badge>
                </div>
                {renderStars(fb.rating)}
                {fb.reviewer_id && empMap[fb.reviewer_id] && (
                  <p className="text-xs text-gray-400">Reviewer: {empMap[fb.reviewer_id]}</p>
                )}
                {fb.strengths && <p className="text-xs text-gray-600 line-clamp-2"><strong>Strengths:</strong> {fb.strengths}</p>}
                {fb.improvements && <p className="text-xs text-gray-600 line-clamp-2"><strong>Improvements:</strong> {fb.improvements}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New 360° Feedback</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee *</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} ({e.employee_id})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reviewer</Label>
              <Select value={form.reviewer_id} onValueChange={(v) => setForm({ ...form, reviewer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select reviewer" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} ({e.employee_id})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Review Cycle *</Label>
                <Input placeholder="e.g. Q1-2026" value={form.review_cycle} onChange={(e) => setForm({ ...form, review_cycle: e.target.value })} />
              </div>
              <div>
                <Label>Feedback Type</Label>
                <Select value={form.feedback_type} onValueChange={(v) => setForm({ ...form, feedback_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Self</SelectItem>
                    <SelectItem value="peer">Peer</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="subordinate">Subordinate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Rating (1–5)</Label>
              <Input type="number" min={1} max={5} value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />
            </div>
            <div>
              <Label>Strengths</Label>
              <Textarea value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Areas for Improvement</Label>
              <Textarea value={form.improvements} onChange={(e) => setForm({ ...form, improvements: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Comments</Label>
              <Textarea value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} rows={2} />
            </div>
            <Button className="w-full bg-[#E8604C] hover:bg-[#d4553f] text-white" onClick={handleCreate}>
              Submit Feedback
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
