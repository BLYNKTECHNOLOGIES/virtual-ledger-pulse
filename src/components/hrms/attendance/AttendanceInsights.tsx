import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Legend,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Minus,
  ShieldAlert,
  Timer,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";

export type MaintainedRow = {
  employee_id: string;
  attendance_date: string;
  attendance_status: string | null;
  late_minutes: number | null;
  early_leave_minutes: number | null;
  overtime_hours: number | null;
};

export type DailyRow = {
  employee_id: string;
  attendance_date: string;
  net_work_minutes: number | null;
  late_by_minutes: number | null;
  is_late: boolean | null;
  early_departure: boolean | null;
  punch_count: number | null;
  session_count: number | null;
  status: string | null;
};

export type SummaryLite = {
  employee_id: string;
  working_days: number;
  present_days: number;
  half_days: number;
  paid_leave_days: number;
  lop_days: number;
  no_biometric_signal: boolean;
};

type Props = {
  month: string; // YYYY-MM
  summary: SummaryLite[];
  maintained: MaintainedRow[];
  maintainedPrev: MaintainedRow[];
  daily: DailyRow[];
  employees: any[];
  deptByEmployee: Map<string, string>;
  shiftMinutesByEmployee: Map<string, number>;
};

const isPresentStatus = (s: string | null) => {
  const v = (s || "").toLowerCase();
  return v === "present" || v === "late";
};
const isAbsentStatus = (s: string | null) => (s || "").toLowerCase() === "absent";
const isHalfStatus = (s: string | null) => (s || "").toLowerCase() === "half_day";

const nameOf = (e: any) => `${e?.first_name || ""} ${e?.last_name || ""}`.trim() || "Unknown";
const shortName = (e: any) => `${(e?.first_name || "?")[0]}. ${e?.last_name || ""}`.trim();

