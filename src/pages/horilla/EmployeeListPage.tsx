import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, Filter, LayoutGrid, List, MoreVertical,
  Mail, Phone, Building2, ChevronDown, ChevronUp, Download, Upload,
  Archive, Trash2, Edit, Eye, UserCheck, UserX, X, Columns3,
  ArrowUpDown, Save, ChevronLeft, ChevronRight, SlidersHorizontal
} from "lucide-react";
import { AddEmployeeDialog } from "@/components/horilla/employee/AddEmployeeDialog";
import { EditEmployeeDialog } from "@/components/horilla/employee/EditEmployeeDialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// ─── Types ───
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
  id: string;
  employee_id: string;
  department_id: string | null;
  job_position_id: string | null;
  job_role: string | null;
  joining_date: string | null;
  work_type: string | null;
  employee_type: string | null;
  location: string | null;
  shift_id: string | null;
}

interface Shift {
  id: string;
  name: string;
}

interface ActiveFilter {
  field: string;
  label: string;
  value: string;
  displayValue: string;
}

type SortDir = "asc" | "desc" | null;
interface SortState {
  column: string | null;
  direction: SortDir;
}

// ─── Column definitions ───
const ALL_TABLE_COLS = [
  { key: "employee", label: "Employee", sortable: true, alwaysVisible: true },
  { key: "email", label: "Email", sortable: true },
  { key: "phone", label: "Phone", sortable: false },
  { key: "badge_id", label: "Badge Id", sortable: true },
  { key: "position", label: "Job Position", sortable: true },
  { key: "department", label: "Department", sortable: true },
  { key: "shift", label: "Shift", sortable: true },
  { key: "work_type", label: "Work Type", sortable: true },
  { key: "type", label: "Employee Type", sortable: true },
  { key: "actions", label: "Actions", sortable: false, alwaysVisible: true },
];

// ─── Filter field options ───
const FILTER_FIELDS = [
  { key: "is_active", label: "Is active", type: "select", options: [{ value: "true", label: "True" }, { value: "false", label: "False" }] },
  { key: "department", label: "Department", type: "dynamic" },
  { key: "position", label: "Job Position", type: "dynamic" },
  { key: "shift", label: "Shift", type: "dynamic" },
  { key: "work_type", label: "Work Type", type: "select", options: [{ value: "Work From Office", label: "Work From Office" }, { value: "Work From Home", label: "Work From Home" }, { value: "Hybrid", label: "Hybrid" }] },
  { key: "employee_type", label: "Employee Type", type: "select", options: [{ value: "Full-time", label: "Full-time" }, { value: "Part-time", label: "Part-time" }, { value: "Contract", label: "Contract" }, { value: "Intern", label: "Intern" }, { value: "Permanent", label: "Permanent" }] },
  { key: "gender", label: "Gender", type: "select", options: [{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }] },
];

