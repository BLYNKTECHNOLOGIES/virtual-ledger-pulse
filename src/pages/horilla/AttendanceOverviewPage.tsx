import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Search, Clock, CheckCircle, XCircle, AlertTriangle, Upload } from "lucide-react";
import BiometricReportUploader from "@/components/hrms/BiometricReportUploader";
import { BiometricQuarantineBanner } from "@/components/hrms/BiometricQuarantineBanner";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { ResponsiveList } from "@/components/horilla/primitives/ResponsiveList";

export default function AttendanceOverviewPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showUploader, setShowUploader] = useState(false);
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

  const { data: attendance = [], isLoading, error: queryError } = useQuery({
    queryKey: ["hr_attendance", dateFilter, statusFilter],
    queryFn: async () => {
      const selectClause = "*, hr_employees!hr_attendance_employee_id_fkey(id, badge_id, first_name, last_name)";
      const nextDate = format(
        new Date(new Date(`${dateFilter}T00:00:00`).getTime() + 24 * 60 * 60 * 1000),
        "yyyy-MM-dd"
      );

      const [byAttendanceDateRes, byCheckInDateRes] = await Promise.all([
        (supabase as any)
          .from("hr_attendance")
          .select(selectClause)
          .eq("attendance_date", dateFilter)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("hr_attendance")
          .select(selectClause)
          .gte("check_in", `${dateFilter}T00:00:00`)
          .lt("check_in", `${nextDate}T00:00:00`)
          .order("created_at", { ascending: false }),
      ]);

      if (byAttendanceDateRes.error) throw byAttendanceDateRes.error;
      if (byCheckInDateRes.error) throw byCheckInDateRes.error;

      const merged = [
        ...((byAttendanceDateRes.data as any[]) || []),
        ...((byCheckInDateRes.data as any[]) || []),
      ];

      let deduped = Array.from(new Map(merged.map((row: any) => [row.id, row])).values());

      if (statusFilter !== "all") {
        deduped = deduped.filter((row: any) => row.attendance_status === statusFilter);
      }

      deduped.sort(
        (a: any, b: any) =>
          new Date(b.check_in || b.created_at || 0).getTime() -
          new Date(a.check_in || a.created_at || 0).getTime()
      );

      return deduped;
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() => (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true));
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
    <div className="hrms-page space-y-6 p-3 md:p-6 page-mount">
      <PageHeader
        title="Attendance Overview"
        description="Track and manage daily attendance"
        actions={
          <>
            <Button variant="outline" className="h-9" onClick={() => setShowUploader(true)}>
              <Upload className="h-4 w-4 mr-2" /> Upload Report
            </Button>
            <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-2" /> Mark Attendance
            </Button>
          </>
        }
      />
      <BiometricQuarantineBanner />


      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
        {[
          { label: "Total", value: stats.total, icon: Clock, color: "text-info", bg: "bg-info/10" },
          { label: "Present", value: stats.present, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
          { label: "Absent", value: stats.absent, icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
          { label: "Late", value: stats.late, icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
        ].map((s) => (
          <Card key={s.label} className="h-full transition-shadow hover:shadow-md">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-2xl font-semibold tabular-nums">{s.value}</p><p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="hrms-toolbar">
        <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-9 sm:w-44" />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="present">Present</SelectItem>
            <SelectItem value="absent">Absent</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="half_day">Half Day</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} columns={9} />
      ) : queryError ? (
        <Card><CardContent className="py-8 text-center text-destructive text-sm">Error loading data. Please refresh the page.</CardContent></Card>
      ) : (
        <ResponsiveList
          items={filtered}
          columns={["Employee", "Badge ID", "Check In", "Check Out", "Status", "Late (min)", "Early Leave", "Work Type", "Notes"].map((h) => ({ key: h, label: h }))}
          keyFor={(a: any) => a.id}
          emptyState={<Card><CardContent className="p-0"><EmptyState icon={Clock} title="No attendance records for this date" description="Adjust the date filter or mark attendance." /></CardContent></Card>}
          renderRow={(a: any) => (
            <>
              <td className="px-4 py-3 font-medium whitespace-nowrap">{a.hr_employees?.first_name} {a.hr_employees?.last_name}</td>
              <td className="px-4 py-3 text-muted-foreground tabular-nums">{a.hr_employees?.badge_id}</td>
              <td className="px-4 py-3 tabular-nums">{a.check_in ? format(new Date(a.check_in), "hh:mm a") : "—"}</td>
              <td className="px-4 py-3 tabular-nums">{a.check_out ? format(new Date(a.check_out), "hh:mm a") : "—"}</td>
              <td className="px-4 py-3"><AttendanceStatusBadge status={a.attendance_status} /></td>
              <td className="px-4 py-3 tabular-nums">{a.late_minutes ? <span className="text-warning font-medium">{a.late_minutes}m</span> : "—"}</td>
              <td className="px-4 py-3 tabular-nums">{a.early_leave_minutes ? <span className="text-warning font-medium">{a.early_leave_minutes}m</span> : "—"}</td>
              <td className="px-4 py-3 text-muted-foreground capitalize">{a.work_type || "—"}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs max-w-[150px] truncate">{a.notes || "—"}</td>
            </>
          )}
          renderCard={(a: any) => (
            <div className="hrms-mobile-card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{a.hr_employees?.first_name} {a.hr_employees?.last_name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{a.hr_employees?.badge_id}</p>
                </div>
                <AttendanceStatusBadge status={a.attendance_status} />
              </div>
              <div className="hrms-mobile-kv">
                <span>Check In</span><span>{a.check_in ? format(new Date(a.check_in), "hh:mm a") : "—"}</span>
                <span>Check Out</span><span>{a.check_out ? format(new Date(a.check_out), "hh:mm a") : "—"}</span>
                <span>Late</span><span>{a.late_minutes ? `${a.late_minutes}m` : "—"}</span>
                <span>Early Leave</span><span>{a.early_leave_minutes ? `${a.early_leave_minutes}m` : "—"}</span>
                <span>Work Type</span><span className="capitalize">{a.work_type || "—"}</span>
                <span>Notes</span><span>{a.notes || "—"}</span>
              </div>
            </div>
          )}
        />
      )}

      <ResponsiveDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        title={<span className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Mark Attendance</span>}
        footer={
          <>
            <Button variant="outline" className="h-9" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => addMutation.mutate()} disabled={!form.employee_id}>Save</Button>
          </>
        }
      >
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Date</Label><Input type="date" className="h-9" value={form.attendance_date} onChange={(e) => setForm({ ...form, attendance_date: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.attendance_status} onValueChange={(v) => setForm({ ...form, attendance_status: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
              <div><Label>Check In</Label><Input type="time" className="h-9" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} /></div>
              <div><Label>Check Out</Label><Input type="time" className="h-9" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} /></div>
            </div>
            <div>
              <Label>Work Type</Label>
              <Select value={form.work_type} onValueChange={(v) => setForm({ ...form, work_type: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="field">Field</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Input className="h-9" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." /></div>
          </div>
      </ResponsiveDialog>
      <BiometricReportUploader open={showUploader} onOpenChange={setShowUploader} />
    </div>
  );
}

function AttendanceStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
      status === "present" ? "bg-success/10 text-success border-success/20" :
      status === "absent" ? "bg-destructive/10 text-destructive border-destructive/20" :
      status === "late" ? "bg-warning/10 text-warning border-warning/20" :
      "bg-muted text-foreground border-border"
    }`}>{status}</span>
  );
}
