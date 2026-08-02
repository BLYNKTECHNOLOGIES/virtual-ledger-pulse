import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Users, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const PIE_COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6"];

type SummaryRow = {
  employee_id: string;
  working_days: number;
  present_days: number;
  half_days: number;
  absent_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  held_harmless_days: number;
  unverified_days: number;
  lop_days: number;
  late_minutes: number;
  early_minutes: number;
  ot_hours: number;
  evidence_days: number;
  legacy_present_days: number;
  no_biometric_signal: boolean;
  formula: string | null;
  config_errors: string[] | null;
};

export default function AttendanceSummaryPage() {
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const periodMonth = `${month}-01`;

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() =>
        (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true).order("first_name"),
      );
      return data || [];
    },
  });

  const empIds = useMemo(() => (employees as any[]).map((e) => e.id), [employees]);

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ["hr_attendance_month_summary", month, empIds.length],
    enabled: empIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_attendance_month_summary", {
        p_employee_ids: empIds,
        p_period_month: periodMonth,
      });
      if (error) throw error;
      return (data || []) as SummaryRow[];
    },
  });

  const empById = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of employees as any[]) m.set(e.id, e);
    return m;
  }, [employees]);

  const rows = useMemo(
    () =>
      (summary as SummaryRow[]).map((s) => {
        const employee = empById.get(s.employee_id);
        const attended = Number(s.present_days) + Number(s.paid_leave_days) + Number(s.held_harmless_days);
        const rate = Number(s.working_days) > 0 ? Math.min(100, (attended / Number(s.working_days)) * 100) : 0;
        return { ...s, employee, rate };
      }),
    [summary, empById],
  );

  const filtered = rows.filter((s: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${s.employee?.first_name || ""} ${s.employee?.last_name || ""}`.toLowerCase();
    return name.includes(q) || String(s.employee?.badge_id || "").toLowerCase().includes(q);
  });

  const totals = useMemo(() => {
    const sum = (k: keyof SummaryRow) => rows.reduce((a: number, r: any) => a + Number(r[k] || 0), 0);
    return {
      working: sum("working_days"),
      present: sum("present_days"),
      lop: sum("lop_days"),
      held: sum("held_harmless_days"),
      unverified: sum("unverified_days"),
      paidLeave: sum("paid_leave_days"),
      noSignal: rows.filter((r: any) => r.no_biometric_signal).length,
      legacyGap: rows.filter((r: any) => Number(r.legacy_present_days) > Number(r.present_days) + Number(r.paid_leave_days)).length,
    };
  }, [rows]);

  const attendanceRate = totals.working > 0 ? (((totals.present + totals.paidLeave + totals.held) / totals.working) * 100).toFixed(1) : "0";

  const pieData = [
    { name: "Verified present", value: Math.round(totals.present) },
    { name: "Loss of pay", value: Math.round(totals.lop) },
    { name: "Paid leave", value: Math.round(totals.paidLeave) },
    { name: "Held harmless", value: Math.round(totals.held) },
  ].filter((d) => d.value > 0);

  const topLate = [...rows].sort((a: any, b: any) => Number(b.late_minutes) - Number(a.late_minutes)).slice(0, 5);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="p-4 md:p-6 space-y-6 page-mount">
        <PageHeader
          title="Attendance Summary"
          description="Maintained monthly attendance — the exact source payroll loss-of-pay uses"
        />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Working Days", value: Math.round(totals.working), icon: Clock, color: "text-info", bg: "bg-info/10" },
            { label: "Verified Present", value: Math.round(totals.present), icon: Users, color: "text-success", bg: "bg-success/10" },
            { label: "Loss of Pay Days", value: Math.round(totals.lop), icon: Users, color: "text-destructive", bg: "bg-destructive/10" },
            { label: "Held Harmless", value: Math.round(totals.held), icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
            { label: "Attendance Rate", value: `${attendanceRate}%`, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-3 flex-wrap">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44 h-9" />
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Day Distribution</CardTitle></CardHeader>
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
              ) : <p className="text-center text-muted-foreground py-8 text-sm">No data</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Top Late Employees (by minutes)</CardTitle></CardHeader>
            <CardContent>
              {topLate.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topLate.map((e: any) => ({ name: `${e.employee?.first_name?.[0] ?? "?"}. ${e.employee?.last_name ?? ""}`, mins: Number(e.late_minutes) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="mins" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Late Minutes" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8 text-sm">No data</p>}
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} columns={10} />
        ) : (
          <>
            {/* Mobile */}
            <div className="md:hidden space-y-2">
              {filtered.length === 0 ? (
                <Card><CardContent className="p-0"><EmptyState icon={Users} title="No records for this month" description="No attendance data found for the selected month." /></CardContent></Card>
              ) : (filtered as any[]).map((s: any) => (
                <Card key={s.employee_id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{s.employee?.first_name} {s.employee?.last_name}</div>
                        <div className="text-xs text-muted-foreground">{s.employee?.badge_id}</div>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${
                        s.rate >= 80 ? "bg-success/10 text-success border-success/20" :
                        s.rate >= 50 ? "bg-warning/10 text-warning border-warning/20" :
                        "bg-destructive/10 text-destructive border-destructive/20"
                      }`}>{s.rate.toFixed(0)}%</span>
                    </div>
                    {s.no_biometric_signal && (
                      <div className="text-[11px] text-destructive">No biometric enrolment this month — HR review</div>
                    )}
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div><div className="text-success font-semibold tabular-nums">{Number(s.present_days)}</div><div className="text-[10px] text-muted-foreground">Present</div></div>
                      <div><div className="text-destructive font-semibold tabular-nums">{Number(s.lop_days)}</div><div className="text-[10px] text-muted-foreground">LOP</div></div>
                      <div><div className="text-warning font-semibold tabular-nums">{Number(s.held_harmless_days)}</div><div className="text-[10px] text-muted-foreground">Held</div></div>
                      <div><div className="text-info font-semibold tabular-nums">{Number(s.paid_leave_days)}</div><div className="text-[10px] text-muted-foreground">Paid lv</div></div>
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums pt-1 border-t">
                      <span>OT: {Number(s.ot_hours) > 0 ? `${Number(s.ot_hours).toFixed(1)}h` : "—"}</span>
                      <span>Late: {Number(s.late_minutes) > 0 ? `${Number(s.late_minutes)}m` : "—"}</span>
                      <span>Early: {Number(s.early_minutes) > 0 ? `${Number(s.early_minutes)}m` : "—"}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Desktop */}
            <Card className="hidden md:block">
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      {["Employee", "Badge", "Working", "Present", "Paid Leave", "Held Harmless", "LOP", "OT Hours", "Late (min)", "Early Leave (min)", "Rate"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={11}><EmptyState icon={Users} title="No records for this month" description="No attendance data found for the selected month." /></td></tr>
                    ) : (
                      (filtered as any[]).map((s: any) => (
                        <tr key={s.employee_id} className="border-b hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium whitespace-nowrap">
                            {s.employee?.first_name} {s.employee?.last_name}
                            {s.no_biometric_signal && (
                              <div className="text-[11px] font-normal text-destructive">No biometric enrolment — HR review</div>
                            )}
                            {Number(s.legacy_present_days) > Number(s.present_days) + Number(s.paid_leave_days) && (
                              <div className="text-[11px] font-normal text-warning">
                                Manually marked present {Number(s.legacy_present_days)} day(s)
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{s.employee?.badge_id}</td>
                          <td className="px-4 py-3 tabular-nums">{Number(s.working_days)}</td>
                          <td className="px-4 py-3 text-success font-medium tabular-nums">{Number(s.present_days)}</td>
                          <td className="px-4 py-3 tabular-nums">{Number(s.paid_leave_days)}</td>
                          <td className="px-4 py-3 text-warning tabular-nums">
                            <UITooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted underline-offset-2">{Number(s.held_harmless_days)}</span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm text-xs">
                                Days with no roster-wide device signal or an unresolved session — excluded from loss of pay.
                                {s.formula ? <div className="mt-1 opacity-80">{s.formula}</div> : null}
                              </TooltipContent>
                            </UITooltip>
                          </td>
                          <td className="px-4 py-3 text-destructive font-medium tabular-nums">{Number(s.lop_days)}</td>
                          <td className="px-4 py-3 tabular-nums">{Number(s.ot_hours) > 0 ? `${Number(s.ot_hours).toFixed(1)}h` : "—"}</td>
                          <td className="px-4 py-3 tabular-nums">{Number(s.late_minutes) > 0 ? `${Number(s.late_minutes)}m` : "—"}</td>
                          <td className="px-4 py-3 tabular-nums">{Number(s.early_minutes) > 0 ? `${Number(s.early_minutes)}m` : "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                              s.rate >= 80 ? "bg-success/10 text-success border-success/20" :
                              s.rate >= 50 ? "bg-warning/10 text-warning border-warning/20" :
                              "bg-destructive/10 text-destructive border-destructive/20"
                            }`}>{s.rate.toFixed(0)}%</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
