import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const PIE_COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6"];

export default function AttendanceSummaryPage() {
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const startDate = `${month}-01`;
  const endDate = `${month}-31`;

  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ["hr_attendance_summary", month],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_attendance")
        .select("*, hr_employees!hr_attendance_employee_id_fkey(id, badge_id, first_name, last_name)")
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate);
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

  // Per-employee summary
  const empSummary = useMemo(() => {
    const map: Record<string, any> = {};
    attendance.forEach((a: any) => {
      const empId = a.employee_id;
      if (!map[empId]) {
        map[empId] = {
          employee: a.hr_employees,
          present: 0, absent: 0, late: 0, half_day: 0,
          total_ot: 0, total_late_min: 0, total_early_min: 0, total: 0,
        };
      }
      map[empId].total++;
      if (a.attendance_status === "present") map[empId].present++;
      if (a.attendance_status === "absent") map[empId].absent++;
      if (a.attendance_status === "late") map[empId].late++;
      if (a.attendance_status === "half_day") map[empId].half_day++;
      map[empId].total_ot += Number(a.overtime_hours || 0);
      map[empId].total_late_min += Number(a.late_minutes || 0);
      map[empId].total_early_min += Number(a.early_leave_minutes || 0);
    });
    return Object.values(map);
  }, [attendance]);

  const filtered = empSummary.filter((s: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${s.employee?.first_name || ""} ${s.employee?.last_name || ""}`.toLowerCase();
    return name.includes(q) || s.employee?.badge_id?.toLowerCase().includes(q);
  });

  // Overall stats — "late" counts as present (they showed up, just late)
  const overallPresent = attendance.filter((a: any) => a.attendance_status === "present" || a.attendance_status === "late").length;
  const overallAbsent = attendance.filter((a: any) => a.attendance_status === "absent").length;
  const overallLate = attendance.filter((a: any) => a.attendance_status === "late").length;
  const overallHalfDay = attendance.filter((a: any) => a.attendance_status === "half_day").length;
  const attendanceRate = attendance.length > 0 ? (((overallPresent + overallHalfDay * 0.5) / attendance.length) * 100).toFixed(1) : "0";

  const pieData = [
    { name: "Present", value: overallPresent },
    { name: "Absent", value: overallAbsent },
    { name: "Late", value: overallLate },
    { name: "Half Day", value: overallHalfDay },
  ].filter(d => d.value > 0);

  // Top late employees
  const topLate = [...empSummary].sort((a: any, b: any) => b.total_late_min - a.total_late_min).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Summary</h1>
        <p className="text-sm text-gray-500">Monthly attendance analytics per employee</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total Records", value: attendance.length, icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Present", value: overallPresent, icon: Users, color: "text-green-600", bg: "bg-green-50" },
          { label: "Absent", value: overallAbsent, icon: Users, color: "text-red-600", bg: "bg-red-50" },
          { label: "Late", value: overallLate, icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50" },
          { label: "Attendance Rate", value: `${attendanceRate}%`, icon: TrendingUp, color: "text-violet-600", bg: "bg-violet-50" },
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
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Status Distribution</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-gray-400 py-8">No data</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Top Late Employees (by minutes)</CardTitle></CardHeader>
          <CardContent>
            {topLate.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topLate.map((e: any) => ({ name: `${e.employee?.first_name?.[0]}. ${e.employee?.last_name}`, mins: e.total_late_min }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="mins" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Late Minutes" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-gray-400 py-8">No data</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Employee", "Badge", "Present", "Absent", "Late", "Half Day", "OT Hours", "Late (min)", "Early Leave (min)", "Rate"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">No records</td></tr>
              ) : (
                (filtered as any[]).map((s: any) => {
                  // Rate: present + late = showed up
                  const showedUp = s.present + s.late + s.half_day * 0.5;
                  const rate = s.total > 0 ? ((showedUp / s.total) * 100).toFixed(0) : "0";
                  return (
                    <tr key={s.employee?.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{s.employee?.first_name} {s.employee?.last_name}</td>
                      <td className="px-4 py-3 text-gray-500">{s.employee?.badge_id}</td>
                      <td className="px-4 py-3 text-green-600 font-medium">{s.present}</td>
                      <td className="px-4 py-3 text-red-600 font-medium">{s.absent}</td>
                      <td className="px-4 py-3 text-yellow-600 font-medium">{s.late}</td>
                      <td className="px-4 py-3 text-blue-600">{s.half_day}</td>
                      <td className="px-4 py-3">{s.total_ot > 0 ? `${s.total_ot.toFixed(1)}h` : "—"}</td>
                      <td className="px-4 py-3">{s.total_late_min > 0 ? `${s.total_late_min}m` : "—"}</td>
                      <td className="px-4 py-3">{s.total_early_min > 0 ? `${s.total_early_min}m` : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          Number(rate) >= 80 ? "bg-green-100 text-green-700" :
                          Number(rate) >= 50 ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }`}>{rate}%</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