export default function EmployeeListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ─── State ───
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<any>(null);
  const [editWorkInfo, setEditWorkInfo] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionsOpen, setActionsOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([
    { field: "is_active", label: "Is active", value: "true", displayValue: "True" }
  ]);
  const [pendingFilterField, setPendingFilterField] = useState("");
  const [pendingFilterValue, setPendingFilterValue] = useState("");
  const [sort, setSort] = useState<SortState>({ column: null, direction: null });
  const [currentPage, setCurrentPage] = useState(1);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<string[]>(ALL_TABLE_COLS.map(c => c.key));

  const pageSize = viewMode === "grid" ? 12 : 20;

  // ─── Queries ───
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

  const { data: shifts } = useQuery({
    queryKey: ["hr_shifts_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_shifts").select("id, name").eq("is_active", true);
      if (error) throw error;
      return (data || []) as Shift[];
    },
  });

  // ─── Lookups ───
  const getWorkInfo = useCallback((empId: string) => workInfos?.find((w) => w.employee_id === empId), [workInfos]);
  const getDeptName = useCallback((deptId: string | null) => departments?.find((d) => d.id === deptId)?.name || "None", [departments]);
  const getPositionTitle = useCallback((posId: string | null) => positions?.find((p) => p.id === posId)?.title || "None", [positions]);
  const getShiftName = useCallback((shiftId: string | null) => shifts?.find((s) => s.id === shiftId)?.name || "None", [shifts]);

  // ─── Delete ───
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Employee deleted");
      queryClient.invalidateQueries({ queryKey: ["hr_employees_list"] });
    },
    onError: () => toast.error("Failed to delete employee"),
  });

  const handleEdit = (emp: HrEmployee) => {
    const wi = getWorkInfo(emp.id);
    setEditEmployee(emp);
    setEditWorkInfo(wi || null);
    setEditOpen(true);
  };

  const handleDelete = (emp: HrEmployee) => {
    if (confirm(`Delete ${emp.first_name} ${emp.last_name}? This cannot be undone.`)) {
      deleteMutation.mutate(emp.id);
    }
  };

  // ─── Filter logic ───
  const addFilter = () => {
    if (!pendingFilterField || !pendingFilterValue) return;
    const fieldDef = FILTER_FIELDS.find(f => f.key === pendingFilterField);
    if (!fieldDef) return;

    let displayValue = pendingFilterValue;
    if (pendingFilterField === "department") {
      displayValue = departments?.find(d => d.id === pendingFilterValue)?.name || pendingFilterValue;
    } else if (pendingFilterField === "position") {
      displayValue = positions?.find(p => p.id === pendingFilterValue)?.title || pendingFilterValue;
    } else if (pendingFilterField === "shift") {
      displayValue = shifts?.find(s => s.id === pendingFilterValue)?.name || pendingFilterValue;
    }

    // Remove existing filter for same field
    const updated = activeFilters.filter(f => f.field !== pendingFilterField);
    updated.push({ field: pendingFilterField, label: fieldDef.label, value: pendingFilterValue, displayValue });
    setActiveFilters(updated);
    setPendingFilterField("");
    setPendingFilterValue("");
    setCurrentPage(1);
  };

  const removeFilter = (field: string) => {
    setActiveFilters(prev => prev.filter(f => f.field !== field));
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
    setCurrentPage(1);
  };

  // ─── Filtering ───
  const filtered = useMemo(() => {
    return (employees || []).filter((e) => {
      // Search
      const term = searchTerm.toLowerCase();
      if (term) {
        const matchesSearch =
          e.first_name.toLowerCase().includes(term) ||
          e.last_name.toLowerCase().includes(term) ||
          e.badge_id.toLowerCase().includes(term) ||
          (e.email || "").toLowerCase().includes(term) ||
          (e.phone || "").includes(term);
        if (!matchesSearch) return false;
      }

      // Active filters
      const wi = getWorkInfo(e.id);
      for (const filter of activeFilters) {
        switch (filter.field) {
          case "is_active":
            if (filter.value === "true" && !e.is_active) return false;
            if (filter.value === "false" && e.is_active) return false;
            break;
          case "department":
            if (wi?.department_id !== filter.value) return false;
            break;
          case "position":
            if (wi?.job_position_id !== filter.value) return false;
            break;
          case "shift":
            if (wi?.shift_id !== filter.value) return false;
            break;
          case "work_type":
            if ((wi?.work_type || "") !== filter.value) return false;
            break;
          case "employee_type":
            if ((wi?.employee_type || "") !== filter.value) return false;
            break;
          case "gender":
            if ((e.gender || "") !== filter.value) return false;
            break;
        }
      }
      return true;
    });
  }, [employees, workInfos, searchTerm, activeFilters, getWorkInfo]);

  // ─── Sorting ───
  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return filtered;
    return [...filtered].sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      let aVal = "";
      let bVal = "";
      const aWi = getWorkInfo(a.id);
      const bWi = getWorkInfo(b.id);

      switch (sort.column) {
        case "employee":
          aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
          bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
          break;
        case "email":
          aVal = (a.email || "").toLowerCase();
          bVal = (b.email || "").toLowerCase();
          break;
        case "badge_id":
          aVal = a.badge_id.toLowerCase();
          bVal = b.badge_id.toLowerCase();
          break;
        case "department":
          aVal = getDeptName(aWi?.department_id || null).toLowerCase();
          bVal = getDeptName(bWi?.department_id || null).toLowerCase();
          break;
        case "position":
          aVal = getPositionTitle(aWi?.job_position_id || null).toLowerCase();
          bVal = getPositionTitle(bWi?.job_position_id || null).toLowerCase();
          break;
        case "shift":
          aVal = getShiftName(aWi?.shift_id || null).toLowerCase();
          bVal = getShiftName(bWi?.shift_id || null).toLowerCase();
          break;
        case "work_type":
          aVal = (aWi?.work_type || "").toLowerCase();
          bVal = (bWi?.work_type || "").toLowerCase();
          break;
        case "type":
          aVal = (aWi?.employee_type || "").toLowerCase();
          bVal = (bWi?.employee_type || "").toLowerCase();
          break;
      }
      return aVal < bVal ? -dir : aVal > bVal ? dir : 0;
    });
  }, [filtered, sort, getWorkInfo, getDeptName, getPositionTitle, getShiftName]);

  // ─── Pagination ───
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ─── Selection ───
  const allSelected = paginated.length > 0 && paginated.every(e => selectedIds.has(e.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginated.map(e => e.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  // ─── Column visibility ───
  const isColVisible = (key: string) => visibleCols.includes(key);
  const toggleCol = (key: string) => {
    setVisibleCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // ─── Sort handler ───
  const handleSort = (colKey: string) => {
    setSort(prev => {
      if (prev.column === colKey) {
        if (prev.direction === "asc") return { column: colKey, direction: "desc" };
        if (prev.direction === "desc") return { column: null, direction: null };
      }
      return { column: colKey, direction: "asc" };
    });
  };

  // ─── Export logic ───
  const handleExport = () => {
    const rows = sorted.map(emp => {
      const wi = getWorkInfo(emp.id);
      return {
        "Badge ID": emp.badge_id,
        "First Name": emp.first_name,
        "Last Name": emp.last_name,
        "Email": emp.email || "",
        "Phone": emp.phone || "",
        "Department": getDeptName(wi?.department_id || null),
        "Job Position": getPositionTitle(wi?.job_position_id || null),
        "Shift": getShiftName(wi?.shift_id || null),
        "Work Type": wi?.work_type || "",
        "Employee Type": wi?.employee_type || "",
        "Status": emp.is_active ? "Active" : "Inactive",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "employees_export.xlsx");
    toast.success(`Exported ${rows.length} employees`);
  };

  // ─── Bulk delete ───
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) { toast.error("No employees selected"); return; }
    if (!confirm(`Delete ${selectedIds.size} selected employee(s)? This cannot be undone.`)) return;
    try {
      for (const id of selectedIds) {
        const { error } = await supabase.from("hr_employees").delete().eq("id", id);
        if (error) throw error;
      }
      toast.success(`${selectedIds.size} employee(s) deleted`);
      queryClient.invalidateQueries({ queryKey: ["hr_employees_list"] });
      setSelectedIds(new Set());
      setActionsOpen(false);
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ─── Helpers ───
  const initials = (f: string, l: string) => `${f.charAt(0)}${l.charAt(0)}`.toUpperCase();
  const avatarColors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500"];
  const getColor = (id: string) => avatarColors[id.charCodeAt(0) % avatarColors.length];

  const resetPage = () => setCurrentPage(1);

  // Filter panel dynamic options
  const getFilterOptions = (fieldKey: string) => {
    const fieldDef = FILTER_FIELDS.find(f => f.key === fieldKey);
    if (!fieldDef) return [];
    if (fieldDef.type === "select") return fieldDef.options || [];
    if (fieldKey === "department") return (departments || []).map(d => ({ value: d.id, label: d.name }));
    if (fieldKey === "position") return (positions || []).map(p => ({ value: p.id, label: p.title }));
    if (fieldKey === "shift") return (shifts || []).map(s => ({ value: s.id, label: s.name }));
    return [];
  };

  // ─── Sort icon for column headers ───
  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sort.column !== colKey) return <ArrowUpDown className="h-3 w-3 ml-1 text-gray-300 inline" />;
    if (sort.direction === "asc") return <ChevronUp className="h-3 w-3 ml-1 text-[#00bcd4] inline" />;
    return <ChevronDown className="h-3 w-3 ml-1 text-[#00bcd4] inline" />;
  };

  return (
    <div className="space-y-0">
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">Employees</h1>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="flex items-center bg-muted/50 rounded-lg border border-border px-3 py-1.5 w-52">
            <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); resetPage(); }}
              className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
            />
          </div>

          {/* View toggle */}
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 transition-colors ${viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 transition-colors ${viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          {/* Filter button */}
          <button
            onClick={() => setFilterPanelOpen(!filterPanelOpen)}
            className={`flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 transition-colors ${
              filterPanelOpen ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:bg-muted"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Filter
          </button>

          {/* Actions */}
          <div className="relative">
            <button
              onClick={() => setActionsOpen(!actionsOpen)}
              className="flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-1.5 text-foreground hover:bg-muted transition-colors"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Actions
            </button>
            {actionsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setActionsOpen(false)} />
                <div className="absolute top-full right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px] z-50">
                  <button
                    onClick={() => { handleExport(); setActionsOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted flex items-center gap-2"
                  >
                    <Download className="h-3.5 w-3.5" /> Export
                  </button>
                  <hr className="my-1 border-border" />
                  <button
                    onClick={handleBulkDelete}
                    className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Bulk Delete
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Create */}
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 bg-[#00bcd4] text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-[#00a5bb] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create
          </button>
        </div>
      </div>

      {/* ─── Filter Panel ─── */}
      {filterPanelOpen && (
        <div className="bg-muted/30 border border-border rounded-lg px-4 py-3 mb-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Field</label>
            <select
              value={pendingFilterField}
              onChange={(e) => { setPendingFilterField(e.target.value); setPendingFilterValue(""); }}
              className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground min-w-[150px]"
            >
              <option value="">Select filter...</option>
              {FILTER_FIELDS.map(f => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>

          {pendingFilterField && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Value</label>
              <select
                value={pendingFilterValue}
                onChange={(e) => setPendingFilterValue(e.target.value)}
                className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground min-w-[150px]"
              >
                <option value="">Select value...</option>
                {getFilterOptions(pendingFilterField).map((o: any) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={addFilter}
            disabled={!pendingFilterField || !pendingFilterValue}
            className="px-3 py-1.5 text-sm font-medium bg-[#00bcd4] text-white rounded-lg hover:bg-[#00a5bb] disabled:opacity-40 transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {/* ─── Active Filter Chips + Toolbar Row ─── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* View mode label */}
        <span className="text-xs font-semibold text-white bg-[#00bcd4] px-2.5 py-1 rounded">
          {viewMode === "list" ? "List" : "Card"}
        </span>

        {/* Select button */}
        <button
          onClick={toggleAll}
          className="text-xs font-medium text-white bg-[#00bcd4] px-3 py-1 rounded hover:bg-[#00a5bb] transition-colors"
        >
          Select ({sorted.length})
        </button>

        {/* Active filters */}
        {activeFilters.length > 0 && (
          <>
            <span className="text-xs font-semibold text-white bg-[#ff9800] px-2.5 py-1 rounded">
              Filters:
            </span>
            {activeFilters.map(f => (
              <span key={f.field} className="flex items-center gap-1 text-xs bg-muted border border-border rounded px-2 py-1 text-foreground">
                {f.label} : {f.displayValue}
                <button onClick={() => removeFilter(f.field)} className="text-destructive hover:text-destructive/80 ml-0.5">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              onClick={clearAllFilters}
              className="p-1 rounded hover:bg-destructive/10 text-destructive"
              title="Clear all filters"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Column picker (list view) */}
        {viewMode === "list" && (
          <div className="relative ml-auto">
            <button
              onClick={() => setColPickerOpen(!colPickerOpen)}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
              title="Column Visibility"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {colPickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setColPickerOpen(false)} />
                <div className="absolute top-full right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg py-2 min-w-[180px] z-50">
                  <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Show Columns</p>
                  {ALL_TABLE_COLS.filter(c => !c.alwaysVisible).map(col => (
                    <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isColVisible(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="rounded border-border text-[#00bcd4] focus:ring-[#00bcd4]"
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

      {/* ─── Content ─── */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading employees...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
            <Building2 className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No employees found</p>
          <button onClick={() => setAddOpen(true)} className="mt-3 text-[#00bcd4] text-sm font-medium hover:underline">
            + Add your first employee
          </button>
        </div>
      ) : viewMode === "list" ? (
        /* ─── TABLE VIEW ─── */
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="w-10 py-3 px-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-border text-[#00bcd4] focus:ring-[#00bcd4]"
                  />
                </th>
                {ALL_TABLE_COLS.filter(c => isColVisible(c.key)).map(col => (
                  <th
                    key={col.key}
                    className={`text-left py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider ${col.sortable ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <span className="inline-flex items-center">
                      {col.label}
                      {col.sortable && <SortIcon colKey={col.key} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((emp) => {
                const wi = getWorkInfo(emp.id);
                const selected = selectedIds.has(emp.id);
                return (
                  <tr
                    key={emp.id}
                    className={`border-b border-border/50 transition-colors cursor-pointer ${
                      selected ? "bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <td className="py-3 px-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleOne(emp.id)}
                        className="rounded border-border text-[#00bcd4] focus:ring-[#00bcd4]"
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
                          <span className="font-medium text-foreground hover:text-[#00bcd4] transition-colors">
                            {emp.first_name} {emp.last_name} ({emp.badge_id})
                          </span>
                        </div>
                      </td>
                    )}

                    {isColVisible("email") && (
                      <td className="py-3 px-3 text-muted-foreground">{emp.email || "None"}</td>
                    )}
                    {isColVisible("phone") && (
                      <td className="py-3 px-3 text-muted-foreground">{emp.phone || "None"}</td>
                    )}
                    {isColVisible("badge_id") && (
                      <td className="py-3 px-3 text-muted-foreground">{emp.badge_id}</td>
                    )}
                    {isColVisible("position") && (
                      <td className="py-3 px-3 text-muted-foreground">{getPositionTitle(wi?.job_position_id || null)}</td>
                    )}
                    {isColVisible("department") && (
                      <td className="py-3 px-3 text-muted-foreground">{getDeptName(wi?.department_id || null)}</td>
                    )}
                    {isColVisible("shift") && (
                      <td className="py-3 px-3 text-muted-foreground">{getShiftName(wi?.shift_id || null)}</td>
                    )}
                    {isColVisible("work_type") && (
                      <td className="py-3 px-3 text-muted-foreground">{wi?.work_type || "None"}</td>
                    )}
                    {isColVisible("type") && (
                      <td className="py-3 px-3 text-muted-foreground">{wi?.employee_type || "None"}</td>
                    )}

                    {isColVisible("actions") && (
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleExportSingle(emp); }}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); emp.email && (window.location.href = `mailto:${emp.email}`); }}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Send Mail"
                          >
                            <Mail className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEdit(emp); }}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(emp); }}
                            className="p-1.5 rounded hover:bg-destructive/10 text-destructive hover:text-destructive transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
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
      ) : (
        /* ─── GRID / CARD VIEW ─── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginated.map((emp) => {
            const wi = getWorkInfo(emp.id);
            const selected = selectedIds.has(emp.id);
            return (
              <div
                key={emp.id}
                className={`bg-card rounded-xl border p-0 hover:shadow-md transition-all cursor-pointer group overflow-hidden ${
                  selected ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-border/80"
                }`}
              >
                <div className={`h-16 ${getColor(emp.id)} relative`}>
                  <div className="absolute top-2 left-2">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) => { e.stopPropagation(); toggleOne(emp.id); }}
                      className="rounded border-white/50 bg-white/20 text-[#00bcd4] focus:ring-[#00bcd4] cursor-pointer"
                    />
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      emp.is_active ? "bg-emerald-400/90 text-white" : "bg-red-400/90 text-white"
                    }`}>
                      {emp.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
                    {emp.profile_image_url ? (
                      <img src={emp.profile_image_url} className="w-14 h-14 rounded-full object-cover border-3 border-white shadow-sm" alt="" />
                    ) : (
                      <div className={`w-14 h-14 rounded-full ${getColor(emp.id)} flex items-center justify-center text-white font-bold text-lg border-3 border-white shadow-sm`}>
                        {initials(emp.first_name, emp.last_name)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-8 pb-4 px-4 text-center" onClick={() => navigate(`/hrms/employee/${emp.id}`)}>
                  <p className="font-semibold text-foreground text-sm group-hover:text-[#00bcd4] transition-colors">
                    {emp.first_name} {emp.last_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{emp.badge_id}</p>
                  {wi?.job_role && <p className="text-xs text-muted-foreground mt-1">{wi.job_role}</p>}
                  {wi?.department_id && <p className="text-[11px] text-muted-foreground mt-0.5">{getDeptName(wi.department_id)}</p>}
                </div>

                <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {emp.email && (
                      <button onClick={(e) => { e.stopPropagation(); window.location.href = `mailto:${emp.email}`; }}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-[#00bcd4] transition-colors" title={emp.email}>
                        <Mail className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {emp.phone && (
                      <button onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${emp.phone}`; }}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-[#00bcd4] transition-colors" title={emp.phone}>
                        <Phone className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/hrms/employee/${emp.id}`); }}
                      className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-blue-600 transition-colors" title="View Profile">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(emp); }}
                      className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(emp); }}
                      className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Pagination (Horilla style) ─── */}
      {sorted.length > pageSize && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Dialogs ─── */}
      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} departments={departments || []} positions={positions || []} />
      <EditEmployeeDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        employee={editEmployee}
        workInfo={editWorkInfo}
        departments={departments || []}
        positions={positions || []}
      />
    </div>
  );

  // ─── Single employee export ───
  function handleExportSingle(emp: HrEmployee) {
    const wi = getWorkInfo(emp.id);
    const rows = [{
      "Badge ID": emp.badge_id,
      "First Name": emp.first_name,
      "Last Name": emp.last_name,
      "Email": emp.email || "",
      "Phone": emp.phone || "",
      "Department": getDeptName(wi?.department_id || null),
      "Job Position": getPositionTitle(wi?.job_position_id || null),
      "Shift": getShiftName(wi?.shift_id || null),
      "Work Type": wi?.work_type || "",
      "Employee Type": wi?.employee_type || "",
      "Status": emp.is_active ? "Active" : "Inactive",
    }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employee");
    XLSX.writeFile(wb, `${emp.badge_id}_${emp.first_name}_${emp.last_name}.xlsx`);
    toast.success(`Exported ${emp.first_name} ${emp.last_name}`);
  }
}
