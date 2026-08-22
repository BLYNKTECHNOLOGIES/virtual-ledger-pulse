import { Fragment, useMemo, useState } from "react";
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
  ChevronDown,
  ChevronRight,
  Clock,
  Info,
  Minus,
  ShieldAlert,
  Timer,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AttendanceDrilldownDialog,
  DrillBadge,
  type DrillPayload,
  type DrillRow,
} from "./AttendanceDrilldownDialog";
import {
  ExceptionEvidenceDialog,
  type EvidenceCell,
  type EvidencePayload,
  type EvidenceRow,
} from "./ExceptionEvidenceDialog";


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
  first_in?: string | null;
  last_out?: string | null;
  early_by_minutes?: number | null;
  break_minutes?: number | null;
  suppressed_count?: number | null;
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
  /** Optional shift label per employee — enables the shift breakdown under each department. */
  shiftNameByEmployee?: Map<string, string>;
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

function InfoDot({ text }: { text: string }) {
  return (
    <UITooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="What this means" className="text-muted-foreground/60 hover:text-foreground transition-colors">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
    </UITooltip>
  );
}

/** Thin horizontal meter — replaces a sentence with a shape. */
function Meter({ pct, tone = "primary" }: { pct: number; tone?: "primary" | "success" | "warning" | "destructive" | "info" }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const bg = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
    info: "bg-info",
  }[tone];
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" role="presentation">
      <div className={`h-full rounded-full ${bg}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function Kpi({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
  pct,
  tone = "primary",
  emphasis = "neutral",
  children,
}: {
  icon: any;
  iconClass: string;
  label: string;
  value: string;
  hint?: string;
  pct?: number | null;
  tone?: "primary" | "success" | "warning" | "destructive" | "info";
  /** "alert" tints the whole card, "accent" adds a leading rail. */
  emphasis?: "neutral" | "alert" | "accent";
  children?: React.ReactNode;
}) {
  const shell =
    emphasis === "alert"
      ? "border-destructive/25 bg-destructive/[0.04]"
      : emphasis === "accent"
        ? "border-l-4 border-l-primary"
        : "";
  const labelTone = emphasis === "alert" ? "text-destructive" : "text-muted-foreground";
  const valueTone = emphasis === "alert" ? "text-destructive" : "text-foreground";
  return (
    <Card className={`overflow-hidden ${shell}`}>
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider ${labelTone}`}>
          <span className="truncate">{label}</span>
          <span className="ml-auto flex items-center gap-1.5">
            <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
            {hint && <InfoDot text={hint} />}
          </span>
        </div>
        <p className={`mt-2.5 text-[26px] font-bold tabular-nums leading-none ${valueTone}`}>{value}</p>
        {children && <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">{children}</div>}
        {pct != null && <div className="mt-3"><Meter pct={pct} tone={tone} /></div>}
      </CardContent>
    </Card>
  );
}


