import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { Clock, LogIn, LogOut, Search, Plus, Timer, ChevronDown, ChevronRight } from "lucide-react";

interface ConsolidatedRecord {
  employeeId: string;
  employeeName: string;
  badgeId: string;
  firstClockIn: string;
  lastClockOut: string | null;
  isActive: boolean;
  durationMinutes: number;
  rawActivities: any[];
  latestActivityId: string; // for clock-out action
  isNightShift: boolean;
}

export default function AttendanceActivityPage() {
  const qc = useQueryClient();
  const [dateFilter, setDateFilter] = useState(format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [showClockIn, setShowClockIn] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState("");
  const [clockNote, setClockNote] = useState("");
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  // Fetch shift info for employees to determine night shift
  const { data: employeeShifts = {} } = useQuery({
    queryKey: ["hr_employee_shifts"],
    queryFn: async () => {
      const { data: emps } = await (supabase as any)
        .from("hr_employees")
        .select("id, shift_id")
        .eq("is_active", true);
      if (!emps?.length) return {};

      const shiftIds = [...new Set(emps.filter((e: any) => e.shift_id).map((e: any) => e.shift_id))];
      if (!shiftIds.length) return {};

      const { data: shifts } = await (supabase as any)
        .from("hr_shifts")
        .select("id, is_night_shift, name")
        .in("id", shiftIds);

      const shiftMap = new Map((shifts || []).map((s: any) => [s.id, s]));
      const result: Record<string, { isNightShift: boolean; shiftName: string }> = {};
      for (const emp of emps) {
        if (emp.shift_id && shiftMap.has(emp.shift_id)) {
          const shift = shiftMap.get(emp.shift_id);
          result[emp.id] = { isNightShift: !!shift.is_night_shift, shiftName: shift.name };
        }
      }
      return result;
    },
  });

  const { data: activities = [], isLoading, error: queryError } = useQuery({
    queryKey: ["hr_attendance_activity", dateFilter],
    queryFn: async () => {
      const selectClause = "*, hr_employees!hr_attendance_activity_employee_id_fkey(id, badge_id, first_name, last_name)";
      const nextDate = format(
        new Date(new Date(`${dateFilter}T00:00:00`).getTime() + 24 * 60 * 60 * 1000),
        "yyyy-MM-dd"
      );

      const [{ data: byActivityDate, error: byActivityDateError }, { data: byClockInDate, error: byClockInDateError }] = await Promise.all([
        (supabase as any)
          .from("hr_attendance_activity")
          .select(selectClause)
          .eq("activity_date", dateFilter),
        (supabase as any)
          .from("hr_attendance_activity")
          .select(selectClause)
          .gte("clock_in", `${dateFilter}T00:00:00`)
          .lt("clock_in", `${nextDate}T00:00:00`),
      ]);

      if (byActivityDateError) throw byActivityDateError;
      if (byClockInDateError) throw byClockInDateError;

      const merged = [...((byActivityDate as any[]) || []), ...((byClockInDate as any[]) || [])];
      const uniqueActivities = Array.from(new Map(merged.map((row: any) => [row.id, row])).values());
      uniqueActivities.sort(
        (a: any, b: any) => new Date(a.clock_in || 0).getTime() - new Date(b.clock_in || 0).getTime()
      );

      return uniqueActivities;
    },
    refetchInterval: 600000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true).order("first_name");
      return data || [];
    },
  });

  // Consolidate activities by employee: first clock-in + last clock-out per day
  const consolidated = useMemo<ConsolidatedRecord[]>(() => {
    const grouped = new Map<string, any[]>();
    for (const a of activities) {
      const empId = a.employee_id;
      if (!grouped.has(empId)) grouped.set(empId, []);
      grouped.get(empId)!.push(a);
    }

    const results: ConsolidatedRecord[] = [];
    for (const [empId, records] of grouped) {
      // Sort by clock_in ascending
      records.sort((a: any, b: any) => new Date(a.clock_in || 0).getTime() - new Date(b.clock_in || 0).getTime());

      const firstRecord = records[0];
      const lastRecord = records[records.length - 1];
      const empName = `${firstRecord.hr_employees?.first_name || ""} ${firstRecord.hr_employees?.last_name || ""}`.trim();
      const badgeId = firstRecord.hr_employees?.badge_id || "";
      const isNightShift = !!(employeeShifts as any)[empId]?.isNightShift;

      const firstClockIn = firstRecord.clock_in;

      // Last clock-out: find the latest clock_out across ALL records for this employee
      // For morning shift: last clock-out of the day
      // For night shift: would need next day's data (handled separately)
      // Intermediate clock-outs are ignored — only the LAST one matters
      let lastClockOut: string | null = null;
      for (let i = records.length - 1; i >= 0; i--) {
        if (records[i].clock_out) {
          lastClockOut = records[i].clock_out;
          break;
        }
      }

      // If the last record has no clock_out, employee is still active
      const isActive = !lastRecord.clock_out;

      // Duration: from first clock-in to last clock-out (or now if active)
      let durationMinutes = 0;
      if (firstClockIn && lastClockOut) {
        durationMinutes = differenceInMinutes(parseISO(lastClockOut), parseISO(firstClockIn));
      }

      results.push({
        employeeId: empId,
        employeeName: empName,
        badgeId,
        firstClockIn,
        lastClockOut,
        isActive,
        durationMinutes,
        rawActivities: records,
        latestActivityId: lastRecord.id,
        isNightShift,
      });
    }

    // Sort by first clock-in descending (latest first)
    results.sort((a, b) => new Date(b.firstClockIn || 0).getTime() - new Date(a.firstClockIn || 0).getTime());
    return results;
  }, [activities, employeeShifts]);

  const clockInMutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const clockInTime = new Date(now);

      const { error } = await (supabase as any).from("hr_attendance_activity").insert({
        employee_id: selectedEmp,
        activity_date: dateFilter,
        clock_in: now,
        clock_in_note: clockNote || null,
      });
      if (error) throw error;

      let attendanceStatus = "present";
      let lateMinutes = 0;
      let shiftId: string | null = null;

      const { data: empData } = await (supabase as any)
        .from("hr_employees")
        .select("shift_id")
        .eq("id", selectedEmp)
        .maybeSingle();

      if (empData?.shift_id) {
        shiftId = empData.shift_id;
        const { data: shift } = await (supabase as any)
          .from("hr_shifts")
          .select("start_time, grace_period_minutes")
          .eq("id", empData.shift_id)
          .maybeSingle();

        if (shift?.start_time) {
          const [sh, sm] = shift.start_time.split(":").map(Number);
          const grace = Number(shift.grace_period_minutes) || 0;
          const shiftStart = new Date(dateFilter + "T00:00:00");
          shiftStart.setHours(sh, sm + grace, 0, 0);
          if (clockInTime > shiftStart) {
            const diffMs = clockInTime.getTime() - shiftStart.getTime();
            lateMinutes = Math.ceil(diffMs / 60000);
            attendanceStatus = "late";
          }
        }
      }

      await (supabase as any).from("hr_attendance").upsert({
        employee_id: selectedEmp,
        attendance_date: dateFilter,
        check_in: now,
        attendance_status: attendanceStatus,
        late_minutes: lateMinutes,
        shift_id: shiftId,
        work_type: "office",
      }, { onConflict: "employee_id,attendance_date" });

      const attDate = new Date(dateFilter + "T00:00:00");
      const isSunday = attDate.getDay() === 0;
      const { data: holidayMatch } = await (supabase as any)
        .from("hr_holidays")
        .select("id")
        .eq("date", dateFilter)
        .eq("is_active", true)
        .maybeSingle();

      if (isSunday || holidayMatch) {
        await (supabase as any).from("hr_compoff_credits").upsert({
          employee_id: selectedEmp,
          credit_date: dateFilter,
          credit_type: isSunday ? "sunday" : "holiday",
          credit_days: 1,
        }, { onConflict: "employee_id,credit_date" });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_attendance_activity"] });
      qc.invalidateQueries({ queryKey: ["hr_attendance"] });
      setShowClockIn(false);
      setSelectedEmp("");
      setClockNote("");
      toast.success("Clocked in successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const clockOutMutation = useMutation({
    mutationFn: async ({ id, employeeId }: { id: string; employeeId: string }) => {
      const now = new Date().toISOString();
      const { error } = await (supabase as any).from("hr_attendance_activity").update({
        clock_out: now,
      }).eq("id", id);
      if (error) throw error;

      // Sync the LAST clock-out to hr_attendance
      await (supabase as any).from("hr_attendance").update({
        check_out: now,
      }).eq("employee_id", employeeId).eq("attendance_date", dateFilter);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_attendance_activity"] });
      qc.invalidateQueries({ queryKey: ["hr_attendance"] });
      toast.success("Clocked out successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = consolidated.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.employeeName.toLowerCase().includes(q) || c.badgeId.toLowerCase().includes(q);
  });

  const currentlyIn = consolidated.filter(c => c.isActive).length;
  const clockedOut = consolidated.filter(c => !c.isActive).length;
  const totalHours = consolidated.reduce((sum, c) => sum + c.durationMinutes / 60, 0);

  const formatTime = (iso: string | null) => {
    if (!iso) return "—";
    return format(parseISO(iso), "hh:mm a");
  };

  const formatDuration = (mins: number) => {
    if (mins <= 0) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clock In / Out Activity</h1>
          <p className="text-sm text-gray-500">Real-time attendance activity tracking</p>
        </div>
        <Button onClick={() => setShowClockIn(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> Clock In
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Employees Today", value: consolidated.length, icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Currently In", value: currentlyIn, icon: LogIn, color: "text-green-600", bg: "bg-green-50" },
          { label: "Clocked Out", value: clockedOut, icon: LogOut, color: "text-gray-600", bg: "bg-gray-50" },
          { label: "Total Hours", value: `${totalHours.toFixed(1)}h`, icon: Timer, color: "text-orange-600", bg: "bg-orange-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-44" />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["", "Employee", "Badge", "First Clock In", "Last Clock Out", "Effective Duration", "Punches", "Note", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : queryError ? (
                <tr><td colSpan={9} className="text-center py-8 text-red-500">Error loading data. Please refresh the page.</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">No activity records for this date</td></tr>
              ) : (
                filtered.map((c) => {
                  const isExpanded = expandedEmployee === c.employeeId;
                  const firstNote = c.rawActivities[0]?.clock_in_note;
                  return (
                    <>
                      <tr key={c.employeeId} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedEmployee(isExpanded ? null : c.employeeId)}>
                        <td className="px-2 py-3 w-8">
                          {c.rawActivities.length > 1 ? (
                            isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />
                          ) : <span className="w-4" />}
                        </td>
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{c.employeeName}</td>
                        <td className="px-4 py-3 text-gray-500">{c.badgeId}</td>
                        <td className="px-4 py-3">
                          <span className="text-green-600 font-medium">{formatTime(c.firstClockIn)}</span>
                        </td>
                        <td className="px-4 py-3">
                          {c.isActive ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 animate-pulse">Active</span>
                          ) : (
                            <span className="text-red-600 font-medium">{formatTime(c.lastClockOut)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold">{c.isActive ? "—" : formatDuration(c.durationMinutes)}</td>
                        <td className="px-4 py-3">
                          {c.rawActivities.length > 1 ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                              {c.rawActivities.length} punches
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">1</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs max-w-[120px] truncate">{firstNote || "Via eSSL Push"}</td>
                        <td className="px-4 py-3">
                          {c.isActive && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:bg-red-50 h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                clockOutMutation.mutate({ id: c.latestActivityId, employeeId: c.employeeId });
                              }}
                            >
                              <LogOut className="h-3 w-3 mr-1" /> Clock Out
                            </Button>
                          )}
                        </td>
                      </tr>
                      {/* Expanded: show all raw punch records */}
                      {isExpanded && c.rawActivities.length > 1 && c.rawActivities.map((a: any, idx: number) => (
                        <tr key={a.id} className="bg-muted/30 border-b border-dashed">
                          <td className="px-2 py-2"></td>
                          <td className="px-4 py-2 text-xs text-muted-foreground pl-8">
                            Punch {idx + 1}
                            {idx === 0 && <span className="ml-1 text-green-600">(First In)</span>}
                            {idx === c.rawActivities.length - 1 && a.clock_out && <span className="ml-1 text-red-600">(Last Out)</span>}
                          </td>
                          <td className="px-4 py-2"></td>
                          <td className="px-4 py-2 text-xs text-green-600">{formatTime(a.clock_in)}</td>
                          <td className="px-4 py-2 text-xs">
                            {a.clock_out ? (
                              <span className="text-red-600">{formatTime(a.clock_out)}</span>
                            ) : (
                              <span className="text-green-600 text-xs">Active</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {a.clock_in && a.clock_out
                              ? formatDuration(differenceInMinutes(parseISO(a.clock_out), parseISO(a.clock_in)))
                              : "—"}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {idx > 0 && idx < c.rawActivities.length - 1 && (
                              <span className="text-yellow-600">Intermediate</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-400">{a.clock_in_note || "—"}</td>
                          <td className="px-4 py-2"></td>
                        </tr>
                      ))}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showClockIn} onOpenChange={setShowClockIn}>
        <DialogContent>
          <DialogHeader><DialogTitle>Clock In Employee</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={selectedEmp} onValueChange={setSelectedEmp}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Textarea value={clockNote} onChange={(e) => setClockNote(e.target.value)} placeholder="Clock in note..." />
            </div>
            <p className="text-xs text-gray-400">Time: {format(new Date(), "hh:mm a")} • Date: {dateFilter}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClockIn(false)}>Cancel</Button>
            <Button onClick={() => clockInMutation.mutate()} disabled={!selectedEmp || clockInMutation.isPending} className="bg-[#E8604C] hover:bg-[#d4553f]">
              <LogIn className="h-4 w-4 mr-2" /> Clock In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
