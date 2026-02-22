import { useState } from "react";
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
import { Clock, LogIn, LogOut, Search, Plus, Timer } from "lucide-react";

export default function AttendanceActivityPage() {
  const qc = useQueryClient();
  const [dateFilter, setDateFilter] = useState(format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [showClockIn, setShowClockIn] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState("");
  const [clockNote, setClockNote] = useState("");

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["hr_attendance_activity", dateFilter],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_attendance_activity")
        .select("*, hr_employees!hr_attendance_activity_employee_id_fkey(id, badge_id, first_name, last_name)")
        .eq("activity_date", dateFilter)
        .order("clock_in", { ascending: false });
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

  const clockInMutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const clockInTime = new Date(now);

      // Create activity record
      const { error } = await (supabase as any).from("hr_attendance_activity").insert({
        employee_id: selectedEmp,
        activity_date: dateFilter,
        clock_in: now,
        clock_in_note: clockNote || null,
      });
      if (error) throw error;

      // Shift-based late detection: look up employee's shift
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
          // Parse shift start time (HH:MM or HH:MM:SS format)
          const [sh, sm] = shift.start_time.split(":").map(Number);
          const grace = Number(shift.grace_period_minutes) || 0;

          // Build shift start datetime for the attendance date
          const shiftStart = new Date(dateFilter + "T00:00:00");
          shiftStart.setHours(sh, sm + grace, 0, 0);

          if (clockInTime > shiftStart) {
            const diffMs = clockInTime.getTime() - shiftStart.getTime();
            lateMinutes = Math.ceil(diffMs / 60000);
            attendanceStatus = "late";
          }
        }
      }

      // Sync to hr_attendance (upsert for the day)
      await (supabase as any).from("hr_attendance").upsert({
        employee_id: selectedEmp,
        attendance_date: dateFilter,
        check_in: now,
        attendance_status: attendanceStatus,
        late_minutes: lateMinutes,
        shift_id: shiftId,
        work_type: "office",
      }, { onConflict: "employee_id,attendance_date" });
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
      // Update activity
      const { error } = await (supabase as any).from("hr_attendance_activity").update({
        clock_out: now,
      }).eq("id", id);
      if (error) throw error;

      // Sync clock_out to hr_attendance
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

  const filtered = activities.filter((a: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${a.hr_employees?.first_name || ""} ${a.hr_employees?.last_name || ""}`.toLowerCase();
    return name.includes(q) || a.hr_employees?.badge_id?.toLowerCase().includes(q);
  });

  const clockedIn = activities.filter((a: any) => a.clock_in && !a.clock_out).length;
  const clockedOut = activities.filter((a: any) => a.clock_in && a.clock_out).length;
  const totalHours = activities.reduce((sum: number, a: any) => {
    if (a.clock_in && a.clock_out) {
      return sum + differenceInMinutes(parseISO(a.clock_out), parseISO(a.clock_in)) / 60;
    }
    return sum;
  }, 0);

  const formatTime = (iso: string | null) => {
    if (!iso) return "—";
    return format(parseISO(iso), "hh:mm a");
  };

  const getDuration = (clockIn: string, clockOut: string | null) => {
    if (!clockIn || !clockOut) return "—";
    const mins = differenceInMinutes(parseISO(clockOut), parseISO(clockIn));
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
          { label: "Total Activities", value: activities.length, icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Currently In", value: clockedIn, icon: LogIn, color: "text-green-600", bg: "bg-green-50" },
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
                {["Employee", "Badge", "Clock In", "Clock Out", "Duration", "Note", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No activity records for this date</td></tr>
              ) : (
                filtered.map((a: any) => (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{a.hr_employees?.first_name} {a.hr_employees?.last_name}</td>
                    <td className="px-4 py-3 text-gray-500">{a.hr_employees?.badge_id}</td>
                    <td className="px-4 py-3">
                      <span className="text-green-600 font-medium">{formatTime(a.clock_in)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {a.clock_out ? (
                        <span className="text-red-600 font-medium">{formatTime(a.clock_out)}</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 animate-pulse">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{getDuration(a.clock_in, a.clock_out)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[150px] truncate">{a.clock_in_note || "—"}</td>
                    <td className="px-4 py-3">
                      {a.clock_in && !a.clock_out && (
                        <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50 h-7 text-xs" onClick={() => clockOutMutation.mutate({ id: a.id, employeeId: a.employee_id })}>
                          <LogOut className="h-3 w-3 mr-1" /> Clock Out
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
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
