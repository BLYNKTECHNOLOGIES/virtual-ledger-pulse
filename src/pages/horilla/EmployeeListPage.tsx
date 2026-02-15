import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, Filter, LayoutGrid, List, MoreVertical,
  Mail, Phone, Building2, ChevronDown, Download, Upload,
  Archive, Trash2, Edit, Eye, UserCheck, UserX, X, Columns3
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

const ALL_TABLE_COLS = [
  { key: "employee", label: "Employee", alwaysVisible: true },
  { key: "badge_id", label: "Badge ID" },
  { key: "department", label: "Department" },
  { key: "position", label: "Job Position" },
  { key: "role", label: "Job Role" },
  { key: "type", label: "Employee Type" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Actions", alwaysVisible: true },
];

export default function EmployeeListPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewTab, setViewTab] = useState<"profile" | "employee">("profile");
  const [addOpen, setAddOpen] = useState(false);
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionsOpen, setActionsOpen] = useState(false);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<string[]>(
    ALL_TABLE_COLS.map(c => c.key)
  );

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

  const filtered = useMemo(() => {
    return (employees || []).filter((e) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        e.first_name.toLowerCase().includes(term) ||
        e.last_name.toLowerCase().includes(term) ||
        e.badge_id.toLowerCase().includes(term) ||
        (e.email || "").toLowerCase().includes(term);
      const wi = getWorkInfo(e.id);
      const matchesDept = deptFilter === "all" || wi?.department_id === deptFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && e.is_active) ||
        (statusFilter === "inactive" && !e.is_active);
      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [employees, workInfos, searchTerm, deptFilter, statusFilter]);

  const initials = (f: string, l: string) => `${f.charAt(0)}${l.charAt(0)}`.toUpperCase();
  const avatarColors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500"];
  const getColor = (id: string) => avatarColors[id.charCodeAt(0) % avatarColors.length];

  const allSelected = filtered.length > 0 && filtered.every(e => selectedIds.has(e.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(e => e.id)));
    }
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const isColVisible = (key: string) => visibleCols.includes(key);
  const toggleCol = (key: string) => {
    setVisibleCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const activeCount = (employees || []).filter(e => e.is_active).length;
  const inactiveCount = (employees || []).filter(e => !e.is_active).length;

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Employees</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage your employee database</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 bg-[#E8604C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Create
        </button>
      </div>

      {/* View Tabs — Profile / Employee (like Horilla sidebar sub-tabs) */}
      <div className="flex items-center gap-0 border-b border-gray-200 mb-0">
        <button
          onClick={() => setViewTab("profile")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            viewTab === "profile"
              ? "border-[#E8604C] text-[#E8604C]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            Profile
          </div>
        </button>
        <button
          onClick={() => setViewTab("employee")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            viewTab === "employee"
              ? "border-[#E8604C] text-[#E8604C]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Employee
          </div>
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl px-4 py-3 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 px-3 py-1.5 w-64">
          <Search className="h-4 w-4 text-gray-400 mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-full"
          />
        </div>

        {/* Filter dropdown */}
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
        >
          <option value="all">All Departments</option>
          {departments?.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        {/* Actions dropdown */}
        <div className="relative">
          <button
            onClick={() => setActionsOpen(!actionsOpen)}
            className="flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            Actions
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {actionsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setActionsOpen(false)} />
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] z-50">
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  <Upload className="h-3.5 w-3.5" /> Import
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
                <hr className="my-1 border-gray-100" />
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  <Archive className="h-3.5 w-3.5" /> Bulk Archive
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  <Edit className="h-3.5 w-3.5" /> Bulk Update
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                  <Trash2 className="h-3.5 w-3.5" /> Bulk Delete
                </button>
              </div>
            </>
          )}
        </div>

        {/* Quick Filters */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
            className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              statusFilter === "active"
                ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <UserCheck className="h-3 w-3" />
            Active ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === "inactive" ? "all" : "inactive")}
            className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              statusFilter === "inactive"
                ? "bg-red-100 text-red-700 ring-1 ring-red-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <UserX className="h-3 w-3" />
            Inactive ({inactiveCount})
          </button>
        </div>

        {/* Column picker (table view only) */}
        {viewTab === "employee" && (
          <div className="relative">
            <button
              onClick={() => setColPickerOpen(!colPickerOpen)}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
              title="Column Visibility"
            >
              <Columns3 className="h-4 w-4" />
            </button>
            {colPickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setColPickerOpen(false)} />
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[180px] z-50">
                  <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Show Columns</p>
                  {ALL_TABLE_COLS.filter(c => !c.alwaysVisible).map(col => (
                    <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isColVisible(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="rounded border-gray-300 text-[#E8604C] focus:ring-[#E8604C]"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bulk selection bar */}
      {selectedIds.size > 0 && (
        <div className="bg-[#E8604C]/5 border border-[#E8604C]/20 rounded-lg px-4 py-2 flex items-center gap-3 mt-3">
          <span className="text-sm font-medium text-[#E8604C]">{selectedIds.size} selected</span>
          <button className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1">
            <Download className="h-3 w-3" /> Export
          </button>
          <button className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1">
            <Archive className="h-3 w-3" /> Archive
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-gray-500 hover:text-gray-700 ml-auto flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Unselect
          </button>
        </div>
      )}

      {/* Content */}
      <div className="mt-4">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading employees...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Building2 className="h-7 w-7 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">No employees found</p>
            <button
              onClick={() => setAddOpen(true)}
              className="mt-3 text-[#E8604C] text-sm font-medium hover:underline"
            >
              + Add your first employee
            </button>
          </div>
        ) : viewTab === "profile" ? (
          /* ─── PROFILE / CARD VIEW ─── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((emp) => {
              const wi = getWorkInfo(emp.id);
              const selected = selectedIds.has(emp.id);
              return (
                <div
                  key={emp.id}
                  className={`bg-white rounded-xl border p-0 hover:shadow-md transition-all cursor-pointer group overflow-hidden ${
                    selected ? "border-[#E8604C] ring-1 ring-[#E8604C]/20" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {/* Card header with colored banner */}
                  <div className={`h-16 ${getColor(emp.id)} relative`}>
                    {/* Checkbox */}
                    <div className="absolute top-2 left-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => { e.stopPropagation(); toggleOne(emp.id); }}
                        className="rounded border-white/50 bg-white/20 text-[#E8604C] focus:ring-[#E8604C] cursor-pointer"
                      />
                    </div>
                    {/* Status badge */}
                    <div className="absolute top-2 right-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        emp.is_active
                          ? "bg-emerald-400/90 text-white"
                          : "bg-red-400/90 text-white"
                      }`}>
                        {emp.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    {/* Avatar overlapping banner */}
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
                      {emp.profile_image_url ? (
                        <img
                          src={emp.profile_image_url}
                          className="w-14 h-14 rounded-full object-cover border-3 border-white shadow-sm"
                          alt=""
                        />
                      ) : (
                        <div className={`w-14 h-14 rounded-full ${getColor(emp.id)} flex items-center justify-center text-white font-bold text-lg border-3 border-white shadow-sm`}>
                          {initials(emp.first_name, emp.last_name)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="pt-8 pb-4 px-4 text-center" onClick={() => navigate(`/hrms/employee/${emp.id}`)}>
                    <p className="font-semibold text-gray-900 text-sm group-hover:text-[#E8604C] transition-colors">
                      {emp.first_name} {emp.last_name}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{emp.badge_id}</p>
                    {wi?.job_role && (
                      <p className="text-xs text-gray-500 mt-1">{wi.job_role}</p>
                    )}
                    {wi?.department_id && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{getDeptName(wi.department_id)}</p>
                    )}
                  </div>

                  {/* Card footer with contact + actions */}
                  <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {emp.email && (
                        <button
                          onClick={(e) => { e.stopPropagation(); window.location.href = `mailto:${emp.email}`; }}
                          className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-[#E8604C] transition-colors"
                          title={emp.email}
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {emp.phone && (
                        <button
                          onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${emp.phone}`; }}
                          className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-[#E8604C] transition-colors"
                          title={emp.phone}
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/hrms/employee/${emp.id}`); }}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                        title="View Profile"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Edit"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ─── EMPLOYEE / TABLE VIEW ─── */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Select all bar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
              <button
                onClick={toggleAll}
                className="text-xs font-medium text-[#E8604C] hover:underline"
              >
                {allSelected ? "Unselect All" : "Select All"}
              </button>
              <span className="text-xs text-gray-400">
                {filtered.length} employee{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-10 py-3 px-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-[#E8604C] focus:ring-[#E8604C]"
                    />
                  </th>
                  {ALL_TABLE_COLS.filter(c => isColVisible(c.key)).map(col => (
                    <th key={col.key} className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const wi = getWorkInfo(emp.id);
                  const selected = selectedIds.has(emp.id);
                  return (
                    <tr
                      key={emp.id}
                      className={`border-b border-gray-50 transition-colors cursor-pointer ${
                        selected ? "bg-[#E8604C]/5" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleOne(emp.id)}
                          className="rounded border-gray-300 text-[#E8604C] focus:ring-[#E8604C]"
                        />
                      </td>

                      {isColVisible("employee") && (
                        <td className="py-3 px-3" onClick={() => navigate(`/hrms/employee/${emp.id}`)}>
                          <div className="flex items-center gap-3">
                            {emp.profile_image_url ? (
                              <img src={emp.profile_image_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                            ) : (
                              <div className={`w-8 h-8 rounded-full ${getColor(emp.id)} flex items-center justify-center text-white font-medium text-xs`}>
                                {initials(emp.first_name, emp.last_name)}
                              </div>
                            )}
                            <span className="font-medium text-gray-900 hover:text-[#E8604C] transition-colors">
                              {emp.first_name} {emp.last_name}
                            </span>
                          </div>
                        </td>
                      )}

                      {isColVisible("badge_id") && (
                        <td className="py-3 px-3 text-gray-500">{emp.badge_id}</td>
                      )}
                      {isColVisible("department") && (
                        <td className="py-3 px-3 text-gray-500">{getDeptName(wi?.department_id || null)}</td>
                      )}
                      {isColVisible("position") && (
                        <td className="py-3 px-3 text-gray-500">{getPositionTitle(wi?.job_position_id || null)}</td>
                      )}
                      {isColVisible("role") && (
                        <td className="py-3 px-3 text-gray-500">{wi?.job_role || "—"}</td>
                      )}
                      {isColVisible("type") && (
                        <td className="py-3 px-3">
                          {wi?.employee_type ? (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                              {wi.employee_type}
                            </span>
                          ) : "—"}
                        </td>
                      )}
                      {isColVisible("email") && (
                        <td className="py-3 px-3 text-gray-500">{emp.email || "—"}</td>
                      )}
                      {isColVisible("phone") && (
                        <td className="py-3 px-3 text-gray-500">{emp.phone || "—"}</td>
                      )}
                      {isColVisible("status") && (
                        <td className="py-3 px-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            emp.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}>
                            {emp.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      )}

                      {isColVisible("actions") && (
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); emp.email && (window.location.href = `mailto:${emp.email}`); }}
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-[#E8604C]"
                              title="Send Mail"
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/hrms/employee/${emp.id}`); }}
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                              title="View"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                              title="Edit"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} departments={departments || []} positions={positions || []} />
    </div>
  );
}
