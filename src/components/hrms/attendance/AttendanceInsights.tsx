import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  AttendanceDrilldownDialog,
  DrillBadge,
  type DrillPayload,
  type DrillRow,
} from "./AttendanceDrilldownDialog";


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
  /** Every employee that can appear in attendance data — active AND former. */
  employees: any[];
  /** Ids of the currently active roster; anyone else is tagged "inactive". */
  activeIds?: Set<string>;
  deptByEmployee: Map<string, string>;
  shiftMinutesByEmployee: Map<string, number>;
};

/** Lateness beyond this is a shift-mapping / timestamp artefact, not real lateness. */
const LATE_SANITY_MINUTES = 240;

const isPresentStatus = (s: string | null) => {
  const v = (s || "").toLowerCase();
  return v === "present" || v === "late";
};
const isAbsentStatus = (s: string | null) => (s || "").toLowerCase() === "absent";
const isHalfStatus = (s: string | null) => (s || "").toLowerCase() === "half_day";

const fmtMinutes = (m: number) => {
  const v = Math.round(m);
  if (v < 60) return `${v}m`;
  const h = Math.floor(v / 60);
  const rem = v % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
};

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

function Kpi({
  icon: Icon,
  iconClass,
  label,
  value,
  children,
}: {
  icon: any;
  iconClass: string;
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className={`h-3.5 w-3.5 ${iconClass}`} /> {label}
        </div>
        <p className="mt-2 text-3xl font-semibold tabular-nums leading-none text-foreground">{value}</p>
        <div className="mt-2 space-y-0.5">{children}</div>
      </CardContent>
    </Card>
  );
}

function SectionCard({
  title,
  caption,
  children,
  className,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
        {caption && <p className="text-xs text-muted-foreground font-normal">{caption}</p>}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

const axisProps = {
  fontSize: 11,
  stroke: "hsl(var(--muted-foreground))",
  tickLine: false,
  axisLine: { stroke: "hsl(var(--border))" },
} as const;

const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
    color: "hsl(var(--popover-foreground))",
  },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 600 },
} as const;

