import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, Filter, Grid3X3, List, MoreHorizontal,
  Mail, Phone, MapPin, Building2, ChevronDown
} from "lucide-react";
import { AddEmployeeDialog } from "@/components/horilla/employee/AddEmployeeDialog";

interface HrEmployee {
  id: string;
  badge_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  dob: string | null;
  is_active: boolean;
  profile_image_url: string | null;
  created_at: string;
}

interface WorkInfo {
  employee_id: string;
  department_id: string | null;
  job_position_id: string | null;
  job_role: string | null;
  joining_date: string | null;
  work_type: string | null;
  employee_type: string | null;
  location: string | null;
}

export default function EmployeeListPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [addOpen, setAddOpen] = useState(false);
  const [deptFilter, setDeptFilter] = useState("all");

  const { data: employees, isLoading } = useQuery({
    queryKey: ["hr_employees_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employees")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as HrEmployee[];
    },
  });

  const { data: workInfos } = useQuery({
    queryKey: ["hr_employee_work_infos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_employee_work_info").select("*");
      if (error) throw error;
      return (data || []) as WorkInfo[];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["departments_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: positions } = useQuery({
    queryKey: ["positions_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("*").eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  const getWorkInfo = (empId: string) => workInfos?.find((w) => w.employee_id === empId);
  const getDeptName = (deptId: string | null) => departments?.find((d) => d.id === deptId)?.name || "—";
  const getPositionTitle = (posId: string | null) => positions?.find((p) => p.id === posId)?.title || "—";

  const filtered = (employees || []).filter((e) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      e.first_name.toLowerCase().includes(term) ||
      e.last_name.toLowerCase().includes(term) ||
      e.badge_id.toLowerCase().includes(term) ||
      (e.email || "").toLowerCase().includes(term);
    const wi = getWorkInfo(e.id);
    const matchesDept = deptFilter === "all" || wi?.department_id === deptFilter;
    return matchesSearch && matchesDept;
  });

  const initials = (f: string, l: string) =>
    `${f.charAt(0)}${l.charAt(0)}`.toUpperCase();

  const colors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
  const getColor = (id: string) => colors[id.charCodeAt(0) % colors.length];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} employee{filtered.length !== 1 ? "s" : ""} found</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 bg-[#6C63FF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#5a52e0] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Employee
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3">
        <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 px-3 py-1.5 flex-1 max-w-sm">
          <Search className="h-4 w-4 text-gray-400 mr-2" />
          <input
            type="text"
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-full"
          />
        </div>

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white"
        >
          <option value="all">All Departments</option>
          {departments?.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 ml-auto border border-gray-200 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("card")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "card" ? "bg-[#6C63FF] text-white" : "text-gray-400 hover:text-gray-600"}`}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-[#6C63FF] text-white" : "text-gray-400 hover:text-gray-600"}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading employees...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Building2 className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-gray-500 text-sm">No employees found</p>
          <button
            onClick={() => setAddOpen(true)}
            className="mt-3 text-[#6C63FF] text-sm font-medium hover:underline"
          >
            + Add your first employee
          </button>
        </div>
      ) : viewMode === "card" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {filtered.map((emp) => {
            const wi = getWorkInfo(emp.id);
            return (
              <div
                key={emp.id}
                onClick={() => navigate(`/hrms/employee/${emp.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-[#6C63FF]/30 transition-all cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  {emp.profile_image_url ? (
                    <img src={emp.profile_image_url} className="w-11 h-11 rounded-full object-cover" alt="" />
                  ) : (
                    <div className={`w-11 h-11 rounded-full ${getColor(emp.id)} flex items-center justify-center text-white font-semibold text-sm`}>
                      {initials(emp.first_name, emp.last_name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate group-hover:text-[#6C63FF] transition-colors">
                      {emp.first_name} {emp.last_name}
                    </p>
                    <p className="text-xs text-gray-400">{emp.badge_id}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${emp.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {emp.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm text-gray-500">
                  {wi?.job_role && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-gray-400" />
                      <span className="truncate">{wi.job_role}</span>
                    </div>
                  )}
                  {wi?.department_id && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-gray-400" />
                      <span className="truncate">{getDeptName(wi.department_id)}</span>
                    </div>
                  )}
                  {emp.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                      <span className="truncate">{emp.email}</span>
                    </div>
                  )}
                  {emp.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      <span>{emp.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List/Table view */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Employee</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Badge ID</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Department</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Position</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Email</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => {
                const wi = getWorkInfo(emp.id);
                return (
                  <tr
                    key={emp.id}
                    onClick={() => navigate(`/hrms/employee/${emp.id}`)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full ${getColor(emp.id)} flex items-center justify-center text-white font-medium text-xs`}>
                          {initials(emp.first_name, emp.last_name)}
                        </div>
                        <span className="font-medium text-gray-900">{emp.first_name} {emp.last_name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-500">{emp.badge_id}</td>
                    <td className="py-3 px-4 text-gray-500">{getDeptName(wi?.department_id || null)}</td>
                    <td className="py-3 px-4 text-gray-500">{getPositionTitle(wi?.job_position_id || null)}</td>
                    <td className="py-3 px-4 text-gray-500">{emp.email || "—"}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${emp.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {emp.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} departments={departments || []} positions={positions || []} />
    </div>
  );
}
