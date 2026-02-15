import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Users, CalendarDays, Wallet, Clock } from "lucide-react";

const COLORS = ["#E8604C", "#6C63FF", "#10B981", "#F59E0B", "#3B82F6", "#8B5CF6"];

export default function ReportsPage() {
  const { data: employees = [] } = useQuery({
    queryKey: ["rpt_employees"],
    queryFn: async () => { const { data } = await supabase.from("hr_employees").select("id, is_active, created_at"); return data || []; },
  });

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["rpt_leaves"],
    queryFn: async () => { const { data } = await supabase.from("hr_leave_requests").select("id, status, total_days, leave_type_id"); return data || []; },
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["rpt_leave_types"],
    queryFn: async () => { const { data } = await supabase.from("hr_leave_types").select("id, name"); return data || []; },
  });

  const { data: payrollRuns = [] } = useQuery({
    queryKey: ["rpt_payroll"],
    queryFn: async () => { const { data } = await supabase.from("hr_payroll_runs").select("id, title, total_net, total_gross, total_deductions, run_date").order("run_date"); return data || []; },
  });

  const { data: workInfos = [] } = useQuery({
    queryKey: ["rpt_work_infos"],
    queryFn: async () => { const { data } = await supabase.from("hr_employee_work_info").select("employee_type"); return data || []; },
  });

  // Employee growth by month
  const monthCounts: Record<string, number> = {};
  employees.forEach((e: any) => { const m = e.created_at?.slice(0, 7); if (m) monthCounts[m] = (monthCounts[m] || 0) + 1; });
  const growthData = Object.entries(monthCounts).sort().slice(-12).map(([month, count]) => ({ month: month.slice(5), count }));

  // Leave by type
  const leaveByType = leaveTypes.map((lt: any) => ({
    name: lt.name,
    value: leaveRequests.filter((r: any) => r.leave_type_id === lt.id).length,
  })).filter(d => d.value > 0);

  // Employee types
  const typeC: Record<string, number> = {};
  workInfos.forEach((w: any) => { const t = w.employee_type || "Unknown"; typeC[t] = (typeC[t] || 0) + 1; });
  const typeData = Object.entries(typeC).map(([name, value]) => ({ name, value }));

  // Payroll trend
  const payrollData = payrollRuns.map((r: any) => ({ name: r.title?.slice(0, 15), gross: r.total_gross || 0, net: r.total_net || 0 }));

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1><p className="text-sm text-gray-500">HR insights and reports</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Total Employees", value: employees.length, icon: Users, bg: "bg-violet-50", color: "text-violet-600" },
          { label: "Active", value: employees.filter((e: any) => e.is_active).length, icon: Users, bg: "bg-emerald-50", color: "text-emerald-600" },
          { label: "Leave Requests", value: leaveRequests.length, icon: CalendarDays, bg: "bg-orange-50", color: "text-orange-600" },
          { label: "Payroll Runs", value: payrollRuns.length, icon: Wallet, bg: "bg-purple-50", color: "text-purple-600" },
        ].map(s => (
          <Card key={s.label}><CardContent className="p-4 flex items-center gap-3"><div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div><div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card><CardHeader><CardTitle className="text-sm">Employee Growth</CardTitle></CardHeader><CardContent>
          {growthData.length > 0 ? <ResponsiveContainer width="100%" height={220}><BarChart data={growthData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="count" fill="#E8604C" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer> : <p className="text-center text-gray-400 py-8">No data</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Leave by Type</CardTitle></CardHeader><CardContent>
          {leaveByType.length > 0 ? <div className="flex items-center gap-4"><ResponsiveContainer width="50%" height={200}><PieChart><Pie data={leaveByType} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" stroke="none">{leaveByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer><div className="space-y-2">{leaveByType.map((d, i) => <div key={d.name} className="flex items-center gap-2 text-sm"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} /><span className="text-gray-600">{d.name}</span><span className="font-semibold">{d.value}</span></div>)}</div></div> : <p className="text-center text-gray-400 py-8">No data</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Payroll Trend</CardTitle></CardHeader><CardContent>
          {payrollData.length > 0 ? <ResponsiveContainer width="100%" height={220}><LineChart data={payrollData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="gross" stroke="#E8604C" strokeWidth={2} /><Line type="monotone" dataKey="net" stroke="#6C63FF" strokeWidth={2} /></LineChart></ResponsiveContainer> : <p className="text-center text-gray-400 py-8">No data</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Employee Types</CardTitle></CardHeader><CardContent>
          {typeData.length > 0 ? <div className="flex items-center gap-4"><ResponsiveContainer width="50%" height={200}><PieChart><Pie data={typeData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" stroke="none">{typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer><div className="space-y-2">{typeData.map((d, i) => <div key={d.name} className="flex items-center gap-2 text-sm"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} /><span className="text-gray-600">{d.name}</span><span className="font-semibold">{d.value}</span></div>)}</div></div> : <p className="text-center text-gray-400 py-8">No data</p>}
        </CardContent></Card>
      </div>
    </div>
  );
}
