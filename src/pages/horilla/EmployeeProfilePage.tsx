import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, Building2, User,
  Briefcase, CreditCard, FileText, Edit
} from "lucide-react";

const tabs = ["About", "Work", "Bank", "Documents"];

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("About");

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

  if (!emp) {
    return <div className="text-center py-16 text-gray-400">Loading...</div>;
  }

  const colors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
  const color = colors[emp.id.charCodeAt(0) % colors.length];

  const InfoRow = ({ label, value, icon: Icon }: { label: string; value: string | null; icon?: any }) => (
    <div className="flex items-start gap-3 py-2.5">
      {Icon && <Icon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />}
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm text-gray-800">{value || "—"}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Back */}
      <button
        onClick={() => navigate("/hrms/employee")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#6C63FF] transition-colors"
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
        <div className="flex border-b border-gray-100">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-5 py-3 text-sm font-medium transition-colors relative ${
                activeTab === t
                  ? "text-[#6C63FF]"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
              {activeTab === t && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6C63FF] rounded-full" />
              )}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === "About" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
              <h3 className="text-sm font-semibold text-gray-800 col-span-full mb-2">Personal Information</h3>
              <InfoRow label="Date of Birth" value={emp.dob} icon={Calendar} />
              <InfoRow label="Gender" value={emp.gender} icon={User} />
              <InfoRow label="Marital Status" value={emp.marital_status} />
              <InfoRow label="Phone" value={emp.phone} icon={Phone} />
              <InfoRow label="Email" value={emp.email} icon={Mail} />
              <InfoRow label="Address" value={emp.address} icon={MapPin} />
              <InfoRow label="City" value={emp.city} />
              <InfoRow label="State" value={emp.state} />
              <InfoRow label="Country" value={emp.country} />
              <InfoRow label="Qualification" value={emp.qualification} />
              <InfoRow label="Experience" value={emp.experience} />
              <h3 className="text-sm font-semibold text-gray-800 col-span-full mt-4 mb-2">Emergency Contact</h3>
              <InfoRow label="Contact Name" value={emp.emergency_contact_name} />
              <InfoRow label="Contact Number" value={emp.emergency_contact} />
              <InfoRow label="Relation" value={emp.emergency_contact_relation} />
            </div>
          )}

          {activeTab === "Work" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
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
            </div>
          )}

          {activeTab === "Bank" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
              <InfoRow label="Bank Name" value={bankInfo?.bank_name || null} icon={CreditCard} />
              <InfoRow label="Account Number" value={bankInfo?.account_number || null} />
              <InfoRow label="Bank Code 1" value={bankInfo?.bank_code_1 || null} />
              <InfoRow label="Bank Code 2" value={bankInfo?.bank_code_2 || null} />
              <InfoRow label="Branch" value={bankInfo?.branch || null} />
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
