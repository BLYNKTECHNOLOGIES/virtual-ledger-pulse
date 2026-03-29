import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { LogOut, Plus, Settings, CheckCircle2, Clock, XCircle, Pencil, Trash2, FileText, ArrowRight } from "lucide-react";

type ResignationEmployee = {
  id: string;
  badge_id: string;
  first_name: string;
  last_name: string;
  hr_employee_work_info: { department_id: string | null; job_role: string | null }[];
  resignation_date: string | null;
  resignation_status: string | null;
  notice_period_end_date: string | null;
  last_working_day: string | null;
  separation_reason: string | null;
  is_active: boolean;
};

type ChecklistItem = {
  id: string;
  employee_id: string;
  template_item_id: string | null;
  item_title: string;
  is_completed: boolean;
  completed_at: string | null;
  notes: string | null;
};

type TemplateItem = {
  id: string;
  item_title: string;
  category: string;
  sequence: number;
  is_active: boolean;
};

export function ResignationTab() {
  const [subTab, setSubTab] = useState("pending");
  const [showInitiateDialog, setShowInitiateDialog] = useState(false);
  const [showChecklistDialog, setShowChecklistDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showAcknowledgement, setShowAcknowledgement] = useState(false);
  const [acknowledgementData, setAcknowledgementData] = useState<any>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<ResignationEmployee | null>(null);
  const [formData, setFormData] = useState({
    employee_id: "",
    resignation_date: "",
    notice_period_end_date: "",
    last_working_day: "",
    separation_reason: "",
  });
  const [newTemplateItem, setNewTemplateItem] = useState({ item_title: "", category: "general" });
  const queryClient = useQueryClient();

  // Fetch employees with resignation data
  const { data: resigningEmployees, isLoading } = useQuery({
    queryKey: ["resignation-employees"],
    queryFn: async () => {
      const { data: employees, error } = await supabase
        .from("hr_employees")
        .select("id, badge_id, first_name, last_name, resignation_date, resignation_status, notice_period_end_date, last_working_day, separation_reason, is_active")
        .not("resignation_status", "is", null)
        .order("resignation_date", { ascending: false });
      if (error) throw error;
      if (!employees?.length) return [] as ResignationEmployee[];

      const employeeIds = employees.map((employee) => employee.id);
      const { data: workInfoRows, error: workInfoError } = await supabase
        .from("hr_employee_work_info")
        .select("employee_id, department_id, job_role")
        .in("employee_id", employeeIds);
      if (workInfoError) throw workInfoError;

      const workInfoByEmployee = new Map<string, { department_id: string | null; job_role: string | null }[]>();
      for (const row of workInfoRows || []) {
        const existing = workInfoByEmployee.get(row.employee_id) || [];
        existing.push({ department_id: row.department_id, job_role: row.job_role });
        workInfoByEmployee.set(row.employee_id, existing);
      }

      return employees.map((employee) => ({
        ...employee,
        hr_employee_work_info: workInfoByEmployee.get(employee.id) || [],
      })) as ResignationEmployee[];
    },
  });

  // Fetch all active employees for initiation dropdown
  const { data: activeEmployees } = useQuery({
    queryKey: ["active-employees-for-resignation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employees")
        .select("id, badge_id, first_name, last_name")
        .eq("is_active", true)
        .is("resignation_status", null)
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch checklist for selected employee
  const { data: checklist, refetch: refetchChecklist } = useQuery({
    queryKey: ["resignation-checklist", selectedEmployee?.id],
    queryFn: async () => {
      if (!selectedEmployee) return [];
      const { data, error } = await supabase
        .from("hr_resignation_checklist")
        .select("*")
        .eq("employee_id", selectedEmployee.id)
        .order("created_at");
      if (error) throw error;
      return data as ChecklistItem[];
    },
    enabled: !!selectedEmployee,
  });

  // Fetch template items
  const { data: templateItems } = useQuery({
    queryKey: ["resignation-template"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_resignation_checklist_template")
        .select("*")
        .order("sequence");
      if (error) throw error;
      return data as TemplateItem[];
    },
  });

  // Initiate resignation — goes to pending_approval first
  const initiateResignation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("hr_employees")
        .update({
          resignation_status: "pending_approval",
          resignation_date: formData.resignation_date,
          notice_period_end_date: formData.notice_period_end_date,
          last_working_day: formData.last_working_day,
          separation_reason: formData.separation_reason,
        })
        .eq("id", formData.employee_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resignation submitted for approval");
      queryClient.invalidateQueries({ queryKey: ["resignation-employees"] });
      queryClient.invalidateQueries({ queryKey: ["active-employees-for-resignation"] });
      setShowInitiateDialog(false);
      setFormData({ employee_id: "", resignation_date: "", notice_period_end_date: "", last_working_day: "", separation_reason: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Approve resignation — moves to notice_period and initializes checklist
  const approveResignation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from("hr_employees")
        .update({ resignation_status: "notice_period" })
        .eq("id", employeeId);
      if (error) throw error;

      // Initialize checklist on approval
      const { error: rpcError } = await supabase.rpc("fn_initialize_resignation_checklist", {
        p_employee_id: employeeId,
      });
      if (rpcError) throw rpcError;
    },
    onSuccess: () => {
      toast.success("Resignation approved — notice period started");
      queryClient.invalidateQueries({ queryKey: ["resignation-employees"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Reject resignation
  const rejectResignation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from("hr_employees")
        .update({ resignation_status: null, resignation_date: null, notice_period_end_date: null, last_working_day: null, separation_reason: null })
        .eq("id", employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resignation rejected");
      queryClient.invalidateQueries({ queryKey: ["resignation-employees"] });
      queryClient.invalidateQueries({ queryKey: ["active-employees-for-resignation"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Toggle checklist item
  const toggleChecklist = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await supabase
        .from("hr_resignation_checklist")
        .update({
          is_completed,
          completed_at: is_completed ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refetchChecklist(),
  });

  // Complete resignation — deactivate employee, auto-create F&F, show acknowledgement
  const completeResignation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { data: empData } = await supabase
        .from("hr_employees")
        .select("first_name, last_name, badge_id, notice_period_end_date, last_working_day, resignation_date, separation_reason")
        .eq("id", employeeId)
        .single();

      const deletionDate = empData?.notice_period_end_date || empData?.last_working_day || new Date().toISOString().split('T')[0];

      const { error } = await (supabase as any)
        .from("hr_employees")
        .update({ 
          resignation_status: "completed",
          is_active: false,
          account_deletion_date: deletionDate,
        })
        .eq("id", employeeId);
      if (error) throw error;

      // Auto-create draft F&F settlement (B3)
      try {
        await (supabase as any).from("hr_fnf_settlements").insert({
          employee_id: employeeId,
          status: "draft",
          settlement_date: empData?.last_working_day || new Date().toISOString().split('T')[0],
          total_earnings: 0,
          total_deductions: 0,
          net_payable: 0,
          notes: "Auto-created on resignation completion",
        });
      } catch (e) {
        console.warn("F&F auto-creation failed (non-fatal):", e);
      }

      return empData;
    },
    onSuccess: (empData) => {
      toast.success("Resignation completed — employee deactivated");
      queryClient.invalidateQueries({ queryKey: ["resignation-employees"] });
      queryClient.invalidateQueries({ queryKey: ["active-employees-for-resignation"] });
      setShowChecklistDialog(false);
      setSelectedEmployee(null);

      // Show acknowledgement summary (B1)
      if (empData) {
        setAcknowledgementData({
          name: `${empData.first_name} ${empData.last_name}`,
          badge: empData.badge_id,
          resignationDate: empData.resignation_date,
          lastWorkingDay: empData.last_working_day,
          reason: empData.separation_reason,
          checklistCompleted: `${completedCount}/${totalCount}`,
        });
        setShowAcknowledgement(true);
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Withdraw resignation
  const withdrawResignation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from("hr_employees")
        .update({ resignation_status: "withdrawn" })
        .eq("id", employeeId);
      if (error) throw error;
      // Clean up checklist
      await supabase.from("hr_resignation_checklist").delete().eq("employee_id", employeeId);
    },
    onSuccess: () => {
      toast.success("Resignation withdrawn");
      queryClient.invalidateQueries({ queryKey: ["resignation-employees"] });
      queryClient.invalidateQueries({ queryKey: ["active-employees-for-resignation"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Template CRUD
  const addTemplateItem = useMutation({
    mutationFn: async () => {
      const maxSeq = templateItems?.length ? Math.max(...templateItems.map(t => t.sequence)) + 1 : 1;
      const { error } = await supabase
        .from("hr_resignation_checklist_template")
        .insert({ item_title: newTemplateItem.item_title, category: newTemplateItem.category, sequence: maxSeq });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template item added");
      queryClient.invalidateQueries({ queryKey: ["resignation-template"] });
      setNewTemplateItem({ item_title: "", category: "general" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteTemplateItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_resignation_checklist_template").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template item removed");
      queryClient.invalidateQueries({ queryKey: ["resignation-template"] });
    },
  });

  const toggleTemplateActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("hr_resignation_checklist_template")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resignation-template"] }),
  });

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "pending_approval": return <Badge className="bg-blue-100 text-blue-800">Pending Approval</Badge>;
      case "notice_period": return <Badge className="bg-amber-100 text-amber-800">Notice Period</Badge>;
      case "completed": return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "withdrawn": return <Badge className="bg-gray-100 text-gray-800">Withdrawn</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const pendingApprovals = resigningEmployees?.filter(e => e.resignation_status === "pending_approval") || [];
  const activeResignations = resigningEmployees?.filter(e => e.resignation_status === "notice_period") || [];
  const completedResignations = resigningEmployees?.filter(e => e.resignation_status === "completed") || [];

  const openChecklist = (emp: ResignationEmployee) => {
    setSelectedEmployee(emp);
    setShowChecklistDialog(true);
  };

  const completedCount = checklist?.filter(c => c.is_completed).length || 0;
  const totalCount = checklist?.length || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h3 className="text-lg font-semibold">Resignation Management</h3>
          <p className="text-sm text-muted-foreground">Track and process employee resignations</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowTemplateDialog(true)}>
            <Settings className="h-4 w-4 mr-1" /> Checklist Template
          </Button>
          <Button size="sm" onClick={() => setShowInitiateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Initiate Resignation
          </Button>
        </div>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-1">
            <FileText className="h-3.5 w-3.5" /> Pending Approval ({pendingApprovals.length})
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-1">
            <Clock className="h-3.5 w-3.5" /> Notice Period ({activeResignations.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Completed ({completedResignations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {pendingApprovals.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No resignations pending approval</CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {pendingApprovals.map(emp => (
                <Card key={emp.id} className="hover:shadow-md transition-shadow border-blue-200 dark:border-blue-800">
                  <CardContent className="py-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{emp.first_name} {emp.last_name}</span>
                          <span className="text-xs text-muted-foreground">#{emp.badge_id}</span>
                          {getStatusBadge(emp.resignation_status)}
                        </div>
                        <div className="text-sm text-muted-foreground">{emp.hr_employee_work_info?.[0]?.job_role || "—"}</div>
                        <div className="text-sm space-x-4">
                          <span>Resigned: <strong>{emp.resignation_date ? new Date(emp.resignation_date).toLocaleDateString() : "—"}</strong></span>
                          <span>Last Day: <strong>{emp.last_working_day ? new Date(emp.last_working_day).toLocaleDateString() : "—"}</strong></span>
                        </div>
                        {emp.separation_reason && <p className="text-sm italic text-muted-foreground">Reason: {emp.separation_reason}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => { if (confirm("Approve this resignation and start notice period?")) approveResignation.mutate(emp.id); }}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { if (confirm("Reject this resignation?")) rejectResignation.mutate(emp.id); }}>
                          <XCircle className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="active">
          {activeResignations.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No active resignations</CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {activeResignations.map(emp => (
                <Card key={emp.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="py-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{emp.first_name} {emp.last_name}</span>
                          <span className="text-xs text-muted-foreground">#{emp.badge_id}</span>
                          {getStatusBadge(emp.resignation_status)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {emp.hr_employee_work_info?.[0]?.job_role || "—"}
                        </div>
                        <div className="text-sm space-x-4">
                          <span>Resigned: <strong>{emp.resignation_date ? new Date(emp.resignation_date).toLocaleDateString() : "—"}</strong></span>
                          <span>Last Day: <strong>{emp.last_working_day ? new Date(emp.last_working_day).toLocaleDateString() : "—"}</strong></span>
                        </div>
                        {emp.separation_reason && <p className="text-sm italic text-muted-foreground">Reason: {emp.separation_reason}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openChecklist(emp)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Checklist
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => {
                          if (confirm("Withdraw this resignation?")) withdrawResignation.mutate(emp.id);
                        }}>
                          <XCircle className="h-4 w-4 mr-1" /> Withdraw
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completedResignations.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No completed resignations</CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {completedResignations.map(emp => (
                <Card key={emp.id} className="opacity-75">
                  <CardContent className="py-4">
                    <div className="flex justify-between items-center">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{emp.first_name} {emp.last_name}</span>
                          <span className="text-xs text-muted-foreground">#{emp.badge_id}</span>
                          {getStatusBadge(emp.resignation_status)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Last day: {emp.last_working_day ? new Date(emp.last_working_day).toLocaleDateString() : "—"}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Initiate Resignation Dialog */}
      <Dialog open={showInitiateDialog} onOpenChange={setShowInitiateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Initiate Resignation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={formData.employee_id} onValueChange={v => setFormData(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {activeEmployees?.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} (#{e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Resignation Date</Label>
              <Input type="date" value={formData.resignation_date} onChange={e => setFormData(p => ({ ...p, resignation_date: e.target.value }))} />
            </div>
            <div>
              <Label>Notice Period End Date</Label>
              <Input type="date" value={formData.notice_period_end_date} onChange={e => setFormData(p => ({ ...p, notice_period_end_date: e.target.value }))} />
            </div>
            <div>
              <Label>Last Working Day</Label>
              <Input type="date" value={formData.last_working_day} onChange={e => setFormData(p => ({ ...p, last_working_day: e.target.value }))} />
            </div>
            <div>
              <Label>Reason for Leaving</Label>
              <Textarea value={formData.separation_reason} onChange={e => setFormData(p => ({ ...p, separation_reason: e.target.value }))} placeholder="e.g. Better opportunity, personal reasons..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInitiateDialog(false)}>Cancel</Button>
            <Button onClick={() => initiateResignation.mutate()} disabled={!formData.employee_id || !formData.resignation_date}>
              Initiate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resignation Checklist Dialog */}
      <Dialog open={showChecklistDialog} onOpenChange={v => { setShowChecklistDialog(v); if (!v) setSelectedEmployee(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Exit Checklist — {selectedEmployee?.first_name} {selectedEmployee?.last_name}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">{completedCount}/{totalCount} items completed</p>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {checklist?.map(item => (
              <div key={item.id} className="flex items-start gap-3 p-2 rounded border">
                <Checkbox
                  checked={item.is_completed}
                  onCheckedChange={(checked) => toggleChecklist.mutate({ id: item.id, is_completed: !!checked })}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <span className={`text-sm ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>
                    {item.item_title}
                  </span>
                  {item.completed_at && (
                    <p className="text-xs text-muted-foreground">Done: {new Date(item.completed_at).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={completedCount < totalCount}
              onClick={() => {
                if (selectedEmployee && confirm("Complete resignation and deactivate this employee?")) {
                  completeResignation.mutate(selectedEmployee.id);
                }
              }}
            >
              {completedCount < totalCount ? `Complete all ${totalCount - completedCount} remaining items` : "Complete Resignation & Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Editor Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Resignation Checklist Template</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {templateItems?.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-2 p-2 rounded border">
                <div className="flex items-center gap-2 flex-1">
                  <Checkbox
                    checked={item.is_active}
                    onCheckedChange={(checked) => toggleTemplateActive.mutate({ id: item.id, is_active: !!checked })}
                  />
                  <span className={`text-sm ${!item.is_active ? "line-through text-muted-foreground" : ""}`}>
                    {item.item_title}
                  </span>
                  <Badge variant="outline" className="text-xs">{item.category}</Badge>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteTemplateItem.mutate(item.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <Input placeholder="New item title" value={newTemplateItem.item_title} onChange={e => setNewTemplateItem(p => ({ ...p, item_title: e.target.value }))} />
            <Select value={newTemplateItem.category} onValueChange={v => setNewTemplateItem(p => ({ ...p, category: v }))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="documentation">Documentation</SelectItem>
                <SelectItem value="handover">Handover</SelectItem>
                <SelectItem value="assets">Assets</SelectItem>
                <SelectItem value="it">IT</SelectItem>
                <SelectItem value="finance">Finance</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => addTemplateItem.mutate()} disabled={!newTemplateItem.item_title}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Resignation Acknowledgement Dialog (B1) */}
      <Dialog open={showAcknowledgement} onOpenChange={setShowAcknowledgement}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Resignation Acknowledgement
            </DialogTitle>
          </DialogHeader>
          {acknowledgementData && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Employee</span>
                  <span className="font-medium">{acknowledgementData.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Badge ID</span>
                  <span className="font-medium">#{acknowledgementData.badge}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Resignation Date</span>
                  <span className="font-medium">{acknowledgementData.resignationDate ? new Date(acknowledgementData.resignationDate).toLocaleDateString() : "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last Working Day</span>
                  <span className="font-medium">{acknowledgementData.lastWorkingDay ? new Date(acknowledgementData.lastWorkingDay).toLocaleDateString() : "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Reason</span>
                  <span className="font-medium">{acknowledgementData.reason || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Checklist</span>
                  <span className="font-medium">{acknowledgementData.checklistCompleted} completed</span>
                </div>
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <p className="text-sm text-green-800 dark:text-green-200">
                  ✓ Employee has been deactivated<br />
                  ✓ F&F Settlement draft created automatically<br />
                  ✓ Account deletion scheduled
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAcknowledgement(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
