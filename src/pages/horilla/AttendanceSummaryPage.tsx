import { useState, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Users, Download } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AttendanceInsights, type DailyRow, type MaintainedRow } from "@/components/hrms/attendance/AttendanceInsights";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "@/components/hrms/ViewToggle";
import { useViewMode } from "@/hooks/useViewMode";


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
  const [viewMode, setViewMode] = useViewMode("attendance-summary");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const periodMonth = `${month}-01`;

  // Full directory (active AND former) — attendance rows exist for people who
  // have since been deactivated, and they must still resolve to a real name.
  const { data: allEmployees = [] } = useQuery({
    queryKey: ["hr_employees_all_for_attendance"],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() =>
        (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name, is_active").order("first_name"),
      );
      return data || [];
    },
  });

  const employees = useMemo(() => (allEmployees as any[]).filter((e) => e.is_active), [allEmployees]);
  const activeIds = useMemo(() => new Set((employees as any[]).map((e) => e.id)), [employees]);

  const empIds = useMemo(() => (employees as any[]).map((e) => e.id), [employees]);


  const { data: summary = [], isLoading } = useQuery({
    queryKey: ["hr_attendance_month_summary", month, empIds.length],
    // Filter/period changes keep the previous rows on screen instead of
    // collapsing to a skeleton; the new data swaps in when it truly lands.
    placeholderData: keepPreviousData,
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

  /* ---- windows for insight queries ---- */
  const windows = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    const monthEnd = new Date(Date.UTC(y, m, 0));
    const nowIst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayUtc = new Date(Date.UTC(nowIst.getFullYear(), nowIst.getMonth(), nowIst.getDate()));
    const end = todayUtc < monthEnd ? todayUtc : monthEnd;
    const cutoffDay = end < monthStart ? 0 : end.getUTCDate();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const prevStart = new Date(Date.UTC(y, m - 2, 1));
    const prevMonthEnd = new Date(Date.UTC(y, m - 1, 0));
    const prevCutoff = new Date(Date.UTC(y, m - 2, Math.min(cutoffDay || 1, prevMonthEnd.getUTCDate())));
    return {
      start: iso(monthStart),
      end: iso(end < monthStart ? monthStart : end),
      monthEnd: iso(monthEnd),
      prevStart: iso(prevStart),
      prevEnd: iso(prevCutoff),
      cutoffDay,
    };
  }, [month]);

  const { data: maintained = [] } = useQuery({
    queryKey: ["hr_attendance_maintained", windows.start, windows.end],
    // Filter/period changes keep the previous rows on screen instead of
    // collapsing to a skeleton; the new data swaps in when it truly lands.
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await fetchAllPaginated<MaintainedRow>(() =>
        (supabase as any)
          .from("hr_attendance")
          .select("employee_id, attendance_date, attendance_status, late_minutes, early_leave_minutes, overtime_hours")
          .gte("attendance_date", windows.start)
          .lte("attendance_date", windows.end),
      )) || [],
  });

  const { data: maintainedPrev = [] } = useQuery({
    queryKey: ["hr_attendance_maintained_prev", windows.prevStart, windows.prevEnd],
    // Filter/period changes keep the previous rows on screen instead of
    // collapsing to a skeleton; the new data swaps in when it truly lands.
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await fetchAllPaginated<MaintainedRow>(() =>
        (supabase as any)
          .from("hr_attendance")
          .select("employee_id, attendance_date, attendance_status, late_minutes, early_leave_minutes, overtime_hours")
          .gte("attendance_date", windows.prevStart)
          .lte("attendance_date", windows.prevEnd),
      )) || [],
  });

  const { data: daily = [] } = useQuery({
    queryKey: ["hr_attendance_daily_month", windows.start, windows.monthEnd],
    // Filter/period changes keep the previous rows on screen instead of
    // collapsing to a skeleton; the new data swaps in when it truly lands.
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await fetchAllPaginated<DailyRow>(() =>
        (supabase as any)
          .from("hr_attendance_daily")
          .select(
            "employee_id, attendance_date, net_work_minutes, late_by_minutes, is_late, early_departure, punch_count, session_count, status",
          )
          .gte("attendance_date", windows.start)
          .lte("attendance_date", windows.monthEnd),
      )) || [],
  });

  const { data: workInfo = [] } = useQuery({
    queryKey: ["hr_work_info_dept_shift"],
    queryFn: async () =>
      (await fetchAllPaginated<any>(() =>
        (supabase as any).from("hr_employee_work_info").select("employee_id, department_id, shift_id"),
      )) || [],
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments_list"],
    queryFn: async () => (await fetchAllPaginated<any>(() => (supabase as any).from("departments").select("id, name"))) || [],
  });

  const { data: shiftSchedule = [] } = useQuery({
    queryKey: ["hr_employee_shift_schedule_current"],
    queryFn: async () =>
      (await fetchAllPaginated<any>(() =>
        (supabase as any).from("hr_employee_shift_schedule").select("employee_id, shift_id, is_current").eq("is_current", true),
      )) || [],
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["hr_shifts_durations"],
    queryFn: async () => (await fetchAllPaginated<any>(() => (supabase as any).from("hr_shifts").select("id, duration_hours"))) || [],
  });

  const deptByEmployee = useMemo(() => {
    const deptName = new Map<string, string>();
    for (const d of departments as any[]) deptName.set(d.id, d.name);
    const m = new Map<string, string>();
    for (const w of workInfo as any[]) {
      if (w.department_id && deptName.has(w.department_id)) m.set(w.employee_id, deptName.get(w.department_id)!);
    }
    return m;
  }, [workInfo, departments]);

  const shiftMinutesByEmployee = useMemo(() => {
    const dur = new Map<string, number>();
    for (const s of shifts as any[]) if (s.duration_hours) dur.set(s.id, Number(s.duration_hours) * 60);
    const m = new Map<string, number>();
    for (const w of workInfo as any[]) if (w.shift_id && dur.has(w.shift_id)) m.set(w.employee_id, dur.get(w.shift_id)!);
    for (const s of shiftSchedule as any[]) if (s.shift_id && dur.has(s.shift_id)) m.set(s.employee_id, dur.get(s.shift_id)!);
    return m;
  }, [workInfo, shiftSchedule, shifts]);


  const exportCsv = () => {
    const rows = filtered as any[];
    if (!rows.length) return;
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "Employee", "Badge ID", "Working Days", "Present", "Paid Leave", "Not Counted",
      "Loss of Pay", "Overtime (h)", "Late (min)", "Early Out (min)", "Attendance %",
    ];
    const lines = [header.map(esc).join(",")];
    for (const s of rows) {
      lines.push([
        `${s.employee?.first_name ?? ""} ${s.employee?.last_name ?? ""}`.trim(),
        s.employee?.badge_id ?? "",
        Number(s.working_days),
        Number(s.present_days),
        Number(s.paid_leave_days),
        Number(s.held_harmless_days),
        Number(s.lop_days),
        Number(s.ot_hours).toFixed(1),
        Number(s.late_minutes),
        Number(s.early_minutes),
        s.rate.toFixed(1),
      ].map(esc).join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-summary-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="p-4 md:p-6 space-y-6 page-mount">
        <PageHeader title="Attendance Summary" />


        <div className="flex gap-3 flex-wrap items-center">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44 h-9" />
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportCsv} disabled={!(filtered as any[]).length}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        {viewMode === "cards" && <AttendanceInsights
          month={month}
          summary={summary as any}
          maintained={maintained as MaintainedRow[]}
          maintainedPrev={maintainedPrev as MaintainedRow[]}
          daily={daily as DailyRow[]}
          employees={allEmployees as any[]}
          activeIds={activeIds}
          deptByEmployee={deptByEmployee}
          shiftMinutesByEmployee={shiftMinutesByEmployee}
        />}


        {isLoading ? (
          <TableSkeleton rows={6} columns={10} />
        ) : (
          <>
            {/* Mobile */}
            <div className={viewMode === "table" ? "hidden" : "md:hidden space-y-2"}>
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
            <Card className={viewMode === "table" ? "block" : "hidden md:block"}>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      {["Employee", "Badge", "Working days", "Present", "Paid leave", "Not counted", "Loss of pay", "Overtime", "Late", "Early out", "Attendance"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
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
