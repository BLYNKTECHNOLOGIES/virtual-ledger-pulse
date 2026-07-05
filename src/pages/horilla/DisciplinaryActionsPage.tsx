import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

const ACTION_TYPES = [
  { value: "verbal_warning", label: "Verbal Warning", color: "bg-warning/10 text-warning border-warning/20" },
  { value: "written_warning", label: "Written Warning", color: "bg-warning/10 text-warning border-warning/20" },
  { value: "suspension", label: "Suspension", color: "bg-destructive/10 text-destructive border-destructive/20" },
  { value: "demotion", label: "Demotion", color: "bg-primary/10 text-primary border-primary/20" },
  { value: "termination", label: "Termination", color: "bg-destructive/20 text-destructive border-destructive/30" },
  { value: "probation", label: "Probation", color: "bg-info/10 text-info border-info/20" },
  { value: "counseling", label: "Counseling", color: "bg-success/10 text-success border-success/20" },
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
    return found
      ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${found.color}`}>{found.label}</span>
      : type;
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
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title={<span className="flex items-center gap-2"><Gavel className="h-5 w-5" /> Disciplinary Actions</span>}
        description="Track warnings, suspensions, and other disciplinary measures"
        actions={
          <Button className="h-9" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Action
          </Button>
        }
      />

      {/* Summary cards */}
      {stats.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {stats.map(s => (
            <Card key={s.value} className="flex-1 min-w-[120px]">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold tabular-nums">{s.count}</div>
                <div className={`text-[10px] font-medium px-2 py-0.5 rounded-full border inline-block mt-1 ${s.color}`}>{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by employee or description..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No disciplinary actions found"
          description="Record disciplinary actions to track warnings and measures"
          action={
            <Button className="h-9" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Action
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Date</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Type</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Employees</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Description</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm tabular-nums">{a.start_date ? format(new Date(a.start_date), "dd MMM yyyy") : format(new Date(a.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell>{getActionBadge(a.action_type)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {(a.employee_ids || []).map((id: string) => (
                          <span key={id} className="text-xs">{empMap[id] || id}</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm">{a.description}</TableCell>
                    <TableCell className="text-sm tabular-nums">{a.duration ? `${a.duration} ${a.unit_in || "days"}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Gavel className="h-4 w-4" /> Record Disciplinary Action
            </DialogTitle>
            <DialogDescription>Document a warning, suspension, or other disciplinary measure</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Action Type</Label>
              <Select value={form.action_type} onValueChange={v => setForm({ ...form, action_type: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Add employee..." /></SelectTrigger>
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
              <Textarea className="mt-1" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Describe the incident and action taken..." />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Start Date</Label>
                <Input className="h-9 mt-1" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label>Duration</Label>
                <Input className="h-9 mt-1" type="number" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="e.g. 7" />
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={form.unit_in} onValueChange={v => setForm({ ...form, unit_in: v })}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-9" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button className="h-9" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Record Action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
