import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SeparationReasonSelect } from "@/components/hrms/SeparationReasonSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { dismissInRazorpay } from "@/lib/razorpayPushback";
import { deleteFromEssl } from "@/lib/esslPushback";
import { LogOut, Plus, Settings, CheckCircle2, Clock, XCircle, Pencil, Trash2, FileText, ArrowRight, Mail, ExternalLink } from "lucide-react";
import { EmployeeCombobox } from "@/components/hrms/EmployeePicker";
import { FnFSettlementDialog } from "@/components/hrms/FnFSettlementDialog";
import { deactivateErpAccount, getErpAccountStatus } from "@/lib/erpAccountDeactivation";
import { issueLetterForEmployee, emailIssuedLetter, findIssuedLetter } from "@/lib/issueLetter";
import { ensureIssuedPdf } from "@/lib/ensureIssuedPdf";
import { finalizeSeparation } from "@/lib/finalizeSeparation";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [subTab, setSubTab] = useState("pending");
  const [showInitiateDialog, setShowInitiateDialog] = useState(false);
  const [showChecklistDialog, setShowChecklistDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<ResignationEmployee | null>(null);
  const [formData, setFormData] = useState({
    employee_id: "",
    resignation_date: "",
    notice_period_end_date: "",
    last_working_day: "",
    separation_reason: "",
  });
  const [newTemplateItem, setNewTemplateItem] = useState({ item_title: "", category: "general" });
  const [previewingRelieving, setPreviewingRelieving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: string; id: string; label: string } | null>(null);
  const queryClient = useQueryClient();

  // Deep link from an employee profile: /hrms/employee/separation?initiate=<employeeId>
  useEffect(() => {
    const initiateFor = searchParams.get("initiate");
    if (!initiateFor) return;
    setFormData((prev) => ({ ...prev, employee_id: initiateFor }));
    setShowInitiateDialog(true);
    const next = new URLSearchParams(searchParams);
    next.delete("initiate");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);


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

  // Toggle checklist item.
  // Ticking "ID card / access badge returned" also removes the employee from
  // every registered eSSL biometric device (queued DELETE USERINFO command).
  const toggleChecklist = useMutation({
    mutationFn: async ({ id, is_completed, item_title }: { id: string; is_completed: boolean; item_title?: string }) => {
      const { error } = await supabase
        .from("hr_resignation_checklist")
        .update({
          is_completed,
          completed_at: is_completed ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;

      const t = (item_title || "").toLowerCase();
      const isBadgeItem = t.includes("id card") || t.includes("access badge") || t.includes("badge returned");
      if (is_completed && isBadgeItem && selectedEmployee?.id) {
        const res = await deleteFromEssl(selectedEmployee.id, {
          triggeredFrom: "exit_checklist",
          silent: true,
        });
        return { essl: res };
      }
      return {};
    },
    onSuccess: (res: any) => {
      refetchChecklist();
      const essl = res?.essl;
      if (!essl) return;
      if (essl.ok) {
        toast.success(`Biometric access removed — delete queued on ${essl.queued_count} device(s), applies on next poll`);
      } else if (essl.skipped) {
        toast.info(
          essl.reason === "no_badge_id"
            ? "No biometric PIN linked to this employee — nothing to delete"
            : "No biometric devices registered — nothing to delete",
        );
      } else {
        toast.warning(`Biometric removal failed: ${essl.error || "unknown error"} — remove the user on the device manually`);
      }
    },
    onError: (err: any) => toast.error(err.message),
  });


  // NOTE: there is deliberately no "complete resignation" shortcut here.
  // Deactivating an employee dismisses them in RazorpayX, which closes their
  // payroll record — so an employee stays ACTIVE until their F&F is marked paid.
  // The only completion paths are finaliseSeparationNow (below), the payroll
  // cockpit mark-paid step, and the nightly sweep (which holds unpaid F&F).

  // Withdraw resignation
  const withdrawResignation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from("hr_employees")
        .update({
          resignation_status: null,
          resignation_date: null,
          notice_period_end_date: null,
          last_working_day: null,
          separation_reason: null,
        })
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
      case "pending_approval": return <Badge className="bg-info/10 text-info">Pending Approval</Badge>;
      case "notice_period": return <Badge className="bg-warning/10 text-warning">Notice Period</Badge>;
      case "completed": return <Badge className="bg-success/10 text-success">Completed</Badge>;
      case "withdrawn": return <Badge className="bg-muted text-foreground">Withdrawn</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const pendingApprovals = resigningEmployees?.filter(e => e.resignation_status === "pending_approval") || [];
  const activeResignations = resigningEmployees?.filter(e => e.resignation_status === "notice_period") || [];
  const completedResignations = resigningEmployees?.filter(e => e.resignation_status === "completed") || [];

  // Settlement state for everyone on notice, so the row can offer the final
  // "Complete separation" step once the F&F is verified on RazorpayX.
  const activeIds = activeResignations.map(e => e.id);
  const { data: fnfByEmployee } = useQuery({
    queryKey: ["resignation-fnf-map", activeIds.join(",")],
    enabled: activeIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_fnf_settlements")
        .select("id, employee_id, status, razorpay_push_status, net_payable, payroll_month, razorpay_pushed_at, payment_reference")
        .in("employee_id", activeIds)
        .neq("status", "cancelled");
      const map: Record<string, any> = {};
      (data || []).forEach((r: any) => { map[r.employee_id] = r; });
      return map;
    },
  });

  const separationReadiness = (empId: string) => {
    const s = fnfByEmployee?.[empId];
    if (!s) return { ready: false, why: "No F&F settlement created yet" };
    if (String(s.status) === "paid") return { ready: true, why: "F&F already paid" };
    if (String(s.status) !== "approved") return { ready: false, why: `F&F is still ${s.status} — confirm it first` };
    if (!["pushed", "nothing_to_push"].includes(String(s.razorpay_push_status || "")))
      return { ready: false, why: "F&F lines are not verified on the RazorpayX payroll run yet" };
    return { ready: true, why: "F&F approved and verified on RazorpayX" };
  };

  // Final step: mark the verified settlement paid, close its sources, complete the
  // separation (deactivate + ERP + biometrics) and dismiss in RazorpayX.
  const finaliseSeparationNow = useMutation({
    mutationFn: async (employeeId: string) => {
      const s = fnfByEmployee?.[employeeId];
      const readiness = separationReadiness(employeeId);
      if (!readiness.ready) throw new Error(readiness.why);

      if (s && String(s.status) !== "paid") {
        // The settlement money already travelled through the monthly payroll
        // cockpit (pushed + read-back verified), so the payment reference is
        // inferable — no manual reference typing needed here.
        const cycle = s.payroll_month
          ? new Date(String(s.payroll_month) + "T00:00:00Z").toLocaleString("en-IN", { month: "short", year: "numeric" })
          : "payroll cycle";
        const pushedIst = s.razorpay_pushed_at
          ? new Date(s.razorpay_pushed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST"
          : null;
        const inferredRef =
          s.payment_reference ||
          (String(s.razorpay_push_status) === "nothing_to_push"
            ? `No payout due — settled in RazorpayX payroll ${cycle}`
            : `RazorpayX payroll ${cycle}${pushedIst ? ` — F&F lines verified ${pushedIst}` : ""}`);

        const { error } = await (supabase as any)
          .from("hr_fnf_settlements")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            payment_reference: inferredRef,
            updated_at: new Date().toISOString(),
          })
          .eq("id", s.id);
        if (error) throw error;
        const { error: closeErr } = await (supabase as any).rpc("hr_close_fnf_sources", { p_settlement_id: s.id });
        if (closeErr) toast.error(`Paid, but closing loans/deposits failed: ${closeErr.message}`);
      }

      const fin = await finalizeSeparation(employeeId);
      let dismissal: any = null;
      if (fin.lwd) {
        try {
          dismissal = await dismissInRazorpay(employeeId, {
            dateOfDismissal: fin.lwd,
            reason: fin.separationReason || "F&F settled",
            triggeredFrom: "fnf_paid",
          });
        } catch (e: any) {
          dismissal = { ok: false, error: e?.message || "RazorpayX dismissal failed" };
        }
      } else {
        dismissal = { ok: false, error: "No last working day on record — dismiss in RazorpayX manually." };
      }
      return { fin, dismissal };
    },
    onSuccess: ({ fin, dismissal }: any) => {
      toast.success(`Separation completed for ${fin.name}${fin.erp?.deactivated ? " — ERP login disabled" : ""}`);
      if (dismissal?.scheduled) toast.success(`RazorpayX dismissal scheduled for ${new Date(`${dismissal.effectiveDate}T00:00:00`).toLocaleDateString("en-IN")}`);
      else if (dismissal?.ok) toast.success("Dismissal propagated to RazorpayX");
      else if (dismissal?.skipped) toast.info("Employee is not linked to RazorpayX — nothing to propagate.");
      else if (dismissal?.manualRequired) toast.warning("Dismiss manually in the RazorpayX dashboard — this employee never activated their RazorpayX account.");
      else if (dismissal?.error) toast.warning(dismissal.error);
      queryClient.invalidateQueries({ queryKey: ["resignation-employees"] });
      queryClient.invalidateQueries({ queryKey: ["resignation-fnf-map"] });
      queryClient.invalidateQueries({ queryKey: ["hr_fnf_settlements"] });
    },
    onError: (e: any) => toast.error(e.message),
  });


  const openChecklist = (emp: ResignationEmployee) => {
    setSelectedEmployee(emp);
    setShowChecklistDialog(true);
  };

  const completedCount = checklist?.filter(c => c.is_completed).length || 0;
  const totalCount = checklist?.length || 0;

  // ── In-checklist exit actions: ERP ID deactivation + F&F creation ──────────
  const { data: erpAccount, refetch: refetchErpAccount } = useQuery({
    queryKey: ["resignation-erp-account", selectedEmployee?.id],
    queryFn: async () => (selectedEmployee ? getErpAccountStatus(selectedEmployee.id) : { userId: null, status: null }),
    enabled: !!selectedEmployee,
  });

  const { data: fnfForEmployee, refetch: refetchFnf } = useQuery({
    queryKey: ["resignation-fnf", selectedEmployee?.id],
    queryFn: async () => {
      if (!selectedEmployee) return null;
      const { data } = await (supabase as any)
        .from("hr_fnf_settlements")
        .select("*")
        .eq("employee_id", selectedEmployee.id)
        .neq("status", "cancelled")
        .maybeSingle();
      return data || null;
    },
    enabled: !!selectedEmployee,
  });

  // The F&F button in the checklist opens the SAME settlement dialog used on
  // the Full & Final Settlement page — the saved record flows through the
  // identical draft → submit → approve → RazorpayX push → paid pipeline.
  const [showFnfDialog, setShowFnfDialog] = useState(false);

  // Ticks the checklist item whose title matches, once its action is done.
  const markChecklistItem = async (matcher: (title: string) => boolean) => {
    const item = (checklist || []).find(c => matcher(c.item_title.toLowerCase()));
    if (item && !item.is_completed) {
      await supabase
        .from("hr_resignation_checklist")
        .update({ is_completed: true, completed_at: new Date().toISOString() })
        .eq("id", item.id);
      refetchChecklist();
    }
  };

  const deactivateErp = useMutation({
    mutationFn: async () => {
      if (!selectedEmployee) throw new Error("No employee selected");
      const res = await deactivateErpAccount(selectedEmployee.id);
      if (!res.deactivated) throw new Error(res.reason || "Could not deactivate ERP account");
      await markChecklistItem(t => t.includes("access revoked") || t.includes("erp"));
    },
    onSuccess: () => {
      toast.success("ERP ID deactivated — the employee can no longer sign in");
      refetchErpAccount();
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Called after the shared F&F dialog saves from inside the checklist.
  const onFnFSavedFromChecklist = async () => {
    await markChecklistItem(t => t.includes("full & final") || t.includes("full and final"));
    refetchFnf();
  };

  // ── Relieving cum experience letter: generate → file → (optional) email ─────
  const { data: relievingLetter, refetch: refetchRelieving } = useQuery({
    queryKey: ["resignation-relieving-letter", selectedEmployee?.id],
    queryFn: async () => (selectedEmployee ? findIssuedLetter(selectedEmployee.id, "relieving") : null),
    enabled: !!selectedEmployee,
  });

  const generateRelieving = useMutation({
    mutationFn: async () => {
      if (!selectedEmployee) throw new Error("No employee selected");
      const res = await issueLetterForEmployee(selectedEmployee.id, "relieving");
      await markChecklistItem(t => t.includes("relieving") || t.includes("experience letter"));
      return res;
    },
    onSuccess: (res) => {
      toast.success(
        res.existed
          ? `Relieving letter ${res.referenceNo} already issued — filed under the employee's documents`
          : `Relieving letter ${res.referenceNo} generated and filed under the employee's documents`,
      );
      refetchRelieving();
      queryClient.invalidateQueries({ queryKey: ["hr_documents_issued"] });
      queryClient.invalidateQueries({ queryKey: ["hr_employee_documents", selectedEmployee?.id] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const emailRelieving = useMutation({
    mutationFn: async () => {
      if (!relievingLetter?.id) throw new Error("Generate the relieving letter first");
      return emailIssuedLetter(relievingLetter.id);
    },
    onSuccess: (to) => {
      toast.success(`Relieving letter emailed to ${to}`);
      refetchRelieving();
    },
    onError: (err: any) => toast.error(err.message),
  });



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
                <Card key={emp.id} className="hover:shadow-md transition-shadow border-info/20 dark:border-info">
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
                        <Button size="sm" onClick={() => setConfirmAction({ type: 'approve', id: emp.id, label: 'Approve this resignation and start notice period?' })}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setConfirmAction({ type: 'reject', id: emp.id, label: 'Reject this resignation?' })}>
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
                      <div className="flex gap-2 items-center">
                        <Button size="sm" variant="outline" onClick={() => openChecklist(emp)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Checklist
                        </Button>
                        <Button
                          size="sm"
                          disabled={!separationReadiness(emp.id).ready || finaliseSeparationNow.isPending}
                          title={separationReadiness(emp.id).why}
                          onClick={() => setConfirmAction({
                            type: 'finalise',
                            id: emp.id,
                            label: `Complete the separation for ${emp.first_name} ${emp.last_name}? The settlement is marked paid, the employee is deactivated, the ERP login and biometrics are removed and the RazorpayX dismissal is sent with last working day ${emp.last_working_day ? new Date(emp.last_working_day).toLocaleDateString("en-IN") : "—"}.`,
                          })}
                        >
                          <LogOut className="h-4 w-4 mr-1" /> Complete separation
                        </Button>

                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                          setConfirmAction({ type: 'withdraw', id: emp.id, label: 'Withdraw this resignation?' });
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
              <EmployeeCombobox
                value={formData.employee_id}
                onChange={v => setFormData(p => ({ ...p, employee_id: v }))}
                placeholder="Select employee"
                options={(activeEmployees || []).map((e: any) => ({
                  value: e.id,
                  label: `${e.first_name || ""} ${e.last_name || ""}`.trim() + (e.badge_id ? ` (#${e.badge_id})` : ""),
                  keywords: e.badge_id || "",
                }))}
              />
            </div>
            <div>
              <Label>Resignation Date <span className="text-destructive">*</span></Label>
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
              <SeparationReasonSelect value={formData.separation_reason} onChange={(v) => setFormData(p => ({ ...p, separation_reason: v }))} />
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
            {checklist?.map(item => {
              const t = item.item_title.toLowerCase();
              const isFnf = t.includes("full & final") || t.includes("full and final");
              const isAccess = t.includes("access revoked") || t.includes("erp");
              const isBadge = t.includes("id card") || t.includes("access badge") || t.includes("badge returned");
              const isRelieving = t.includes("relieving") || t.includes("experience letter");
              return (
              <div key={item.id} className="flex items-start gap-3 p-2 rounded border">
                <Checkbox
                  checked={item.is_completed}
                  onCheckedChange={(checked) => toggleChecklist.mutate({ id: item.id, is_completed: !!checked, item_title: item.item_title })}

                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>
                    {item.item_title}
                  </span>
                  {item.completed_at && (
                    <p className="text-xs text-muted-foreground">Done: {new Date(item.completed_at).toLocaleDateString()}</p>
                  )}
                  {isBadge && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.is_completed
                        ? "Biometric removal queued on all eSSL devices."
                        : "Ticking this removes the employee from all eSSL biometric devices."}
                    </p>
                  )}
                  {isRelieving && (
                    <div className="mt-1.5 space-y-1.5">
                      {relievingLetter ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">{relievingLetter.reference_no}</span> issued
                            {relievingLetter.issued_at ? ` on ${new Date(relievingLetter.issued_at).toLocaleDateString("en-IN")}` : ""} · saved in the employee's Documents
                            {relievingLetter.delivered_at ? ` · emailed ${new Date(relievingLetter.delivered_at).toLocaleDateString("en-IN")}${relievingLetter.delivered_to ? ` to ${relievingLetter.delivered_to}` : ""}` : ""}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={previewingRelieving}
                              onClick={async () => {
                                setPreviewingRelieving(true);
                                try {
                                  const { path } = await ensureIssuedPdf(relievingLetter);
                                  const { data, error } = await supabase.storage
                                    .from("hr-doc-issued").createSignedUrl(path, 300);
                                  if (error || !data?.signedUrl) throw error || new Error("Could not open the letter");
                                  window.open(data.signedUrl, "_blank", "noopener");
                                } catch (e: any) {
                                  toast.error(e?.message || "Could not open the letter");
                                } finally {
                                  setPreviewingRelieving(false);
                                }
                              }}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              {previewingRelieving ? "Opening…" : "Preview letter"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={emailRelieving.isPending}
                              onClick={() => emailRelieving.mutate()}
                            >
                              <Mail className="h-3.5 w-3.5 mr-1" />
                              {emailRelieving.isPending ? "Sending…" : relievingLetter.delivered_at ? "Email again" : "Email the relieving letter"}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={generateRelieving.isPending}
                            onClick={() => generateRelieving.mutate()}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            {generateRelieving.isPending ? "Generating…" : "Generate relieving letter"}
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            Generates and files it under the employee's documents. Emailing is optional and stays a separate step.
                          </p>
                        </>
                      )}
                    </div>
                  )}


                  {isFnf && (
                    <div className="mt-1.5">
                      {fnfForEmployee ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-muted-foreground">
                            Settlement <span className="font-medium">{fnfForEmployee.status}</span> · Net ₹{Number(fnfForEmployee.net_payable || 0).toLocaleString("en-IN")}
                          </p>
                          {["draft", "calculated"].includes(fnfForEmployee.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setShowFnfDialog(true)}
                            >
                              Edit settlement
                            </Button>
                          )}
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setShowFnfDialog(true)}
                        >
                          Create F&F settlement
                        </Button>
                      )}
                    </div>
                  )}
                  {isAccess && (
                    <div className="mt-1.5">
                      {erpAccount?.userId == null ? (
                        <p className="text-xs text-muted-foreground">No ERP login linked to this employee</p>
                      ) : erpAccount.status !== "ACTIVE" ? (
                        <p className="text-xs text-muted-foreground">ERP ID is {String(erpAccount.status).toLowerCase()}</p>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={deactivateErp.isPending}
                          onClick={() => deactivateErp.mutate()}
                        >
                          {deactivateErp.isPending ? "Deactivating…" : "Deactivate ERP ID"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );})}

          </div>
          <DialogFooter className="sm:justify-start">
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground w-full">
              <p className="font-medium text-foreground mb-1">Separation completes itself after the F&amp;F is paid</p>
              <p>
                The employee stays active here on purpose — dismissing them in RazorpayX now would block their final
                payroll run. Once the F&amp;F settlement is pushed into its payroll cycle, verified on the RazorpayX
                read-back and marked <strong>paid</strong> in Full &amp; Final Settlement, the resignation is completed
                automatically: the employee is deactivated, the ERP login is disabled, biometrics are removed and the
                RazorpayX dismissal is offered.
              </p>
              {completedCount < totalCount && (
                <p className="mt-1">Still open: {totalCount - completedCount} checklist item(s).</p>
              )}
            </div>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* F&F settlement — the same dialog as the Full & Final Settlement page,
          opened in place from the checklist for a faster workflow. */}
      <FnFSettlementDialog
        open={showFnfDialog}
        onOpenChange={setShowFnfDialog}
        fixedEmployee={selectedEmployee}
        settlement={fnfForEmployee && ["draft", "calculated"].includes(fnfForEmployee.status) ? fnfForEmployee : null}
        onSaved={onFnFSavedFromChecklist}
      />

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
                <Button size="icon" aria-label="Delete" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteTemplateItem.mutate(item.id)}>
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

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.label}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!confirmAction) return;
              const { type, id } = confirmAction;
              if (type === 'approve') approveResignation.mutate(id);
              else if (type === 'reject') rejectResignation.mutate(id);
              else if (type === 'withdraw') withdrawResignation.mutate(id);
              else if (type === 'finalise') finaliseSeparationNow.mutate(id);
              setConfirmAction(null);
            }}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
