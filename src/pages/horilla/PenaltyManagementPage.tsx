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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";
import { AlertTriangle, Plus, Settings, FileText, Gavel, Clock, Trash2, Edit2 } from "lucide-react";

export default function PenaltyManagementPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("penalties");
  const [showAddPenalty, setShowAddPenalty] = useState(false);
  const [showEditRule, setShowEditRule] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));
  const [penaltyForm, setPenaltyForm] = useState({
    employee_id: "",
    penalty_type: "manual",
    penalty_reason: "",
    penalty_amount: "",
    penalty_days: "",
    notes: "",
    deduct_from_deposit: false,
  });
  const [ruleForm, setRuleForm] = useState({
    rule_name: "",
    rule_type: "late_slab",
    late_count_min: "",
    late_count_max: "",
    penalty_type: "days",
    penalty_value: "",
    description: "",
  });

  // Fetch penalties
  const { data: penalties = [], isLoading: penaltiesLoading } = useQuery({
    queryKey: ["hr_penalties", monthFilter],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_penalties")
        .select("*, hr_employees!hr_penalties_employee_id_fkey(badge_id, first_name, last_name), hr_penalty_rules!hr_penalties_rule_id_fkey(rule_name)")
        .eq("penalty_month", monthFilter)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch rules
  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ["hr_penalty_rules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_penalty_rules")
        .select("*")
        .order("late_count_min", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch employees
  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active_penalty"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true).order("first_name");
      return data || [];
    },
  });

  // Auto-calculate late penalties for the month
  const autoCalcMutation = useMutation({
    mutationFn: async () => {
      const monthStart = `${monthFilter}-01`;
      const monthEnd = new Date(Number(monthFilter.split("-")[0]), Number(monthFilter.split("-")[1]), 0).toISOString().slice(0, 10);

      // Get late attendance counts per employee
      const { data: attendance, error: attErr } = await (supabase as any)
        .from("hr_attendance")
        .select("employee_id, attendance_status")
        .eq("attendance_status", "late")
        .gte("attendance_date", monthStart)
        .lte("attendance_date", monthEnd);
      if (attErr) throw attErr;

      const lateCounts: Record<string, number> = {};
      (attendance || []).forEach((a: any) => {
        lateCounts[a.employee_id] = (lateCounts[a.employee_id] || 0) + 1;
      });

      // Get active slab rules
      const activeRules = rules.filter((r: any) => r.is_active && r.rule_type === "late_slab");
      if (activeRules.length === 0) throw new Error("No active late slab rules configured");

      // Delete existing auto-calculated late penalties for this month
      await (supabase as any)
        .from("hr_penalties")
        .delete()
        .eq("penalty_month", monthFilter)
        .eq("penalty_type", "late_slab")
        .eq("is_applied", false);

      // Generate penalties
      const newPenalties: any[] = [];
      for (const [empId, count] of Object.entries(lateCounts)) {
        // Find matching slab rule (highest matching)
        const matchingRule = activeRules
          .filter((r: any) => count >= r.late_count_min && (r.late_count_max === null || count <= r.late_count_max))
          .sort((a: any, b: any) => b.late_count_min - a.late_count_min)[0];

        if (matchingRule) {
          newPenalties.push({
            employee_id: empId,
            penalty_month: monthFilter,
            penalty_type: "late_slab",
            penalty_reason: `${count} late marks — ${matchingRule.rule_name}`,
            penalty_amount: matchingRule.penalty_type === "fixed" ? Number(matchingRule.penalty_value) : 0,
            penalty_days: matchingRule.penalty_type === "days" ? Number(matchingRule.penalty_value) : 0,
            late_count: count,
            rule_id: matchingRule.id,
          });
        }
      }

      if (newPenalties.length > 0) {
        const { error } = await (supabase as any).from("hr_penalties").insert(newPenalties);
        if (error) throw error;
      }

      return newPenalties.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["hr_penalties"] });
      toast.success(`Auto-calculated ${count} late penalties for ${monthFilter}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Add manual penalty
  const addPenaltyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_penalties").insert({
        employee_id: penaltyForm.employee_id,
        penalty_month: monthFilter,
        penalty_type: penaltyForm.penalty_type,
        penalty_reason: penaltyForm.penalty_reason,
        penalty_amount: Number(penaltyForm.penalty_amount) || 0,
        penalty_days: Number(penaltyForm.penalty_days) || 0,
        notes: penaltyForm.notes || null,
        deduct_from_deposit: penaltyForm.deduct_from_deposit,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_penalties"] });
      setShowAddPenalty(false);
      setPenaltyForm({ employee_id: "", penalty_type: "manual", penalty_reason: "", penalty_amount: "", penalty_days: "", notes: "", deduct_from_deposit: false });
      toast.success("Penalty added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Delete penalty
  const deletePenaltyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_penalties").delete().eq("id", id).eq("is_applied", false);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_penalties"] });
      toast.success("Penalty deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Toggle rule active
  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any).from("hr_penalty_rules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_penalty_rules"] });
    },
  });

  // Save rule
  const saveRuleMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        rule_name: ruleForm.rule_name,
        rule_type: ruleForm.rule_type,
        late_count_min: Number(ruleForm.late_count_min) || 0,
        late_count_max: ruleForm.late_count_max ? Number(ruleForm.late_count_max) : null,
        penalty_type: ruleForm.penalty_type,
        penalty_value: Number(ruleForm.penalty_value) || 0,
        description: ruleForm.description || null,
      };
      if (editingRule) {
        const { error } = await (supabase as any).from("hr_penalty_rules").update(payload).eq("id", editingRule.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("hr_penalty_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_penalty_rules"] });
      setShowEditRule(false);
      setEditingRule(null);
      setRuleForm({ rule_name: "", rule_type: "late_slab", late_count_min: "", late_count_max: "", penalty_type: "days", penalty_value: "", description: "" });
      toast.success(editingRule ? "Rule updated" : "Rule created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_penalty_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_penalty_rules"] });
      toast.success("Rule deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalPenaltyAmount = penalties.reduce((s: number, p: any) => s + Number(p.penalty_amount || 0), 0);
  const totalPenaltyDays = penalties.reduce((s: number, p: any) => s + Number(p.penalty_days || 0), 0);
  const appliedCount = penalties.filter((p: any) => p.is_applied).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Penalty Management</h1>
          <p className="text-sm text-muted-foreground">Configure penalty rules, auto-calculate from attendance, or add manual penalties</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Penalties", value: penalties.length, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
          { label: "Penalty Days", value: `${totalPenaltyDays} days`, icon: Clock, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "Fixed Amount", value: `₹${totalPenaltyAmount.toLocaleString()}`, icon: Gavel, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Applied to Payroll", value: `${appliedCount}/${penalties.length}`, icon: FileText, color: "text-green-600", bg: "bg-green-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="penalties"><AlertTriangle className="h-4 w-4 mr-1" /> Penalties</TabsTrigger>
          <TabsTrigger value="rules"><Settings className="h-4 w-4 mr-1" /> Penalty Rules</TabsTrigger>
        </TabsList>

        {/* Penalties Tab */}
        <TabsContent value="penalties" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="w-48" />
            <Button variant="outline" onClick={() => autoCalcMutation.mutate()} disabled={autoCalcMutation.isPending}>
              <Clock className="h-4 w-4 mr-1" /> {autoCalcMutation.isPending ? "Calculating..." : "Auto-Calculate Late Penalties"}
            </Button>
            <Button onClick={() => setShowAddPenalty(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
              <Plus className="h-4 w-4 mr-1" /> Add Manual Penalty
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Late Count</TableHead>
                    <TableHead>Days Deducted</TableHead>
                    <TableHead>₹ Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {penaltiesLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : penalties.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No penalties for {monthFilter}</TableCell></TableRow>
                  ) : (
                    penalties.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          {p.hr_employees?.first_name} {p.hr_employees?.last_name}
                          <span className="text-xs text-muted-foreground ml-1">({p.hr_employees?.badge_id})</span>
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            p.penalty_type === "late_slab" ? "bg-orange-100 text-orange-700" :
                            p.penalty_type === "manual" ? "bg-purple-100 text-purple-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {p.penalty_type === "late_slab" ? "Late Slab" : p.penalty_type === "manual" ? "Manual" : p.penalty_type}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{p.penalty_reason}</TableCell>
                        <TableCell>{p.late_count || "—"}</TableCell>
                        <TableCell className="text-orange-600 font-medium">{p.penalty_days > 0 ? `${p.penalty_days} day${p.penalty_days > 1 ? "s" : ""}` : "—"}</TableCell>
                        <TableCell className="text-red-600 font-medium">{p.penalty_amount > 0 ? `₹${Number(p.penalty_amount).toLocaleString()}` : "—"}</TableCell>
                        <TableCell>
                          {p.is_applied ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Applied</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Pending</span>
                          )}
                          {p.deduct_from_deposit && (
                            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">From Deposit</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {!p.is_applied && (
                            <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => deletePenaltyMutation.mutate(p.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Configure slab-based rules for automatic late penalty calculation</p>
            <Button onClick={() => { setEditingRule(null); setRuleForm({ rule_name: "", rule_type: "late_slab", late_count_min: "", late_count_max: "", penalty_type: "days", penalty_value: "", description: "" }); setShowEditRule(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Rule
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule Name</TableHead>
                    <TableHead>Late Range</TableHead>
                    <TableHead>Penalty</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rulesLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : rules.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No rules configured</TableCell></TableRow>
                  ) : (
                    rules.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.rule_name}</TableCell>
                        <TableCell>
                          {r.late_count_min}{r.late_count_max ? `–${r.late_count_max}` : "+"} lates
                        </TableCell>
                        <TableCell className="font-medium text-red-600">
                          {r.penalty_type === "days" ? `${r.penalty_value} day${r.penalty_value > 1 ? "s" : ""} salary` : `₹${Number(r.penalty_value).toLocaleString()}`}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">{r.description || "—"}</TableCell>
                        <TableCell>
                          <Switch checked={r.is_active} onCheckedChange={(checked) => toggleRuleMutation.mutate({ id: r.id, is_active: checked })} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => {
                              setEditingRule(r);
                              setRuleForm({
                                rule_name: r.rule_name,
                                rule_type: r.rule_type,
                                late_count_min: String(r.late_count_min),
                                late_count_max: r.late_count_max ? String(r.late_count_max) : "",
                                penalty_type: r.penalty_type,
                                penalty_value: String(r.penalty_value),
                                description: r.description || "",
                              });
                              setShowEditRule(true);
                            }}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => deleteRuleMutation.mutate(r.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Manual Penalty Dialog */}
      <Dialog open={showAddPenalty} onOpenChange={setShowAddPenalty}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Penalty</DialogTitle>
            <DialogDescription>Add a disciplinary or manual penalty for an employee for {monthFilter}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={penaltyForm.employee_id} onValueChange={(v) => setPenaltyForm({ ...penaltyForm, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Penalty Type</Label>
              <Select value={penaltyForm.penalty_type} onValueChange={(v) => setPenaltyForm({ ...penaltyForm, penalty_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual / Disciplinary</SelectItem>
                  <SelectItem value="absence">Absence Without Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason</Label>
              <Input value={penaltyForm.penalty_reason} onChange={(e) => setPenaltyForm({ ...penaltyForm, penalty_reason: e.target.value })} placeholder="e.g. Unauthorized absence, policy violation..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Days to Deduct</Label>
                <Input type="number" step="0.5" min="0" value={penaltyForm.penalty_days} onChange={(e) => setPenaltyForm({ ...penaltyForm, penalty_days: e.target.value })} placeholder="e.g. 0.5, 1" />
                <p className="text-xs text-muted-foreground mt-1">Salary days deducted</p>
              </div>
              <div>
                <Label>Fixed Amount (₹)</Label>
                <Input type="number" min="0" value={penaltyForm.penalty_amount} onChange={(e) => setPenaltyForm({ ...penaltyForm, penalty_amount: e.target.value })} placeholder="e.g. 500" />
                <p className="text-xs text-muted-foreground mt-1">Additional fixed penalty</p>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={penaltyForm.notes} onChange={(e) => setPenaltyForm({ ...penaltyForm, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border">
              <input
                type="checkbox"
                id="deduct_from_deposit"
                checked={penaltyForm.deduct_from_deposit}
                onChange={(e) => setPenaltyForm({ ...penaltyForm, deduct_from_deposit: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="deduct_from_deposit" className="text-sm font-medium cursor-pointer">
                Deduct from Security Deposit
              </label>
              <p className="text-xs text-muted-foreground ml-auto">Instead of salary, deduct from employee's deposit balance</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPenalty(false)}>Cancel</Button>
            <Button onClick={() => addPenaltyMutation.mutate()} disabled={!penaltyForm.employee_id || !penaltyForm.penalty_reason} className="bg-[#E8604C] hover:bg-[#d4553f]">
              Add Penalty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rule Edit Dialog */}
      <Dialog open={showEditRule} onOpenChange={setShowEditRule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Rule" : "Add Penalty Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rule Name</Label>
              <Input value={ruleForm.rule_name} onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })} placeholder="e.g. 3 Lates = Half Day" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Min Late Count</Label>
                <Input type="number" min="1" value={ruleForm.late_count_min} onChange={(e) => setRuleForm({ ...ruleForm, late_count_min: e.target.value })} />
              </div>
              <div>
                <Label>Max Late Count (empty = unlimited)</Label>
                <Input type="number" min="1" value={ruleForm.late_count_max} onChange={(e) => setRuleForm({ ...ruleForm, late_count_max: e.target.value })} placeholder="No max" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Penalty Type</Label>
                <Select value={ruleForm.penalty_type} onValueChange={(v) => setRuleForm({ ...ruleForm, penalty_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">Salary Days</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{ruleForm.penalty_type === "days" ? "Days to Deduct" : "Amount (₹)"}</Label>
                <Input type="number" step="0.5" min="0" value={ruleForm.penalty_value} onChange={(e) => setRuleForm({ ...ruleForm, penalty_value: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })} placeholder="Optional description..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditRule(false)}>Cancel</Button>
            <Button onClick={() => saveRuleMutation.mutate()} disabled={!ruleForm.rule_name || !ruleForm.penalty_value}>
              {editingRule ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
