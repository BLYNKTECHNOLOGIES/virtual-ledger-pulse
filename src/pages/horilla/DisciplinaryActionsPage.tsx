import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, AlertTriangle, Search, Gavel, Users } from "lucide-react";

const ACTION_TYPES = [
  { value: "verbal_warning", label: "Verbal Warning", color: "bg-yellow-100 text-yellow-800" },
  { value: "written_warning", label: "Written Warning", color: "bg-orange-100 text-orange-800" },
  { value: "suspension", label: "Suspension", color: "bg-red-100 text-red-800" },
  { value: "demotion", label: "Demotion", color: "bg-purple-100 text-purple-800" },
  { value: "termination", label: "Termination", color: "bg-red-200 text-red-900" },
  { value: "probation", label: "Probation", color: "bg-blue-100 text-blue-800" },
  { value: "counseling", label: "Counseling", color: "bg-green-100 text-green-800" },
];

const UNIT_OPTIONS = ["days", "weeks", "months"];

export default function DisciplinaryActionsPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [form, setForm] = useState({
    action_type: "verbal_warning",
    employee_ids: [] as string[],
    description: "",
    start_date: "",
    duration: "",
    unit_in: "days",
  });

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ["hr_disciplinary_actions", typeFilter],
    queryFn: async () => {
      let query = (supabase as any).from("hr_disciplinary_actions")
        .select("*")
        .order("created_at", { ascending: false });
      if (typeFilter !== "all") query = query.eq("action_type", typeFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees")
        .select("id, badge_id, first_name, last_name")
        .eq("is_active", true).order("first_name");
      return data || [];
    },
  });

  const empMap = Object.fromEntries(employees.map((e: any) => [e.id, `${e.first_name} ${e.last_name} (${e.badge_id})`]));

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.employee_ids.length) throw new Error("Select at least one employee");
      if (!form.description) throw new Error("Description is required");
      const { error } = await (supabase as any).from("hr_disciplinary_actions").insert({
        action_type: form.action_type,
        employee_ids: form.employee_ids,
        description: form.description,
        start_date: form.start_date || null,
        duration: form.duration ? parseInt(form.duration) : null,
        unit_in: form.duration ? form.unit_in : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_disciplinary_actions"] });
      setShowAdd(false);
      setForm({ action_type: "verbal_warning", employee_ids: [], description: "", start_date: "", duration: "", unit_in: "days" });
      toast.success("Disciplinary action recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const getActionBadge = (type: string) => {
    const found = ACTION_TYPES.find(a => a.value === type);
    return found ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${found.color}`}>{found.label}</span> : type;
  };

  const filtered = actions.filter((a: any) => {
    if (!search) return true;
    const empNames = (a.employee_ids || []).map((id: string) => empMap[id] || "").join(" ");
    return empNames.toLowerCase().includes(search.toLowerCase()) || a.description?.toLowerCase().includes(search.toLowerCase());
  });

  // Stats
  const stats = ACTION_TYPES.map(t => ({
    ...t,
    count: actions.filter((a: any) => a.action_type === t.value).length,
  })).filter(s => s.count > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Gavel className="h-5 w-5" /> Disciplinary Actions</h1>
          <p className="text-sm text-muted-foreground">Track warnings, suspensions, and other disciplinary measures</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> New Action</Button>
      </div>

      {/* Summary cards */}
      {stats.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {stats.map(s => (
            <Card key={s.value} className="flex-1 min-w-[120px]">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold">{s.count}</div>
                <div className={`text-xs font-medium px-2 py-0.5 rounded-full inline-block mt-1 ${s.color}`}>{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by employee or description..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No disciplinary actions found</TableCell></TableRow>
              ) : filtered.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="text-sm">{a.start_date ? format(new Date(a.start_date), "dd MMM yyyy") : format(new Date(a.created_at), "dd MMM yyyy")}</TableCell>
                  <TableCell>{getActionBadge(a.action_type)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {(a.employee_ids || []).map((id: string) => (
                        <span key={id} className="text-xs">{empMap[id] || id}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate text-sm">{a.description}</TableCell>
                  <TableCell className="text-sm">{a.duration ? `${a.duration} ${a.unit_in || "days"}` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Disciplinary Action</DialogTitle>
            <DialogDescription>Document a warning, suspension, or other disciplinary measure</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Action Type</Label>
              <Select value={form.action_type} onValueChange={v => setForm({ ...form, action_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Employees</Label>
              <Select onValueChange={v => {
                if (!form.employee_ids.includes(v)) setForm({ ...form, employee_ids: [...form.employee_ids, v] });
              }}>
                <SelectTrigger><SelectValue placeholder="Add employee..." /></SelectTrigger>
                <SelectContent>
                  {employees.filter((e: any) => !form.employee_ids.includes(e.id)).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-1 mt-1">
                {form.employee_ids.map(id => (
                  <Badge key={id} variant="secondary" className="cursor-pointer" onClick={() => setForm({ ...form, employee_ids: form.employee_ids.filter(i => i !== id) })}>
                    {empMap[id] || id} ✕
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Describe the incident and action taken..." />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label>Duration</Label>
                <Input type="number" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="e.g. 7" />
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={form.unit_in} onValueChange={v => setForm({ ...form, unit_in: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Record Action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
