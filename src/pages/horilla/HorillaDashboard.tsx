import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, UserPlus, CheckCircle, CalendarDays, Briefcase,
  Rocket, Building2, TrendingUp
} from "lucide-react";

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

  const { data: onboardingStages } = useQuery({
    queryKey: ["hr_dashboard_onboarding_stages"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_onboarding_stages").select("id");
      return data || [];
    },
  });

  const totalEmployees = (employees || []).length;
  const activeEmployees = (employees || []).filter(e => e.is_active).length;
  const inactiveEmployees = totalEmployees - activeEmployees;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const newThisMonth = (employees || []).filter(e => e.created_at?.startsWith(thisMonth)).length;

  const totalCandidates = (candidates || []).length;
  const hiredCandidates = (candidates || []).filter(c => c.hired).length;
  const onboardingCount = (candidates || []).filter(c => c.start_onboard).length;
  const inProgressCandidates = (candidates || []).filter(c => !c.hired && !c.canceled).length;

  const activeRecruitments = (recruitments || []).filter(r => !r.closed).length;
  const totalVacancies = (recruitments || []).reduce((sum, r) => sum + (r.vacancy || 0), 0);

  const activeDepts = (departments || []).filter(d => d.is_active).length;

  const stats = [
    { label: "Total Employees", value: totalEmployees, sub: `+${newThisMonth} this month`, subColor: "text-emerald-500", icon: Users, iconBg: "bg-violet-100", iconColor: "text-violet-600" },
    { label: "Active Employees", value: activeEmployees, sub: `${inactiveEmployees} inactive`, subColor: "text-gray-500", icon: CheckCircle, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
    { label: "Open Recruitments", value: activeRecruitments, sub: `${totalVacancies} vacancies`, subColor: "text-amber-500", icon: Briefcase, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
    { label: "Total Candidates", value: totalCandidates, sub: `${inProgressCandidates} in progress`, subColor: "text-blue-500", icon: UserPlus, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
    { label: "Hired", value: hiredCandidates, sub: "candidates hired", subColor: "text-emerald-500", icon: CheckCircle, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
    { label: "Onboarding", value: onboardingCount, sub: `${(onboardingStages || []).length} stages defined`, subColor: "text-[#E8604C]", icon: Rocket, iconBg: "bg-[#E8604C]/10", iconColor: "text-[#E8604C]" },
    { label: "Departments", value: activeDepts, sub: `${(departments || []).length} total`, subColor: "text-gray-500", icon: Building2, iconBg: "bg-purple-100", iconColor: "text-purple-600" },
    { label: "Workforce Trend", value: `${activeEmployees > 0 ? "+" : ""}${newThisMonth}`, sub: "new employees this month", subColor: "text-emerald-500", icon: TrendingUp, iconBg: "bg-indigo-100", iconColor: "text-indigo-600" },
  ];

  // Department distribution from work infos
  const deptCounts: Record<string, number> = {};
  (workInfos || []).forEach(w => {
    if (w.department_id) deptCounts[w.department_id] = (deptCounts[w.department_id] || 0) + 1;
  });
  const deptDistribution = (departments || [])
    .filter(d => d.is_active)
    .map(d => ({
      name: d.name,
      count: deptCounts[d.id] || 0,
      pct: totalEmployees > 0 ? Math.round(((deptCounts[d.id] || 0) / totalEmployees) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Employee type breakdown
  const typeCounts: Record<string, number> = {};
  (workInfos || []).forEach(w => {
    const t = w.employee_type || "Unknown";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const typeColors: Record<string, string> = {
    "Full-time": "bg-emerald-100 text-emerald-700",
    "Part-time": "bg-blue-100 text-blue-700",
    "Contract": "bg-amber-100 text-amber-700",
    "Intern": "bg-violet-100 text-violet-700",
    "Unknown": "bg-gray-100 text-gray-600",
  };

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
              <p className={`text-[11px] mt-1 ${c.subColor}`}>{c.sub}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center shrink-0`}>
              <c.icon className={`h-5 w-5 ${c.iconColor}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Department Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Department Distribution</h3>
          {deptDistribution.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No department data yet</p>
          ) : (
            <div className="space-y-3">
              {deptDistribution.map((d) => (
                <div key={d.name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700">{d.name}</span>
                    <span className="text-gray-500 text-xs">{d.count} ({d.pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#E8604C]" style={{ width: `${Math.max(d.pct, 2)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Employee Types */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Employee Types</h3>
          {Object.keys(typeCounts).length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No employee type data yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${typeColors[type] || typeColors.Unknown}`}>
                      {type}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}