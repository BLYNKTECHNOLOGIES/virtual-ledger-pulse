import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, Users, CalendarDays, BarChart3, Download, History } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";
import { useProbationStatus, isSickLeaveType } from "@/hooks/useProbationStatus";
import { EmployeePicker } from "@/components/hrms/EmployeePicker";
import { ViewToggle } from "@/components/hrms/ViewToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getCurrentMonth() {
  return new Date().getMonth() + 1;
}

function getMonthLabel(m: number) {
  return MONTHS[m - 1] || "";
}

function getMonthShort(m: number) {
  return (MONTHS[m - 1] || "").slice(0, 3);
}

export default function LeaveAllocationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
  const [monthFilter, setMonthFilter] = useState(getCurrentMonth().toString());
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState({ employee_id: "", leave_type_id: "", allocated_days: 12 });

  const { isOnProbation, probationEndDate } = useProbationStatus();
  const [viewMode, setViewMode] = useViewMode("leave-allocations");

  const year = parseInt(yearFilter);
  const month = parseInt(monthFilter);
  const quarterOfMonth = Math.ceil(month / 3);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const { data: allAllocations = [], isLoading } = useQuery({
    queryKey: ["hr_leave_allocations_all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_leave_allocations")
        .select("*, hr_employees!hr_leave_allocations_employee_id_fkey(id, badge_id, first_name, last_name, is_active), hr_leave_types!hr_leave_allocations_leave_type_id_fkey(id, name, code, color, max_days_per_year)")
        .order("year", { ascending: true });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // Automatic monthly accrual credits for the selected month (CL/SL etc.)
  const { data: monthAccruals = [] } = useQuery({
    queryKey: ["hr_leave_accrual_log_month", year, month],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_leave_accrual_log")
        .select("employee_id, accrued_days, accrual_date, hr_leave_accrual_plans!hr_leave_accrual_log_accrual_plan_id_fkey(leave_type_id)")
        .gte("accrual_date", monthStart)
        .lt("accrual_date", monthEnd);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // Ex-employees (is_active = false) must not appear in live leave balances
  const activeAllocations = allAllocations.filter((a: any) => a.hr_employees?.is_active !== false);

  // Allocations relevant to the selected month: the month's quarter buckets,
  // legacy quarter-less rows, and the cumulative monthly-accrual buckets (quarter = 0)
  const currentMonthAllocations = activeAllocations.filter(
    (a: any) => a.year === year && (a.quarter === quarterOfMonth || !a.quarter)
  );

  // ── Per-month credit map: what each employee was actually CREDITED in the selected month ──
  // Sources: (1) automatic accrual log entries dated in the month,
  //          (2) manual allocations tagged with this month (legacy rows backfilled by creation month).
  const creditedMap: Record<string, Record<string, number>> = {};
  const addCredit = (empId: string, ltId: string, days: number) => {
    if (!empId || !ltId || !days) return;
    if (!creditedMap[empId]) creditedMap[empId] = {};
    creditedMap[empId][ltId] = (creditedMap[empId][ltId] || 0) + days;
  };
  for (const log of monthAccruals) {
    addCredit(log.employee_id, log.hr_leave_accrual_plans?.leave_type_id, Number(log.accrued_days || 0));
  }
  for (const a of activeAllocations) {
    if (a.year === year && a.month === month && a.quarter && a.quarter > 0) {
      addCredit(a.employee_id, a.leave_type_id, Number(a.allocated_days || 0));
    }
  }
  const totalCreditedThisMonth = Object.values(creditedMap).reduce(
    (s, per) => s + Object.values(per).reduce((ss, v) => ss + v, 0), 0,
  );

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() => (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true).order("first_name"));
      return data || [];
    },
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hr_leave_types_active"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_leave_types").select("id, name, code, color, max_days_per_year").eq("is_active", true);
      return data || [];
    },
  });

  const allocatableLeaveTypes = leaveTypes.filter((lt: any) => lt.code !== "CO");

  const selectedIsProbationer = isOnProbation(form.employee_id);
  const selectedType = leaveTypes.find((t: any) => t.id === form.leave_type_id);
  const blockedByProbation = selectedIsProbationer && !!selectedType && isSickLeaveType(selectedType);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (blockedByProbation) throw new Error("Sick/Medical leave cannot be allocated to an employee on probation");
      if (selectedType?.code === "CO") throw new Error("Compensatory Off is generated only from verified weekly-off or holiday attendance");
      const { error } = await (supabase as any).from("hr_leave_allocations").insert({
        employee_id: form.employee_id,
        leave_type_id: form.leave_type_id,
        year,
        quarter: quarterOfMonth,
        month,
        allocated_days: form.allocated_days,
        carry_forward_days: 0,
        used_days: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_allocations_all"] });
      setShowAdd(false);
      toast.success("Leave allocated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkAllocateMutation = useMutation({
    mutationFn: async () => {
      const rows = employees.flatMap((emp: any) =>
        allocatableLeaveTypes.filter((lt: any) => !(isSickLeaveType(lt) && isOnProbation(emp.id))).map((lt: any) => ({
          employee_id: emp.id,
          leave_type_id: lt.id,
          year,
          quarter: quarterOfMonth,
          month,
          allocated_days: lt.max_days_per_year ?? 12,
          available_days: lt.max_days_per_year ?? 12,
          used_days: 0,
          carry_forward_days: 0,
        }))
      );
      const { error } = await (supabase as any)
        .from("hr_leave_allocations")
        .upsert(rows, { onConflict: "employee_id,leave_type_id,year,quarter" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_allocations_all"] });
      setShowBulk(false);
      toast.success(`Leave allocated for all ${employees.length} employees for ${getMonthLabel(month)} ${year}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const computeCumulativeBalances = () => {
    const empMap: Record<string, { employee: any; balances: Record<string, { totalAllocated: number; totalUsed: number; leaveType: any }> }> = {};
    for (const a of activeAllocations) {
      const empId = a.employee_id;
      if (!empMap[empId]) empMap[empId] = { employee: a.hr_employees, balances: {} };
      const ltId = a.leave_type_id;
      if (!empMap[empId].balances[ltId]) empMap[empId].balances[ltId] = { totalAllocated: 0, totalUsed: 0, leaveType: a.hr_leave_types };
      if (a.hr_leave_types?.code === "CO") {
        const isSelectedPeriod = a.year === year && (a.quarter === quarterOfMonth || !a.quarter);
        if (isSelectedPeriod) {
          empMap[empId].balances[ltId].totalAllocated = Number(a.available_days || 0);
          empMap[empId].balances[ltId].totalUsed = 0;
        }
      } else {
        empMap[empId].balances[ltId].totalAllocated += Number(a.allocated_days || 0);
        empMap[empId].balances[ltId].totalUsed += Number(a.used_days || 0);
      }
    }
    return Object.values(empMap);
  };

  // Group by employee: anyone with an allocation in scope OR a credit this month
  const grouped = currentMonthAllocations.reduce((acc: any, a: any) => {
    const empId = a.employee_id;
    if (!acc[empId]) acc[empId] = { employee: a.hr_employees, allocations: [] };
    acc[empId].allocations.push(a);
    return acc;
  }, {} as Record<string, any>);
  for (const empId of Object.keys(creditedMap)) {
    if (!grouped[empId]) {
      const emp = employees.find((e: any) => e.id === empId)
        || allAllocations.find((a: any) => a.employee_id === empId)?.hr_employees;
      if (emp && emp.is_active !== false) grouped[empId] = { employee: emp, allocations: [] };
    }
  }

  const groupedArr = Object.values(grouped).filter((g: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${g.employee?.first_name || ""} ${g.employee?.last_name || ""}`.toLowerCase();
    return name.includes(q) || g.employee?.badge_id?.toLowerCase().includes(q);
  });

  const cumulativeData = computeCumulativeBalances();
  const totalAllocated = cumulativeData.reduce((s, e) => s + Object.values(e.balances).reduce((ss, b) => ss + b.totalAllocated, 0), 0);
  const totalUsed = cumulativeData.reduce((s, e) => s + Object.values(e.balances).reduce((ss, b) => ss + b.totalUsed, 0), 0);
  const uniqueEmployees = cumulativeData.length;

  const exportCsv = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const monShort = getMonthShort(month);
    const header = ["Employee", "Badge", "Status", ...leaveTypes.map((lt: any) => `${lt.name} (${monShort} credited)`), ...leaveTypes.map((lt: any) => `${lt.name} (Bal)`), "Total Credited", "Total Balance"];
    const rows = (groupedArr as any[]).map((g: any) => {
      const empCumulative = cumulativeData.find(c => c.employee?.id === g.employee?.id);
      const probation = isOnProbation(g.employee?.id);
      let totalBal = 0;
      let totalCred = 0;
      const credCells = leaveTypes.map((lt: any) => {
        const c = creditedMap[g.employee?.id]?.[lt.id] || 0;
        totalCred += c;
        return c;
      });
      const balCells = leaveTypes.map((lt: any) => {
        const alloc = g.allocations.find((a: any) => a.leave_type_id === lt.id);
        const cumBal = empCumulative?.balances[lt.id];
        const bal = cumBal
          ? cumBal.totalAllocated - cumBal.totalUsed
          : Number(alloc?.allocated_days || 0) - Number(alloc?.used_days || 0);
        totalBal += bal;
        if (!alloc && isSickLeaveType(lt) && probation) return "Not allocated";
        return bal;
      });
      return [
        `${g.employee?.first_name || ""} ${g.employee?.last_name || ""}`.trim(),
        g.employee?.badge_id || "",
        probation ? `Probation${probationEndDate(g.employee?.id) ? ` till ${probationEndDate(g.employee?.id)}` : ""}` : "Confirmed",
        ...credCells,
        ...balCells,
        totalCred,
        totalBal,
      ];
    });
    const csv = [header, ...rows].map(r => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leave-credits-${getMonthLabel(month)}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Leave Allocations"
        description="Monthly leave credits — Compensatory Off is earned from verified off-day work and settles monthly"
        actions={
          <>
            <ViewToggle value={viewMode} onChange={setViewMode} />
            <Button variant="outline" onClick={() => navigate("/hrms/leave/allocations/history")} className="h-9">
              <History className="h-4 w-4 mr-2" /> History
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={groupedArr.length === 0} className="h-9">
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => setShowBulk(true)} className="h-9">
              <Users className="h-4 w-4 mr-2" /> Bulk Allocate
            </Button>
            <Button onClick={() => setShowAdd(true)} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">
              <Plus className="h-4 w-4 mr-2" /> Allocate Leave
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Employees Allocated", value: uniqueEmployees, icon: Users, color: "text-info", bg: "bg-info/10" },
          { label: `Days Credited (${getMonthShort(month)} ${year})`, value: totalCreditedThisMonth, icon: CalendarDays, color: "text-success", bg: "bg-success/10" },
          { label: "Total Days Allocated (All Time)", value: totalAllocated, icon: BarChart3, color: "text-warning", bg: "bg-warning/10" },
          { label: "Cumulative Balance", value: totalAllocated - totalUsed, icon: CalendarDays, color: "text-primary", bg: "bg-primary/10" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-2xl font-bold tabular-nums">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>
      ) : groupedArr.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarDays}
              title={`No leave allocations for ${getMonthLabel(month)} ${year}`}
              description="Bulk allocate to quickly assign default leave days to all active employees."
              action={
                <button onClick={() => setShowBulk(true)} className="text-sm text-[#E8604C] font-medium hover:underline">
                  Bulk allocate for all employees →
                </button>
              }
            />
          </CardContent>
        </Card>
      ) : viewMode === "table" ? (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium sticky left-0 bg-muted/50">Employee</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Badge</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Status</TableHead>
                  {leaveTypes.map((lt: any) => (
                    <TableHead key={lt.id} className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: lt.color || "#E8604C" }} />
                        {lt.name}
                      </span>
                      <span className="block text-[9px] normal-case tracking-normal">{getMonthShort(month)} credited · Balance</span>
                    </TableHead>
                  ))}
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium text-right">Total Bal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(groupedArr as any[]).map((g: any) => {
                  const empCumulative = cumulativeData.find(c => c.employee?.id === g.employee?.id);
                  const probation = isOnProbation(g.employee?.id);
                  let totalBal = 0;
                  const cells = leaveTypes.map((lt: any) => {
                    const alloc = g.allocations.find((a: any) => a.leave_type_id === lt.id);
                    const cumBal = empCumulative?.balances[lt.id];
                    const credited = creditedMap[g.employee?.id]?.[lt.id] || 0;
                    const used = Number(cumBal?.totalUsed ?? alloc?.used_days ?? 0);
                    const bal = lt.code === "CO"
                      ? Number(alloc?.available_days || 0)
                      : cumBal ? cumBal.totalAllocated - cumBal.totalUsed : Number(alloc?.allocated_days || 0) - used;
                    totalBal += bal;
                    const blocked = !alloc && isSickLeaveType(lt) && probation;
                    return { lt, credited, used, bal, blocked, has: !!alloc };
                  });
                  return (
                    <TableRow key={g.employee?.id} className="odd:bg-muted/20">
                      <TableCell className="text-sm font-medium whitespace-nowrap sticky left-0 bg-background">
                        {g.employee?.first_name} {g.employee?.last_name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">{g.employee?.badge_id || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {probation ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-warning/10 text-warning border-warning/20">
                            Probation{probationEndDate(g.employee?.id) ? ` till ${probationEndDate(g.employee?.id)}` : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Confirmed</span>
                        )}
                      </TableCell>
                      {cells.map((c: any) => (
                        <TableCell key={c.lt.id} className="text-right text-sm tabular-nums whitespace-nowrap">
                          {c.blocked ? (
                            <span className="text-warning text-[11px]">Not allocated</span>
                          ) : (
                            <span className="inline-flex flex-col items-end leading-tight">
                              <span className={c.credited ? "text-success font-semibold" : "text-muted-foreground"}>
                                {c.credited ? `+${c.credited}` : "0"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">Bal: {c.bal}</span>
                            </span>
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="text-right text-sm font-semibold tabular-nums">{totalBal}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(groupedArr as any[]).map((g: any) => {
            const empCumulative = cumulativeData.find(c => c.employee?.id === g.employee?.id);
            return (
              <Card key={g.employee?.id}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <div className="w-10 h-10 rounded-full bg-[#E8604C]/10 flex items-center justify-center text-[#E8604C] font-bold text-sm">
                      {g.employee?.first_name?.[0]}{g.employee?.last_name?.[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{g.employee?.first_name} {g.employee?.last_name}</p>
                      <p className="text-xs text-muted-foreground">{g.employee?.badge_id}</p>
                    </div>
                    {isOnProbation(g.employee?.id) && (
                      <span className="px-2 py-1 rounded-full text-[10px] font-medium border bg-warning/10 text-warning border-warning/20">
                        On probation{probationEndDate(g.employee?.id) ? ` till ${probationEndDate(g.employee?.id)}` : ""} · Sick leave not allocated
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {leaveTypes.map((lt: any) => {
                      const a = g.allocations.find((al: any) => al.leave_type_id === lt.id);
                      const cumBal = empCumulative?.balances[lt.id];
                      const credited = creditedMap[g.employee?.id]?.[lt.id] || 0;
                      const cumulativeAvailable = lt.code === "CO"
                        ? Number(a?.available_days || 0)
                        : cumBal ? cumBal.totalAllocated - cumBal.totalUsed : Number(a?.allocated_days || 0) - Number(a?.used_days || 0);
                      const percent = cumBal && cumBal.totalAllocated > 0 ? (cumBal.totalUsed / cumBal.totalAllocated) * 100 : 0;
                      const probationBlocked = !a && isSickLeaveType(lt) && isOnProbation(g.employee?.id);
                      return (
                        <div key={lt.id} className={`rounded-lg p-3 border ${a || credited ? "bg-muted/50 border-border" : "bg-muted/20 border-dashed border-border"}`}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${a || credited ? "" : "opacity-50"}`} style={{ backgroundColor: lt.color || "#E8604C" }} />
                            <p className={`text-xs font-medium truncate ${a || credited ? "text-foreground" : "text-muted-foreground"}`}>{lt.name}</p>
                          </div>
                          <div className="w-full h-1.5 bg-muted rounded-full mb-2">
                            <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: lt.color || "#E8604C" }} />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span className={credited ? "text-success font-semibold" : ""}>{getMonthShort(month)}: {credited ? `+${credited}d` : "0d"}</span>
                            <span className="font-medium text-foreground tabular-nums">Bal: {cumulativeAvailable}</span>
                          </div>
                          <p className={`text-[10px] mt-0.5 tabular-nums ${probationBlocked ? "text-warning" : "text-muted-foreground"}`}>
                            {probationBlocked
                              ? "Not allocated — on probation"
                              : lt.code === "CO"
                                ? "Settled monthly — offsets LOP, remainder encashed"
                                : `Used: ${cumBal?.totalUsed || a?.used_days || 0} (all time)`}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#E8604C]" /> Allocate Leave — {getMonthLabel(month)} {year}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <EmployeePicker employees={employees} value={form.employee_id} onChange={(v) => setForm({ ...form, employee_id: v })} />
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={form.leave_type_id} onValueChange={(v) => {
                const lt = leaveTypes.find((t: any) => t.id === v);
                  setForm({ ...form, leave_type_id: v, allocated_days: lt?.max_days_per_year ?? 12 });
              }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{allocatableLeaveTypes.map((lt: any) => {
                  const blocked = selectedIsProbationer && isSickLeaveType(lt);
                  return <SelectItem key={lt.id} value={lt.id} disabled={blocked}>{lt.name}{blocked ? " — blocked (on probation)" : ""}</SelectItem>;
                })}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Days to Allocate (this month)</Label>
              <Input type="number" value={form.allocated_days} onChange={(e) => setForm({ ...form, allocated_days: parseFloat(e.target.value) || 0 })} className="h-9" />
            </div>
            {selectedIsProbationer && (
              <p className="text-xs text-warning">This employee is on probation{probationEndDate(form.employee_id) ? ` until ${probationEndDate(form.employee_id)}` : ""}. Sick / Medical leave cannot be allocated as per company policy.</p>
            )}
            <p className="text-xs text-muted-foreground">Month: {getMonthLabel(month)} {year} • Compensatory Off is generated automatically and cannot be allocated here.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} className="h-9">Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!form.employee_id || !form.leave_type_id || blockedByProbation} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">Allocate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-[#E8604C]" /> Bulk Leave Allocation — {getMonthLabel(month)} {year}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will allocate default leave days (from leave type settings) to <strong>all {employees.length} active employees</strong> for <strong>{getMonthLabel(month)} {year}</strong>.
            </p>
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              {allocatableLeaveTypes.map((lt: any) => (
                <div key={lt.id} className="flex justify-between">
                  <span className="text-muted-foreground">{lt.name}</span>
                  <span className="font-medium tabular-nums">{lt.max_days_per_year} days (one-time)</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-warning">Note: Sick / Medical leave is automatically skipped for employees currently on probation.</p>
            <p className="text-xs text-muted-foreground">Compensatory Off is excluded because it is generated only by verified weekly-off or holiday attendance and settles monthly.</p>
            {allocatableLeaveTypes.length === 0 && <p className="text-xs text-warning">Create an allocatable leave type first.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulk(false)} className="h-9">Cancel</Button>
            <Button onClick={() => bulkAllocateMutation.mutate()} disabled={allocatableLeaveTypes.length === 0 || employees.length === 0 || bulkAllocateMutation.isPending} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">
              {bulkAllocateMutation.isPending ? "Allocating..." : `Allocate for ${employees.length} Employees`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
