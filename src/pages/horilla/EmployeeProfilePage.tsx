import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, Building2, User,
  Briefcase, CreditCard, FileText, Edit, Save, X, Check,
  ChevronLeft, ChevronRight, Settings, Plus, Trash2
} from "lucide-react";
import { toast } from "sonner";

// ─── Tabs matching Horilla ───
const TABS = [
  "About", "Work Type & Shift", "Note", "Documents",
  "Leave", "Asset", "Attendance", "Payroll",
];

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("About");
  const [editing, setEditing] = useState(false);
  const [editingWorkInfo, setEditingWorkInfo] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [workInfoForm, setWorkInfoForm] = useState<any>({});
  const [noteText, setNoteText] = useState("");

  // ─── Core employee data ───
  const { data: emp } = useQuery({
    queryKey: ["hr_employee_detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_employees").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: workInfo } = useQuery({
    queryKey: ["hr_employee_work_info", id],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employee_work_info").select("*").eq("employee_id", id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: bankInfo } = useQuery({
    queryKey: ["hr_employee_bank", id],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employee_bank_details").select("*").eq("employee_id", id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  // ─── Lookups ───
  const { data: dept } = useQuery({
    queryKey: ["dept_for_emp", workInfo?.department_id],
    queryFn: async () => {
      if (!workInfo?.department_id) return null;
      const { data } = await supabase.from("departments").select("name").eq("id", workInfo.department_id).single();
      return data;
    },
    enabled: !!workInfo?.department_id,
  });

  const { data: position } = useQuery({
    queryKey: ["pos_for_emp", workInfo?.job_position_id],
    queryFn: async () => {
      if (!workInfo?.job_position_id) return null;
      const { data } = await supabase.from("positions").select("title").eq("id", workInfo.job_position_id).single();
      return data;
    },
    enabled: !!workInfo?.job_position_id,
  });

  const { data: shift } = useQuery({
    queryKey: ["shift_for_emp", workInfo?.shift_id],
    queryFn: async () => {
      if (!workInfo?.shift_id) return null;
      const { data } = await supabase.from("hr_shifts").select("name").eq("id", workInfo.shift_id).single();
      return data;
    },
    enabled: !!workInfo?.shift_id,
  });

  const { data: reportingManager } = useQuery({
    queryKey: ["reporting_mgr", workInfo?.reporting_manager_id],
    queryFn: async () => {
      if (!workInfo?.reporting_manager_id) return null;
      const { data } = await supabase.from("hr_employees").select("first_name, last_name, badge_id").eq("id", workInfo.reporting_manager_id).single();
      return data;
    },
    enabled: !!workInfo?.reporting_manager_id,
  });

  // ─── All employees (for reporting manager dropdown) ───
  const { data: allEmployees } = useQuery({
    queryKey: ["hr_employees_all"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employees").select("id, first_name, last_name, badge_id").eq("is_active", true).order("first_name");
      return data || [];
    },
  });

  // ─── All positions ───
  const { data: allPositions } = useQuery({
    queryKey: ["positions_list"],
    queryFn: async () => {
      const { data } = await supabase.from("positions").select("id, title, department_id").eq("is_active", true).order("title");
      return data || [];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["departments_list"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*").eq("is_active", true);
      return data || [];
    },
  });

  const { data: shifts } = useQuery({
    queryKey: ["hr_shifts_list"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_shifts").select("*").eq("is_active", true);
      return data || [];
    },
  });


  // ─── Notes ───
  const { data: notes } = useQuery({
    queryKey: ["hr_employee_notes", id],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employee_notes").select("*").eq("employee_id", id!).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  // ─── Leave data ───
  const { data: leaveAllocations } = useQuery({
    queryKey: ["hr_leave_allocations", id],
    queryFn: async () => {
      const { data } = await supabase.from("hr_leave_allocations").select("*").eq("employee_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: leaveRequests } = useQuery({
    queryKey: ["hr_leave_requests", id],
    queryFn: async () => {
      const { data } = await supabase.from("hr_leave_requests").select("*").eq("employee_id", id!).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: leaveTypes } = useQuery({
    queryKey: ["hr_leave_types"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_leave_types").select("*");
      return data || [];
    },
  });

  // ─── Assets ───
  const { data: assetAssignments } = useQuery({
    queryKey: ["hr_asset_assignments", id],
    queryFn: async () => {
      const { data } = await supabase.from("hr_asset_assignments").select("*, hr_assets(*)").eq("employee_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  // ─── Attendance ───
  const { data: attendance } = useQuery({
    queryKey: ["hr_attendance", id],
    queryFn: async () => {
      const { data } = await supabase.from("hr_attendance").select("*").eq("employee_id", id!).order("attendance_date", { ascending: false }).limit(30);
      return data || [];
    },
    enabled: !!id,
  });

  // ─── Payslips ───
  const { data: payslips } = useQuery({
    queryKey: ["hr_payslips", id],
    queryFn: async () => {
      const { data } = await supabase.from("hr_payslips").select("*").eq("employee_id", id!).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  // ─── Prev/Next navigation ───
  const { data: allEmployeeIds } = useQuery({
    queryKey: ["hr_employees_ids"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employees").select("id").eq("is_active", true).order("created_at", { ascending: false });
      return (data || []).map(e => e.id);
    },
  });

  const currentIndex = useMemo(() => allEmployeeIds?.indexOf(id!) ?? -1, [allEmployeeIds, id]);
  const prevId = currentIndex > 0 ? allEmployeeIds?.[currentIndex - 1] : null;
  const nextId = allEmployeeIds && currentIndex < allEmployeeIds.length - 1 ? allEmployeeIds[currentIndex + 1] : null;

  // ─── Mutations ───
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (activeTab === "About") {
        const { error } = await supabase.from("hr_employees").update({
          phone: editForm.phone || null,
          gender: editForm.gender || null,
          dob: editForm.dob || null,
          marital_status: editForm.marital_status || null,
          address: editForm.address || null,
          city: editForm.city || null,
          state: editForm.state || null,
          country: editForm.country || null,
          qualification: editForm.qualification || null,
          experience: editForm.experience || null,
          emergency_contact_name: editForm.emergency_contact_name || null,
          emergency_contact: editForm.emergency_contact || null,
          emergency_contact_relation: editForm.emergency_contact_relation || null,
        }).eq("id", id!);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Updated successfully");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["hr_employee_detail"] });
    },
    onError: () => toast.error("Failed to save"),
  });

  // ─── Work Info Save Mutation ───
  const saveWorkInfoMutation = useMutation({
    mutationFn: async () => {
      const updateData: any = {
        reporting_manager_id: workInfoForm.reporting_manager_id || null,
        shift_id: workInfoForm.shift_id || null,
        department_id: workInfoForm.department_id || null,
        job_position_id: workInfoForm.job_position_id || null,
        job_role: workInfoForm.job_role || null,
        work_type: workInfoForm.work_type || null,
        employee_type: workInfoForm.employee_type || null,
        location: workInfoForm.location || null,
        company_name: workInfoForm.company_name || null,
        work_email: workInfoForm.work_email || null,
        work_phone: workInfoForm.work_phone || null,
        basic_salary: workInfoForm.basic_salary ? parseFloat(workInfoForm.basic_salary) : null,
        joining_date: workInfoForm.joining_date || null,
        contract_end_date: workInfoForm.contract_end_date || null,
        experience_years: workInfoForm.experience_years ? parseInt(workInfoForm.experience_years) : null,
      };

      if (workInfo?.id) {
        const { error } = await supabase.from("hr_employee_work_info").update(updateData).eq("id", workInfo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_employee_work_info").insert({ ...updateData, employee_id: id! });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Work information updated");
      setEditingWorkInfo(false);
      queryClient.invalidateQueries({ queryKey: ["hr_employee_work_info", id] });
      queryClient.invalidateQueries({ queryKey: ["dept_for_emp"] });
      queryClient.invalidateQueries({ queryKey: ["pos_for_emp"] });
      queryClient.invalidateQueries({ queryKey: ["shift_for_emp"] });
      queryClient.invalidateQueries({ queryKey: ["reporting_mgr"] });
    },
    onError: () => toast.error("Failed to update work info"),
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_employee_notes").insert({
        employee_id: id!,
        description: noteText,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note added");
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["hr_employee_notes", id] });
    },
    onError: () => toast.error("Failed to add note"),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from("hr_employee_notes").delete().eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note deleted");
      queryClient.invalidateQueries({ queryKey: ["hr_employee_notes", id] });
    },
  });

  const startEdit = () => {
    if (activeTab === "About" && emp) {
      setEditForm({
        phone: emp.phone || "", gender: emp.gender || "", dob: emp.dob || "",
        marital_status: emp.marital_status || "", address: emp.address || "",
        city: emp.city || "", state: emp.state || "", country: emp.country || "",
        qualification: emp.qualification || "", experience: emp.experience || "",
        emergency_contact_name: emp.emergency_contact_name || "",
        emergency_contact: emp.emergency_contact || "",
        emergency_contact_relation: emp.emergency_contact_relation || "",
      });
    }
    setEditing(true);
  };

  const startWorkInfoEdit = () => {
    setWorkInfoForm({
      reporting_manager_id: workInfo?.reporting_manager_id || "",
      shift_id: workInfo?.shift_id || "",
      department_id: workInfo?.department_id || "",
      job_position_id: workInfo?.job_position_id || "",
      job_role: workInfo?.job_role || "",
      work_type: workInfo?.work_type || "",
      employee_type: workInfo?.employee_type || "",
      location: workInfo?.location || "",
      company_name: workInfo?.company_name || "",
      work_email: workInfo?.work_email || "",
      work_phone: workInfo?.work_phone || "",
      basic_salary: workInfo?.basic_salary?.toString() || "",
      joining_date: workInfo?.joining_date || "",
      contract_end_date: workInfo?.contract_end_date || "",
      experience_years: workInfo?.experience_years?.toString() || "",
    });
    setEditingWorkInfo(true);
  };


  // ─── Leave helpers ───
  const getLeaveTypeName = (typeId: string) => leaveTypes?.find(t => t.id === typeId)?.name || "Unknown";
  const getLeaveTypeCode = (typeId: string) => leaveTypes?.find(t => t.id === typeId)?.code || "??";
  const getLeaveTypeColor = (typeId: string) => leaveTypes?.find(t => t.id === typeId)?.color || "#666";

  if (!emp) {
    return <div className="text-center py-16 text-muted-foreground">Loading...</div>;
  }

  const colors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
  const color = colors[emp.id.charCodeAt(0) % colors.length];

  const inputCls = "w-full border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#00bcd4] bg-background text-foreground";

  const InfoRow = ({ label, value, editKey, inputType, selectOptions }: { label: string; value: string | null; editKey?: string; inputType?: string; selectOptions?: { value: string; label: string }[] }) => (
    <div className="py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      {editing && editKey ? (
        selectOptions ? (
          <select value={editForm[editKey] || ""} onChange={e => setEditForm({ ...editForm, [editKey]: e.target.value })} className={inputCls}>
            <option value="">Select</option>
            {selectOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input type={inputType || "text"} value={editForm[editKey] || ""} onChange={e => setEditForm({ ...editForm, [editKey]: e.target.value })} className={inputCls} />
        )
      ) : (
        <p className="text-sm font-medium text-foreground">{value || "None"}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ─── Breadcrumb ─── */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate("/hrms")} className="hover:text-foreground">Horilla</button>
        <span>›</span>
        <button onClick={() => navigate("/hrms/employee")} className="hover:text-foreground">Employee</button>
        <span>›</span>
        <button onClick={() => navigate("/hrms/employee")} className="hover:text-foreground">Employees</button>
        <span>›</span>
        <span className="text-[#00bcd4] font-medium">{emp.first_name} {emp.last_name} ({emp.badge_id})</span>
      </div>

      {/* ─── Profile Header (Horilla style) ─── */}
      <div className="bg-card border border-border rounded-xl px-6 py-5 flex items-start justify-between">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          {emp.profile_image_url ? (
            <img src={emp.profile_image_url} className="w-20 h-20 rounded-lg object-cover" alt="" />
          ) : (
            <div className={`w-20 h-20 rounded-lg ${color} flex items-center justify-center text-white font-bold text-2xl`}>
              {emp.first_name.charAt(0)}{emp.last_name.charAt(0)}
            </div>
          )}

          {/* Info */}
          <div>
            <h1 className="text-lg font-bold text-foreground">{emp.first_name} {emp.last_name} ({emp.badge_id})</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span>{emp.email || "No email"}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>{emp.phone || "No phone"}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              <span>{emp.gender ? emp.gender.charAt(0).toUpperCase() + emp.gender.slice(1) : "Not specified"}</span>
            </div>
          </div>
        </div>

        {/* Prev/Next navigation */}
        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted" title="Settings">
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={() => prevId && navigate(`/hrms/employee/${prevId}`)}
            disabled={!prevId}
            className="p-1.5 rounded-full bg-[#00bcd4] text-white hover:bg-[#00a5bb] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => nextId && navigate(`/hrms/employee/${nextId}`)}
            disabled={!nextId}
            className="p-1.5 rounded-full bg-[#00bcd4] text-white hover:bg-[#00a5bb] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ─── Tabs (Horilla pill style) ─── */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => { setActiveTab(t); setEditing(false); }}
            className={`px-4 py-1.5 text-sm font-medium rounded-full border transition-colors ${
              activeTab === t
                ? "bg-[#00bcd4] text-white border-[#00bcd4]"
                : "bg-card text-foreground border-border hover:border-[#00bcd4]/50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ─── */}
      <div className="bg-card border border-border rounded-xl p-6">
        {/* ── ABOUT TAB ── */}
        {activeTab === "About" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Personal Information */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-foreground">Personal Information</h3>
                {editing ? (
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted">Cancel</button>
                    <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="text-xs text-white bg-[#00bcd4] px-3 py-1 rounded hover:bg-[#00a5bb] disabled:opacity-50">
                      {saveMutation.isPending ? "Saving..." : "Save"}
                    </button>
                  </div>
                ) : (
                  <button onClick={startEdit} className="text-xs text-[#00bcd4] hover:underline font-medium">Edit</button>
                )}
              </div>
              <div className="border border-border rounded-lg p-4 space-y-0">
                <InfoRow label="Date of birth" value={emp.dob} editKey="dob" inputType="date" />
                <InfoRow label="Gender" value={emp.gender ? emp.gender.charAt(0).toUpperCase() + emp.gender.slice(1) : null} editKey="gender" selectOptions={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }]} />
                <InfoRow label="Address" value={emp.address} editKey="address" />
                <InfoRow label="Country" value={emp.country} editKey="country" />
                <InfoRow label="State" value={emp.state} editKey="state" />
                <InfoRow label="City" value={emp.city} editKey="city" />
                <InfoRow label="Qualification" value={emp.qualification} editKey="qualification" />
                <InfoRow label="Experience" value={emp.experience} editKey="experience" />
                <InfoRow label="Emergency Contact" value={emp.emergency_contact} editKey="emergency_contact" />
                <InfoRow label="Emergency Contact Name" value={emp.emergency_contact_name} editKey="emergency_contact_name" />
                <InfoRow label="Emergency Contact Relation" value={emp.emergency_contact_relation} editKey="emergency_contact_relation" />
                <InfoRow label="Marital Status" value={emp.marital_status} editKey="marital_status" selectOptions={[{ value: "Single", label: "Single" }, { value: "Married", label: "Married" }, { value: "Divorced", label: "Divorced" }]} />
              </div>
            </div>

            {/* Right: Work Information table */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="bg-[#00bcd4] text-white text-xs font-bold px-2 py-0.5 rounded-full">1</span>
                  <h3 className="text-base font-semibold text-[#00bcd4]">Work Information</h3>
                </div>
                {editingWorkInfo ? (
                  <div className="flex gap-2">
                    <button onClick={() => setEditingWorkInfo(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted">Cancel</button>
                    <button onClick={() => saveWorkInfoMutation.mutate()} disabled={saveWorkInfoMutation.isPending} className="text-xs text-white bg-[#00bcd4] px-3 py-1 rounded hover:bg-[#00a5bb] disabled:opacity-50">
                      {saveWorkInfoMutation.isPending ? "Saving..." : "Save"}
                    </button>
                  </div>
                ) : (
                  <button onClick={startWorkInfoEdit} className="text-xs text-[#00bcd4] hover:underline font-medium">Edit</button>
                )}
              </div>

              {editingWorkInfo ? (
                <div className="border border-border rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Department</label>
                      <select value={workInfoForm.department_id || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, department_id: e.target.value })} className={inputCls}>
                        <option value="">Select Department</option>
                        {(departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Job Position</label>
                      <select value={workInfoForm.job_position_id || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, job_position_id: e.target.value })} className={inputCls}>
                        <option value="">Select Position</option>
                        {(allPositions || []).filter((p: any) => !workInfoForm.department_id || p.department_id === workInfoForm.department_id).map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Reporting Manager</label>
                      <select value={workInfoForm.reporting_manager_id || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, reporting_manager_id: e.target.value })} className={inputCls}>
                        <option value="">Select Manager</option>
                        {(allEmployees || []).filter((e: any) => e.id !== id).map((e: any) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Shift</label>
                      <select value={workInfoForm.shift_id || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, shift_id: e.target.value })} className={inputCls}>
                        <option value="">Select Shift</option>
                        {(shifts || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Work Type</label>
                      <select value={workInfoForm.work_type || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, work_type: e.target.value })} className={inputCls}>
                        <option value="">Select</option>
                        <option value="On-site">On-site</option>
                        <option value="Remote">Remote</option>
                        <option value="Hybrid">Hybrid</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Employee Type</label>
                      <select value={workInfoForm.employee_type || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, employee_type: e.target.value })} className={inputCls}>
                        <option value="">Select</option>
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Contract">Contract</option>
                        <option value="Intern">Intern</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Job Role</label>
                      <input type="text" value={workInfoForm.job_role || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, job_role: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Badge Id</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Job Position</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Department</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Shift</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Work Type</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Employee Type</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Job Role</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Reporting Manager</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="py-2.5 px-3 text-muted-foreground">{emp.badge_id}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{position?.title || "None"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{dept?.name || "None"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{shift?.name || "None"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{workInfo?.work_type || "None"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{workInfo?.employee_type || "None"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{workInfo?.job_role || "None"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {reportingManager ? `${reportingManager.first_name} ${reportingManager.last_name} (${reportingManager.badge_id})` : "None"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── WORK TYPE & SHIFT TAB ── */}
        {activeTab === "Work Type & Shift" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                Current Shift : <span className="text-foreground">{shift?.name || "None"}</span>
              </h3>
              {editingWorkInfo ? (
                <div className="flex gap-2">
                  <button onClick={() => setEditingWorkInfo(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted">Cancel</button>
                  <button onClick={() => saveWorkInfoMutation.mutate()} disabled={saveWorkInfoMutation.isPending} className="text-xs text-white bg-[#00bcd4] px-3 py-1 rounded hover:bg-[#00a5bb] disabled:opacity-50">
                    {saveWorkInfoMutation.isPending ? "Saving..." : "Save"}
                  </button>
                </div>
              ) : (
                <button onClick={startWorkInfoEdit} className="text-xs text-[#00bcd4] hover:underline font-medium">Edit</button>
              )}
            </div>

            {editingWorkInfo ? (
              <div className="border border-border rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Shift</label>
                    <select value={workInfoForm.shift_id || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, shift_id: e.target.value })} className={inputCls}>
                      <option value="">Select Shift</option>
                      {(shifts || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Work Type</label>
                    <select value={workInfoForm.work_type || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, work_type: e.target.value })} className={inputCls}>
                      <option value="">Select</option>
                      <option value="On-site">On-site</option>
                      <option value="Remote">Remote</option>
                      <option value="Hybrid">Hybrid</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Employee Type</label>
                    <select value={workInfoForm.employee_type || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, employee_type: e.target.value })} className={inputCls}>
                      <option value="">Select</option>
                      <option value="Full-time">Full-time</option>
                      <option value="Part-time">Part-time</option>
                      <option value="Contract">Contract</option>
                      <option value="Intern">Intern</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Reporting Manager</label>
                    <select value={workInfoForm.reporting_manager_id || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, reporting_manager_id: e.target.value })} className={inputCls}>
                      <option value="">Select Manager</option>
                      {(allEmployees || []).filter((e: any) => e.id !== id).map((e: any) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Joining Date</label>
                    <input type="date" value={workInfoForm.joining_date || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, joining_date: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Contract End Date</label>
                    <input type="date" value={workInfoForm.contract_end_date || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, contract_end_date: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Location</label>
                    <input type="text" value={workInfoForm.location || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, location: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Company</label>
                    <input type="text" value={workInfoForm.company_name || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, company_name: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Work Email</label>
                    <input type="email" value={workInfoForm.work_email || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, work_email: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Work Phone</label>
                    <input type="text" value={workInfoForm.work_phone || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, work_phone: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Basic Salary</label>
                    <input type="number" value={workInfoForm.basic_salary || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, basic_salary: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Experience (years)</label>
                    <input type="number" value={workInfoForm.experience_years || ""} onChange={e => setWorkInfoForm({ ...workInfoForm, experience_years: e.target.value })} className={inputCls} />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground">Work Type</p>
                    <p className="text-sm font-medium text-foreground mt-1">{workInfo?.work_type || "None"}</p>
                  </div>
                  <div className="border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground">Employee Type</p>
                    <p className="text-sm font-medium text-foreground mt-1">{workInfo?.employee_type || "None"}</p>
                  </div>
                  <div className="border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground">Joining Date</p>
                    <p className="text-sm font-medium text-foreground mt-1">{workInfo?.joining_date || "None"}</p>
                  </div>
                  <div className="border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground">Contract End</p>
                    <p className="text-sm font-medium text-foreground mt-1">{workInfo?.contract_end_date || "None"}</p>
                  </div>
                  <div className="border border-border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground">Reporting Manager</p>
                    <p className="text-sm font-medium text-foreground mt-1">
                      {reportingManager ? `${reportingManager.first_name} ${reportingManager.last_name} (${reportingManager.badge_id})` : "None"}
                    </p>
                  </div>
                </div>
                <div className="border border-border rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-foreground mb-3">Work Details</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div><p className="text-xs text-muted-foreground">Location</p><p className="text-sm text-foreground">{workInfo?.location || "None"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Company</p><p className="text-sm text-foreground">{workInfo?.company_name || "None"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Work Email</p><p className="text-sm text-foreground">{workInfo?.work_email || "None"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Work Phone</p><p className="text-sm text-foreground">{workInfo?.work_phone || "None"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Basic Salary</p><p className="text-sm text-foreground">{workInfo?.basic_salary ? `₹${Number(workInfo.basic_salary).toLocaleString()}` : "None"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Experience (years)</p><p className="text-sm text-foreground">{workInfo?.experience_years?.toString() || "None"}</p></div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── NOTE TAB ── */}
        {activeTab === "Note" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground resize-none min-h-[80px] focus:border-[#00bcd4] outline-none"
              />
              <button
                onClick={() => noteText.trim() && addNoteMutation.mutate()}
                disabled={!noteText.trim() || addNoteMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-[#00bcd4] text-white rounded-lg hover:bg-[#00a5bb] disabled:opacity-40"
              >
                <Plus className="h-4 w-4 inline mr-1" />
                Add
              </button>
            </div>
            {(notes || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No notes yet</p>
            ) : (
              <div className="space-y-3">
                {(notes || []).map(note => (
                  <div key={note.id} className="border border-border rounded-lg p-4 flex items-start justify-between">
                    <div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{note.description}</p>
                      <p className="text-xs text-muted-foreground mt-2">{new Date(note.created_at).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => deleteNoteMutation.mutate(note.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENTS TAB ── */}
        {activeTab === "Documents" && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-foreground">Documents</h3>
            <div className="border border-border rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-3">Bank Details</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><p className="text-xs text-muted-foreground">Bank Name</p><p className="text-sm text-foreground">{bankInfo?.bank_name || "None"}</p></div>
                <div><p className="text-xs text-muted-foreground">Account Number</p><p className="text-sm text-foreground">{bankInfo?.account_number || "None"}</p></div>
                <div><p className="text-xs text-muted-foreground">Bank Code 1</p><p className="text-sm text-foreground">{bankInfo?.bank_code_1 || "None"}</p></div>
                <div><p className="text-xs text-muted-foreground">Bank Code 2</p><p className="text-sm text-foreground">{bankInfo?.bank_code_2 || "None"}</p></div>
                <div><p className="text-xs text-muted-foreground">Branch</p><p className="text-sm text-foreground">{bankInfo?.branch || "None"}</p></div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Document upload functionality will be available in a future update.</p>
          </div>
        )}

        {/* ── LEAVE TAB ── */}
        {activeTab === "Leave" && (
          <div className="space-y-6">
            {/* Leave allocation cards */}
            <div className="flex flex-wrap gap-6">
              {(leaveAllocations || []).map(alloc => {
                const lt = leaveTypes?.find(t => t.id === alloc.leave_type_id);
                const available = alloc.allocated_days - alloc.used_days;
                const carry = alloc.carry_forward_days || 0;
                const total = alloc.allocated_days;
                return (
                  <div key={alloc.id} className="min-w-[200px] border-r border-border last:border-r-0 pr-6 last:pr-0">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm mb-2"
                      style={{ backgroundColor: lt?.color || "#666" }}
                    >
                      {lt?.code || "??"}
                    </div>
                    <p className="text-sm font-semibold text-foreground">{lt?.name || "Unknown"}</p>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Available Leave Days</span><span className="font-medium text-foreground">{available}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Carryforward Leave Days</span><span className="font-medium text-foreground">{carry}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Total Leave Days</span><span className="font-medium text-foreground">{total}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Total Leave Taken</span><span className="font-medium text-foreground">{alloc.used_days}</span></div>
                    </div>
                  </div>
                );
              })}
              {(leaveAllocations || []).length === 0 && (
                <p className="text-sm text-muted-foreground">No leave allocations found</p>
              )}
            </div>

            {/* Leave requests table */}
            {(leaveRequests || []).length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
                  <span className="text-xs font-medium text-muted-foreground">Leave Requests</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Rejected</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /> Cancelled</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Approved</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Requested</span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Leave Type</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Start Date</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">End Date</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Requested Days</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(leaveRequests || []).map(req => {
                      const lt = leaveTypes?.find(t => t.id === req.leave_type_id);
                      const statusColor = req.status === "Approved" ? "text-green-600" : req.status === "Rejected" ? "text-red-600" : req.status === "Cancelled" ? "text-gray-500" : "text-yellow-600";
                      return (
                        <tr key={req.id} className="border-b border-border/50">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: lt?.color || "#666" }}>
                                {lt?.code?.substring(0, 2) || "??"}
                              </span>
                              <span className="text-foreground">{lt?.name || "Unknown"}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">{req.start_date}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{req.end_date}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{req.total_days}</td>
                          <td className={`py-2.5 px-3 font-medium ${statusColor}`}>{req.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ASSET TAB ── */}
        {activeTab === "Asset" && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-foreground">Assigned Assets</h3>
            {(assetAssignments || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No assets assigned</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Asset Name</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Type</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Serial Number</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Assigned Date</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(assetAssignments || []).map((aa: any) => (
                      <tr key={aa.id} className="border-b border-border/50">
                        <td className="py-2.5 px-3 text-foreground font-medium">{aa.hr_assets?.name || "Unknown"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{aa.hr_assets?.asset_type || "None"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{aa.hr_assets?.serial_number || "None"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{aa.assigned_date}</td>
                        <td className="py-2.5 px-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            aa.status === "Assigned" ? "bg-green-100 text-green-700" :
                            aa.status === "Returned" ? "bg-gray-100 text-gray-700" : "bg-yellow-100 text-yellow-700"
                          }`}>
                            {aa.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">{aa.notes || "None"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ATTENDANCE TAB ── */}
        {activeTab === "Attendance" && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-foreground">Attendance (Last 30 Records)</h3>
            {(attendance || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No attendance records found</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Date</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Check In</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Check Out</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Work Type</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Late (min)</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">OT (hrs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(attendance || []).map(att => (
                      <tr key={att.id} className="border-b border-border/50">
                        <td className="py-2.5 px-3 text-foreground">{att.attendance_date}</td>
                        <td className="py-2.5 px-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            att.attendance_status === "Present" ? "bg-green-100 text-green-700" :
                            att.attendance_status === "Absent" ? "bg-red-100 text-red-700" :
                            att.attendance_status === "Half Day" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"
                          }`}>
                            {att.attendance_status || "None"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">{att.check_in || "—"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{att.check_out || "—"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{att.work_type || "None"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{att.late_minutes ?? "—"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{att.overtime_hours ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── PAYROLL TAB ── */}
        {activeTab === "Payroll" && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-foreground">Payslips</h3>
            {(payslips || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No payslips found</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Payment Date</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Gross Salary</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Total Earnings</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Total Deductions</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Net Salary</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Working Days</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payslips || []).map(ps => (
                      <tr key={ps.id} className="border-b border-border/50">
                        <td className="py-2.5 px-3 text-foreground">{ps.payment_date || "Pending"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">₹{Number(ps.gross_salary).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-green-600">₹{Number(ps.total_earnings).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-red-600">₹{Number(ps.total_deductions).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-foreground font-semibold">₹{Number(ps.net_salary).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{ps.working_days ?? "—"}</td>
                        <td className="py-2.5 px-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            ps.status === "Paid" ? "bg-green-100 text-green-700" :
                            ps.status === "Draft" ? "bg-gray-100 text-gray-700" : "bg-yellow-100 text-yellow-700"
                          }`}>
                            {ps.status || "Draft"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
