import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, Users, CalendarDays, BarChart3 } from "lucide-react";

export default function LeaveAllocationsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState({ employee_id: "", leave_type_id: "", allocated_days: 12, carry_forward_days: 0 });

  const year = parseInt(yearFilter);

  const { data: allocations = [], isLoading } = useQuery({
    queryKey: ["hr_leave_allocations", year],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_leave_allocations")
        .select("*, hr_employees!hr_leave_allocations_employee_id_fkey(id, badge_id, first_name, last_name), hr_leave_types!hr_leave_allocations_leave_type_id_fkey(id, name, color, max_days_per_year)")
        .eq("year", year)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true).order("first_name");
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
        allocated_days: form.allocated_days,
        carry_forward_days: form.carry_forward_days,
        used_days: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_allocations"] });
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
          allocated_days: lt.max_days_per_year || 12,
          used_days: 0,
          carry_forward_days: 0,
        }))
      );
      const { error } = await (supabase as any)
        .from("hr_leave_allocations")
        .upsert(rows, { onConflict: "employee_id,leave_type_id,year" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_leave_allocations"] });
      setShowBulk(false);
      toast.success(`Leave allocated for all ${employees.length} employees`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Group allocations by employee
  const grouped = allocations.reduce((acc: any, a: any) => {
    const empId = a.employee_id;
    if (!acc[empId]) {
      acc[empId] = { employee: a.hr_employees, allocations: [] };
    }
    acc[empId].allocations.push(a);
    return acc;
  }, {} as Record<string, any>);

  const groupedArr = Object.values(grouped).filter((g: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${g.employee?.first_name || ""} ${g.employee?.last_name || ""}`.toLowerCase();
    return name.includes(q) || g.employee?.badge_id?.toLowerCase().includes(q);
  });

  const totalAllocated = allocations.reduce((s: number, a: any) => s + Number(a.allocated_days || 0), 0);
  const totalUsed = allocations.reduce((s: number, a: any) => s + Number(a.used_days || 0), 0);
  const uniqueEmployees = new Set(allocations.map((a: any) => a.employee_id)).size;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Allocations</h1>
          <p className="text-sm text-gray-500">Assign and manage leave balances per employee</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulk(true)}>
            <Users className="h-4 w-4 mr-2" /> Bulk Allocate
          </Button>
          <Button onClick={() => setShowAdd(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
            <Plus className="h-4 w-4 mr-2" /> Allocate Leave
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Employees Allocated", value: uniqueEmployees, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total Days Allocated", value: totalAllocated, icon: CalendarDays, color: "text-green-600", bg: "bg-green-50" },
          { label: "Total Days Used", value: totalUsed, icon: BarChart3, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "Remaining Balance", value: totalAllocated - totalUsed, icon: CalendarDays, color: "text-violet-600", bg: "bg-violet-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* Employee-wise allocation cards */}
      {isLoading ? (
        <p className="text-center text-gray-400 py-12">Loading...</p>
      ) : groupedArr.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">No leave allocations for {year}</p>
            <button onClick={() => setShowBulk(true)} className="mt-2 text-sm text-[#E8604C] font-medium hover:underline">
              Bulk allocate for all employees →
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(groupedArr as any[]).map((g: any) => (
            <Card key={g.employee?.id}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-[#E8604C]/10 flex items-center justify-center text-[#E8604C] font-bold text-sm">
                    {g.employee?.first_name?.[0]}{g.employee?.last_name?.[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{g.employee?.first_name} {g.employee?.last_name}</p>
                    <p className="text-xs text-gray-500">{g.employee?.badge_id}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {g.allocations.map((a: any) => {
                    const remaining = Number(a.allocated_days) + Number(a.carry_forward_days) - Number(a.used_days);
                    const percent = Number(a.allocated_days) > 0 ? (Number(a.used_days) / Number(a.allocated_days)) * 100 : 0;
                    return (
                      <div key={a.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: a.hr_leave_types?.color || "#E8604C" }} />
                          <p className="text-xs font-medium text-gray-700 truncate">{a.hr_leave_types?.name}</p>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full mb-2">
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: a.hr_leave_types?.color || "#E8604C" }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-500">
                          <span>Used: {a.used_days}</span>
                          <span className="font-medium text-gray-800">Bal: {remaining}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">of {a.allocated_days} days</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Allocate Leave</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={form.leave_type_id} onValueChange={(v) => {
                const lt = leaveTypes.find((t: any) => t.id === v);
                setForm({ ...form, leave_type_id: v, allocated_days: lt?.max_days_per_year || 12 });
              }}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{leaveTypes.map((lt: any) => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Allocated Days</Label><Input type="number" value={form.allocated_days} onChange={(e) => setForm({ ...form, allocated_days: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Carry Forward</Label><Input type="number" value={form.carry_forward_days} onChange={(e) => setForm({ ...form, carry_forward_days: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <p className="text-xs text-gray-400">Year: {year}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!form.employee_id || !form.leave_type_id} className="bg-[#E8604C] hover:bg-[#d4553f]">Allocate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Allocate Dialog */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk Leave Allocation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              This will allocate default leave days (from leave type settings) to <strong>all {employees.length} active employees</strong> for the year <strong>{year}</strong>.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
              {leaveTypes.map((lt: any) => (
                <div key={lt.id} className="flex justify-between">
                  <span className="text-gray-600">{lt.name}</span>
                  <span className="font-medium">{lt.max_days_per_year} days</span>
                </div>
              ))}
            </div>
            {leaveTypes.length === 0 && <p className="text-xs text-amber-600">⚠ Create leave types first before bulk allocating.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulk(false)}>Cancel</Button>
            <Button onClick={() => bulkAllocateMutation.mutate()} disabled={leaveTypes.length === 0 || employees.length === 0 || bulkAllocateMutation.isPending} className="bg-[#E8604C] hover:bg-[#d4553f]">
              {bulkAllocateMutation.isPending ? "Allocating..." : `Allocate for ${employees.length} Employees`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
