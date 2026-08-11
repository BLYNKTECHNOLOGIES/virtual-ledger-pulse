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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Search, Users, Calendar } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { useComplianceSettings, isWeeklyOff } from "@/hooks/hrms/useComplianceSettings";
import { EmployeePicker } from "@/components/hrms/EmployeePicker";
import { useAttendanceDayRange, type AttendanceDay, type AttendanceDayStatus } from "@/hooks/hrms/useAttendanceDay";
import { DayTileTooltip, DAY_STATUS_DOT, DAY_STATUS_LABEL, DAY_STATUS_TILE } from "@/components/hrms/attendance/DayTileTooltip";
import { AttendanceDayDialog } from "@/components/hrms/attendance/AttendanceDayDialog";

/** Statuses shown in the legend, in reading order. */
const LEGEND_STATUSES: AttendanceDayStatus[] = [
  "present", "half_day", "absent", "on_leave", "holiday", "week_off", "incomplete", "in_progress", "no_punch",
];


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

  const [dayDialog, setDayDialog] = useState<{ emp: any; date: string } | null>(null);



  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() => (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true).order("first_name"));
      return data || [];
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      // check_in/check_out are timestamptz columns — a bare "HH:mm" is invalid,
      // combine with the selected date.
      const toTs = (t: string) => (t && bulkDate ? new Date(`${bulkDate}T${t}:00`).toISOString() : null);
      const rows = selectedEmps.map(empId => ({
        employee_id: empId,
        attendance_date: bulkDate,
        attendance_status: bulkStatus,
        check_in: toTs(bulkCheckIn),
        check_out: toTs(bulkCheckOut),
        work_type: "office",
      }));
      const { error, data } = await (supabase as any)
        .from("hr_attendance")
        .upsert(rows, { onConflict: "employee_id,attendance_date", ignoreDuplicates: false })
        .select("id");
      if (error) throw error;
      return (data as any[])?.length ?? rows.length;
    },
    onSuccess: (count: number) => {
      qc.invalidateQueries({ queryKey: ["hr_attendance_month"] });
      qc.invalidateQueries({ queryKey: ["hr_attendance"] });
      toast.success(`Attendance marked for ${count} employee${count === 1 ? "" : "s"}`);
      setShowBulk(false);
      setSelectedEmps([]);
    },
    onError: (e: any) => {
      console.error("[bulk-mark-attendance]", e);
      toast.error(e?.message || e?.details || "Failed to mark attendance");
    },
  });

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = getDay(monthStart); // 0=Sun
  const { data: complianceSettings } = useComplianceSettings();

  const filteredEmps = employees.filter((e: any) => {
    if (selectedEmp !== "all" && e.id !== selectedEmp) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || e.badge_id?.toLowerCase().includes(q);
  });

  // v4 engine truth for every visible employee this month (single sanctioned reader).
  const visibleIds = useMemo(() => filteredEmps.map((e: any) => e.id), [filteredEmps]);
  const { data: engineDays = [], isLoading: daysLoading } = useAttendanceDayRange(
    visibleIds,
    format(monthStart, "yyyy-MM-dd"),
    format(monthEnd, "yyyy-MM-dd"),
  );

  // Lookup: { emp_id: { "2026-08-11": AttendanceDay } }
  const attendanceMap = useMemo(() => {
    const map: Record<string, Record<string, AttendanceDay>> = {};
    (engineDays as AttendanceDay[]).forEach((d) => {
      if (!map[d.employee_id]) map[d.employee_id] = {};
      map[d.employee_id][d.date] = d;
    });
    return map;
  }, [engineDays]);

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));

  // Monthly stats — engine statuses only.
  const monthStats = useMemo(() => {
    const rows = engineDays as AttendanceDay[];
    const counted = rows.filter((d) => !["week_off", "holiday", "no_data"].includes(d.status));
    const present = rows.filter((d) => d.status === "present").length;
    const half = rows.filter((d) => d.status === "half_day").length;
    const absent = rows.filter((d) => d.status === "absent").length;
    const late = rows.filter((d) => d.is_late).length;
    const base = counted.length;
    return {
      total: base,
      present,
      absent,
      late,
      rate: base > 0 ? (((present + half * 0.5) / base) * 100).toFixed(1) : "0",
    };
  }, [engineDays]);


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
        <EmployeePicker
          employees={employees}
          value={selectedEmp}
          onChange={setSelectedEmp}
          allOption={{ value: "all", label: "All Employees" }}
          className="w-full sm:w-48"
        />
        <div className="relative flex-1 min-w-0 sm:min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div
            key={status}
            className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px]"
          >
            <div className={`w-2 h-2 rounded-full ${color}`} />
            <span className="capitalize text-muted-foreground">{status.replace("_", " ")}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px]">
          <div className="w-2 h-2 rounded-sm bg-muted-foreground/30" />
          <span className="text-muted-foreground">Weekly off</span>
        </div>
      </div>

      {/* Employee Calendar Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filteredEmps.length === 0 ? (
          <Card className="xl:col-span-2">
            <CardContent className="py-0">
              <EmptyState icon={Calendar} title="No employees found" description="Try adjusting your search or filter." />
            </CardContent>
          </Card>
        ) : (
          filteredEmps.map((emp: any) => {
            const empAttendance = attendanceMap[emp.id] || {};
            const values = Object.values(empAttendance) as any[];
            const empPresent = values.filter((a) => a.attendance_status === "present").length;
            const empAbsent = values.filter((a) => a.attendance_status === "absent" && !isWeeklyOff(new Date(`${a.attendance_date}T00:00:00`), complianceSettings)).length;
            const empLate = values.filter((a) => a.attendance_status === "late").length;
            const empTotal = values.length;
            const rate = empTotal > 0 ? Math.round((empPresent / empTotal) * 100) : 0;

            return (
              <Card key={emp.id} className="min-w-0 overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-xs shrink-0 ring-1 ring-primary/20">
                        {emp.first_name?.[0]}{emp.last_name?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{emp.first_name} {emp.last_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{emp.badge_id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="rounded-md bg-success/10 text-success text-[10px] font-semibold px-1.5 py-0.5 tabular-nums">{empPresent} P</span>
                      {empAbsent > 0 && <span className="rounded-md bg-destructive/10 text-destructive text-[10px] font-semibold px-1.5 py-0.5 tabular-nums">{empAbsent} A</span>}
                      {empLate > 0 && <span className="rounded-md bg-warning/15 text-warning text-[10px] font-semibold px-1.5 py-0.5 tabular-nums">{empLate} L</span>}
                      <span className="rounded-md bg-muted text-foreground text-[10px] font-semibold px-1.5 py-0.5 tabular-nums">{rate}%</span>
                    </div>
                  </div>

                  {/* Attendance rate bar */}
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-success transition-all" style={{ width: `${rate}%` }} />
                  </div>

                  {/* Mini Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                      <div key={i} className="text-center text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider py-1">{d}</div>
                    ))}
                    {Array.from({ length: startDay }).map((_, i) => <div key={`pad-${i}`} className="aspect-square" />)}
                    {days.map(day => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const record = empAttendance[dateStr];
                      const weeklyOff = isWeeklyOff(day, complianceSettings);
                      // A weekly-off day can never be "absent" — the off-day wins.
                      const rawStatus = record?.attendance_status;
                      const status = weeklyOff && (!rawStatus || rawStatus === "absent") ? undefined : rawStatus;
                      const today = isToday(day);
                      const tile = status ? STATUS_TILE[status] : "";

                      return (
                        <div
                          key={dateStr}
                          className={`aspect-square flex items-center justify-center rounded-md text-[11px] font-medium relative transition-colors
                            ${status ? tile : weeklyOff ? "bg-muted/60 text-muted-foreground/60" : "bg-muted/20 text-muted-foreground hover:bg-muted/40"}
                            ${today ? "ring-2 ring-primary ring-offset-1 ring-offset-background font-bold" : ""}
                          `}
                          title={
                            status ? `${format(day, "MMM d")} — ${status.replace("_", " ")}${weeklyOff ? " (weekly off)" : ""}` :
                            weeklyOff ? `${format(day, "MMM d")} — Weekly off` :
                            format(day, "MMM d")
                          }
                        >
                          {day.getDate()}
                          {weeklyOff && !status && (
                            <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-muted-foreground/40" />
                          )}
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