function Delta({ value, unit = "pt", invert = false }: { value: number | null; unit?: string; invert?: boolean }) {
  if (value === null || !isFinite(value)) return <span className="text-[11px] text-muted-foreground">no prior data</span>;
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 0.1) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Minus className="h-3 w-3" /> flat vs last month
      </span>
    );
  }
  const good = invert ? rounded < 0 : rounded > 0;
  const Icon = rounded > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${good ? "text-success" : "text-destructive"}`}>
      <Icon className="h-3 w-3" />
      {rounded > 0 ? "+" : ""}
      {rounded}
      {unit} vs last month
    </span>
  );
}

export function AttendanceInsights({
  month,
  summary,
  maintained,
  maintainedPrev,
  daily,
  employees,
  deptByEmployee,
  shiftMinutesByEmployee,
}: Props) {
  const empById = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  /* ---------------- coverage / integrity ---------------- */
  const coverage = useMemo(() => {
    const expected = summary.reduce((a, s) => a + Number(s.working_days || 0), 0);
    const maintainedDays = maintained.length;
    const pct = expected > 0 ? Math.min(100, (maintainedDays / expected) * 100) : 0;

    // dates where maintained rows are materially below the day's punch-evidence headcount
    const maintainedByDate = new Map<string, number>();
    for (const r of maintained) maintainedByDate.set(r.attendance_date, (maintainedByDate.get(r.attendance_date) || 0) + 1);
    const evidenceByDate = new Map<string, number>();
    for (const d of daily) {
      if (Number(d.punch_count || 0) > 0 || Number(d.session_count || 0) > 0) {
        evidenceByDate.set(d.attendance_date, (evidenceByDate.get(d.attendance_date) || 0) + 1);
      }
    }
    const gapDates: { date: string; missing: number }[] = [];
    for (const [date, ev] of evidenceByDate) {
      const got = maintainedByDate.get(date) || 0;
      if (ev - got > 0) gapDates.push({ date, missing: ev - got });
    }
    gapDates.sort((a, b) => a.date.localeCompare(b.date));
    return { expected, maintainedDays, pct, gapDates };
  }, [summary, maintained, daily]);

  /* ---------------- window metrics (current vs prior, same elapsed length) ---------------- */
  const windowMetrics = (rows: MaintainedRow[]) => {
    const total = rows.length;
    const present = rows.filter((r) => isPresentStatus(r.attendance_status)).length;
    const half = rows.filter((r) => isHalfStatus(r.attendance_status)).length;
    const absent = rows.filter((r) => isAbsentStatus(r.attendance_status)).length;
    const worked = present + half;
    const lateRows = rows.filter((r) => Number(r.late_minutes || 0) > 0);
    const lateMinutes = lateRows.reduce((a, r) => a + Number(r.late_minutes || 0), 0);
    return {
      total,
      present,
      half,
      absent,
      worked,
      attendanceRate: total > 0 ? (present + half * 0.5) * (100 / total) : 0,
      onTimeRate: worked > 0 ? ((worked - lateRows.length) / worked) * 100 : 0,
      avgLateWhenLate: lateRows.length > 0 ? lateMinutes / lateRows.length : 0,
      lateDays: lateRows.length,
    };
  };

  const cur = useMemo(() => windowMetrics(maintained), [maintained]);
  const prev = useMemo(() => windowMetrics(maintainedPrev), [maintainedPrev]);

  /* ---------------- hours ---------------- */
  const hours = useMemo(() => {
    const workedDays = daily.filter((d) => Number(d.net_work_minutes || 0) > 0);
    const totalMin = workedDays.reduce((a, d) => a + Number(d.net_work_minutes || 0), 0);
    const avgMin = workedDays.length > 0 ? totalMin / workedDays.length : 0;
    let shortDays = 0;
    let measurable = 0;
    for (const d of workedDays) {
      const sched = shiftMinutesByEmployee.get(d.employee_id);
      if (!sched) continue;
      measurable++;
      if (Number(d.net_work_minutes || 0) < sched * 0.9) shortDays++;
    }
    return {
      avgHours: avgMin / 60,
      workedDays: workedDays.length,
      shortPct: measurable > 0 ? (shortDays / measurable) * 100 : null,
      measurable,
    };
  }, [daily, shiftMinutesByEmployee]);

  /* ---------------- per-employee rollup ---------------- */
  const perEmployee = useMemo(() => {
    const map = new Map<
      string,
      { maintained: number; present: number; half: number; absent: number; lateDays: number; lateMin: number; netMin: number; workedDays: number }
    >();
    const ensure = (id: string) => {
      if (!map.has(id)) map.set(id, { maintained: 0, present: 0, half: 0, absent: 0, lateDays: 0, lateMin: 0, netMin: 0, workedDays: 0 });
      return map.get(id)!;
    };
    for (const r of maintained) {
      const e = ensure(r.employee_id);
      e.maintained++;
      if (isPresentStatus(r.attendance_status)) e.present++;
      if (isHalfStatus(r.attendance_status)) e.half++;
      if (isAbsentStatus(r.attendance_status)) e.absent++;
      if (Number(r.late_minutes || 0) > 0) {
        e.lateDays++;
        e.lateMin += Number(r.late_minutes || 0);
      }
    }
    for (const d of daily) {
      const e = ensure(d.employee_id);
      if (Number(d.net_work_minutes || 0) > 0) {
        e.workedDays++;
        e.netMin += Number(d.net_work_minutes || 0);
      }
    }
    return map;
  }, [maintained, daily]);

  /* ---------------- review list ---------------- */
  const review = useMemo(() => {
    const out: { id: string; name: string; reasons: string[]; lossPct: number; latePct: number }[] = [];
    for (const s of summary) {
      const stat = perEmployee.get(s.employee_id);
      const wd = Number(s.working_days || 0);
      const lost = Number(s.lop_days || 0);
      const lossPct = wd > 0 ? (lost / wd) * 100 : 0;
      const workedM = stat ? stat.present + stat.half : 0;
      const latePct = workedM > 0 ? ((stat?.lateDays || 0) / workedM) * 100 : 0;
      const reasons: string[] = [];
      if (lossPct >= 10 && lost > 0) reasons.push(`${lost} day(s) lost (${lossPct.toFixed(0)}%)`);
      if (latePct >= 30 && (stat?.lateDays || 0) > 0) reasons.push(`late on ${stat!.lateDays}/${workedM} days`);
      if (reasons.length) {
        out.push({ id: s.employee_id, name: nameOf(empById.get(s.employee_id)), reasons, lossPct, latePct });
      }
    }
    return out.sort((a, b) => b.lossPct + b.latePct - (a.lossPct + a.latePct));
  }, [summary, perEmployee, empById]);

  /* ---------------- daily trend ---------------- */
  const trend = useMemo(() => {
    const byDate = new Map<string, { present: number; half: number; total: number; late: number }>();
    for (const r of maintained) {
      if (!byDate.has(r.attendance_date)) byDate.set(r.attendance_date, { present: 0, half: 0, total: 0, late: 0 });
      const b = byDate.get(r.attendance_date)!;
      b.total++;
      if (isPresentStatus(r.attendance_status)) b.present++;
      if (isHalfStatus(r.attendance_status)) b.half++;
      if (Number(r.late_minutes || 0) > 0) b.late++;
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, b]) => ({
        day: date.slice(8),
        date,
        rate: b.total > 0 ? Math.round(((b.present + b.half * 0.5) / b.total) * 1000) / 10 : 0,
        late: b.late,
        maintained: b.total,
      }));
  }, [maintained]);

  /* ---------------- punctuality buckets ---------------- */
  const buckets = useMemo(() => {
    const b = [
      { name: "On time", days: 0 },
      { name: "1-15 min", days: 0 },
      { name: "16-30 min", days: 0 },
      { name: "31-60 min", days: 0 },
      { name: "60+ min", days: 0 },
    ];
    for (const r of maintained) {
      if (!isPresentStatus(r.attendance_status) && !isHalfStatus(r.attendance_status)) continue;
      const m = Number(r.late_minutes || 0);
      if (m <= 0) b[0].days++;
      else if (m <= 15) b[1].days++;
      else if (m <= 30) b[2].days++;
      else if (m <= 60) b[3].days++;
      else b[4].days++;
    }
    return b;
  }, [maintained]);

  const latenessSplit = useMemo(() => {
    const chronic: { name: string; lateDays: number; worked: number; avg: number }[] = [];
    const occasional: { name: string; lateDays: number; worked: number; avg: number }[] = [];
    for (const [id, s] of perEmployee) {
      const worked = s.present + s.half;
      if (worked === 0 || s.lateDays === 0) continue;
      const rec = { name: nameOf(empById.get(id)), lateDays: s.lateDays, worked, avg: s.lateMin / s.lateDays };
      if (s.lateDays / worked >= 0.5) chronic.push(rec);
      else occasional.push(rec);
    }
    chronic.sort((a, b) => b.lateDays - a.lateDays);
    occasional.sort((a, b) => b.lateDays - a.lateDays);
    return { chronic, occasional };
  }, [perEmployee, empById]);

  /* ---------------- weekday pattern ---------------- */
  const weekday = useMemo(() => {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const acc = labels.map((l) => ({ name: l, total: 0, lost: 0, late: 0 }));
    for (const r of maintained) {
      const dow = new Date(`${r.attendance_date}T00:00:00`).getDay();
      const a = acc[dow];
      a.total++;
      if (isAbsentStatus(r.attendance_status)) a.lost++;
      if (isHalfStatus(r.attendance_status)) a.lost += 0.5;
      if (Number(r.late_minutes || 0) > 0) a.late++;
    }
    return acc
      .filter((a) => a.total > 0)
      .map((a) => ({
        name: a.name,
        absence: Math.round((a.lost / a.total) * 1000) / 10,
        late: Math.round((a.late / a.total) * 1000) / 10,
      }));
  }, [maintained]);

  /* ---------------- departments ---------------- */
  const deptRows = useMemo(() => {
    const acc = new Map<string, { headcount: number; total: number; present: number; half: number; lateDays: number; lop: number; netMin: number; workedDays: number }>();
    const ensure = (d: string) => {
      if (!acc.has(d)) acc.set(d, { headcount: 0, total: 0, present: 0, half: 0, lateDays: 0, lop: 0, netMin: 0, workedDays: 0 });
      return acc.get(d)!;
    };
    for (const s of summary) {
      const dept = deptByEmployee.get(s.employee_id) || "Unassigned";
      const a = ensure(dept);
      a.headcount++;
      a.lop += Number(s.lop_days || 0);
      const st = perEmployee.get(s.employee_id);
      if (st) {
        a.total += st.maintained;
        a.present += st.present;
        a.half += st.half;
        a.lateDays += st.lateDays;
        a.netMin += st.netMin;
        a.workedDays += st.workedDays;
      }
    }
    return [...acc.entries()]
      .map(([name, a]) => ({
        name,
        headcount: a.headcount,
        attendanceRate: a.total > 0 ? ((a.present + a.half * 0.5) / a.total) * 100 : null,
        onTimeRate: a.present + a.half > 0 ? ((a.present + a.half - a.lateDays) / (a.present + a.half)) * 100 : null,
        lop: a.lop,
        avgHours: a.workedDays > 0 ? a.netMin / a.workedDays / 60 : null,
      }))
      .sort((a, b) => (a.attendanceRate ?? 999) - (b.attendanceRate ?? 999));
  }, [summary, perEmployee, deptByEmployee]);

  /* ---------------- exceptions ---------------- */
  const exceptions = useMemo(() => {
    const maintainedKeys = new Set(maintained.map((r) => `${r.employee_id}|${r.attendance_date}`));
    const noSignal = summary.filter((s) => s.no_biometric_signal).map((s) => nameOf(empById.get(s.employee_id)));

    const unmaintained = new Map<string, number>();
    const singlePunch = new Map<string, number>();
    const longDays = new Map<string, number>();
    const microDays = new Map<string, number>();
    for (const d of daily) {
      const hasEvidence = Number(d.punch_count || 0) > 0 || Number(d.session_count || 0) > 0;
      if (hasEvidence && !maintainedKeys.has(`${d.employee_id}|${d.attendance_date}`)) {
        unmaintained.set(d.employee_id, (unmaintained.get(d.employee_id) || 0) + 1);
      }
      if (Number(d.punch_count || 0) === 1) singlePunch.set(d.employee_id, (singlePunch.get(d.employee_id) || 0) + 1);
      const net = Number(d.net_work_minutes || 0);
      if (net > 14 * 60) longDays.set(d.employee_id, (longDays.get(d.employee_id) || 0) + 1);
      if (net > 0 && net < 120) microDays.set(d.employee_id, (microDays.get(d.employee_id) || 0) + 1);
    }
    const toList = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([id, n]) => ({ name: nameOf(empById.get(id)), n }))
        .sort((a, b) => b.n - a.n);

    return [
      { key: "no-signal", label: "No biometric signal this month", detail: noSignal.map((n) => ({ name: n, n: 0 })) },
      { key: "unmaintained", label: "Punches recorded but no maintained attendance row", detail: toList(unmaintained) },
      { key: "single", label: "Single-punch days (missing punch-out)", detail: toList(singlePunch) },
      { key: "long", label: "Days over 14 net hours", detail: toList(longDays) },
      { key: "micro", label: "Days under 2 net hours", detail: toList(microDays) },
    ].filter((x) => x.detail.length > 0);
  }, [daily, maintained, summary, empById]);

  /* ---------------- day distribution ---------------- */
  const distribution = useMemo(() => {
    const present = summary.reduce((a, s) => a + Number(s.present_days || 0), 0);
    const paid = summary.reduce((a, s) => a + Number(s.paid_leave_days || 0), 0);
    const half = summary.reduce((a, s) => a + Number(s.half_days || 0), 0);
    const lop = summary.reduce((a, s) => a + Number(s.lop_days || 0), 0);
    const total = present + paid + half + lop;
    return {
      total,
      parts: [
        { name: "Present", value: present, cls: "bg-success" },
        { name: "Paid leave", value: paid, cls: "bg-info" },
        { name: "Half day", value: half, cls: "bg-warning" },
        { name: "Loss of pay", value: lop, cls: "bg-destructive" },
      ].filter((p) => p.value > 0),
    };
  }, [summary]);

  const totalWorkingDays = summary.reduce((a, s) => a + Number(s.working_days || 0), 0);
  const totalLop = summary.reduce((a, s) => a + Number(s.lop_days || 0), 0);
  const employeesWithLop = summary.filter((s) => Number(s.lop_days || 0) > 0).length;
  const lopPct = totalWorkingDays > 0 ? (totalLop / totalWorkingDays) * 100 : 0;

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* 1. Period integrity */}
      <Card className={coverage.pct < 99 ? "border-warning/40" : undefined}>
        <CardContent className="p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="font-medium">{monthLabel}</span>
            <span className="text-muted-foreground">
              Elapsed working days counted: <span className="font-semibold text-foreground tabular-nums">{Math.round(totalWorkingDays)}</span> employee-days
            </span>
            <span className="text-muted-foreground">
              Maintained rows: <span className="font-semibold text-foreground tabular-nums">{coverage.maintainedDays}</span>
            </span>
            <Badge variant={coverage.pct >= 99 ? "secondary" : "outline"} className={coverage.pct < 99 ? "border-warning text-warning" : undefined}>
              {coverage.pct.toFixed(1)}% maintained coverage
            </Badge>
          </div>
          {coverage.pct < 99 && (
            <p className="text-xs text-warning flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Attendance is not yet maintained for every elapsed working day, so the rates below are computed{" "}
                <strong>on maintained days only</strong> — a low rate here is not the same as absence.
                {coverage.gapDates.length > 0 && (
                  <>
                    {" "}Days with punch evidence but missing maintained rows:{" "}
                    {coverage.gapDates.slice(0, 8).map((g) => `${g.date.slice(5)} (${g.missing})`).join(", ")}
                    {coverage.gapDates.length > 8 ? ` +${coverage.gapDates.length - 8} more` : ""}.
                  </>
                )}
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
              <TrendingUp className="h-4 w-4 text-primary" /> Attendance rate
            </div>
            <p className="text-2xl font-bold tabular-nums">{cur.attendanceRate.toFixed(1)}%</p>
            <Delta value={prev.total > 0 ? cur.attendanceRate - prev.attendanceRate : null} />
            <p className="text-[11px] text-muted-foreground">on {cur.total} maintained days</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
              <ShieldAlert className="h-4 w-4 text-destructive" /> Loss-of-pay exposure
            </div>
            <p className="text-2xl font-bold tabular-nums">{lopPct.toFixed(1)}%</p>
            <p className="text-[11px] text-muted-foreground">
              {Math.round(totalLop * 10) / 10} unpaid day(s) of {Math.round(totalWorkingDays)} payable
            </p>
            <p className="text-[11px] text-muted-foreground">{employeesWithLop} employee(s) affected</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
              <Clock className="h-4 w-4 text-warning" /> On-time rate
            </div>
            <p className="text-2xl font-bold tabular-nums">{cur.onTimeRate.toFixed(1)}%</p>
            <Delta value={prev.worked > 0 ? cur.onTimeRate - prev.onTimeRate : null} />
            <p className="text-[11px] text-muted-foreground">
              avg {Math.round(cur.avgLateWhenLate)} min late when late · {cur.lateDays} late day(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
              <Timer className="h-4 w-4 text-info" /> Avg net hours / worked day
            </div>
            <p className="text-2xl font-bold tabular-nums">{hours.avgHours.toFixed(2)}h</p>
            <p className="text-[11px] text-muted-foreground">
              {hours.shortPct === null
                ? "no shift mapped — short-day share unavailable"
                : `${hours.shortPct.toFixed(0)}% of days below scheduled shift`}
            </p>
            <p className="text-[11px] text-muted-foreground">across {hours.workedDays} worked day(s)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
              <UserCheck className="h-4 w-4 text-destructive" /> Employees to review
            </div>
            <p className="text-2xl font-bold tabular-nums">{review.length}</p>
            <p className="text-[11px] text-muted-foreground">≥10% days lost or late on ≥30% of days</p>
            {review.length > 0 && (
              <p className="text-[11px] text-foreground/80 leading-tight">
                {review.slice(0, 3).map((r) => r.name).join(", ")}
                {review.length > 3 ? ` +${review.length - 3}` : ""}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {review.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 flex flex-wrap gap-2">
            {review.map((r) => (
              <span key={r.id} className="text-xs rounded-full border px-3 py-1 bg-muted/40">
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground"> — {r.reasons.join(" · ")}</span>
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 3. Daily trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Daily attendance rate & late arrivals</CardTitle>
        </CardHeader>
        <CardContent>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis yAxisId="left" fontSize={11} unit="%" domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} allowDecimals={false} />
                <Tooltip
                  formatter={(v: any, n: any) => (n === "Attendance rate" ? [`${v}%`, n] : [v, n])}
                  labelFormatter={(l: any) => `Day ${l}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="right" dataKey="late" name="Late arrivals" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="rate" name="Attendance rate" stroke="#22c55e" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8 text-sm">No maintained attendance for this month</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 4. Punctuality distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Punctuality distribution (worked days)</CardTitle>
          </CardHeader>
          <CardContent>
            {buckets.some((b) => b.days > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={buckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="days" name="Days" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">No worked days recorded</p>
            )}
          </CardContent>
        </Card>

        {/* chronic vs occasional */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Chronic vs occasional lateness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Chronic — late on at least half their worked days ({latenessSplit.chronic.length})
              </p>
              {latenessSplit.chronic.length === 0 ? (
                <p className="text-xs text-muted-foreground">None</p>
              ) : (
                <ul className="space-y-1">
                  {latenessSplit.chronic.slice(0, 8).map((c) => (
                    <li key={c.name} className="flex justify-between gap-3">
                      <span className="truncate">{c.name}</span>
                      <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                        {c.lateDays}/{c.worked} days · avg {Math.round(c.avg)}m
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Occasional ({latenessSplit.occasional.length})
              </p>
              {latenessSplit.occasional.length === 0 ? (
                <p className="text-xs text-muted-foreground">None</p>
              ) : (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {latenessSplit.occasional
                    .slice(0, 12)
                    .map((c) => `${c.name} (${c.lateDays})`)
                    .join(", ")}
                  {latenessSplit.occasional.length > 12 ? ` +${latenessSplit.occasional.length - 12} more` : ""}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 5. Weekday pattern */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Day-of-week pattern</CardTitle>
          </CardHeader>
          <CardContent>
            {weekday.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekday}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} unit="%" />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="absence" name="Days lost" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="late" name="Late" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">No data</p>
            )}
          </CardContent>
        </Card>

        {/* 8. Day distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Day distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {distribution.total > 0 ? (
              <>
                <div className="flex h-4 w-full overflow-hidden rounded-full">
                  {distribution.parts.map((p) => (
                    <div
                      key={p.name}
                      className={p.cls}
                      style={{ width: `${(p.value / distribution.total) * 100}%` }}
                      title={`${p.name}: ${Math.round(p.value * 10) / 10} days`}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {distribution.parts.map((p) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-sm ${p.cls}`} />
                      <span className="text-muted-foreground">{p.name}</span>
                      <span className="ml-auto tabular-nums font-medium">
                        {Math.round(p.value * 10) / 10} d · {((p.value / distribution.total) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 6. Department comparison */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Department comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-y">
              <tr>
                {["Department", "Headcount", "Attendance rate", "On-time rate", "LOP days", "Avg net hours"].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deptRows.map((d) => (
                <tr key={d.name} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">{d.name}</td>
                  <td className="px-4 py-2 tabular-nums">{d.headcount}</td>
                  <td className="px-4 py-2 tabular-nums">{d.attendanceRate === null ? "—" : `${d.attendanceRate.toFixed(1)}%`}</td>
                  <td className="px-4 py-2 tabular-nums">{d.onTimeRate === null ? "—" : `${d.onTimeRate.toFixed(1)}%`}</td>
                  <td className="px-4 py-2 tabular-nums text-destructive">{Math.round(d.lop * 10) / 10}</td>
                  <td className="px-4 py-2 tabular-nums">{d.avgHours === null ? "—" : `${d.avgHours.toFixed(2)}h`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 7. Exception register */}
      {exceptions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" /> Exception register
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {exceptions.map((ex) => (
              <div key={ex.key}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  {ex.label} ({ex.detail.length})
                </p>
                <p className="text-xs leading-relaxed">
                  {ex.detail
                    .slice(0, 12)
                    .map((d) => (d.n > 0 ? `${d.name} (${d.n})` : d.name))
                    .join(", ")}
                  {ex.detail.length > 12 ? ` +${ex.detail.length - 12} more` : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AttendanceInsights;
