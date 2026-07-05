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
import { Plus, Search, Users, CalendarDays, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";

function getCurrentQuarter() {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

function getQuarterLabel(q: number) {
  return `Q${q} (${["Jan-Mar", "Apr-Jun", "Jul-Sep", "Oct-Dec"][q - 1]})`;
}

export default function LeaveAllocationsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
  const [quarterFilter, setQuarterFilter] = useState(getCurrentQuarter().toString());
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState({ employee_id: "", leave_type_id: "", allocated_days: 12 });

  const year = parseInt(yearFilter);
  const quarter = parseInt(quarterFilter);

  const { data: allAllocations = [], isLoading } = useQuery({
    queryKey: ["hr_leave_allocations_all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_leave_allocations")
        .select("*, hr_employees!hr_leave_allocations_employee_id_fkey(id, badge_id, first_name, last_name), hr_leave_types!hr_leave_allocations_leave_type_id_fkey(id, name, color, max_days_per_year)")
        .order("year", { ascending: true });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const currentQuarterAllocations = allAllocations.filter(
    (a: any) => a.year === year && (a.quarter === quarter || !a.quarter)
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
      const { data } = await (supabase as any).from("hr_leave_types").select("id, name, color, max_days_per_year").eq("is_active", true);
      return data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_leave_allocations").insert({
        employee_id: form.employee_id,
        leave_type_id: form.leave_type_id,
        year,
        quarter,
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
        leaveTypes.map((lt: any) => ({
          employee_id: emp.id,
          leave_type_id: lt.id,
          year,
          quarter,
          allocated_days: lt.max_days_per_year || 12,
          available_days: lt.max_days_per_year || 12,
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
      toast.success(`Leave allocated for all ${employees.length} employees for ${getQuarterLabel(quarter)} ${year}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const computeCumulativeBalances = () => {
    const empMap: Record<string, { employee: any; balances: Record<string, { totalAllocated: number; totalUsed: number; leaveType: any }> }> = {};
    for (const a of allAllocations) {
      const empId = a.employee_id;
      if (!empMap[empId]) empMap[empId] = { employee: a.hr_employees, balances: {} };
      const ltId = a.leave_type_id;
      if (!empMap[empId].balances[ltId]) empMap[empId].balances[ltId] = { totalAllocated: 0, totalUsed: 0, leaveType: a.hr_leave_types };
      empMap[empId].balances[ltId].totalAllocated += Number(a.allocated_days || 0);
      empMap[empId].balances[ltId].totalUsed += Number(a.used_days || 0);
    }
    return Object.values(empMap);
  };

  const grouped = currentQuarterAllocations.reduce((acc: any, a: any) => {
    const empId = a.employee_id;
    if (!acc[empId]) acc[empId] = { employee: a.hr_employees, allocations: [] };
    acc[empId].allocations.push(a);
    return acc;
  }, {} as Record<string, any>);

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

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Leave Allocations"
        description="Quarterly leave allocation — all leaves carry forward infinitely"
        actions={
          <>
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
          { label: "Total Days Allocated (All Time)", value: totalAllocated, icon: CalendarDays, color: "text-success", bg: "bg-success/10" },
          { label: "Total Days Used (All Time)", value: totalUsed, icon: BarChart3, color: "text-warning", bg: "bg-warning/10" },
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
        <Select value={quarterFilter} onValueChange={setQuarterFilter}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4].map(q => <SelectItem key={q} value={q.toString()}>{getQuarterLabel(q)}</SelectItem>)}
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
              title={`No leave allocations for ${getQuarterLabel(quarter)} ${year}`}
              description="Bulk allocate to quickly assign default leave days to all active employees."
              action={
                <button onClick={() => setShowBulk(true)} className="text-sm text-[#E8604C] font-medium hover:underline">
                  Bulk allocate for all employees →
                </button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(groupedArr as any[]).map((g: any) => {
            const empCumulative = cumulativeData.find(c => c.employee?.id === g.employee?.id);
            return (
              <Card key={g.employee?.id}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-[#E8604C]/10 flex items-center justify-center text-[#E8604C] font-bold text-sm">
                      {g.employee?.first_name?.[0]}{g.employee?.last_name?.[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{g.employee?.first_name} {g.employee?.last_name}</p>
                      <p className="text-xs text-muted-foreground">{g.employee?.badge_id}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {g.allocations.map((a: any) => {
                      const cumBal = empCumulative?.balances[a.leave_type_id];
                      const cumulativeAvailable = cumBal ? cumBal.totalAllocated - cumBal.totalUsed : a.allocated_days - a.used_days;
                      const percent = cumBal && cumBal.totalAllocated > 0 ? (cumBal.totalUsed / cumBal.totalAllocated) * 100 : 0;
                      return (
                        <div key={a.id} className="bg-muted/50 rounded-lg p-3 border border-border">
                          <div className="flex items-center gap-1.5 mb-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: a.hr_leave_types?.color || "#E8604C" }} />
                            <p className="text-xs font-medium text-foreground truncate">{a.hr_leave_types?.name}</p>
                          </div>
                          <div className="w-full h-1.5 bg-muted rounded-full mb-2">
                            <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: a.hr_leave_types?.color || "#E8604C" }} />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>This Qtr: {a.allocated_days}d</span>
                            <span className="font-medium text-foreground tabular-nums">Bal: {cumulativeAvailable}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">Used: {cumBal?.totalUsed || a.used_days} (all time)</p>
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
              <CalendarDays className="h-4 w-4 text-[#E8604C]" /> Allocate Leave — {getQuarterLabel(quarter)} {year}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={form.leave_type_id} onValueChange={(v) => {
                const lt = leaveTypes.find((t: any) => t.id === v);
                setForm({ ...form, leave_type_id: v, allocated_days: lt?.max_days_per_year || 12 });
              }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{leaveTypes.map((lt: any) => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Days to Allocate (this quarter)</Label>
              <Input type="number" value={form.allocated_days} onChange={(e) => setForm({ ...form, allocated_days: parseFloat(e.target.value) || 0 })} className="h-9" />
            </div>
            <p className="text-xs text-muted-foreground">Quarter: {getQuarterLabel(quarter)} {year} • All unused days carry forward automatically</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} className="h-9">Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!form.employee_id || !form.leave_type_id} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">Allocate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-[#E8604C]" /> Bulk Leave Allocation — {getQuarterLabel(quarter)} {year}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will allocate default leave days (from leave type settings) to <strong>all {employees.length} active employees</strong> for <strong>{getQuarterLabel(quarter)} {year}</strong>.
            </p>
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              {leaveTypes.map((lt: any) => (
                <div key={lt.id} className="flex justify-between">
                  <span className="text-muted-foreground">{lt.name}</span>
                  <span className="font-medium tabular-nums">{lt.max_days_per_year} days/quarter</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">💡 Unused days from previous quarters automatically carry forward.</p>
            {leaveTypes.length === 0 && <p className="text-xs text-warning">⚠ Create leave types first before bulk allocating.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulk(false)} className="h-9">Cancel</Button>
            <Button onClick={() => bulkAllocateMutation.mutate()} disabled={leaveTypes.length === 0 || employees.length === 0 || bulkAllocateMutation.isPending} className="bg-[#E8604C] hover:bg-[#d4553f] h-9">
              {bulkAllocateMutation.isPending ? "Allocating..." : `Allocate for ${employees.length} Employees`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
