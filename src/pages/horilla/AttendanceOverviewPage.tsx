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
import { format } from "date-fns";
import { Plus, Search, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export default function AttendanceOverviewPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    employee_id: "",
    attendance_date: format(new Date(), "yyyy-MM-dd"),
    check_in: "",
    check_out: "",
    attendance_status: "present",
    work_type: "office",
    notes: "",
  });

  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ["hr_attendance", dateFilter, statusFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("hr_attendance")
        .select("*, hr_employees!hr_attendance_employee_id_fkey(id, badge_id, first_name, last_name)")
        .eq("attendance_date", dateFilter)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") query = query.eq("attendance_status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true);
      return data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_attendance").insert({
        employee_id: form.employee_id,
        attendance_date: form.attendance_date,
        check_in: form.check_in || null,
        check_out: form.check_out || null,
        attendance_status: form.attendance_status,
        work_type: form.work_type,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_attendance"] });
      setShowAdd(false);
      toast.success("Attendance recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = attendance.filter((a: any) => {
    const emp = a.hr_employees;
    if (!emp) return false;
    const q = search.toLowerCase();
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
    return fullName.includes(q) || emp.badge_id?.toLowerCase().includes(q);
  });

  const stats = {
    present: attendance.filter((a: any) => a.attendance_status === "present").length,
    absent: attendance.filter((a: any) => a.attendance_status === "absent").length,
    late: attendance.filter((a: any) => a.attendance_status === "late").length,
    total: attendance.length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Overview</h1>
          <p className="text-sm text-gray-500">Track and manage daily attendance</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> Mark Attendance
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Present", value: stats.present, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
          { label: "Absent", value: stats.absent, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
          { label: "Late", value: stats.late, icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50" },
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="present">Present</SelectItem>
            <SelectItem value="absent">Absent</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="half_day">Half Day</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Employee", "Badge ID", "Check In", "Check Out", "Status", "Late (min)", "Early Leave", "Work Type", "Notes"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">No attendance records for this date</td></tr>
              ) : (
                filtered.map((a: any) => (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{a.hr_employees?.first_name} {a.hr_employees?.last_name}</td>
                    <td className="px-4 py-3 text-gray-500">{a.hr_employees?.badge_id}</td>
                    <td className="px-4 py-3">{a.check_in || "—"}</td>
                    <td className="px-4 py-3">{a.check_out || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.attendance_status === "present" ? "bg-green-100 text-green-700" :
                        a.attendance_status === "absent" ? "bg-red-100 text-red-700" :
                        a.attendance_status === "late" ? "bg-yellow-100 text-yellow-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>{a.attendance_status}</span>
                    </td>
                    <td className="px-4 py-3">{a.late_minutes ? <span className="text-yellow-600 font-medium">{a.late_minutes}m</span> : "—"}</td>
                    <td className="px-4 py-3">{a.early_leave_minutes ? <span className="text-orange-600 font-medium">{a.early_leave_minutes}m</span> : "—"}</td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{a.work_type || "—"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[150px] truncate">{a.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark Attendance</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date</Label><Input type="date" value={form.attendance_date} onChange={(e) => setForm({ ...form, attendance_date: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.attendance_status} onValueChange={(v) => setForm({ ...form, attendance_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="half_day">Half Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Check In</Label><Input type="time" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} /></div>
              <div><Label>Check Out</Label><Input type="time" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} /></div>
            </div>
            <div>
              <Label>Work Type</Label>
              <Select value={form.work_type} onValueChange={(v) => setForm({ ...form, work_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="field">Field</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!form.employee_id} className="bg-[#E8604C] hover:bg-[#d4553f]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