export function AttendanceInsights({
  month,
  summary,
  maintained,
  maintainedPrev,
  daily,
  employees,
  activeIds,
  deptByEmployee,
  shiftMinutesByEmployee,
}: Props) {
  const [showAllPeople, setShowAllPeople] = useState(false);

  const empById = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  /** Never renders "Unknown": falls back to badge id, then a short id stub. */
  const nameOf = useMemo(
    () => (id: string) => {
      const e = empById.get(id);
      const n = `${e?.first_name || ""} ${e?.last_name || ""}`.trim();
      if (n) return n;
      if (e?.badge_id) return String(e.badge_id);
      return `Employee ${String(id).slice(0, 8)}`;
    },
    [empById],
  );

  const isInactive = useMemo(
    () => (id: string) => {
      if (activeIds && activeIds.size > 0) return !activeIds.has(id);
      const e = empById.get(id);
      return e ? e.is_active === false : false;
    },
    [activeIds, empById],
  );

  const Person = ({ id, className }: { id: string; className?: string }) => (
    <span className={`inline-flex items-center gap-1.5 ${className || ""}`}>
      <span className="truncate">{nameOf(id)}</span>
      {isInactive(id) && (
        <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal text-muted-foreground border-muted-foreground/30">
          inactive
        </Badge>
      )}
    </span>
  );

  /* ---------------- coverage / integrity ---------------- */
  const coverage = useMemo(() => {
    const expected = summary.reduce((a, s) => a + Number(s.working_days || 0), 0);
    const maintainedDays = maintained.length;
    const pct = expected > 0 ? Math.min(100, (maintainedDays / expected) * 100) : 0;

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
    // implausible lateness is still a late day, but it must not poison the average
    const saneLate = lateRows.filter((r) => Number(r.late_minutes || 0) <= LATE_SANITY_MINUTES);
    const saneMinutes = saneLate.reduce((a, r) => a + Number(r.late_minutes || 0), 0);
    return {
      total,
      present,
      half,
      absent,
      worked,
      attendanceRate: total > 0 ? (present + half * 0.5) * (100 / total) : 0,
      onTimeRate: worked > 0 ? ((worked - lateRows.length) / worked) * 100 : 0,
      avgLateWhenLate: saneLate.length > 0 ? saneMinutes / saneLate.length : 0,
      lateDays: lateRows.length,
      implausibleLateDays: lateRows.length - saneLate.length,
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
      {
        maintained: number;
        present: number;
        half: number;
        absent: number;
        lateDays: number;
        saneLateDays: number;
        saneLateMin: number;
        implausibleLateDays: number;
        netMin: number;
        workedDays: number;
      }
    >();
    const ensure = (id: string) => {
      if (!map.has(id))
        map.set(id, {
          maintained: 0,
          present: 0,
          half: 0,
          absent: 0,
          lateDays: 0,
          saneLateDays: 0,
          saneLateMin: 0,
          implausibleLateDays: 0,
          netMin: 0,
          workedDays: 0,
        });
      return map.get(id)!;
    };
    for (const r of maintained) {
      const e = ensure(r.employee_id);
      e.maintained++;
      if (isPresentStatus(r.attendance_status)) e.present++;
      if (isHalfStatus(r.attendance_status)) e.half++;
      if (isAbsentStatus(r.attendance_status)) e.absent++;
      const late = Number(r.late_minutes || 0);
      if (late > 0) {
        e.lateDays++;
        if (late <= LATE_SANITY_MINUTES) {
          e.saneLateDays++;
          e.saneLateMin += late;
        } else {
          e.implausibleLateDays++;
        }
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

  /* ---------------- unified people table (attention + lateness in one ranked list) ---- */
  const people = useMemo(() => {
    const lopById = new Map<string, { lop: number; working: number }>();
    for (const s of summary) {
      lopById.set(s.employee_id, { lop: Number(s.lop_days || 0), working: Number(s.working_days || 0) });
    }
    const ids = new Set<string>([...lopById.keys(), ...perEmployee.keys()]);
    const rows = [...ids].map((id) => {
      const stat = perEmployee.get(id);
      const sm = lopById.get(id) || { lop: 0, working: 0 };
      const worked = stat ? stat.present + stat.half : 0;
      const lossPct = sm.working > 0 ? (sm.lop / sm.working) * 100 : 0;
      const latePct = worked > 0 ? ((stat?.lateDays || 0) / worked) * 100 : 0;
      const flags: string[] = [];
      if (lossPct >= 10 && sm.lop > 0) flags.push("loss of pay");
      if (latePct >= 50 && (stat?.lateDays || 0) > 0) flags.push("chronic lateness");
      else if (latePct >= 30 && (stat?.lateDays || 0) > 0) flags.push("frequent lateness");
      return {
        id,
        dept: deptByEmployee.get(id) || "Unassigned",
        working: sm.working,
        lop: sm.lop,
        lossPct,
        lateDays: stat?.lateDays || 0,
        worked,
        latePct,
        avgLate: stat && stat.saneLateDays > 0 ? stat.saneLateMin / stat.saneLateDays : null,
        implausible: stat?.implausibleLateDays || 0,
        avgHours: stat && stat.workedDays > 0 ? stat.netMin / stat.workedDays / 60 : null,
        flags,
        score: lossPct * 2 + latePct,
      };
    });
    return rows.filter((r) => r.flags.length > 0 || r.lop > 0 || r.lateDays > 0).sort((a, b) => b.score - a.score);
  }, [summary, perEmployee, deptByEmployee]);

  const reviewCount = people.filter((p) => p.flags.length > 0).length;

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
        label: new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
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
      { name: "1-4 h", days: 0 },
      { name: "Suspect", days: 0 },
    ];
    for (const r of maintained) {
      if (!isPresentStatus(r.attendance_status) && !isHalfStatus(r.attendance_status)) continue;
      const m = Number(r.late_minutes || 0);
      if (m <= 0) b[0].days++;
      else if (m <= 15) b[1].days++;
      else if (m <= 30) b[2].days++;
      else if (m <= 60) b[3].days++;
      else if (m <= LATE_SANITY_MINUTES) b[4].days++;
      else b[5].days++;
    }
    return b;
  }, [maintained]);

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
    const acc = new Map<
      string,
      { headcount: number; total: number; present: number; half: number; lateDays: number; lop: number; netMin: number; workedDays: number }
    >();
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
    const noSignal = summary.filter((s) => s.no_biometric_signal).map((s) => ({ id: s.employee_id, n: 0 }));

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
    const implausible = new Map<string, number>();
    for (const [id, s] of perEmployee) if (s.implausibleLateDays > 0) implausible.set(id, s.implausibleLateDays);

    const toList = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([id, n]) => ({ id, n }))
        .sort((a, b) => b.n - a.n);

    return [
      {
        key: "no-signal",
        label: "No biometric signal this month",
        hint: "Enrolment or device mapping is missing — payroll treats these days as held harmless.",
        detail: noSignal,
      },
      {
        key: "unmaintained",
        label: "Punches recorded but no maintained attendance row",
        hint: "The person was at work but the day was never finalised — fix before payroll lock.",
        detail: toList(unmaintained),
      },
      {
        key: "single",
        label: "Single-punch days (missing punch-out)",
        hint: "Hours cannot be computed for these days.",
        detail: toList(singlePunch),
      },
      {
        key: "implausible",
        label: `Implausible late minutes (over ${LATE_SANITY_MINUTES / 60}h)`,
        hint: "Almost always a shift-mapping or night-shift timestamp issue, not real lateness. Excluded from the average-late figure.",
        detail: toList(implausible),
      },
      { key: "long", label: "Days over 14 net hours", hint: "Check for an unresolved session or a duplicate punch pair.", detail: toList(longDays) },
      { key: "micro", label: "Days under 2 net hours", hint: "Short attendance that still counts as a worked day.", detail: toList(microDays) },
    ].filter((x) => x.detail.length > 0);
  }, [daily, maintained, summary, perEmployee]);

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
  const visiblePeople = showAllPeople ? people : people.slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Period integrity */}
      <Card className={coverage.pct < 99 ? "border-warning/40 bg-warning/[0.03]" : undefined}>
        <CardContent className="p-3.5 space-y-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
            <span className="font-semibold text-foreground">{monthLabel}</span>
            <span className="text-muted-foreground">
              Elapsed working days <span className="font-semibold text-foreground tabular-nums">{Math.round(totalWorkingDays)}</span>
            </span>
            <span className="text-muted-foreground">
              Maintained rows <span className="font-semibold text-foreground tabular-nums">{coverage.maintainedDays}</span>
            </span>
            <Badge
              variant={coverage.pct >= 99 ? "secondary" : "outline"}
              className={coverage.pct < 99 ? "border-warning text-warning" : undefined}
            >
              {coverage.pct.toFixed(1)}% coverage
            </Badge>
          </div>
          {coverage.pct < 99 && (
            <p className="text-[11px] text-warning flex items-start gap-2 leading-relaxed">
              <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
              <span>
                Attendance is not maintained for every elapsed working day, so rates below are computed{" "}
                <strong>on maintained days only</strong> — a low rate here is not the same as absence.
                {coverage.gapDates.length > 0 && (
                  <>
                    {" "}Days with punch evidence but no maintained row:{" "}
                    {coverage.gapDates.slice(0, 8).map((g) => `${g.date.slice(5)} (${g.missing})`).join(", ")}
                    {coverage.gapDates.length > 8 ? ` +${coverage.gapDates.length - 8} more` : ""}.
                  </>
                )}
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi icon={TrendingUp} iconClass="text-primary" label="Attendance rate" value={`${cur.attendanceRate.toFixed(1)}%`}>
          <Delta value={prev.total > 0 ? cur.attendanceRate - prev.attendanceRate : null} />
          <p className="text-[11px] text-muted-foreground">on {cur.total} maintained days</p>
        </Kpi>

        <Kpi icon={ShieldAlert} iconClass="text-destructive" label="Loss-of-pay exposure" value={`${lopPct.toFixed(1)}%`}>
          <p className="text-[11px] text-muted-foreground">
            {Math.round(totalLop * 10) / 10} unpaid of {Math.round(totalWorkingDays)} payable days
          </p>
          <p className="text-[11px] text-muted-foreground">{employeesWithLop} employee(s) affected</p>
        </Kpi>

        <Kpi icon={Clock} iconClass="text-warning" label="On-time rate" value={`${cur.onTimeRate.toFixed(1)}%`}>
          <Delta value={prev.worked > 0 ? cur.onTimeRate - prev.onTimeRate : null} />
          <p className="text-[11px] text-muted-foreground">
            avg {fmtMinutes(cur.avgLateWhenLate)} late when late · {cur.lateDays} late day(s)
          </p>
        </Kpi>

        <Kpi icon={Timer} iconClass="text-info" label="Avg net hours / day" value={`${hours.avgHours.toFixed(2)}h`}>
          <p className="text-[11px] text-muted-foreground">
            {hours.shortPct === null ? "no shift mapped" : `${hours.shortPct.toFixed(0)}% of days below scheduled shift`}
          </p>
          <p className="text-[11px] text-muted-foreground">across {hours.workedDays} worked day(s)</p>
        </Kpi>

        <Kpi icon={UserCheck} iconClass="text-destructive" label="Employees to review" value={String(reviewCount)}>
          <p className="text-[11px] text-muted-foreground">≥10% days lost, or late on ≥30% of days</p>
          <p className="text-[11px] text-muted-foreground">see the People tab for the ranked list</p>
        </Kpi>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-flex">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="people">
            People{reviewCount > 0 ? ` (${reviewCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
          <TabsTrigger value="exceptions">
            Exceptions{exceptions.length > 0 ? ` (${exceptions.length})` : ""}
          </TabsTrigger>
        </TabsList>

        {/* ---------------- Overview ---------------- */}
        <TabsContent value="overview" className="space-y-4 mt-0">
          <SectionCard
            title="Daily attendance rate & late arrivals"
            caption="How the roster showed up each day — the line is the attendance rate, the bars count late arrivals."
          >
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={trend} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" {...axisProps} />
                  <YAxis yAxisId="left" unit="%" domain={[0, 100]} {...axisProps} />
                  <YAxis yAxisId="right" orientation="right" allowDecimals={false} {...axisProps} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: any, n: any) => (n === "Attendance rate" ? [`${v}%`, n] : [`${v} people`, n])}
                    labelFormatter={(l: any) => trend.find((t) => t.day === l)?.label || `Day ${l}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="right" dataKey="late" name="Late arrivals" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="rate"
                    name="Attendance rate"
                    stroke="hsl(var(--success))"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-10 text-sm">No maintained attendance for this month</p>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard
              title="Punctuality distribution"
              caption="Worked days grouped by how late the first punch was. 'Suspect' is beyond 4 hours — treated as a data issue."
            >
              {buckets.some((b) => b.days > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={buckets} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" {...axisProps} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip {...tooltipStyle} formatter={(v: any) => [`${v} day(s)`, "Worked days"]} />
                    <Bar dataKey="days" name="Days" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-10 text-sm">No worked days recorded</p>
              )}
            </SectionCard>

            <SectionCard title="Day mix" caption="Every payable employee-day in the month, split by how payroll will treat it.">
              {distribution.total > 0 ? (
                <div className="space-y-3">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                    {distribution.parts.map((p) => (
                      <div key={p.name} className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-sm ${p.cls}`} />
                        <span className="text-muted-foreground">{p.name}</span>
                        <span className="ml-auto tabular-nums font-medium text-foreground">
                          {Math.round(p.value * 10) / 10} d · {((p.value / distribution.total) * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-10 text-sm">No data</p>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* ---------------- People ---------------- */}
        <TabsContent value="people" className="space-y-4 mt-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-foreground">Employees ranked by attendance risk</CardTitle>
              <p className="text-xs text-muted-foreground font-normal">
                Anyone with lost days or late arrivals this month, worst first. Flags mark the people who need an HR conversation.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {people.length === 0 ? (
                <p className="text-center text-muted-foreground py-10 text-sm">No lost days or late arrivals this month</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-y">
                        <tr>
                          {["Employee", "Department", "Days lost", "Late days", "Avg late", "Avg hours", "Flags"].map((h, i) => (
                            <th
                              key={h}
                              className={`px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap ${
                                i >= 2 && i <= 5 ? "text-right" : "text-left"
                              }`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visiblePeople.map((p) => (
                          <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                            <td className="px-4 py-2 font-medium max-w-[220px]">
                              <Person id={p.id} />
                            </td>
                            <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{p.dept}</td>
                            <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                              {p.lop > 0 ? (
                                <span className="text-destructive font-medium">
                                  {Math.round(p.lop * 10) / 10}
                                  <span className="text-muted-foreground font-normal"> / {Math.round(p.working)}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                              {p.lateDays > 0 ? (
                                <>
                                  {p.lateDays}
                                  <span className="text-muted-foreground"> / {p.worked}</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                              {p.avgLate === null ? <span className="text-muted-foreground">—</span> : fmtMinutes(p.avgLate)}
                              {p.implausible > 0 && (
                                <AlertTriangle className="inline h-3 w-3 ml-1 text-warning" aria-label="implausible late minutes present" />
                              )}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                              {p.avgHours === null ? <span className="text-muted-foreground">—</span> : `${p.avgHours.toFixed(2)}h`}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex flex-wrap gap-1">
                                {p.flags.length === 0 ? (
                                  <span className="text-muted-foreground text-xs">—</span>
                                ) : (
                                  p.flags.map((f) => (
                                    <Badge
                                      key={f}
                                      variant="outline"
                                      className={
                                        f === "loss of pay"
                                          ? "border-destructive/40 text-destructive text-[10px] font-normal"
                                          : "border-warning/40 text-warning text-[10px] font-normal"
                                      }
                                    >
                                      {f}
                                    </Badge>
                                  ))
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {people.length > 10 && (
                    <div className="p-3 border-t flex justify-center">
                      <Button variant="ghost" size="sm" onClick={() => setShowAllPeople((v) => !v)}>
                        {showAllPeople ? "Show top 10 only" : `Show all ${people.length} employees`}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Patterns ---------------- */}
        <TabsContent value="patterns" className="space-y-4 mt-0">
          <SectionCard
            title="Day-of-week pattern"
            caption="Share of maintained days lost or late, by weekday — useful for spotting Monday/Saturday drift."
          >
            {weekday.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekday} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis unit="%" {...axisProps} />
                  <Tooltip {...tooltipStyle} formatter={(v: any, n: any) => [`${v}%`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="absence" name="Days lost" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="late" name="Late" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-10 text-sm">No data</p>
            )}
          </SectionCard>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-foreground">Department comparison</CardTitle>
              <p className="text-xs text-muted-foreground font-normal">Weakest attendance first. Rates use maintained days only.</p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-y">
                  <tr>
                    {["Department", "Headcount", "Attendance rate", "On-time rate", "LOP days", "Avg net hours"].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap ${
                          i === 0 ? "text-left" : "text-right"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deptRows.map((d) => (
                    <tr key={d.name} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2 font-medium">{d.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{d.headcount}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {d.attendanceRate === null ? "—" : `${d.attendanceRate.toFixed(1)}%`}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{d.onTimeRate === null ? "—" : `${d.onTimeRate.toFixed(1)}%`}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-destructive">{Math.round(d.lop * 10) / 10}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{d.avgHours === null ? "—" : `${d.avgHours.toFixed(2)}h`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Exceptions ---------------- */}
        <TabsContent value="exceptions" className="space-y-4 mt-0">
          {exceptions.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">No exceptions this month.</CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <Users className="h-4 w-4" /> Exception register
                </CardTitle>
                <p className="text-xs text-muted-foreground font-normal">Days that need a human decision before the period is locked.</p>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {exceptions.map((ex) => (
                  <ExceptionBlock key={ex.key} ex={ex} Person={Person} />
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExceptionBlock({
  ex,
  Person,
}: {
  ex: { key: string; label: string; hint: string; detail: { id: string; n: number }[] };
  Person: (p: { id: string; className?: string }) => JSX.Element;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? ex.detail : ex.detail.slice(0, 8);
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-foreground">
            {ex.label} <span className="text-muted-foreground font-normal">({ex.detail.length})</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{ex.hint}</p>
        </div>
        {ex.detail.length > 8 && (
          <Button variant="ghost" size="sm" className="h-6 text-[11px] shrink-0" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : `+${ex.detail.length - 8} more`}
          </Button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shown.map((d) => (
          <span key={d.id} className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px]">
            <Person id={d.id} />
            {d.n > 0 && <span className="text-muted-foreground tabular-nums">· {d.n}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

export default AttendanceInsights;
