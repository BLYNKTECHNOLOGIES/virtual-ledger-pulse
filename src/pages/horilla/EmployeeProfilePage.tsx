import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, Building2, User,
  Briefcase, CreditCard, FileText, Edit, Save, X, Check
} from "lucide-react";
import { toast } from "sonner";

const tabs = ["About", "Work", "Bank", "Documents"];

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("About");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

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

  const { data: dept } = useQuery({
    queryKey: ["dept_for_emp", workInfo?.department_id],
    queryFn: async () => {
      if (!workInfo?.department_id) return null;
      const { data } = await supabase.from("departments").select("name").eq("id", workInfo.department_id).single();
      return data;
    },
    enabled: !!workInfo?.department_id,
  });

  const { data: departments } = useQuery({
    queryKey: ["departments_list"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*").eq("is_active", true);
      return data || [];
    },
  });

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
      } else if (activeTab === "Work") {
        const payload = {
          department_id: editForm.department_id || null,
          job_role: editForm.job_role || null,
          employee_type: editForm.employee_type || null,
          work_type: editForm.work_type || null,
          joining_date: editForm.joining_date || null,
          contract_end_date: editForm.contract_end_date || null,
          location: editForm.location || null,
          company_name: editForm.company_name || null,
          work_email: editForm.work_email || null,
          work_phone: editForm.work_phone || null,
          basic_salary: editForm.basic_salary ? Number(editForm.basic_salary) : null,
          experience_years: editForm.experience_years ? Number(editForm.experience_years) : null,
        };
        if (workInfo?.id) {
          const { error } = await supabase.from("hr_employee_work_info").update(payload).eq("id", workInfo.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("hr_employee_work_info").insert({ ...payload, employee_id: id! });
          if (error) throw error;
        }
      } else if (activeTab === "Bank") {
        const payload = {
          bank_name: editForm.bank_name || null,
          account_number: editForm.account_number || null,
          bank_code_1: editForm.bank_code_1 || null,
          bank_code_2: editForm.bank_code_2 || null,
          branch: editForm.branch || null,
        };
        if (bankInfo?.id) {
          const { error } = await supabase.from("hr_employee_bank_details").update(payload).eq("id", bankInfo.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("hr_employee_bank_details").insert({ ...payload, employee_id: id! });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Updated successfully");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["hr_employee_detail"] });
      queryClient.invalidateQueries({ queryKey: ["hr_employee_work_info"] });
      queryClient.invalidateQueries({ queryKey: ["hr_employee_bank"] });
    },
    onError: () => toast.error("Failed to save"),
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
    } else if (activeTab === "Work") {
      setEditForm({
        department_id: workInfo?.department_id || "", job_role: workInfo?.job_role || "",
        employee_type: workInfo?.employee_type || "", work_type: workInfo?.work_type || "",
        joining_date: workInfo?.joining_date || "", contract_end_date: workInfo?.contract_end_date || "",
        location: workInfo?.location || "", company_name: workInfo?.company_name || "",
        work_email: workInfo?.work_email || "", work_phone: workInfo?.work_phone || "",
        basic_salary: workInfo?.basic_salary?.toString() || "", experience_years: workInfo?.experience_years?.toString() || "",
      });
    } else if (activeTab === "Bank") {
      setEditForm({
        bank_name: bankInfo?.bank_name || "", account_number: bankInfo?.account_number || "",
        bank_code_1: bankInfo?.bank_code_1 || "", bank_code_2: bankInfo?.bank_code_2 || "",
        branch: bankInfo?.branch || "",
      });
    }
    setEditing(true);
  };

  if (!emp) {
    return <div className="text-center py-16 text-gray-400">Loading...</div>;
  }

  const colors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
  const color = colors[emp.id.charCodeAt(0) % colors.length];

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#E8604C]";

  const InfoRow = ({ label, value, icon: Icon, editKey, inputType, selectOptions }: { label: string; value: string | null; icon?: any; editKey?: string; inputType?: string; selectOptions?: { value: string; label: string }[] }) => (
    <div className="flex items-start gap-3 py-2.5">
      {Icon && <Icon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />}
      <div className="flex-1">
        <p className="text-xs text-gray-400">{label}</p>
        {editing && editKey ? (
          selectOptions ? (
            <select
              value={editForm[editKey] || ""}
              onChange={e => setEditForm({ ...editForm, [editKey]: e.target.value })}
              className={inputCls}
            >
              <option value="">Select</option>
              {selectOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              type={inputType || "text"}
              value={editForm[editKey] || ""}
              onChange={e => setEditForm({ ...editForm, [editKey]: e.target.value })}
              className={inputCls}
            />
          )
        ) : (
          <p className="text-sm text-gray-800">{value || "—"}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate("/hrms/employee")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#E8604C] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Employees
      </button>

      {/* Profile header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-5">
          <div className={`w-16 h-16 rounded-xl ${color} flex items-center justify-center text-white font-bold text-xl`}>
            {emp.first_name.charAt(0)}{emp.last_name.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{emp.first_name} {emp.last_name}</h1>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${emp.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                {emp.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{emp.badge_id}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              {workInfo?.job_role && (
                <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{workInfo.job_role}</span>
              )}
              {dept?.name && (
                <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{dept.name}</span>
              )}
              {emp.email && (
                <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{emp.email}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between border-b border-gray-100 px-2">
          <div className="flex">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => { setActiveTab(t); setEditing(false); }}
                className={`px-5 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === t ? "text-[#E8604C]" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t}
                {activeTab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E8604C] rounded-full" />}
              </button>
            ))}
          </div>
          {activeTab !== "Documents" && (
            <div className="flex items-center gap-2 pr-3">
              {editing ? (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="flex items-center gap-1 text-xs text-white bg-[#E8604C] px-3 py-1.5 rounded-lg hover:bg-[#d04e3c] disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" /> {saveMutation.isPending ? "Saving..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1 text-xs text-[#E8604C] px-3 py-1.5 rounded-lg hover:bg-[#E8604C]/5 font-medium"
                >
                  <Edit className="h-3.5 w-3.5" /> Edit
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-6">
          {activeTab === "About" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
              <h3 className="text-sm font-semibold text-gray-800 col-span-full mb-2">Personal Information</h3>
              <InfoRow label="Date of Birth" value={emp.dob} icon={Calendar} editKey="dob" inputType="date" />
              <InfoRow label="Gender" value={emp.gender} icon={User} editKey="gender" selectOptions={[{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }, { value: "Other", label: "Other" }]} />
              <InfoRow label="Marital Status" value={emp.marital_status} editKey="marital_status" selectOptions={[{ value: "Single", label: "Single" }, { value: "Married", label: "Married" }, { value: "Divorced", label: "Divorced" }, { value: "Widowed", label: "Widowed" }]} />
              <InfoRow label="Phone" value={emp.phone} icon={Phone} editKey="phone" />
              <InfoRow label="Email" value={emp.email} icon={Mail} />
              <InfoRow label="Address" value={emp.address} icon={MapPin} editKey="address" />
              <InfoRow label="City" value={emp.city} editKey="city" />
              <InfoRow label="State" value={emp.state} editKey="state" />
              <InfoRow label="Country" value={emp.country} editKey="country" />
              <InfoRow label="Qualification" value={emp.qualification} editKey="qualification" />
              <InfoRow label="Experience" value={emp.experience} editKey="experience" />
              <h3 className="text-sm font-semibold text-gray-800 col-span-full mt-4 mb-2">Emergency Contact</h3>
              <InfoRow label="Contact Name" value={emp.emergency_contact_name} editKey="emergency_contact_name" />
              <InfoRow label="Contact Number" value={emp.emergency_contact} editKey="emergency_contact" />
              <InfoRow label="Relation" value={emp.emergency_contact_relation} editKey="emergency_contact_relation" />
            </div>
          )}

          {activeTab === "Work" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
              {editing ? (
                <>
                  <div className="py-2.5">
                    <p className="text-xs text-gray-400 mb-1">Department</p>
                    <select value={editForm.department_id || ""} onChange={e => setEditForm({ ...editForm, department_id: e.target.value })} className={inputCls}>
                      <option value="">Select</option>
                      {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <InfoRow label="Job Role" value={workInfo?.job_role || null} icon={Briefcase} editKey="job_role" />
                  <InfoRow label="Employee Type" value={workInfo?.employee_type || null} editKey="employee_type" />
                  <InfoRow label="Work Type" value={workInfo?.work_type || null} editKey="work_type" />
                  <InfoRow label="Joining Date" value={workInfo?.joining_date || null} icon={Calendar} editKey="joining_date" />
                  <InfoRow label="Contract End" value={workInfo?.contract_end_date || null} editKey="contract_end_date" />
                  <InfoRow label="Location" value={workInfo?.location || null} icon={MapPin} editKey="location" />
                  <InfoRow label="Company" value={workInfo?.company_name || null} editKey="company_name" />
                  <InfoRow label="Work Email" value={workInfo?.work_email || null} icon={Mail} editKey="work_email" />
                  <InfoRow label="Work Phone" value={workInfo?.work_phone || null} icon={Phone} editKey="work_phone" />
                  <InfoRow label="Basic Salary" value={workInfo?.basic_salary?.toString() || null} editKey="basic_salary" />
                  <InfoRow label="Experience (years)" value={workInfo?.experience_years?.toString() || null} editKey="experience_years" />
                </>
              ) : (
                <>
                  <InfoRow label="Department" value={dept?.name || null} icon={Building2} />
                  <InfoRow label="Job Role" value={workInfo?.job_role || null} icon={Briefcase} />
                  <InfoRow label="Employee Type" value={workInfo?.employee_type || null} />
                  <InfoRow label="Work Type" value={workInfo?.work_type || null} />
                  <InfoRow label="Joining Date" value={workInfo?.joining_date || null} icon={Calendar} />
                  <InfoRow label="Contract End" value={workInfo?.contract_end_date || null} />
                  <InfoRow label="Location" value={workInfo?.location || null} icon={MapPin} />
                  <InfoRow label="Company" value={workInfo?.company_name || null} />
                  <InfoRow label="Work Email" value={workInfo?.work_email || null} icon={Mail} />
                  <InfoRow label="Work Phone" value={workInfo?.work_phone || null} icon={Phone} />
                  <InfoRow label="Basic Salary" value={workInfo?.basic_salary ? `₹${Number(workInfo.basic_salary).toLocaleString()}` : null} />
                  <InfoRow label="Experience (years)" value={workInfo?.experience_years?.toString() || null} />
                </>
              )}
            </div>
          )}

          {activeTab === "Bank" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
              <InfoRow label="Bank Name" value={bankInfo?.bank_name || null} icon={CreditCard} editKey="bank_name" />
              <InfoRow label="Account Number" value={bankInfo?.account_number || null} editKey="account_number" />
              <InfoRow label="Bank Code 1" value={bankInfo?.bank_code_1 || null} editKey="bank_code_1" />
              <InfoRow label="Bank Code 2" value={bankInfo?.bank_code_2 || null} editKey="bank_code_2" />
              <InfoRow label="Branch" value={bankInfo?.branch || null} editKey="branch" />
            </div>
          )}

          {activeTab === "Documents" && (
            <div className="text-center py-12 text-gray-400">
              <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No documents uploaded yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
