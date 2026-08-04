import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
} from "recharts";
import { Users, CalendarDays, Wallet, Clock, Download, TrendingUp, UserMinus } from "lucide-react";
import * as XLSX from "xlsx";
import { PageHeader } from "@/components/shared/PageHeader";
import { MonthlyPayrollBreakdownDialog } from "@/components/hrms/MonthlyPayrollBreakdownDialog";

const COLORS = ["#E8604C", "#6C63FF", "#10B981", "#F59E0B", "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6"];

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

/** Small provenance footnote so every number on this page is traceable. */
const Source = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] text-muted-foreground mt-2">Source: {children}</p>
);

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [drillMonth, setDrillMonth] = useState<string | null>(null);

  // ─── Sources of truth ───
  // Roster: hr_employees + hr_employee_work_info (joining_date lives on work info).
  const { data: employees = [] } = useQuery({
    queryKey: ["rpt_employees"],
    queryFn: async () => await fetchAllPaginated<any>(() =>
      supabase.from("hr_employees").select("id, badge_id, first_name, last_name, is_active, created_at, total_salary, resignation_date, last_working_day")),
  });
  const { data: workInfos = [] } = useQuery({
    queryKey: ["rpt_work_infos"],
    queryFn: async () => await fetchAllPaginated<any>(() =>
      supabase.from("hr_employee_work_info").select("employee_id, employee_type, department_id, joining_date, job_position_id")),
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["rpt_departments"],
    queryFn: async () => { const { data } = await supabase.from("departments").select("id, name"); return data || []; },
  });
  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["rpt_leaves"],
    queryFn: async () => await fetchAllPaginated<any>(() =>
      supabase.from("hr_leave_requests").select("id, employee_id, status, total_days, leave_type_id, start_date, created_at")),
  });
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["rpt_leave_types"],
    queryFn: async () => { const { data } = await supabase.from("hr_leave_types").select("id, name"); return data || []; },
  });
  // Payroll truth = RazorpayX-mirrored payslips (hr_payslips_v), NOT hr_payroll_runs (empty).
  const { data: payslips = [] } = useQuery({
    queryKey: ["rpt_payslips", dateFrom, dateTo],
    queryFn: async () => await fetchAllPaginated<any>(() => (supabase as any)
      .from("hr_payslips_v")
      .select("employee_id, period_month, gross, regular_gross, net, total_deductions, tds_amount, pf_amount, esi_amount, professional_tax, employer_contrib, register_source")
      .gte("period_month", dateFrom.slice(0, 8) + "01")
      .lte("period_month", dateTo)),
  });
  // Attendance truth = v4 engine daily rollup.
  const { data: attendance = [] } = useQuery({
    queryKey: ["rpt_attendance_daily", dateFrom, dateTo],
    queryFn: async () => await fetchAllPaginated<any>(() => (supabase as any)
      .from("hr_attendance_daily")
      .select("employee_id, attendance_date, status, is_late, late_by_minutes, early_departure, total_hours, net_work_minutes")
      .gte("attendance_date", dateFrom).lte("attendance_date", dateTo)),
  });
  // Same-length window immediately before the range, for period-over-period deltas.
  const prevWindow = useMemo(() => {
    const from = new Date(`${dateFrom}T00:00:00`), to = new Date(`${dateTo}T00:00:00`);
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
    const pTo = new Date(from); pTo.setDate(from.getDate() - 1);
    const pFrom = new Date(pTo); pFrom.setDate(pTo.getDate() - (days - 1));
    return { from: pFrom.toISOString().slice(0, 10), to: pTo.toISOString().slice(0, 10) };
  }, [dateFrom, dateTo]);
  const { data: prevAttendance = [] } = useQuery({
    queryKey: ["rpt_attendance_prev", prevWindow.from, prevWindow.to],
    queryFn: async () => await fetchAllPaginated<any>(() => (supabase as any)
      .from("hr_attendance_daily")
      .select("employee_id, status, is_late")
      .gte("attendance_date", prevWindow.from).lte("attendance_date", prevWindow.to)),
  });

  // ─── Lookups ───
  const empById = useMemo(() => new Map(employees.map((e: any) => [e.id, e])), [employees]);
  const wiByEmp = useMemo(() => new Map(workInfos.map((w: any) => [w.employee_id, w])), [workInfos]);
  const deptById = useMemo(() => new Map(departments.map((d: any) => [d.id, d.name])), [departments]);
  const empName = (id: string) => {
    const e: any = empById.get(id);
    return e ? `${e.first_name || ""} ${e.last_name || ""}`.trim() || e.badge_id || id : id;
  };
  const deptOf = (empId: string) => deptById.get(wiByEmp.get(empId)?.department_id) || "Unassigned";

  const inRange = (d?: string | null) => !!d && d.slice(0, 10) >= dateFrom && d.slice(0, 10) <= dateTo;
  const exitDateOf = (e: any) => e.last_working_day || e.resignation_date || null;

  // ─── Roster / headcount ───
  const activeCount = employees.filter((e: any) => e.is_active).length;
  const exitsInRange = useMemo(() => employees.filter((e: any) => inRange(exitDateOf(e))), [employees, dateFrom, dateTo]);

  const newHires = useMemo(() => {
    const m: Record<string, number> = {};
    workInfos.forEach((w: any) => { if (inRange(w.joining_date)) { const k = w.joining_date.slice(0, 7); m[k] = (m[k] || 0) + 1; } });
    return Object.entries(m).sort().map(([k, count]) => ({ month: monthLabel(k), count }));
  }, [workInfos, dateFrom, dateTo]);

  const headcountTrend = useMemo(() => {
    if (!employees.length) return [];
    // Baseline: everyone who joined before the range and had not exited before it.
    let running = employees.filter((e: any) => {
      const j = wiByEmp.get(e.id)?.joining_date;
      const x = exitDateOf(e);
      return j && j < dateFrom && (!x || x >= dateFrom);
    }).length;
    const events: Record<string, number> = {};
    workInfos.forEach((w: any) => { if (inRange(w.joining_date)) { const k = w.joining_date.slice(0, 7); events[k] = (events[k] || 0) + 1; } });
    employees.forEach((e: any) => { const x = exitDateOf(e); if (inRange(x)) { const k = x.slice(0, 7); events[k] = (events[k] || 0) - 1; } });
    return Object.keys(events).sort().map((k) => { running += events[k]; return { month: monthLabel(k), total: running }; });
  }, [employees, workInfos, wiByEmp, dateFrom, dateTo]);

  const deptHeadcount = useMemo(() => {
    const m: Record<string, number> = {};
    employees.filter((e: any) => e.is_active).forEach((e: any) => { const n = deptOf(e.id); m[n] = (m[n] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [employees, wiByEmp, deptById]);

  const typeData = useMemo(() => {
    const c: Record<string, number> = {};
    workInfos.forEach((w: any) => {
      if (!empById.get(w.employee_id)?.is_active) return;
      const t = w.employee_type || "Unspecified"; c[t] = (c[t] || 0) + 1;
    });
    return Object.entries(c).map(([name, value]) => ({ name, value }));
  }, [workInfos, empById]);

  // ─── Payroll (RazorpayX mirror) ───
  const payrollMonths = useMemo(() => {
    const m: Record<string, { gross: number; net: number; deductions: number; tds: number; pf: number; esi: number; pt: number; er: number; count: number; withRegister: number; esiCovered: number }> = {};
    payslips.forEach((p: any) => {
      const k = String(p.period_month).slice(0, 7);
      const r = m[k] || (m[k] = { gross: 0, net: 0, deductions: 0, tds: 0, pf: 0, esi: 0, pt: 0, er: 0, count: 0, withRegister: 0, esiCovered: 0 });
      r.gross += Number(p.gross || 0); r.net += Number(p.net || 0);
      r.deductions += Math.abs(Number(p.total_deductions || 0));
      r.tds += Math.abs(Number(p.tds_amount || 0)); r.pf += Math.abs(Number(p.pf_amount || 0));
      r.esi += Math.abs(Number(p.esi_amount || 0)); r.pt += Math.abs(Number(p.professional_tax || 0));
      r.er += Number(p.employer_contrib || 0); r.count += 1;
      if (p.register_source) r.withRegister += 1;
      if (Math.abs(Number(p.esi_amount || 0)) > 0) r.esiCovered += 1;
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ key: k, month: monthLabel(k), ...v }));
  }, [payslips]);

  const totalPayrollCost = payrollMonths.reduce((s, r) => s + r.gross, 0);
  const avgMonthlyCost = payrollMonths.length ? totalPayrollCost / payrollMonths.length : 0;
  const statutory = payrollMonths.reduce(
    (s, r) => ({ pf: s.pf + r.pf, esi: s.esi + r.esi, pt: s.pt + r.pt, tds: s.tds + r.tds, er: s.er + r.er }),
    { pf: 0, esi: 0, pt: 0, tds: 0, er: 0 },
  );

  // Statutory figures are only as complete as the imported salary registers.
  // Dashboard-only payslips carry no PF/ESI/PT breakdown, so surface the gap instead of understating silently.
  const statutoryCoverage = useMemo(() => {
    const total = payrollMonths.reduce((s, r) => s + r.count, 0);
    const withReg = payrollMonths.reduce((s, r) => s + r.withRegister, 0);
    const esiCovered = payrollMonths.reduce((s, r) => s + r.esiCovered, 0);
    const missingMonths = payrollMonths.filter((r) => r.withRegister === 0).map((r) => r.month);
    const partialMonths = payrollMonths.filter((r) => r.withRegister > 0 && r.withRegister < r.count).map((r) => `${r.month} (${r.count - r.withRegister} missing)`);
    return { total, withReg, esiCovered, missingMonths, partialMonths };
  }, [payrollMonths]);


  // ─── Attendance (v4 daily rollup) — rate-based KPIs, the way HRIS suites report it ───
  const attStats = useMemo(() => {
    let present = 0, halfDay = 0, absent = 0, late = 0, noData = 0, incomplete = 0;
    let lateMinutes = 0, earlyOuts = 0, workedMinutes = 0, workedDays = 0;
    attendance.forEach((a: any) => {
      if (a.is_late) { late++; lateMinutes += Number(a.late_by_minutes || 0); }
      if (a.early_departure) earlyOuts++;
      const mins = a.net_work_minutes != null ? Number(a.net_work_minutes) : Number(a.total_hours || 0) * 60;
      if (mins > 0) { workedMinutes += mins; workedDays++; }
      switch (a.status) {
        case "present": present++; break;
        case "half_day": halfDay++; break;
        case "absent": absent++; break;
        case "incomplete": incomplete++; break;
        default: noData++;
      }
    });
    const considered = present + halfDay + absent + incomplete;
    const workedRows = present + halfDay + incomplete;
    const pct = considered ? ((present + halfDay * 0.5 + incomplete * 0.5) / considered) * 100 : 0;
    const absenteeism = considered ? ((absent + halfDay * 0.5) / considered) * 100 : 0;
    const punctuality = workedRows ? ((workedRows - late) / workedRows) * 100 : 0;
    const avgHours = workedDays ? workedMinutes / workedDays / 60 : 0;
    const avgLateMin = late ? lateMinutes / late : 0;
    const earlyOutRate = workedRows ? (earlyOuts / workedRows) * 100 : 0;
    return { present, halfDay, absent, late, noData, incomplete, considered, pct, absenteeism, punctuality, avgHours, avgLateMin, earlyOutRate, workedRows };
  }, [attendance]);

  const prevAttStats = useMemo(() => {
    let present = 0, halfDay = 0, absent = 0, incomplete = 0, late = 0;
    prevAttendance.forEach((a: any) => {
      if (a.is_late) late++;
      if (a.status === "present") present++;
      else if (a.status === "half_day") halfDay++;
      else if (a.status === "absent") absent++;
      else if (a.status === "incomplete") incomplete++;
    });
    const considered = present + halfDay + absent + incomplete;
    const workedRows = present + halfDay + incomplete;
    return {
      considered,
      pct: considered ? ((present + halfDay * 0.5 + incomplete * 0.5) / considered) * 100 : 0,
      absenteeism: considered ? ((absent + halfDay * 0.5) / considered) * 100 : 0,
      punctuality: workedRows ? ((workedRows - late) / workedRows) * 100 : 0,
    };
  }, [prevAttendance]);

  // Who actually needs a conversation — chronic absence / chronic lateness in this window.
  const attentionList = useMemo(() => {
    const m: Record<string, { marked: number; lost: number; late: number }> = {};
    attendance.forEach((a: any) => {
      if (!["present", "half_day", "absent", "incomplete"].includes(a.status)) return;
      const r = m[a.employee_id] || (m[a.employee_id] = { marked: 0, lost: 0, late: 0 });
      r.marked++;
      if (a.status === "absent") r.lost += 1;
      else if (a.status === "half_day") r.lost += 0.5;
      if (a.is_late) r.late++;
    });
    return Object.entries(m)
      .filter(([, r]) => r.marked >= 5 && (r.lost / r.marked >= 0.1 || r.late / r.marked >= 0.3))
      .map(([id, r]) => ({ id, absentPct: (r.lost / r.marked) * 100, latePct: (r.late / r.marked) * 100, lost: r.lost, late: r.late }))
      .sort((a, b) => (b.absentPct + b.latePct) - (a.absentPct + a.latePct));
  }, [attendance]);


  const attendanceTrend = useMemo(() => {
    const wm: Record<string, { present: number; absent: number; late: number; half: number }> = {};
    attendance.forEach((a: any) => {
      const d = new Date(`${a.attendance_date}T00:00:00`);
      const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
      const k = ws.toISOString().slice(0, 10);
      const r = wm[k] || (wm[k] = { present: 0, absent: 0, late: 0, half: 0 });
      if (a.status === "present") r.present++;
      else if (a.status === "absent") r.absent++;
      else if (a.status === "half_day") r.half++;
      if (a.is_late) r.late++;
    });
    return Object.entries(wm).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ week: k.slice(5), ...v }));
  }, [attendance]);

  // ─── Leave ───
  const filteredLeaves = useMemo(
    () => leaveRequests.filter((l: any) => inRange(l.start_date || l.created_at?.slice(0, 10))),
    [leaveRequests, dateFrom, dateTo],
  );
  const leaveByType = useMemo(
    () => leaveTypes.map((lt: any) => ({ name: lt.name, value: filteredLeaves.filter((r: any) => r.leave_type_id === lt.id).length })).filter((d: any) => d.value > 0),
    [leaveTypes, filteredLeaves],
  );
  const deptLeaveData = useMemo(() => {
    const dm: Record<string, number> = {};
    filteredLeaves.forEach((l: any) => { const n = deptOf(l.employee_id); dm[n] = (dm[n] || 0) + Number(l.total_days || 1); });
    return Object.entries(dm).map(([name, days]) => ({ name, days })).sort((a, b) => b.days - a.days).slice(0, 8);
  }, [filteredLeaves, wiByEmp, deptById]);

  const attritionRate = activeCount + exitsInRange.length
    ? (exitsInRange.length / (activeCount + exitsInRange.length)) * 100 : 0;

  // ─── Export ───
  const handleExport = (type: string) => {
    let rows: any[] = []; let sheetName = "Report";
    if (type === "employees") {
      sheetName = "Employees";
      rows = employees.map((e: any) => ({
        "Badge ID": e.badge_id, Name: empName(e.id), Department: deptOf(e.id),
        "Employee Type": wiByEmp.get(e.id)?.employee_type || "", "Joining Date": wiByEmp.get(e.id)?.joining_date || "",
        Active: e.is_active ? "Yes" : "No", "Exit Date": exitDateOf(e) || "", CTC: Number(e.total_salary || 0),
      }));
    } else if (type === "leaves") {
      sheetName = "Leaves";
      rows = filteredLeaves.map((l: any) => ({
        Employee: empName(l.employee_id), Department: deptOf(l.employee_id),
        Type: leaveTypes.find((t: any) => t.id === l.leave_type_id)?.name || "", Status: l.status,
        Days: l.total_days, "Start Date": l.start_date,
      }));
    } else if (type === "payroll_monthly") {
      sheetName = "Payroll Monthly";
      rows = payrollMonths.map((r) => ({
        Month: r.month, Payslips: r.count, Gross: r.gross, Deductions: r.deductions, Net: r.net,
        TDS: r.tds, PF: r.pf, ESI: r.esi, PT: r.pt, "Employer Contribution": r.er,
      }));
    } else if (type === "payroll_detail") {
      sheetName = "Payslips";
      rows = payslips.map((p: any) => ({
        Month: String(p.period_month).slice(0, 7), "Badge ID": empById.get(p.employee_id)?.badge_id || "",
        Employee: empName(p.employee_id), Department: deptOf(p.employee_id),
        Gross: Number(p.gross || 0), "Regular Gross": Number(p.regular_gross || 0),
        Deductions: Math.abs(Number(p.total_deductions || 0)), Net: Number(p.net || 0),
        TDS: Math.abs(Number(p.tds_amount || 0)), PF: Math.abs(Number(p.pf_amount || 0)),
        ESI: Math.abs(Number(p.esi_amount || 0)), PT: Math.abs(Number(p.professional_tax || 0)),
      }));
    } else if (type === "attendance") {
      sheetName = "Attendance";
      rows = attendance.map((a: any) => ({
        Date: a.attendance_date, "Badge ID": empById.get(a.employee_id)?.badge_id || "",
        Employee: empName(a.employee_id), Department: deptOf(a.employee_id),
        Status: a.status, Late: a.is_late ? "Yes" : "No", Hours: a.total_hours ?? "",
      }));
    }
    if (!rows.length) rows = [{ Note: "No data in the selected date range" }];
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${sheetName.toLowerCase().replace(/\s+/g, "_")}_${dateFrom}_to_${dateTo}.xlsx`);
  };

  const NoData = ({ reason }: { reason?: string }) => (
    <div className="text-center py-8">
      <p className="text-sm text-muted-foreground">No data available</p>
      {reason && <p className="text-xs text-muted-foreground/70 mt-1">{reason}</p>}
    </div>
  );

  const kpis = [
    { label: "Total Employees", value: employees.length, icon: Users, fg: "text-primary", bg: "bg-primary/10" },
    { label: "Active", value: activeCount, icon: Users, fg: "text-success", bg: "bg-success/10" },
    { label: "Exited (range)", value: exitsInRange.length, icon: UserMinus, fg: "text-destructive", bg: "bg-destructive/10" },
    { label: "Leave Requests", value: filteredLeaves.length, icon: CalendarDays, fg: "text-warning", bg: "bg-warning/10" },
    { label: "Months Processed", value: payrollMonths.length, icon: Wallet, fg: "text-primary", bg: "bg-primary/10" },
    { label: "Total Payroll Cost", value: inr(totalPayrollCost), icon: TrendingUp, fg: "text-info", bg: "bg-info/10" },
    { label: "Avg Monthly Cost", value: inr(avgMonthlyCost), icon: Clock, fg: "text-info", bg: "bg-info/10" },
    { label: "Attrition (range)", value: `${attritionRate.toFixed(1)}%`, icon: UserMinus, fg: "text-destructive", bg: "bg-destructive/10" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Reports & Analytics"
        description="HR insights with date filters and export"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-1.5 h-9 bg-background text-foreground" />
            <span className="text-muted-foreground text-sm">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-1.5 h-9 bg-background text-foreground" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9"><Download className="h-4 w-4 mr-1" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 bg-popover">
                <DropdownMenuLabel className="text-xs">Export (selected range)</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleExport("employees")}>Employees</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("payroll_monthly")}>Payroll (monthly)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("payroll_detail")}>Payslips (per employee)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("attendance")}>Attendance (daily)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("leaves")}>Leaves</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />


      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-3">
        {kpis.map(s => (
          <Card key={s.label}><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${s.bg}`}><s.icon className={`h-4 w-4 ${s.fg}`} /></div>
            <div className="min-w-0"><p className="text-base font-bold text-foreground tabular-nums truncate">{s.value}</p><p className="text-[10px] text-muted-foreground">{s.label}</p></div>
          </CardContent></Card>
        ))}
      </div>

      {/* Attendance health strip */}
      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Attendance Health</CardTitle></CardHeader>
        <CardContent>
          {attendance.length ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  {
                    l: "Attendance rate", v: `${attStats.pct.toFixed(1)}%`,
                    d: prevAttStats.considered ? attStats.pct - prevAttStats.pct : null, good: "up" as const,
                    sub: "of scheduled days worked",
                  },
                  {
                    l: "Absenteeism rate", v: `${attStats.absenteeism.toFixed(1)}%`,
                    d: prevAttStats.considered ? attStats.absenteeism - prevAttStats.absenteeism : null, good: "down" as const,
                    sub: `${attStats.absent} full + ${attStats.halfDay} half days lost`,
                  },
                  {
                    l: "On-time rate", v: `${attStats.punctuality.toFixed(1)}%`,
                    d: prevAttStats.considered ? attStats.punctuality - prevAttStats.punctuality : null, good: "up" as const,
                    sub: attStats.late ? `avg ${Math.round(attStats.avgLateMin)} min late when late` : "no late arrivals",
                  },
                  {
                    l: "Avg hours / worked day", v: `${attStats.avgHours.toFixed(1)} h`,
                    d: null, good: "up" as const,
                    sub: `${attStats.earlyOutRate.toFixed(0)}% days ended early`,
                  },
                  {
                    l: "Employees to review", v: attentionList.length,
                    d: null, good: "down" as const,
                    sub: "≥10% days lost or ≥30% late",
                  },
                ].map(x => {
                  const improving = x.d == null ? null : (x.good === "up" ? x.d > 0 : x.d < 0);
                  return (
                    <div key={x.l} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-baseline gap-1.5">
                        <p className="text-lg font-bold tabular-nums text-foreground">{x.v}</p>
                        {x.d != null && Math.abs(x.d) >= 0.1 && (
                          <span className={`text-[10px] font-semibold tabular-nums ${improving ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                            {x.d > 0 ? "+" : ""}{x.d.toFixed(1)} pt
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{x.l}</p>
                      <p className="text-[10px] text-muted-foreground/80">{x.sub}</p>
                    </div>
                  );
                })}
              </div>
              {attentionList.length > 0 && (
                <div className="mt-3 rounded-md border border-border bg-muted/40 p-2.5">
                  <p className="text-[11px] font-semibold text-foreground">Needs attention</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {attentionList.slice(0, 5).map(a => (
                      <span key={a.id} className="text-[11px] text-muted-foreground">
                        <span className="text-foreground">{empName(a.id)}</span> · {a.absentPct.toFixed(0)}% days lost · {a.latePct.toFixed(0)}% late
                      </span>
                    ))}
                    {attentionList.length > 5 && <span className="text-[11px] text-muted-foreground">+{attentionList.length - 5} more</span>}
                  </div>
                </div>
              )}
            </>
          ) : <NoData reason="No attendance rows recorded in the selected range." />}
          <Source>attendance engine daily rollup (hr_attendance_daily) · {attStats.considered} marked day-rows; {attStats.noData} rows with no device data excluded · deltas compare the same-length window before this range</Source>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Headcount Trend</CardTitle></CardHeader>
          <CardContent>
            {headcountTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}><AreaChart data={headcountTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip />
                <Area type="monotone" dataKey="total" name="Headcount" fill="#6C63FF" fillOpacity={0.15} stroke="#6C63FF" strokeWidth={2} />
              </AreaChart></ResponsiveContainer>
            ) : <NoData reason="No joinings or exits recorded in the selected range." />}
            <Source>joining dates (work info) minus exits (resignation / last working day)</Source>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">New Hires</CardTitle></CardHeader>
          <CardContent>
            {newHires.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}><BarChart data={newHires}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip />
                <Bar dataKey="count" name="Joined" fill="#E8604C" radius={[4, 4, 0, 0]} />
              </BarChart></ResponsiveContainer>
            ) : <NoData reason="No employee joined within the selected range." />}
            <Source>hr_employee_work_info.joining_date (actual hiring date, not record import date)</Source>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Payroll Cost Trend</CardTitle></CardHeader>
          <CardContent>
            {payrollMonths.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}><LineChart
                data={payrollMonths}
                style={{ cursor: "pointer" }}
                onClick={(st: any) => {
                  const k = st?.activePayload?.[0]?.payload?.key || payrollMonths[st?.activeTooltipIndex]?.key;
                  if (k) setDrillMonth(k);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}K`} />
                <Tooltip formatter={(v: any) => inr(Number(v))} />
                <Line type="monotone" dataKey="gross" name="Gross" stroke="#E8604C" strokeWidth={2} />
                <Line type="monotone" dataKey="net" name="Net" stroke="#6C63FF" strokeWidth={2} />
                <Line type="monotone" dataKey="deductions" name="Deductions" stroke="#10B981" strokeWidth={1.5} strokeDasharray="5 5" />
              </LineChart></ResponsiveContainer>
            ) : <NoData reason="No payslips exist for the selected months." />}
            <Source>RazorpayX payslip mirror (hr_payslips_v), grouped by pay period · click any month for the employee-by-employee breakdown</Source>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Statutory & Tax Cost</CardTitle></CardHeader>
          <CardContent>
            {payrollMonths.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { l: "Provident Fund (EE)", v: statutory.pf, s: undefined as string | undefined },
                    { l: "ESI (EE)", v: statutory.esi, s: `${statutoryCoverage.esiCovered} of ${statutoryCoverage.total} payslips ESI-covered` },
                    { l: "Professional Tax", v: statutory.pt, s: undefined },
                    { l: "TDS", v: statutory.tds, s: undefined },
                    { l: "Employer Contribution", v: statutory.er, s: undefined },
                    { l: "Total Net Paid", v: payrollMonths.reduce((s, r) => s + r.net, 0), s: undefined },
                  ].map(x => (
                    <div key={x.l} className="rounded-lg border border-border p-2.5">
                      <p className="text-base font-bold tabular-nums text-foreground">{inr(x.v)}</p>
                      <p className="text-[11px] text-muted-foreground">{x.l}</p>
                      {x.s && <p className="mt-0.5 text-[10px] text-muted-foreground/80">{x.s}</p>}
                    </div>
                  ))}
                </div>
                {(statutoryCoverage.missingMonths.length > 0 || statutoryCoverage.partialMonths.length > 0) && (
                  <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                    <p className="font-semibold">Statutory totals are under-stated for this range</p>
                    <p className="mt-1">
                      Only {statutoryCoverage.withReg} of {statutoryCoverage.total} payslips have an imported salary register. Dashboard-only payslips carry no PF / ESI / PT breakdown, so their statutory amounts count as zero here.
                    </p>
                    {statutoryCoverage.missingMonths.length > 0 && (
                      <p className="mt-1">No register imported: {statutoryCoverage.missingMonths.join(", ")}</p>
                    )}
                    {statutoryCoverage.partialMonths.length > 0 && (
                      <p className="mt-1">Partially imported: {statutoryCoverage.partialMonths.join(", ")}</p>
                    )}
                  </div>
                )}
              </>
            ) : <NoData reason="No payslips exist for the selected months." />}
            <Source>RazorpayX payslip mirror (hr_payslips_v) for the selected range · statutory heads come only from imported salary registers</Source>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Department-wise Headcount</CardTitle></CardHeader>
          <CardContent>
            {deptHeadcount.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}><BarChart data={deptHeadcount} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis type="number" fontSize={11} allowDecimals={false} /><YAxis dataKey="name" type="category" fontSize={10} width={110} /><Tooltip />
                <Bar dataKey="value" name="Active employees" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart></ResponsiveContainer>
            ) : <NoData />}
            <Source>active employees mapped through work info departments</Source>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Employee Types</CardTitle></CardHeader>
          <CardContent>
            {typeData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}><PieChart>
                  <Pie data={typeData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" stroke="none">
                    {typeData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip />
                </PieChart></ResponsiveContainer>
                <div className="space-y-1.5">
                  {typeData.map((d: any, i: number) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground text-xs capitalize">{d.name}</span>
                      <span className="font-semibold text-xs tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <NoData />}
            <Source>work info employee type (active employees only)</Source>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Leave by Type</CardTitle></CardHeader>
          <CardContent>
            {leaveByType.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}><PieChart>
                  <Pie data={leaveByType} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" stroke="none">
                    {leaveByType.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip />
                </PieChart></ResponsiveContainer>
                <div className="space-y-1.5">
                  {leaveByType.map((d: any, i: number) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground text-xs">{d.name}</span>
                      <span className="font-semibold text-xs tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <NoData reason="No leave requests were raised in the selected range." />}
            <Source>hr_leave_requests</Source>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Department-wise Leave Days</CardTitle></CardHeader>
          <CardContent>
            {deptLeaveData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}><BarChart data={deptLeaveData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis type="number" fontSize={11} /><YAxis dataKey="name" type="category" fontSize={10} width={110} /><Tooltip />
                <Bar dataKey="days" name="Leave days" fill="#F59E0B" radius={[0, 4, 4, 0]} />
              </BarChart></ResponsiveContainer>
            ) : <NoData reason="No leave requests were raised in the selected range." />}
            <Source>hr_leave_requests joined to work info departments</Source>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Attendance Trend (Weekly)</CardTitle></CardHeader>
          <CardContent>
            {attendanceTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}><BarChart data={attendanceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="week" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip />
                <Bar dataKey="present" name="Present" fill="#10B981" stackId="a" />
                <Bar dataKey="half" name="Half day" fill="#F59E0B" stackId="a" />
                <Bar dataKey="absent" name="Absent" fill="#EF4444" stackId="a" />
                <Bar dataKey="late" name="Late (of present)" fill="#6C63FF" />
              </BarChart></ResponsiveContainer>
            ) : <NoData reason="No attendance rows recorded in the selected range." />}
            <Source>attendance engine daily rollup (hr_attendance_daily), bucketed by week starting Sunday</Source>
          </CardContent>
        </Card>
      </div>

      <MonthlyPayrollBreakdownDialog
        monthKey={drillMonth}
        monthLabel={drillMonth ? monthLabel(drillMonth) : ""}
        onClose={() => setDrillMonth(null)}
        empName={empName}
        deptOf={deptOf}
        empBadge={(id) => (empById.get(id) as any)?.badge_id || "—"}
      />
    </div>
  );
}
