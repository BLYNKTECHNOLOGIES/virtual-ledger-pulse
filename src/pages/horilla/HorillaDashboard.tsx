import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, UserPlus, CheckCircle, CalendarDays, Briefcase,
  Rocket, Building2, TrendingUp, Clock, Wallet, XCircle,
  AlertTriangle
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format } from "date-fns";

const COLORS = ["#E8604C", "#6C63FF", "#10B981", "#F59E0B", "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6"];

export default function HorillaDashboard() {
  const { data: employees } = useQuery({
    queryKey: ["hr_dashboard_employees"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employees").select("id, is_active, created_at");
      return data || [];
    },
  });

  const { data: candidates } = useQuery({
    queryKey: ["hr_dashboard_candidates"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_candidates").select("id, hired, canceled, start_onboard");
      return data || [];
    },
  });

  const { data: recruitments } = useQuery({
    queryKey: ["hr_dashboard_recruitments"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_recruitments").select("id, closed, vacancy");
      return data || [];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["hr_dashboard_departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name, is_active");
      return data || [];
    },
  });

  const { data: workInfos } = useQuery({
    queryKey: ["hr_dashboard_work_infos"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employee_work_info").select("department_id, employee_type");
      return data || [];
    },
  });

  const today = format(new Date(), "yyyy-MM-dd");

  const { data: todayAttendance } = useQuery({
    queryKey: ["hr_dashboard_attendance", today],
    queryFn: async () => {
      const { data } = await supabase.from("hr_attendance").select("id, attendance_status").eq("attendance_date", today);
      return data || [];
    },
  });

  const { data: leaveRequests } = useQuery({
    queryKey: ["hr_dashboard_leave"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_leave_requests").select("id, status").order("created_at", { ascending: false }).limit(200);
      return data || [];
    },
  });

  const { data: payrollRuns } = useQuery({
    queryKey: ["hr_dashboard_payroll"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_payroll_runs").select("id, status, total_net, total_gross, employee_count, title").order("run_date", { ascending: false }).limit(10);
      return data || [];
    },
  });

  // Employee stats
  const totalEmployees = (employees || []).length;
  const activeEmployees = (employees || []).filter(e => e.is_active).length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const newThisMonth = (employees || []).filter(e => e.created_at?.startsWith(thisMonth)).length;

  // Candidate stats
  const totalCandidates = (candidates || []).length;
  const hiredCandidates = (candidates || []).filter(c => c.hired).length;
  const onboardingCount = (candidates || []).filter(c => c.start_onboard).length;

  // Recruitment
  const activeRecruitments = (recruitments || []).filter(r => !r.closed).length;
  const totalVacancies = (recruitments || []).reduce((sum, r) => sum + (r.vacancy || 0), 0);

  // Attendance
  const presentToday = (todayAttendance || []).filter(a => a.attendance_status === "present").length;
  const absentToday = (todayAttendance || []).filter(a => a.attendance_status === "absent").length;
  const lateToday = (todayAttendance || []).filter(a => a.attendance_status === "late").length;

  // Leave
  const pendingLeaves = (leaveRequests || []).filter(l => l.status === "pending").length;
  const approvedLeaves = (leaveRequests || []).filter(l => l.status === "approved").length;

  // Payroll
  const lastPayroll = (payrollRuns || [])[0];
  const totalPayrollNet = (payrollRuns || []).reduce((s, r) => s + (r.total_net || 0), 0);

  // Department distribution
  const deptCounts: Record<string, number> = {};
  (workInfos || []).forEach(w => {
    if (w.department_id) deptCounts[w.department_id] = (deptCounts[w.department_id] || 0) + 1;
  });
  const deptDistribution = (departments || [])
    .filter(d => d.is_active)
    .map(d => ({ name: d.name, count: deptCounts[d.id] || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Employee type breakdown
  const typeCounts: Record<string, number> = {};
  (workInfos || []).forEach(w => {
    const t = w.employee_type || "Unknown";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const typeData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

  // Attendance pie
  const attendancePie = [
    { name: "Present", value: presentToday, color: "#10B981" },
    { name: "Absent", value: absentToday, color: "#EF4444" },
    { name: "Late", value: lateToday, color: "#F59E0B" },
  ].filter(d => d.value > 0);

  const stats = [
    { label: "Total Employees", value: totalEmployees, sub: `+${newThisMonth} this month`, icon: Users, iconBg: "bg-violet-100", iconColor: "text-violet-600" },
    { label: "Active Employees", value: activeEmployees, sub: `${totalEmployees - activeEmployees} inactive`, icon: CheckCircle, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
    { label: "Open Positions", value: activeRecruitments, sub: `${totalVacancies} vacancies`, icon: Briefcase, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
    { label: "Candidates", value: totalCandidates, sub: `${hiredCandidates} hired`, icon: UserPlus, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
    { label: "Present Today", value: presentToday, sub: `${absentToday} absent, ${lateToday} late`, icon: Clock, iconBg: "bg-teal-100", iconColor: "text-teal-600" },
    { label: "Pending Leaves", value: pendingLeaves, sub: `${approvedLeaves} approved`, icon: CalendarDays, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
    { label: "Onboarding", value: onboardingCount, sub: "candidates in pipeline", icon: Rocket, iconBg: "bg-[#E8604C]/10", iconColor: "text-[#E8604C]" },
    { label: "Payroll Runs", value: (payrollRuns || []).length, sub: lastPayroll ? `Last: ${lastPayroll.title}` : "No runs yet", icon: Wallet, iconBg: "bg-purple-100", iconColor: "text-purple-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-xs text-gray-500 mt-0.5">Welcome back! Here's what's happening today.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{c.value}</p>
              <p className="text-[11px] mt-1 text-gray-500">{c.sub}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center shrink-0`}>
              <c.icon className={`h-5 w-5 ${c.iconColor}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Department Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Department Distribution</h3>
          {deptDistribution.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={deptDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={11} tick={{ fill: "#6b7280" }} />
                <YAxis fontSize={11} tick={{ fill: "#6b7280" }} />
                <Tooltip />
                <Bar dataKey="count" fill="#E8604C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Today's Attendance */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Today's Attendance</h3>
          {attendancePie.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No attendance data</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={attendancePie} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" stroke="none">
                    {attendancePie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {attendancePie.map(d => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-gray-600">{d.name}</span>
                    <span className="font-semibold text-gray-900">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Employee Types */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Employee Types</h3>
          {typeData.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No data</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={typeData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" stroke="none">
                    {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {typeData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-gray-600">{d.name}</span>
                    <span className="font-semibold text-gray-900">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Leave Requests */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Leave Summary</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pending", value: pendingLeaves, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50" },
              { label: "Approved", value: approvedLeaves, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
              { label: "Rejected", value: (leaveRequests || []).filter(l => l.status === "rejected").length, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-lg p-3 text-center`}>
                <s.icon className={`h-5 w-5 ${s.color} mx-auto mb-1`} />
                <p className="text-lg font-bold text-gray-900">{s.value}</p>
                <p className="text-[10px] text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Payroll Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Payroll Overview</h3>
          {(payrollRuns || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No payroll runs yet</p>
          ) : (
            <div className="space-y-3">
              {(payrollRuns || []).slice(0, 4).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.title}</p>
                    <p className="text-xs text-gray-500">{r.employee_count || 0} employees</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">₹{(r.total_net || 0).toLocaleString()}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      r.status === "completed" ? "bg-green-100 text-green-700" :
                      r.status === "processing" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>{r.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