function SectionCard({
  title,
  caption,
  children,
  className,
  action,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <CardTitle className="text-sm font-semibold text-foreground truncate">{title}</CardTitle>
            {caption && <InfoDot text={caption} />}
          </div>
          {action}
        </div>
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
  shiftNameByEmployee,
}: Props) {
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [deptBreakdown, setDeptBreakdown] = useState<"none" | "shift">("none");
  const [openDepts, setOpenDepts] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<DrillPayload | null>(null);
  const [evidence, setEvidence] = useState<EvidencePayload | null>(null);


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
        date,
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
  const shiftOf = (id: string) => shiftNameByEmployee?.get(id) || "No shift mapped";

  const deptRows = useMemo(() => {
    type Agg = { headcount: number; total: number; present: number; half: number; lateDays: number; lop: number; netMin: number; workedDays: number };
    const blank = (): Agg => ({ headcount: 0, total: 0, present: 0, half: 0, lateDays: 0, lop: 0, netMin: 0, workedDays: 0 });
    const acc = new Map<string, { agg: Agg; shifts: Map<string, Agg> }>();

    const add = (a: Agg, s: SummaryLite) => {
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
    };

    for (const s of summary) {
      const dept = deptByEmployee.get(s.employee_id) || "Unassigned";
      if (!acc.has(dept)) acc.set(dept, { agg: blank(), shifts: new Map() });
      const bucket = acc.get(dept)!;
      add(bucket.agg, s);
      const sh = shiftOf(s.employee_id);
      if (!bucket.shifts.has(sh)) bucket.shifts.set(sh, blank());
      add(bucket.shifts.get(sh)!, s);
    }

    const shape = (name: string, a: Agg) => ({
      name,
      headcount: a.headcount,
      attendanceRate: a.total > 0 ? ((a.present + a.half * 0.5) / a.total) * 100 : null,
      onTimeRate: a.present + a.half > 0 ? ((a.present + a.half - a.lateDays) / (a.present + a.half)) * 100 : null,
      lop: a.lop,
      avgHours: a.workedDays > 0 ? a.netMin / a.workedDays / 60 : null,
    });

    return [...acc.entries()]
      .map(([name, b]) => ({
        ...shape(name, b.agg),
        shifts: [...b.shifts.entries()]
          .map(([sname, sa]) => shape(sname, sa))
          .sort((a, b2) => (a.attendanceRate ?? 999) - (b2.attendanceRate ?? 999)),
      }))
      .sort((a, b) => (a.attendanceRate ?? 999) - (b.attendanceRate ?? 999));
  }, [summary, perEmployee, deptByEmployee, shiftNameByEmployee]);


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

  /* ---------------- drill-down builders ---------------- */
  const dailyByKey = useMemo(() => {
    const m = new Map<string, DailyRow>();
    for (const d of daily) m.set(`${d.employee_id}|${d.attendance_date}`, d);
    return m;
  }, [daily]);

  const maintainedByKey = useMemo(() => {
    const m = new Map<string, MaintainedRow>();
    for (const r of maintained) m.set(`${r.employee_id}|${r.attendance_date}`, r);
    return m;
  }, [maintained]);

  /* ---------------- exception evidence ---------------- */
  const buildEvidence = (exKey: string, exLabel: string, empId: string): EvidencePayload => {
    const dayLabel = (d: string) =>
      new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", weekday: "short" });
    const timeOf = (t?: string | null) =>
      t ? new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
    const hrs = (m: number | null | undefined) => (m == null ? "—" : `${(Number(m) / 60).toFixed(2)}h`);

    const empDaily = daily
      .filter((d) => d.employee_id === empId)
      .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));
    const empMaintained = maintained
      .filter((r) => r.employee_id === empId)
      .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));
    const s = summary.find((x) => x.employee_id === empId);

    const base = {
      exception: exLabel,
      employeeName: nameOf(empId),
      employeeMeta: [deptOf(empId), shiftNameByEmployee?.get(empId), isInactive(empId) ? "inactive" : null]
        .filter(Boolean)
        .join(" · "),
      emptyText: "No underlying rows found for this month.",
    };

    const punchCols = ["First in", "Last out", "Punches", "Sessions", "Net hours", "Engine status"];
    const punchCells = (d: DailyRow, extra: EvidenceCell[] = []): EvidenceCell[] => [
      { value: timeOf(d.first_in) },
      { value: timeOf(d.last_out), tone: d.last_out ? "default" : "bad" },
      { value: String(d.punch_count ?? 0) },
      { value: String(d.session_count ?? 0) },
      { value: hrs(d.net_work_minutes) },
      { value: d.status || "—", tone: "muted" },
      ...extra,
    ];

    if (exKey === "no-signal") {
      const rows: EvidenceRow[] = empMaintained.map((r) => ({
        key: r.attendance_date,
        label: dayLabel(r.attendance_date),
        cells: [
          { value: r.attendance_status || "—" },
          { value: r.late_minutes ? fmtMinutes(Number(r.late_minutes)) : "—", tone: "muted" },
          { value: "0", tone: "bad" },
        ],
      }));
      return {
        ...base,
        why:
          "No biometric punch reached the system for this person in the whole month, so every day below was decided by HR/maintained data alone rather than device evidence.",
        rule: "daily punch rows for employee in month = 0",
        stats: [
          { label: "Punch rows", value: "0", tone: "bad" },
          { label: "Maintained days", value: String(empMaintained.length) },
          { label: "Working days", value: String(s?.working_days ?? "—") },
          { label: "Loss of pay", value: String(s?.lop_days ?? 0), tone: (s?.lop_days || 0) > 0 ? "bad" : "good" },
        ],
        columns: ["Maintained status", "Late", "Punches"],
        rows,
        actions: [
          "Confirm the person is enrolled on a biometric device and mapped to the right device user id.",
          "If they work off-site, regularise the days or mark them held-harmless before locking payroll.",
        ],
      };
    }

    if (exKey === "unmaintained") {
      const rows: EvidenceRow[] = empDaily
        .filter(
          (d) =>
            (Number(d.punch_count || 0) > 0 || Number(d.session_count || 0) > 0) &&
            !maintainedByKey.has(`${empId}|${d.attendance_date}`),
        )
        .map((d) => ({ key: d.attendance_date, label: dayLabel(d.attendance_date), cells: punchCells(d) }));
      return {
        ...base,
        why:
          "Device punches exist for these days but no maintained attendance row was ever written, so payroll currently sees nothing for them.",
        rule: "punch_count > 0 or session_count > 0  AND  no hr_attendance row for that date",
        stats: [
          { label: "Unfinalised days", value: String(rows.length), tone: "bad" },
          { label: "Days with punches", value: String(empDaily.filter((d) => Number(d.punch_count || 0) > 0).length) },
          { label: "Maintained days", value: String(empMaintained.length) },
          { label: "Working days", value: String(s?.working_days ?? "—") },
        ],
        columns: punchCols,
        rows,
        actions: [
          "Re-run the attendance engine for these dates so the maintained rows are created.",
          "If the day should not count, mark it explicitly instead of leaving it blank.",
        ],
      };
    }

    if (exKey === "single") {
      const rows: EvidenceRow[] = empDaily
        .filter((d) => Number(d.punch_count || 0) === 1)
        .map((d) => ({
          key: d.attendance_date,
          label: dayLabel(d.attendance_date),
          sublabel: maintainedByKey.get(`${empId}|${d.attendance_date}`)?.attendance_status || undefined,
          cells: punchCells(d),
        }));
      return {
        ...base,
        why:
          "Exactly one punch was captured on these days — the pair is incomplete, so worked hours, late-by and early-out cannot be derived from the device.",
        rule: "punch_count = 1 (no matching out-punch)",
        stats: [
          { label: "Single-punch days", value: String(rows.length), tone: "bad" },
          { label: "Days with punches", value: String(empDaily.filter((d) => Number(d.punch_count || 0) > 0).length) },
          {
            label: "Hours lost (est.)",
            value: `${rows.length * ((shiftMinutesByEmployee.get(empId) || 480) / 60)}h`.replace(/(\.\d*?)0+h$/, "$1h"),
            hint: "at the person's shift length",
          },
          { label: "Working days", value: String(s?.working_days ?? "—") },
        ],
        columns: punchCols,
        rows,
        actions: [
          "Ask the employee to raise a regularisation for the missing punch.",
          "Check whether the exit device was offline or the finger/face template failed on that day.",
        ],
      };
    }

    if (exKey === "implausible") {
      const rows: EvidenceRow[] = empMaintained
        .filter((r) => Number(r.late_minutes || 0) > LATE_SANITY_MINUTES)
        .map((r) => {
          const d = dailyByKey.get(`${empId}|${r.attendance_date}`);
          return {
            key: r.attendance_date,
            label: dayLabel(r.attendance_date),
            sublabel: r.attendance_status || undefined,
            cells: [
              { value: fmtMinutes(Number(r.late_minutes || 0)), tone: "bad" },
              { value: timeOf(d?.first_in) },
              { value: timeOf(d?.last_out) },
              { value: hrs(d?.net_work_minutes) },
              { value: d?.status || "—", tone: "muted" },
            ],
          };
        });
      return {
        ...base,
        why:
          `Lateness above ${LATE_SANITY_MINUTES / 60}h is treated as a data artefact — usually a night-shift day mapped to a day shift, or an out-punch stamped on the wrong calendar date. These days are excluded from the average-late figure so they do not distort the month.`,
        rule: `late_minutes > ${LATE_SANITY_MINUTES} (${LATE_SANITY_MINUTES / 60}h)`,
        stats: [
          { label: "Flagged days", value: String(rows.length), tone: "bad" },
          {
            label: "Worst day",
            value: rows.length ? rows[0].cells[0].value : "—",
            hint: rows.length ? rows[0].label : undefined,
          },
          { label: "Shift on file", value: shiftNameByEmployee?.get(empId) || "—" },
          {
            label: "Shift length",
            value: `${((shiftMinutesByEmployee.get(empId) || 0) / 60).toFixed(1)}h`,
          },
        ],
        columns: ["Late by", "First in", "Last out", "Net hours", "Engine status"],
        rows,
        actions: [
          "Verify the shift assigned to this person for those dates — a night shift judged against a morning shift produces exactly this.",
          "If the in-punch time is correct, re-run the engine so shift detection re-maps the day.",
        ],
      };
    }

    const isLong = exKey === "long";
    const rows: EvidenceRow[] = empDaily
      .filter((d) => {
        const net = Number(d.net_work_minutes || 0);
        return isLong ? net > 14 * 60 : net > 0 && net < 120;
      })
      .map((d) => ({
        key: d.attendance_date,
        label: dayLabel(d.attendance_date),
        sublabel: maintainedByKey.get(`${empId}|${d.attendance_date}`)?.attendance_status || undefined,
        cells: [
          { value: hrs(d.net_work_minutes), tone: "bad" },
          { value: timeOf(d.first_in) },
          { value: timeOf(d.last_out) },
          { value: String(d.punch_count ?? 0) },
          { value: String(d.session_count ?? 0) },
          { value: d.break_minutes ? fmtMinutes(Number(d.break_minutes)) : "—", tone: "muted" },
          { value: d.status || "—", tone: "muted" },
        ],
      }));
    return {
      ...base,
      why: isLong
        ? "A single day cannot realistically exceed 14 net hours. This normally means a session was never closed, or an in/out pair was duplicated across a midnight rollover."
        : "These days were worked for under 2 hours yet still count as attendance. Either the person genuinely left early, or a punch pair is missing.",
      rule: isLong ? "net_work_minutes > 840 (14h)" : "0 < net_work_minutes < 120 (2h)",
      stats: [
        { label: "Flagged days", value: String(rows.length), tone: "bad" },
        {
          label: isLong ? "Longest day" : "Shortest day",
          value: rows.length ? rows[0].cells[0].value : "—",
          hint: rows.length ? rows[0].label : undefined,
        },
        { label: "Shift length", value: `${((shiftMinutesByEmployee.get(empId) || 0) / 60).toFixed(1)}h` },
        { label: "Working days", value: String(s?.working_days ?? "—") },
      ],
      columns: ["Net hours", "First in", "Last out", "Punches", "Sessions", "Break", "Engine status"],
      rows,
      actions: isLong
        ? [
            "Check the raw punches for a stale/unclosed session on that date.",
            "If the out-punch belongs to the next day, correct it via regularisation and re-run the engine.",
          ]
        : [
            "Confirm whether this was a genuine short day (half day / early exit) or a missing punch.",
            "If a punch is missing, raise a regularisation so the day is valued correctly in payroll.",
          ],
    };
  };

  /** Day-by-day justification behind an employee's risk row. */
  const buildPersonEvidence = (empId: string): EvidencePayload => {
    const dayLabel = (d: string) =>
      new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", weekday: "short" });
    const timeOf = (t?: string | null) =>
      t ? new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
    const hrsF = (m: number | null | undefined) => (m == null ? "—" : `${(Number(m) / 60).toFixed(2)}h`);

    const s = summary.find((x) => x.employee_id === empId);
    const empMaintained = maintained
      .filter((r) => r.employee_id === empId)
      .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));
    const empDaily = daily.filter((d) => d.employee_id === empId);
    const dailyDates = new Set(empDaily.map((d) => d.attendance_date));
    const allDates = Array.from(new Set([...empMaintained.map((r) => r.attendance_date), ...dailyDates])).sort();

    const lateVals = empMaintained
      .map((r) => Number(r.late_minutes || 0))
      .filter((m) => m > 0 && m <= LATE_SANITY_MINUTES);
    const avgLate = lateVals.length ? lateVals.reduce((a, b) => a + b, 0) / lateVals.length : null;
    const netVals = empDaily.map((d) => Number(d.net_work_minutes || 0)).filter((m) => m > 0);
    const avgHours = netVals.length ? netVals.reduce((a, b) => a + b, 0) / netVals.length / 60 : null;
    const implausible = empMaintained.filter((r) => Number(r.late_minutes || 0) > LATE_SANITY_MINUTES).length;

    const rows: EvidenceRow[] = allDates.map((date) => {
      const m = maintainedByKey.get(`${empId}|${date}`);
      const d = dailyByKey.get(`${empId}|${date}`);
      const late = Number(m?.late_minutes || d?.late_by_minutes || 0);
      const early = Number(m?.early_leave_minutes || d?.early_by_minutes || 0);
      const net = d?.net_work_minutes ?? null;
      return {
        key: date,
        label: dayLabel(date),
        sublabel: pretty(m?.attendance_status ?? null),
        cells: [
          { value: timeOf(d?.first_in) },
          { value: timeOf(d?.last_out), tone: d?.last_out ? "default" : "muted" },
          {
            value: late > 0 ? fmtMinutes(late) : "—",
            tone: late > LATE_SANITY_MINUTES ? "bad" : late > 0 ? "warn" : "muted",
          },
          { value: early > 0 ? fmtMinutes(early) : "—", tone: early > 0 ? "warn" : "muted" },
          {
            value: hrsF(net),
            tone: net == null ? "muted" : net > 14 * 60 || net < 120 ? "bad" : "default",
          },
          { value: String(d?.punch_count ?? 0), tone: (d?.punch_count ?? 0) === 0 ? "bad" : "default" },
          { value: d?.status || "—", tone: "muted" },
        ],
      };
    });

    return {
      exception: "Attendance risk — day-by-day evidence",
      employeeName: nameOf(empId),
      employeeMeta: [deptOf(empId), shiftNameByEmployee?.get(empId), isInactive(empId) ? "inactive" : null]
        .filter(Boolean)
        .join(" · "),
      why:
        "This is every attendance day recorded for this person in the month — the punches, lateness, early exits and net hours that add up to the ranking figures on the People table.",
      rule: `days lost = loss of pay days · late days = maintained days with late_minutes > 0 · avg late excludes anything above ${LATE_SANITY_MINUTES / 60}h · avg hours = mean net worked hours over days with punches`,
      stats: [
        {
          label: "Days lost",
          value: `${Math.round(Number(s?.lop_days || 0) * 10) / 10} / ${Math.round(Number(s?.working_days || 0))}`,
          tone: Number(s?.lop_days || 0) > 0 ? "bad" : "good",
        },
        { label: "Late days", value: `${lateVals.length + implausible} / ${empMaintained.length}`, tone: lateVals.length ? "warn" : "good" },
        { label: "Avg late", value: avgLate == null ? "—" : fmtMinutes(avgLate), hint: implausible ? `${implausible} suspect day(s) excluded` : undefined },
        { label: "Avg hours", value: avgHours == null ? "—" : `${avgHours.toFixed(2)}h` },
        { label: "Present", value: String(s?.present_days ?? "—"), tone: "good" },
        { label: "Half days", value: String(s?.half_days ?? "—"), tone: Number(s?.half_days || 0) > 0 ? "warn" : "default" },
        { label: "Paid leave", value: String(s?.paid_leave_days ?? "—") },
        { label: "Shift length", value: `${((shiftMinutesByEmployee.get(empId) || 0) / 60).toFixed(1)}h` },
      ],
      columns: ["First in", "Last out", "Late by", "Early out", "Net hours", "Punches", "Engine status"],
      rows,
      emptyText: "No attendance rows for this person this month.",
      actions: [
        "Check the days flagged red — missing out-punches and implausible hours distort both lateness and payroll.",
        "Where the day was genuinely worked, ask the employee to raise a regularisation so the record is corrected at source.",
      ],
    };
  };


  const deptOf = (id: string) => deptByEmployee.get(id) || "Unassigned";
  const cell = (value: string, tone?: "default" | "good" | "warn" | "bad") => ({ value, tone });
  const hrsOf = (min: number) => `${(min / 60).toFixed(2)}h`;
  const pretty = (s: string | null) => {
    const v = (s || "").toLowerCase();
    if (v === "half_day") return "Half day";
    if (!v) return "—";
    return v.charAt(0).toUpperCase() + v.slice(1);
  };
  const bucketOf = (m: number) =>
    m <= 0 ? "On time" : m <= 15 ? "1-15 min" : m <= 30 ? "16-30 min" : m <= 60 ? "31-60 min" : m <= LATE_SANITY_MINUTES ? "1-4 h" : "Suspect";

  const openDay = (dayKey: string) => {
    const point = trend.find((t) => t.day === dayKey);
    if (!point) return;
    const rows = maintained.filter((r) => r.attendance_date === point.date);
    const present = rows.filter((r) => isPresentStatus(r.attendance_status)).length;
    const half = rows.filter((r) => isHalfStatus(r.attendance_status)).length;
    const absent = rows.filter((r) => isAbsentStatus(r.attendance_status)).length;
    const lateRows = rows.filter((r) => Number(r.late_minutes || 0) > 0);
    const saneLate = lateRows.filter((r) => Number(r.late_minutes || 0) <= LATE_SANITY_MINUTES);
    const avgLate = saneLate.length > 0 ? saneLate.reduce((a, r) => a + Number(r.late_minutes || 0), 0) / saneLate.length : 0;
    const netRows = rows
      .map((r) => Number(dailyByKey.get(`${r.employee_id}|${r.attendance_date}`)?.net_work_minutes || 0))
      .filter((n) => n > 0);

    const drillRows: DrillRow[] = rows
      .map((r) => {
        const late = Number(r.late_minutes || 0);
        const net = Number(dailyByKey.get(`${r.employee_id}|${r.attendance_date}`)?.net_work_minutes || 0);
        return {
          id: r.employee_id,
          dept: deptOf(r.employee_id),
          rank: (isAbsentStatus(r.attendance_status) ? 100000 : isHalfStatus(r.attendance_status) ? 50000 : 0) + Math.min(late, 9999),
          cells: [
            cell(
              pretty(r.attendance_status),
              isAbsentStatus(r.attendance_status) ? "bad" : isHalfStatus(r.attendance_status) ? "warn" : "good",
            ),
            cell(late > 0 ? fmtMinutes(late) : "on time", late > LATE_SANITY_MINUTES ? "bad" : late > 0 ? "warn" : "good"),
            cell(net > 0 ? hrsOf(net) : "—"),
          ],
        };
      })
      .sort((a, b) => (b.rank || 0) - (a.rank || 0));

    setDrill({
      title: `Attendance on ${point.label}`,
      subtitle: `${rows.length} maintained attendance row(s) on this date`,
      narrative:
        `The plotted rate of ${point.rate}% for this day comes from the ${rows.length} maintained attendance rows dated ${point.date}. ` +
        `Each fully present (or late-but-present) person counts as 1 day, each half day counts as 0.5, and absent days count as 0. ` +
        `The bar on the same day counts everyone whose first punch was after their shift start.`,
      formula: {
        expression: `(${present} present + ${half} half × 0.5) ÷ ${rows.length} maintained × 100`,
        result: `${point.rate}%`,
      },
      stats: [
        { label: "Present", value: String(present), tone: "good" },
        { label: "Half day", value: String(half), tone: half > 0 ? "warn" : "default" },
        { label: "Absent", value: String(absent), tone: absent > 0 ? "bad" : "default" },
        { label: "Late arrivals", value: String(lateRows.length), tone: lateRows.length > 0 ? "warn" : "default", hint: `avg ${fmtMinutes(avgLate)} late` },
        {
          label: "Avg net hours",
          value: netRows.length > 0 ? hrsOf(netRows.reduce((a, b) => a + b, 0) / netRows.length) : "—",
          hint: `${netRows.length} day(s) with computable hours`,
        },
      ],
      columns: ["Status", "Late by", "Net hours"],
      rows: drillRows,
      notes:
        lateRows.length - saneLate.length > 0
          ? [`${lateRows.length - saneLate.length} row(s) show lateness over ${LATE_SANITY_MINUTES / 60}h and are excluded from the average-late figure (shift-mapping artefact).`]
          : undefined,
    });
  };

  const openBucket = (name: string) => {
    const rows = maintained.filter(
      (r) => (isPresentStatus(r.attendance_status) || isHalfStatus(r.attendance_status)) && bucketOf(Number(r.late_minutes || 0)) === name,
    );
    const byEmp = new Map<string, { days: number; total: number; worst: number; worstDate: string }>();
    for (const r of rows) {
      const m = Number(r.late_minutes || 0);
      const e = byEmp.get(r.employee_id) || { days: 0, total: 0, worst: 0, worstDate: "" };
      e.days++;
      e.total += m;
      if (m >= e.worst) {
        e.worst = m;
        e.worstDate = r.attendance_date;
      }
      byEmp.set(r.employee_id, e);
    }
    const workedTotal = maintained.filter((r) => isPresentStatus(r.attendance_status) || isHalfStatus(r.attendance_status)).length;
    const drillRows: DrillRow[] = [...byEmp.entries()]
      .map(([id, e]) => ({
        id,
        dept: deptOf(id),
        rank: e.days,
        cells: [
          cell(String(e.days)),
          cell(name === "On time" ? "—" : fmtMinutes(e.total / e.days)),
          cell(name === "On time" ? "—" : `${fmtMinutes(e.worst)} on ${e.worstDate.slice(5)}`),
        ],
      }))
      .sort((a, b) => (b.rank || 0) - (a.rank || 0));

    setDrill({
      title: name === "On time" ? "On-time worked days" : `Worked days late by ${name}`,
      subtitle: `${rows.length} of ${workedTotal} worked days this month`,
      narrative:
        name === "Suspect"
          ? `These worked days record lateness beyond ${LATE_SANITY_MINUTES / 60} hours. That is almost never real lateness — it means the person's shift is mapped wrong, or a night-shift punch was attributed to the wrong calendar day. They still count as late days, but are kept out of the average-late figure so one bad mapping does not distort the month.`
          : `Every worked day (present or half day) is bucketed by how many minutes after shift start the first punch landed. This bar is the count of days that fell in the ${name} band, grouped below by employee so you can see whether it is one repeat offender or spread across the roster.`,
      formula: { expression: `${rows.length} day(s) ÷ ${workedTotal} worked days × 100`, result: `${workedTotal > 0 ? ((rows.length / workedTotal) * 100).toFixed(1) : "0.0"}% of worked days` },
      stats: [
        { label: "Days in band", value: String(rows.length) },
        { label: "Employees involved", value: String(byEmp.size) },
        {
          label: "Avg late in band",
          value: name === "On time" ? "—" : fmtMinutes(rows.reduce((a, r) => a + Number(r.late_minutes || 0), 0) / Math.max(1, rows.length)),
        },
        { label: "Share of worked days", value: `${workedTotal > 0 ? ((rows.length / workedTotal) * 100).toFixed(1) : "0.0"}%` },
      ],
      columns: ["Days in band", "Avg late", "Worst day"],
      rows: drillRows,
    });
  };

  const openMix = (part: string) => {
    const field = part === "Present" ? "present_days" : part === "Paid leave" ? "paid_leave_days" : part === "Half day" ? "half_days" : "lop_days";
    const rows = summary
      .map((s) => ({ s, v: Number((s as any)[field] || 0) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v);
    const total = rows.reduce((a, x) => a + x.v, 0);
    const drillRows: DrillRow[] = rows.map(({ s, v }) => ({
      id: s.employee_id,
      dept: deptOf(s.employee_id),
      cells: [
        cell(String(Math.round(v * 10) / 10), part === "Loss of pay" ? "bad" : part === "Half day" ? "warn" : "default"),
        cell(`${Math.round(Number(s.working_days || 0))}`),
        cell(Number(s.working_days || 0) > 0 ? `${((v / Number(s.working_days)) * 100).toFixed(1)}%` : "—"),
      ],
    }));
    setDrill({
      title: `${part} days`,
      subtitle: `${Math.round(total * 10) / 10} day(s) across ${rows.length} employee(s)`,
      narrative:
        `The day-mix bar splits every payable employee-day this month by how payroll will treat it. This segment is the sum of the "${part}" ` +
        `column of each employee's monthly attendance summary — the same figures payroll consumes, not a re-derived number.` +
        (part === "Loss of pay" ? " Loss-of-pay days are unpaid and directly reduce net salary." : ""),
      formula: { expression: `Σ ${part.toLowerCase()} days over ${rows.length} employee(s)`, result: `${Math.round(total * 10) / 10} days` },
      stats: [
        { label: "Total days", value: String(Math.round(total * 10) / 10), tone: part === "Loss of pay" ? "bad" : "default" },
        { label: "Employees", value: String(rows.length) },
        { label: "Largest single holder", value: rows.length > 0 ? `${Math.round(rows[0].v * 10) / 10} d` : "—", hint: rows.length > 0 ? nameOf(rows[0].s.employee_id) : undefined },
        { label: "Avg per affected employee", value: rows.length > 0 ? `${(total / rows.length).toFixed(1)} d` : "—" },
      ],
      columns: [`${part} days`, "Working days", "Share of own month"],
      rows: drillRows,
    });
  };

  const openWeekday = (name: string) => {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dow = labels.indexOf(name);
    const rows = maintained.filter((r) => new Date(`${r.attendance_date}T00:00:00`).getDay() === dow);
    const dates = [...new Set(rows.map((r) => r.attendance_date))].sort();
    const byEmp = new Map<string, { days: number; lost: number; late: number }>();
    for (const r of rows) {
      const e = byEmp.get(r.employee_id) || { days: 0, lost: 0, late: 0 };
      e.days++;
      if (isAbsentStatus(r.attendance_status)) e.lost += 1;
      if (isHalfStatus(r.attendance_status)) e.lost += 0.5;
      if (Number(r.late_minutes || 0) > 0) e.late++;
      byEmp.set(r.employee_id, e);
    }
    const lost = rows.filter((r) => isAbsentStatus(r.attendance_status)).length + rows.filter((r) => isHalfStatus(r.attendance_status)).length * 0.5;
    const late = rows.filter((r) => Number(r.late_minutes || 0) > 0).length;
    const drillRows: DrillRow[] = [...byEmp.entries()]
      .filter(([, e]) => e.lost > 0 || e.late > 0)
      .map(([id, e]) => ({
        id,
        dept: deptOf(id),
        rank: e.lost * 2 + e.late,
        cells: [
          cell(String(e.days)),
          cell(e.lost > 0 ? String(Math.round(e.lost * 10) / 10) : "—", e.lost > 0 ? "bad" : "default"),
          cell(e.late > 0 ? String(e.late) : "—", e.late > 0 ? "warn" : "default"),
        ],
      }))
      .sort((a, b) => (b.rank || 0) - (a.rank || 0));

    setDrill({
      title: `${name} pattern`,
      subtitle: `${dates.length} ${name}(s) this month · ${rows.length} maintained attendance rows`,
      narrative:
        `Every maintained attendance row falling on a ${name} is pooled together, then expressed as a percentage so weekdays with a different ` +
        `number of occurrences stay comparable. A spike here usually means an extended-weekend habit or a shift that is poorly covered on this day.`,
      formula: {
        expression: `${Math.round(lost * 10) / 10} lost ÷ ${rows.length} rows × 100  |  ${late} late ÷ ${rows.length} × 100`,
        result: `${rows.length > 0 ? ((lost / rows.length) * 100).toFixed(1) : "0.0"}% lost, ${rows.length > 0 ? ((late / rows.length) * 100).toFixed(1) : "0.0"}% late`,
      },
      stats: [
        { label: `${name}s in month`, value: String(dates.length), hint: dates.map((d) => d.slice(5)).join(", ") },
        { label: "Days lost", value: String(Math.round(lost * 10) / 10), tone: lost > 0 ? "bad" : "default" },
        { label: "Late arrivals", value: String(late), tone: late > 0 ? "warn" : "default" },
        { label: "Employees affected", value: String(drillRows.length) },
      ],
      columns: [`${name}s recorded`, "Days lost", "Late days"],
      rows: drillRows,
      emptyText: `No absence or lateness on any ${name} this month.`,
    });
  };

  const openDept = (name: string, shiftName?: string) => {
    const ids = summary
      .filter((s) => deptOf(s.employee_id) === name && (!shiftName || shiftOf(s.employee_id) === shiftName))
      .map((s) => s.employee_id);
    const lopById = new Map(summary.map((s) => [s.employee_id, Number(s.lop_days || 0)]));
    const deptRow = deptRows.find((d) => d.name === name);
    const row = shiftName ? deptRow?.shifts.find((s) => s.name === shiftName) : deptRow;
    const drillRows: DrillRow[] = ids
      .map((id) => {
        const st = perEmployee.get(id);
        const rate = st && st.maintained > 0 ? ((st.present + st.half * 0.5) / st.maintained) * 100 : null;
        return {
          id,
          dept: name,
          rank: 100 - (rate ?? 100),
          cells: [
            cell(shiftOf(id)),
            cell(String(st?.maintained ?? 0)),
            cell(rate === null ? "—" : `${rate.toFixed(1)}%`, rate !== null && rate < 90 ? "bad" : "good"),
            cell(String(st?.lateDays ?? 0), (st?.lateDays ?? 0) > 0 ? "warn" : "default"),
            cell(String(Math.round((lopById.get(id) || 0) * 10) / 10), (lopById.get(id) || 0) > 0 ? "bad" : "default"),
            cell(st && st.workedDays > 0 ? hrsOf(st.netMin / st.workedDays) : "—"),
          ],
        };
      })
      .sort((a, b) => (b.rank || 0) - (a.rank || 0));

    setDrill({
      title: shiftName ? `${name} — ${shiftName}` : `${name} department`,
      subtitle: `${ids.length} employee(s) on the active roster`,
      narrative:
        `Department figures are the sum of each member's maintained attendance rows — no separate department-level source exists. ` +
        (shiftName
          ? `This view is limited to members currently mapped to ${shiftName}; shift mapping comes from the employee's current shift schedule (falling back to work info). `
          : "") +
        `The attendance rate below is computed on maintained days only, so a department with unfinalised days will look different from one ` +
        `that is fully maintained. The per-employee table shows exactly who is pulling the average.`,
      formula: {
        expression: `Σ (present + half × 0.5) ÷ Σ maintained days for ${ids.length} member(s)`,
        result: row?.attendanceRate != null ? `${row.attendanceRate.toFixed(1)}%` : "—",
      },
      stats: [
        { label: "Headcount", value: String(ids.length) },
        { label: "Attendance rate", value: row?.attendanceRate != null ? `${row.attendanceRate.toFixed(1)}%` : "—" },
        { label: "On-time rate", value: row?.onTimeRate != null ? `${row.onTimeRate.toFixed(1)}%` : "—" },
        { label: "LOP days", value: String(Math.round((row?.lop || 0) * 10) / 10), tone: (row?.lop || 0) > 0 ? "bad" : "default" },
        { label: "Avg net hours", value: row?.avgHours != null ? `${row.avgHours.toFixed(2)}h` : "—" },
      ],
      columns: ["Shift", "Maintained days", "Attendance rate", "Late days", "LOP days", "Avg net hours"],
      rows: drillRows,
    });
  };


  return (
    <TooltipProvider delayDuration={100}>
    <div className="space-y-5">

      {/* Period integrity */}
      <Card className={coverage.pct < 99 ? "border-warning/40 bg-warning/[0.03]" : undefined}>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-semibold text-foreground shrink-0">{monthLabel}</span>
              <div className="w-40 shrink-0">
                <Meter pct={coverage.pct} tone={coverage.pct >= 99 ? "success" : "warning"} />
              </div>
              <span className={`text-xs font-medium tabular-nums shrink-0 ${coverage.pct >= 99 ? "text-success" : "text-warning"}`}>
                {coverage.pct.toFixed(0)}% verified
              </span>
              {coverage.pct < 99 ? (
                <span className="inline-flex items-center gap-1 text-warning text-xs">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <InfoDot
                    text={`Rates are computed on maintained days only.${
                      coverage.gapDates.length > 0
                        ? ` Missing rows on: ${coverage.gapDates.slice(0, 8).map((g) => `${g.date.slice(5)} (${g.missing})`).join(", ")}${
                            coverage.gapDates.length > 8 ? ` +${coverage.gapDates.length - 8} more` : ""
                          }`
                        : ""
                    }`}
                  />
                </span>
              ) : (
                <InfoDot text="Maintained attendance coverage for elapsed working days — the exact source payroll loss-of-pay uses." />
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">
                {coverage.maintainedDays} / {Math.round(totalWorkingDays)}
              </span>{" "}
              work days checked
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi
          icon={TrendingUp}
          iconClass="text-success"
          label="Attendance"
          value={`${cur.attendanceRate.toFixed(1)}%`}
          pct={cur.attendanceRate}
          tone="success"
          hint={`Present + half-days ÷ ${cur.total} maintained days.`}
        >
          <Delta value={prev.total > 0 ? cur.attendanceRate - prev.attendanceRate : null} />
        </Kpi>

        <Kpi
          icon={ShieldAlert}
          iconClass="text-destructive"
          label="Loss of pay"
          value={`${lopPct.toFixed(1)}%`}
          pct={lopPct}
          tone="destructive"
          emphasis={employeesWithLop > 0 ? "alert" : "neutral"}
          hint={`${Math.round(totalLop * 10) / 10} unpaid of ${Math.round(totalWorkingDays)} payable days.`}
        >
          <span className="tabular-nums">{employeesWithLop} employees affected</span>
        </Kpi>

        <Kpi
          icon={Clock}
          iconClass="text-warning"
          label="On time"
          value={`${cur.onTimeRate.toFixed(1)}%`}
          pct={cur.onTimeRate}
          tone="warning"
          hint={`Average ${fmtMinutes(cur.avgLateWhenLate)} late when late.`}
        >
          <span className="tabular-nums">{cur.lateDays} late arrivals</span>
        </Kpi>

        <Kpi
          icon={Timer}
          iconClass="text-info"
          label="Avg day hours"
          value={`${hours.avgHours.toFixed(2)}h`}
          pct={hours.shortPct === null ? null : 100 - hours.shortPct}
          tone="info"
          hint={
            hours.shortPct === null
              ? "No shift mapped, so short-day share cannot be computed."
              : `${hours.shortPct.toFixed(0)}% of ${hours.workedDays} worked days fell below the scheduled shift.`
          }
        >
          <span className="tabular-nums">across {hours.workedDays} worked days</span>
        </Kpi>

        <Kpi
          icon={UserCheck}
          iconClass="text-primary"
          label="To review"
          value={String(reviewCount)}
          emphasis="accent"
          hint="Employees losing ≥10% of days or late on ≥30% of days — ranked in the People tab."
        >
          <span>Action needed on {reviewCount} {reviewCount === 1 ? "profile" : "profiles"}</span>

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
            caption="How the roster showed up each day — the line is the attendance rate, the bars count late arrivals. Click any day for the full breakdown."
            action={<DrillBadge />}
          >
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart
                  data={trend}
                  margin={{ top: 4, right: 8, left: -8, bottom: 0 }}
                  onClick={(e: any) => e?.activeLabel && openDay(String(e.activeLabel))}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" {...axisProps} />
                  <YAxis yAxisId="left" unit="%" domain={[0, 100]} {...axisProps} />
                  <YAxis yAxisId="right" orientation="right" allowDecimals={false} {...axisProps} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: any, n: any) => (n === "Attendance rate" ? [`${v}%`, n] : [`${v} people`, n])}
                    labelFormatter={(l: any) => `${trend.find((t) => t.day === l)?.label || `Day ${l}`} — click to expand`}
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
              action={<DrillBadge />}
            >
              {buckets.some((b) => b.days > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={buckets}
                    margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                    onClick={(e: any) => e?.activeLabel && openBucket(String(e.activeLabel))}
                    style={{ cursor: "pointer" }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" {...axisProps} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip {...tooltipStyle} formatter={(v: any) => [`${v} day(s) — click to expand`, "Worked days"]} />
                    <Bar dataKey="days" name="Days" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-10 text-sm">No worked days recorded</p>
              )}
            </SectionCard>

            <SectionCard
              title="Day mix"
              caption="Every payable employee-day in the month, split by how payroll will treat it. Click a segment to see who holds those days."
              action={<DrillBadge />}
            >
              {distribution.total > 0 ? (
                <div className="space-y-3">
                  <div className="flex h-4 w-full overflow-hidden rounded-full">
                    {distribution.parts.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => openMix(p.name)}
                        className={`${p.cls} transition-opacity hover:opacity-75`}
                        style={{ width: `${(p.value / distribution.total) * 100}%` }}
                        title={`${p.name}: ${Math.round(p.value * 10) / 10} days — click to expand`}
                        aria-label={`${p.name} days`}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                    {distribution.parts.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => openMix(p.name)}
                        className="flex items-center gap-2 rounded-md px-1.5 py-1 -mx-1.5 text-left hover:bg-muted/60"
                      >
                        <span className={`h-2.5 w-2.5 rounded-sm ${p.cls}`} />
                        <span className="text-muted-foreground">{p.name}</span>
                        <span className="ml-auto tabular-nums font-medium text-foreground">
                          {Math.round(p.value * 10) / 10} d · {((p.value / distribution.total) * 100).toFixed(1)}%
                        </span>
                      </button>
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
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-semibold text-foreground">Employees ranked by attendance risk</CardTitle>
                <InfoDot text="Anyone with lost days or late arrivals this month, worst first. Flags mark the people who need an HR conversation." />
              </div>

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
                          <tr
                            key={p.id}
                            className="border-b last:border-0 hover:bg-muted/40 cursor-pointer"
                            onClick={() => setEvidence(buildPersonEvidence(p.id))}
                            title="View the days and evidence behind this row"
                          >
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
            caption="Share of maintained days lost or late, by weekday — useful for spotting Monday/Saturday drift. Click a weekday to expand."
            action={<DrillBadge />}
          >
            {weekday.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={weekday}
                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                  onClick={(e: any) => e?.activeLabel && openWeekday(String(e.activeLabel))}
                  style={{ cursor: "pointer" }}
                >

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
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-sm font-semibold text-foreground">Department comparison</CardTitle>
                  <InfoDot text="Weakest attendance first. Rates use maintained days only. Click a department (or a shift under it) for the per-employee breakdown." />
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={deptBreakdown}
                    onValueChange={(v) => {
                      setDeptBreakdown(v as "none" | "shift");
                      setOpenDepts(new Set());
                    }}
                  >
                    <SelectTrigger className="h-8 w-[190px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Department only</SelectItem>
                      <SelectItem value="shift">Subdivide by shift</SelectItem>
                    </SelectContent>
                  </Select>
                  <DrillBadge />
                </div>
              </div>
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
                  {deptRows.map((d) => {
                    const expanded = deptBreakdown === "shift" && openDepts.has(d.name);
                    return (
                      <Fragment key={d.name}>
                        <tr
                          className="border-b last:border-0 hover:bg-muted/40 cursor-pointer"
                          onClick={() => openDept(d.name)}
                        >
                          <td className="px-4 py-2 font-medium">
                            <span className="flex items-center gap-1.5">
                              {deptBreakdown === "shift" && (
                                <button
                                  type="button"
                                  aria-label={expanded ? "Collapse shifts" : "Expand shifts"}
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenDepts((prev) => {
                                      const next = new Set(prev);
                                      next.has(d.name) ? next.delete(d.name) : next.add(d.name);
                                      return next;
                                    });
                                  }}
                                >
                                  {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                              )}
                              <span className="text-primary underline-offset-2 hover:underline">{d.name}</span>
                              {deptBreakdown === "shift" && (
                                <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal text-muted-foreground">
                                  {d.shifts.length} shift{d.shifts.length === 1 ? "" : "s"}
                                </Badge>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{d.headcount}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {d.attendanceRate === null ? "—" : `${d.attendanceRate.toFixed(1)}%`}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{d.onTimeRate === null ? "—" : `${d.onTimeRate.toFixed(1)}%`}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-destructive">{Math.round(d.lop * 10) / 10}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{d.avgHours === null ? "—" : `${d.avgHours.toFixed(2)}h`}</td>
                        </tr>
                        {expanded &&
                          d.shifts.map((s) => (
                            <tr
                              key={`${d.name}|${s.name}`}
                              className="border-b last:border-0 bg-muted/20 hover:bg-muted/40 cursor-pointer"
                              onClick={() => openDept(d.name, s.name)}
                            >
                              <td className="px-4 py-1.5 pl-11 text-[13px] text-muted-foreground">{s.name}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-[13px]">{s.headcount}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-[13px]">
                                {s.attendanceRate === null ? "—" : `${s.attendanceRate.toFixed(1)}%`}
                              </td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-[13px]">
                                {s.onTimeRate === null ? "—" : `${s.onTimeRate.toFixed(1)}%`}
                              </td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-[13px] text-destructive">
                                {Math.round(s.lop * 10) / 10}
                              </td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-[13px]">
                                {s.avgHours === null ? "—" : `${s.avgHours.toFixed(2)}h`}
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
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
                  <InfoDot text="Days that need a human decision before the period is locked." />
                </CardTitle>

              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {exceptions.map((ex) => (
                  <ExceptionBlock
                    key={ex.key}
                    ex={ex}
                    Person={Person}
                    onPick={(id) => setEvidence(buildEvidence(ex.key, ex.label, id))}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <AttendanceDrilldownDialog
        payload={drill}
        onOpenChange={(o) => !o && setDrill(null)}
        renderPerson={(id) => <Person id={id} />}
        nameOf={nameOf}
      />

      <ExceptionEvidenceDialog payload={evidence} onOpenChange={(o) => !o && setEvidence(null)} />
    </div>
    </TooltipProvider>


  );
}

function ExceptionBlock({
  ex,
  Person,
  onPick,
}: {
  ex: { key: string; label: string; hint: string; detail: { id: string; n: number }[] };
  Person: (p: { id: string; className?: string }) => JSX.Element;
  onPick: (employeeId: string) => void;
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
          <p className="text-[10px] text-muted-foreground/80 mt-0.5">Click a name to see the days and evidence behind it.</p>
        </div>
        {ex.detail.length > 8 && (
          <Button variant="ghost" size="sm" className="h-6 text-[11px] shrink-0" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : `+${ex.detail.length - 8} more`}
          </Button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shown.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onPick(d.id)}
            title="View the days and evidence behind this exception"
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px] transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Person id={d.id} />
            {d.n > 0 && <span className="text-muted-foreground tabular-nums">· {d.n}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default AttendanceInsights;
