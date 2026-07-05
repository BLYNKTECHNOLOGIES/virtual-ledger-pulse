import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { Plus, CalendarDays, Users, Trash2 } from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function WeeklyOffPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("patterns");
  const [showAddPattern, setShowAddPattern] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [form, setForm] = useState({ name: "", weekly_offs: [0] as number[], is_alternating: false, alternate_week_offs: [] as number[], description: "" });
  const [assignForm, setAssignForm] = useState({ employee_id: "", pattern_id: "" });

  const { data: patterns = [] } = useQuery({
    queryKey: ["hr_weekly_off_patterns"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_weekly_off_patterns").select("*").order("name");
      return data || [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["hr_employee_weekly_off"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employee_weekly_off")
        .select("*, hr_employees!hr_employee_weekly_off_employee_id_fkey(badge_id, first_name, last_name), hr_weekly_off_patterns!hr_employee_weekly_off_pattern_id_fkey(name)")
        .order("created_at", { ascending: false });
      return data || [];
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

  const toggleDay = (day: number, field: "weekly_offs" | "alternate_week_offs") => {
    const current = form[field];
    const updated = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
    setForm({ ...form, [field]: updated });
  };

  const savePatternMutation = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error("Pattern name is required");
      const { error } = await (supabase as any).from("hr_weekly_off_patterns").insert({
        name: form.name,
        weekly_offs: form.weekly_offs,
        is_alternating: form.is_alternating,
        alternate_week_offs: form.is_alternating ? form.alternate_week_offs : null,
        description: form.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_weekly_off_patterns"] });
      setShowAddPattern(false);
      setForm({ name: "", weekly_offs: [0], is_alternating: false, alternate_week_offs: [], description: "" });
      toast.success("Pattern created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!assignForm.employee_id || !assignForm.pattern_id) throw new Error("Select employee and pattern");
      const { error } = await (supabase as any).from("hr_employee_weekly_off").insert({
        employee_id: assignForm.employee_id,
        pattern_id: assignForm.pattern_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_weekly_off"] });
      setShowAssign(false);
      setAssignForm({ employee_id: "", pattern_id: "" });
      toast.success("Weekly-off pattern assigned");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_employee_weekly_off").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_weekly_off"] });
      toast.success("Assignment removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Weekly Off Management"
        description="Define weekly-off patterns and assign them to employees"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="patterns">Patterns ({patterns.length})</TabsTrigger>
          <TabsTrigger value="assignments">Assignments ({assignments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="patterns" className="space-y-3">
          <div className="flex justify-end">
            <Button className="h-9" onClick={() => setShowAddPattern(true)}><Plus className="h-4 w-4 mr-1" /> New Pattern</Button>
          </div>
          {patterns.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No patterns defined yet"
              description="Create a weekly-off pattern to get started."
              action={<Button className="h-9" onClick={() => setShowAddPattern(true)}><Plus className="h-4 w-4 mr-1" /> New Pattern</Button>}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {patterns.map((p: any) => (
                <Card key={p.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{p.name}</p>
                      <Badge variant={p.is_active !== false ? "default" : "destructive"} className="text-[10px]">
                        {p.is_active !== false ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(p.weekly_offs || []).map((d: number) => (
                        <Badge key={d} variant="secondary" className="text-[10px]">{DAYS[d]}</Badge>
                      ))}
                    </div>
                    {p.is_alternating && p.alternate_week_offs?.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground">Alternate weeks:</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {p.alternate_week_offs.map((d: number) => (
                            <Badge key={d} variant="outline" className="text-[10px]">{DAYS[d]}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="assignments" className="space-y-3">
          <div className="flex justify-end">
            <Button className="h-9" onClick={() => setShowAssign(true)} disabled={patterns.length === 0}>
              <Users className="h-4 w-4 mr-1" /> Assign Pattern
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {assignments.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No assignments yet"
                  description="Assign a weekly-off pattern to an employee."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Employee</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Pattern</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm">
                          {a.hr_employees ? `${a.hr_employees.first_name} ${a.hr_employees.last_name} (${a.hr_employees.badge_id})` : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{a.hr_weekly_off_patterns?.name || "—"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(a.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Pattern Dialog */}
      <Dialog open={showAddPattern} onOpenChange={setShowAddPattern}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Create Weekly-Off Pattern</DialogTitle>
            <DialogDescription>Define which days are off each week</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Pattern Name *</Label>
              <Input className="h-9 mt-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard (Sun off)" />
            </div>
            <div>
              <Label>Weekly Offs</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {DAYS.map((d, i) => (
                  <Badge key={i} variant={form.weekly_offs.includes(i) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleDay(i, "weekly_offs")}>
                    {d}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_alternating} onCheckedChange={v => setForm({ ...form, is_alternating: v })} />
              <Label>Alternating week pattern</Label>
            </div>
            {form.is_alternating && (
              <div>
                <Label>Alternate Week Offs</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {DAYS.map((d, i) => (
                    <Badge key={i} variant={form.alternate_week_offs.includes(i) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleDay(i, "alternate_week_offs")}>
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Description</Label>
              <Input className="h-9 mt-1" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-9" onClick={() => setShowAddPattern(false)}>Cancel</Button>
            <Button className="h-9" onClick={() => savePatternMutation.mutate()} disabled={savePatternMutation.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Assign Weekly-Off Pattern</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select value={assignForm.employee_id} onValueChange={v => setAssignForm({ ...assignForm, employee_id: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pattern</Label>
              <Select value={assignForm.pattern_id} onValueChange={v => setAssignForm({ ...assignForm, pattern_id: v })}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select pattern..." /></SelectTrigger>
                <SelectContent>
                  {patterns.filter((p: any) => p.is_active !== false).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-9" onClick={() => setShowAssign(false)}>Cancel</Button>
            <Button className="h-9" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
