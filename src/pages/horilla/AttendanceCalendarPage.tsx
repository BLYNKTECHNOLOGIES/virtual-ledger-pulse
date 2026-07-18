// ============= Full file contents =============

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Search, Users, Calendar } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";

const STATUS_COLORS: Record<string, string> = {
  present: "bg-success",
  absent: "bg-destructive",
  late: "bg-warning",
  half_day: "bg-info",
  holiday: "bg-primary",
  leave: "bg-primary",
};

const STATUS_BG: Record<string, string> = {
  present: "bg-success/10 border-success/20 text-success",
  absent: "bg-destructive/10 border-destructive/20 text-destructive",
  late: "bg-warning/10 border-warning/20 text-warning",
  half_day: "bg-info/10 border-info/20 text-info",
};

export default function AttendanceCalendarPage() {
  const qc = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEmp, setSelectedEmp] = useState("all");
  const [search, setSearch] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [bulkDate, setBulkDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [bulkStatus, setBulkStatus] = useState("present");
  const [bulkCheckIn, setBulkCheckIn] = useState("09:00");
  const [bulkCheckOut, setBulkCheckOut] = useState("18:00");
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: attendance = [] } = useQuery({
    queryKey: ["hr_attendance_month", format(monthStart, "yyyy-MM-dd"), format(monthEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_attendance")
        .select("*, hr_employees!hr_attendance_employee_id_fkey(id, badge_id, first_name, last_name)")
        .gte("attendance_date", format(monthStart, "yyyy-MM-dd"))
        .lte("attendance_date", format(monthEnd, "yyyy-MM-dd"))
        .order("attendance_date");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() => (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true).order("first_name"));
      return data || [];
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const rows = selectedEmps.map(empId => ({
        employee_id: empId,
        attendance_date: bulkDate,
        attendance_status: bulkStatus,
        check_in: bulkCheckIn || null,
        check_out: bulkCheckOut || null,
        work_type: "office",
      }));
      const { error } = await (supabase as any).from("hr_attendance").upsert(rows, { onConflict: "employee_id,attendance_date", ignoreDuplicates: false });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_attendance_month"] });
      qc.invalidateQueries({ queryKey: ["hr_attendance"] });
      setShowBulk(false);
      setSelectedEmps([]);
      toast.success(`Attendance marked for ${selectedEmps.length} employees`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Build attendance lookup: { "emp_id": { "2026-02-15": status } }
  const attendanceMap = useMemo(() => {
    const map: Record<string, Record<string, any>> = {};
    attendance.forEach((a: any) => {
      if (!map[a.employee_id]) map[a.employee_id] = {};
      map[a.employee_id][a.attendance_date] = a;
    });
    return map;
  }, [attendance]);

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = getDay(monthStart); // 0=Sun

  const filteredEmps = employees.filter((e: any) => {
    if (selectedEmp !== "all" && e.id !== selectedEmp) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || e.badge_id?.toLowerCase().includes(q);
  });

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));

  // Monthly stats
  const monthStats = useMemo(() => {
    const total = attendance.length;
    const present = attendance.filter((a: any) => a.attendance_status === "present").length;
    const absent = attendance.filter((a: any) => a.attendance_status === "absent").length;
    const late = attendance.filter((a: any) => a.attendance_status === "late").length;
    return { total, present, absent, late, rate: total > 0 ? ((present / total) * 100).toFixed(1) : "0" };
  }, [attendance]);

  return (
    <div className="hrms-page space-y-4 page-mount">
      <PageHeader
        title="Attendance Calendar"
        description="Monthly attendance view per employee"
        actions={
          <Button onClick={() => { setShowBulk(true); setSelectedEmps(employees.map((e: any) => e.id)); }} className="h-9 w-full sm:w-auto">
            <Users className="h-4 w-4 mr-2" /> Bulk Mark Attendance
          </Button>
        }
      />

      {/* Month Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Records", value: monthStats.total },
          { label: "Present", value: monthStats.present },
          { label: "Absent", value: monthStats.absent },
          { label: "Late", value: monthStats.late },
          { label: "Present Rate", value: `${monthStats.rate}%` },
        ].map(s => (
          <Card key={s.label}><CardContent className="p-3 text-center"><p className="text-xl font-bold text-foreground tabular-nums">{s.value}</p><p className="text-[10px] text-muted-foreground">{s.label}</p></CardContent></Card>
        ))}
      </div>

      {/* Month Nav + Filters */}
      <div className="hrms-toolbar items-stretch sm:items-center">
        <div className="flex items-center justify-between gap-2 bg-card border rounded-lg px-2 w-full sm:w-auto">
          <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-semibold text-sm min-w-[140px] text-center">{format(currentMonth, "MMMM yyyy")}</span>
          <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Select value={selectedEmp} onValueChange={setSelectedEmp}>
          <SelectTrigger className="w-full sm:w-48 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-0 sm:min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
            <span className="capitalize text-muted-foreground">{status.replace("_", " ")}</span>
          </div>
        ))}
      </div>

      {/* Employee Calendar Cards */}
      <div className="space-y-4">
        {filteredEmps.length === 0 ? (
          <Card>
            <CardContent className="py-0">
              <EmptyState icon={Calendar} title="No employees found" description="Try adjusting your search or filter." />
            </CardContent>
          </Card>
        ) : (
          filteredEmps.map((emp: any) => {
            const empAttendance = attendanceMap[emp.id] || {};
            const empPresent = Object.values(empAttendance).filter((a: any) => a.attendance_status === "present").length;
            const empTotal = Object.values(empAttendance).length;

            return (
            <Card key={emp.id} className="min-w-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                        {emp.first_name?.[0]}{emp.last_name?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{emp.first_name} {emp.last_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{emp.badge_id}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground tabular-nums">{empPresent}/{empTotal}</p>
                      <p className="text-[10px] text-muted-foreground">Present days</p>
                    </div>
                  </div>

                  {/* Mini Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                      <div key={i} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
                    ))}
                    {Array.from({ length: startDay }).map((_, i) => <div key={`pad-${i}`} />)}
                    {days.map(day => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const record = empAttendance[dateStr];
                      const status = record?.attendance_status;
                      const dotColor = status ? STATUS_COLORS[status] || "bg-muted/20" : "";
                      const today = isToday(day);

                      return (
                        <div
                          key={dateStr}
                          className={`text-center py-1 rounded text-[11px] relative ${today ? "ring-1 ring-primary font-bold" : ""} ${
                            status ? "font-medium" : "text-muted-foreground"
                          }`}
                          title={status ? `${format(day, "MMM d")} — ${status}` : format(day, "MMM d")}
                        >
                          {day.getDate()}
                          {status && <div className={`w-1.5 h-1.5 rounded-full ${dotColor} mx-auto mt-0.5`} />}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Bulk Attendance Dialog */}
      <ResponsiveDialog
        open={showBulk}
        onOpenChange={setShowBulk}
        title={<span className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> Bulk Mark Attendance</span>}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowBulk(false)} className="h-9">Cancel</Button>
            <Button
              onClick={() => bulkMutation.mutate()}
              disabled={selectedEmps.length === 0 || !bulkDate || bulkMutation.isPending}
              className="h-9"
            >
              {bulkMutation.isPending ? "Marking..." : `Mark ${selectedEmps.length} Employees`}
            </Button>
          </>
        }
      >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Date</Label><Input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} className="h-9 mt-1" /></div>
              <div>
                <Label>Status</Label>
                <Select value={bulkStatus} onValueChange={setBulkStatus}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="half_day">Half Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Check In</Label><Input type="time" value={bulkCheckIn} onChange={e => setBulkCheckIn(e.target.value)} className="h-9 mt-1" /></div>
              <div><Label>Check Out</Label><Input type="time" value={bulkCheckOut} onChange={e => setBulkCheckOut(e.target.value)} className="h-9 mt-1" /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Select Employees ({selectedEmps.length}/{employees.length})</Label>
                <button
                  onClick={() => setSelectedEmps(selectedEmps.length === employees.length ? [] : employees.map((e: any) => e.id))}
                    className="text-xs text-primary font-medium"
                >
                  {selectedEmps.length === employees.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="border rounded-lg max-h-[200px] overflow-y-auto divide-y">
                {employees.map((e: any) => (
                  <label key={e.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer min-w-0">
                    <Checkbox
                      checked={selectedEmps.includes(e.id)}
                      onCheckedChange={(checked) => {
                        setSelectedEmps(checked ? [...selectedEmps, e.id] : selectedEmps.filter(id => id !== e.id));
                      }}
                    />
                    <span className="text-sm min-w-0 break-words">{e.first_name} {e.last_name}</span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">{e.badge_id}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
      </ResponsiveDialog>
    </div>
  );
}
