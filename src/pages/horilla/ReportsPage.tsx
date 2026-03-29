import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
} from "recharts";
import { Users, CalendarDays, Wallet, Clock, Download, TrendingUp } from "lucide-react";
import * as XLSX from "xlsx";

const COLORS = ["#E8604C", "#6C63FF", "#10B981", "#F59E0B", "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6"];

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: employees = [] } = useQuery({
    queryKey: ["rpt_employees"],
    queryFn: async () => { const { data } = await supabase.from("hr_employees").select("id, is_active, created_at, total_salary"); return data || []; },
  });

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["rpt_leaves"],
    queryFn: async () => { const { data } = await supabase.from("hr_leave_requests").select("id, status, total_days, leave_type_id, start_date, created_at"); return data || []; },
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["rpt_leave_types"],
    queryFn: async () => { const { data } = await supabase.from("hr_leave_types").select("id, name"); return data || []; },
  });

  const { data: payrollRuns = [] } = useQuery({
    queryKey: ["rpt_payroll"],
    queryFn: async () => { const { data } = await supabase.from("hr_payroll_runs").select("id, title, total_net, total_gross, total_deductions, run_date, employee_count").order("run_date"); return data || []; },
  });

  const { data: workInfos = [] } = useQuery({
    queryKey: ["rpt_work_infos"],
    queryFn: async () => { const { data } = await supabase.from("hr_employee_work_info").select("employee_id, employee_type, department_id"); return data || []; },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["rpt_departments"],
    queryFn: async () => { const { data } = await supabase.from("departments").select("id, name").eq("is_active", true); return data || []; },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["rpt_attendance", dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_attendance")
        .select("id, employee_id, attendance_date, status")
        .gte("attendance_date", dateFrom).lte("attendance_date", dateTo);
      return data || [];
    },
  });

  // Filtered data by date range
  const filteredLeaves = useMemo(() => leaveRequests.filter((l: any) => {
    const d = l.start_date || l.created_at?.slice(0, 10);
    return d >= dateFrom && d <= dateTo;
  }), [leaveRequests, dateFrom, dateTo]);

  const filteredPayroll = useMemo(() => payrollRuns.filter((r: any) => {
    const d = r.run_date;
    return d && d >= dateFrom && d <= dateTo;
  }), [payrollRuns, dateFrom, dateTo]);

  // Employee growth by month
  const growthData = useMemo(() => {
    const monthCounts: Record<string, number> = {};
    employees.forEach((e: any) => { const m = e.created_at?.slice(0, 7); if (m) monthCounts[m] = (monthCounts[m] || 0) + 1; });
    return Object.entries(monthCounts).sort().slice(-12).map(([month, count]) => ({ month: month.slice(5), count }));
  }, [employees]);

  // Leave by type
  const leaveByType = useMemo(() => leaveTypes.map((lt: any) => ({
    name: lt.name,
    value: filteredLeaves.filter((r: any) => r.leave_type_id === lt.id).length,
  })).filter(d => d.value > 0), [leaveTypes, filteredLeaves]);

  // Employee types
  const typeData = useMemo(() => {
    const typeC: Record<string, number> = {};
    workInfos.forEach((w: any) => { const t = w.employee_type || "Unknown"; typeC[t] = (typeC[t] || 0) + 1; });
    return Object.entries(typeC).map(([name, value]) => ({ name, value }));
  }, [workInfos]);

  // Payroll trend
  const payrollData = useMemo(() => filteredPayroll.map((r: any) => ({
    name: r.title?.slice(0, 15), gross: r.total_gross || 0, net: r.total_net || 0, deductions: r.total_deductions || 0,
  })), [filteredPayroll]);

  // Attendance trend (by week)
  const attendanceTrend = useMemo(() => {
    const weekMap: Record<string, { present: number; absent: number; late: number }> = {};
    attendance.forEach((a: any) => {
      const d = new Date(a.attendance_date);
      const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().slice(5, 10);
      if (!weekMap[key]) weekMap[key] = { present: 0, absent: 0, late: 0 };
      if (a.status === "present") weekMap[key].present++;
      else if (a.status === "absent") weekMap[key].absent++;
      else if (a.status === "late") weekMap[key].late++;
    });
    return Object.entries(weekMap).sort().map(([week, v]) => ({ week, ...v }));
  }, [attendance]);

  // Department-wise leave
  const deptLeaveData = useMemo(() => {
    const deptMap: Record<string, number> = {};
    filteredLeaves.forEach((l: any) => {
      // Find employee's department
      const wi = workInfos.find((w: any) => {
        // We need employee_id from leave - but leave has employee_id
        return w.employee_id === (l as any).employee_id;
      });
      const dept = departments.find((d: any) => d.id === wi?.department_id);
      const name = dept?.name || "Unassigned";
      deptMap[name] = (deptMap[name] || 0) + (l.total_days || 1);
    });
    return Object.entries(deptMap).map(([name, days]) => ({ name, days })).sort((a, b) => b.days - a.days).slice(0, 8);
  }, [filteredLeaves, workInfos, departments]);

  // Payroll cost summary
  const totalPayrollCost = filteredPayroll.reduce((s: number, r: any) => s + (r.total_gross || 0), 0);
  const avgPayrollCost = filteredPayroll.length ? Math.round(totalPayrollCost / filteredPayroll.length) : 0;

  // Headcount trend
  const headcountTrend = useMemo(() => {
    const sorted = [...employees].sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
    let running = 0;
    const monthMap: Record<string, number> = {};
    sorted.forEach((e: any) => {
      running++;
      const m = e.created_at?.slice(0, 7);
      if (m) monthMap[m] = running;
    });
    return Object.entries(monthMap).slice(-12).map(([month, total]) => ({ month: month.slice(5), total }));
  }, [employees]);

  // Export
  const handleExport = (type: string) => {
    let rows: any[] = [];
    let sheetName = "Report";
    if (type === "employees") {
      rows = employees.map((e: any) => ({ ID: e.id, Active: e.is_active, Created: e.created_at?.slice(0, 10), CTC: e.total_salary || 0 }));
      sheetName = "Employees";
    } else if (type === "leaves") {
      rows = filteredLeaves.map((l: any) => ({ Status: l.status, Days: l.total_days, Date: l.start_date }));
      sheetName = "Leaves";
    } else if (type === "payroll") {
      rows = filteredPayroll.map((r: any) => ({ Title: r.title, Gross: r.total_gross, Net: r.total_net, Deductions: r.total_deductions, Date: r.run_date }));
      sheetName = "Payroll";
    } else if (type === "attendance") {
      rows = attendance.map((a: any) => ({ Date: a.attendance_date, Status: a.status }));
      sheetName = "Attendance";
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${sheetName.toLowerCase()}_report.xlsx`);
  };

  const NoData = () => <p className="text-center text-muted-foreground py-8 text-sm">No data available</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">HR insights with date filters and export</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground" />
          <span className="text-muted-foreground text-sm">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground" />
          <div className="relative group">
            <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" /> Export</Button>
            <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[140px] hidden group-hover:block z-50">
              {["employees", "leaves", "payroll", "attendance"].map(t => (
                <button key={t} onClick={() => handleExport(t)}
                  className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-muted capitalize">{t}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: "Total Employees", value: employees.length, icon: Users, color: "text-violet-600 bg-violet-50" },
          { label: "Active", value: employees.filter((e: any) => e.is_active).length, icon: Users, color: "text-emerald-600 bg-emerald-50" },
          { label: "Leave Requests", value: filteredLeaves.length, icon: CalendarDays, color: "text-orange-600 bg-orange-50" },
          { label: "Payroll Runs", value: filteredPayroll.length, icon: Wallet, color: "text-purple-600 bg-purple-50" },
          { label: "Total Payroll Cost", value: `₹${(totalPayrollCost / 100000).toFixed(1)}L`, icon: TrendingUp, color: "text-blue-600 bg-blue-50" },
          { label: "Avg Payroll/Run", value: `₹${(avgPayrollCost / 1000).toFixed(0)}K`, icon: Clock, color: "text-rose-600 bg-rose-50" },
        ].map(s => (
          <Card key={s.label}><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${s.color.split(' ')[1]}`}><s.icon className={`h-4 w-4 ${s.color.split(' ')[0]}`} /></div>
            <div><p className="text-lg font-bold text-foreground">{s.value}</p><p className="text-[10px] text-muted-foreground">{s.label}</p></div>
          </CardContent></Card>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Headcount Trend</CardTitle></CardHeader><CardContent>
          {headcountTrend.length > 0 ? <ResponsiveContainer width="100%" height={220}><AreaChart data={headcountTrend}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Area type="monotone" dataKey="total" fill="#6C63FF" fillOpacity={0.15} stroke="#6C63FF" strokeWidth={2} /></AreaChart></ResponsiveContainer> : <NoData />}
        </CardContent></Card>

        <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Employee Growth (New Hires)</CardTitle></CardHeader><CardContent>
          {growthData.length > 0 ? <ResponsiveContainer width="100%" height={220}><BarChart data={growthData}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="count" fill="#E8604C" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer> : <NoData />}
        </CardContent></Card>

        <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Leave by Type</CardTitle></CardHeader><CardContent>
          {leaveByType.length > 0 ? <div className="flex items-center gap-4"><ResponsiveContainer width="50%" height={200}><PieChart><Pie data={leaveByType} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" stroke="none">{leaveByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer><div className="space-y-1.5">{leaveByType.map((d, i) => <div key={d.name} className="flex items-center gap-2 text-sm"><div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} /><span className="text-muted-foreground text-xs">{d.name}</span><span className="font-semibold text-xs">{d.value}</span></div>)}</div></div> : <NoData />}
        </CardContent></Card>

        <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Department-wise Leave Days</CardTitle></CardHeader><CardContent>
          {deptLeaveData.length > 0 ? <ResponsiveContainer width="100%" height={220}><BarChart data={deptLeaveData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis type="number" fontSize={11} /><YAxis dataKey="name" type="category" fontSize={10} width={80} /><Tooltip /><Bar dataKey="days" fill="#F59E0B" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer> : <NoData />}
        </CardContent></Card>

        <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Payroll Cost Trend</CardTitle></CardHeader><CardContent>
          {payrollData.length > 0 ? <ResponsiveContainer width="100%" height={220}><LineChart data={payrollData}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="gross" stroke="#E8604C" strokeWidth={2} /><Line type="monotone" dataKey="net" stroke="#6C63FF" strokeWidth={2} /><Line type="monotone" dataKey="deductions" stroke="#10B981" strokeWidth={1.5} strokeDasharray="5 5" /></LineChart></ResponsiveContainer> : <NoData />}
        </CardContent></Card>

        <Card><CardHeader className="pb-1"><CardTitle className="text-sm">Employee Types</CardTitle></CardHeader><CardContent>
          {typeData.length > 0 ? <div className="flex items-center gap-4"><ResponsiveContainer width="50%" height={200}><PieChart><Pie data={typeData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" stroke="none">{typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer><div className="space-y-1.5">{typeData.map((d, i) => <div key={d.name} className="flex items-center gap-2 text-sm"><div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} /><span className="text-muted-foreground text-xs">{d.name}</span><span className="font-semibold text-xs">{d.value}</span></div>)}</div></div> : <NoData />}
        </CardContent></Card>

        <Card className="lg:col-span-2"><CardHeader className="pb-1"><CardTitle className="text-sm">Attendance Trend (Weekly)</CardTitle></CardHeader><CardContent>
          {attendanceTrend.length > 0 ? <ResponsiveContainer width="100%" height={220}><BarChart data={attendanceTrend}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="week" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="present" fill="#10B981" stackId="a" /><Bar dataKey="late" fill="#F59E0B" stackId="a" /><Bar dataKey="absent" fill="#EF4444" stackId="a" /></BarChart></ResponsiveContainer> : <NoData />}
        </CardContent></Card>
      </div>
    </div>
  );
}
