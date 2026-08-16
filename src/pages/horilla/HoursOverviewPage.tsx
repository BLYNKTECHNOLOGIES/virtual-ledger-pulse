import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Clock, RefreshCw, Search, Timer, AlertTriangle, Download, BarChart3,
  ChevronDown, ChevronUp, ArrowUpDown, CalendarDays, Info,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAttendanceDayRange } from "@/hooks/hrms/useAttendanceDay";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer } from "recharts";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Row = {
  employee_id: string;
  badge_id: string | null;
  employee_name: string;
  department: string | null;
  shift_name: string | null;
  worked_seconds: number;
  pending_seconds: number;
  overtime_seconds: number;
  required_seconds: number;
  present_days: number;
  absent_days: number;
  half_days: number;
  incomplete_days: number;
  no_punch_days: number;
  late_count: number;
  late_minutes: number;
  early_out_count: number;
  early_minutes: number;
};

type StatusKey = "deficit" | "overtime" | "on_track" | "no_data";
type SortKey =
  | "employee_name" | "present_days" | "absent_days" | "worked_seconds"
  | "required_seconds" | "utilisation" | "overtime_seconds" | "pending_seconds"
  | "late_minutes" | "early_minutes";

const hhmm = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const utilisationOf = (r: Row) =>
  r.required_seconds > 0 ? (r.worked_seconds / r.required_seconds) * 100 : r.worked_seconds > 0 ? 100 : 0;

const statusOf = (r: Row): StatusKey => {
  if (r.worked_seconds === 0 && r.present_days === 0) return "no_data";
  if (r.overtime_seconds > 0) return "overtime";
  if (r.pending_seconds > 0) return "deficit";
  return "on_track";
};

const STATUS_META: Record<StatusKey, { label: string; className: string }> = {
  deficit: { label: "Deficit", className: "bg-warning/10 text-warning border-warning/20" },
  overtime: { label: "Overtime", className: "bg-info/10 text-info border-info/20" },
  on_track: { label: "On track", className: "bg-success/10 text-success border-success/20" },
  no_data: { label: "No punch", className: "bg-muted text-muted-foreground border-border" },
};

function Meter({ value, tone }: { value: number; tone: "success" | "warning" | "info" }) {
  const pct = Math.max(0, Math.min(100, value));
  const bar = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-info";
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sub, meter, tone = "success", hint,
}: {
  icon: any; label: string; value: string; sub?: string;
  meter?: number; tone?: "success" | "warning" | "info"; hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span className="truncate">{label}</span>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 shrink-0 opacity-60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-xs">{hint}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums">{value}</span>
          {sub && <span className="text-[11px] text-muted-foreground tabular-nums">{sub}</span>}
        </div>
        {typeof meter === "number" && <Meter value={meter} tone={tone} />}
      </CardContent>
    </Card>
  );
}

export default function HoursOverviewPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusKey>("all");
  const [showChart, setShowChart] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "pending_seconds", dir: "desc" });
  const [refreshing, setRefreshing] = useState(false);
  const [drill, setDrill] = useState<Row | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["hr_monthly_hours_unified", year, month],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_monthly_hours_unified")
        .select("*")
        .eq("year", year)
        .eq("month_sequence", month);
      if (error) throw error;
      return (data as Row[]) || [];
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { error } = await (supabase as any).rpc("refresh_hour_accounts", { p_year: year, p_month: month });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["hr_monthly_hours_unified"] });
      toast.success(`Hours recomputed for ${MONTHS[month - 1]} ${year}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  // Contract-type staff are out of scope for hours/overtime analytics.
  const { data: workInfo = [] } = useQuery({
    queryKey: ["hr_work_info_contract_type"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employee_work_info")
        .select("employee_id, employee_type");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
  const contractIds = useMemo(() => {
    const set = new Set<string>();
    for (const w of workInfo as any[]) if (w.employee_type === "contract" && w.employee_id) set.add(w.employee_id);
    return set;
  }, [workInfo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (contractIds.has(r.employee_id)) return false;
      const matchQ = !q || r.employee_name.toLowerCase().includes(q) || (r.badge_id || "").toLowerCase().includes(q);
      const matchS = statusFilter === "all" || statusOf(r) === statusFilter;
      return matchQ && matchS;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === "employee_name") return a.employee_name.localeCompare(b.employee_name) * dir;
      const av = sort.key === "utilisation" ? utilisationOf(a) : (a as any)[sort.key] || 0;
      const bv = sort.key === "utilisation" ? utilisationOf(b) : (b as any)[sort.key] || 0;
      return (av - bv) * dir;
    });
  }, [rows, search, statusFilter, sort, contractIds]);

  const totals = useMemo(() => {
    const t = filtered.reduce(
      (acc, r) => {
        acc.worked += r.worked_seconds;
        acc.required += r.required_seconds;
        acc.overtime += r.overtime_seconds;
        acc.pending += r.pending_seconds;
        acc.late += r.late_count;
        acc.lateMin += r.late_minutes;
        acc.early += r.early_out_count;
        acc.absent += r.absent_days;
        acc.present += r.present_days;
        if (statusOf(r) === "no_data") acc.noPunch += 1;
        if (r.required_seconds > 0 && utilisationOf(r) < 70) acc.underUtilised += 1;
        return acc;
      },
      { worked: 0, required: 0, overtime: 0, pending: 0, late: 0, lateMin: 0, early: 0, absent: 0, present: 0, noPunch: 0, underUtilised: 0 },
    );
    return { ...t, utilisation: t.required > 0 ? (t.worked / t.required) * 100 : 0 };
  }, [filtered]);

  const topOvertime = useMemo(
    () => [...filtered].sort((a, b) => b.overtime_seconds - a.overtime_seconds)[0],
    [filtered],
  );

  const chartData = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => b.pending_seconds - a.pending_seconds)
        .slice(0, 20)
        .map((r) => ({
          name: r.employee_name.split(" ")[0] + (r.badge_id ? ` #${r.badge_id}` : ""),
          Worked: +(r.worked_seconds / 3600).toFixed(1),
          Required: +(r.required_seconds / 3600).toFixed(1),
          Overtime: +(r.overtime_seconds / 3600).toFixed(1),
        })),
    [filtered],
  );

  const exportCsv = () => {
    const head = [
      "Employee", "Badge ID", "Department", "Shift", "Present", "Absent", "Half day", "No punch",
      "Worked (h)", "Required (h)", "Utilisation %", "Overtime (h)", "Deficit (h)",
      "Late count", "Late minutes", "Early out count", "Early minutes", "Status",
    ];
    const lines = filtered.map((r) => [
      r.employee_name, r.badge_id ?? "", r.department ?? "", r.shift_name ?? "",
      r.present_days, r.absent_days, r.half_days, r.no_punch_days,
      (r.worked_seconds / 3600).toFixed(2), (r.required_seconds / 3600).toFixed(2),
      utilisationOf(r).toFixed(1), (r.overtime_seconds / 3600).toFixed(2), (r.pending_seconds / 3600).toFixed(2),
      r.late_count, r.late_minutes, r.early_out_count, r.early_minutes, STATUS_META[statusOf(r)].label,
    ]);
    const csv = [head, ...lines]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `hours-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const Th = ({ label, sortKey, align = "left" }: { label: string; sortKey?: SortKey; align?: "left" | "right" }) => (
    <th
      className={`px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      } ${sortKey ? "cursor-pointer select-none hover:text-foreground" : ""}`}
      onClick={sortKey ? () => toggleSort(sortKey) : undefined}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {label}
        {sortKey && <ArrowUpDown className={`h-3 w-3 ${sort.key === sortKey ? "opacity-100" : "opacity-30"}`} />}
      </span>
    </th>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Hours & Overtime"
        description="Worked vs required hours, overtime, deficit and punctuality — one view per month"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
            <Button size="sm" className="h-9" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Recomputing..." : "Recompute"}
            </Button>
          </div>
        }
      />

      {/* Period + search + filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employee or badge ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-foreground"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="deficit">Deficit</SelectItem>
            <SelectItem value="overtime">Overtime</SelectItem>
            <SelectItem value="on_track">On track</SelectItem>
            <SelectItem value="no_data">No punch</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setShowChart((v) => !v)}>
          <BarChart3 className="h-4 w-4 mr-2" />
          Chart {showChart ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi
          icon={Clock} label="Worked / Required" value={hhmm(totals.worked)} sub={`of ${hhmm(totals.required)}`}
          meter={totals.utilisation} tone="success"
          hint="Total hours captured by the attendance engine against calendar working hours for the month."
        />
        <Kpi
          icon={BarChart3} label="Utilisation" value={`${totals.utilisation.toFixed(1)}%`}
          meter={totals.utilisation} tone={totals.utilisation >= 90 ? "success" : totals.utilisation >= 70 ? "info" : "warning"}
          hint="Worked hours divided by required hours across the filtered employees."
        />
        <Kpi
          icon={Timer} label="Overtime (payable)" value={hhmm(totals.overtime)}
          hint="Hours worked above the required calendar hours — the payable overtime pool."
        />
        <Kpi
          icon={AlertTriangle} label="Deficit" value={hhmm(totals.pending)}
          meter={totals.required > 0 ? (totals.pending / totals.required) * 100 : 0} tone="warning"
          hint="Shortfall against required hours. Review before payroll — this is the LOP-risk pool."
        />
        <Kpi
          icon={AlertTriangle} label="Late arrivals" value={String(totals.late)} sub={`${totals.lateMin} min`}
          hint="Number of days with a late punch, and the total late minutes."
        />
        <Kpi
          icon={CalendarDays} label="Absent days" value={String(totals.absent)} sub={`${totals.noPunch} no-punch emp.`}
          hint="Days marked absent by the engine, plus employees with no punches at all this month."
        />
      </div>

      {/* Insight strip */}
      {!isLoading && filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground bg-muted/40 border rounded-md px-3 py-2">
          <span>{filtered.length} employees</span>
          <span>·</span>
          <span className="text-warning">{totals.underUtilised} below 70% utilisation</span>
          <span>·</span>
          <span>{totals.present} present days logged</span>
          {topOvertime && topOvertime.overtime_seconds > 0 && (
            <>
              <span>·</span>
              <span className="text-info">Top OT: {topOvertime.employee_name} ({hhmm(topOvertime.overtime_seconds)})</span>
            </>
          )}
          {totals.noPunch > 0 && (
            <>
              <span>·</span>
              <span className="text-destructive">{totals.noPunch} with zero punches</span>
            </>
          )}
        </div>
      )}

      {/* Chart */}
      {showChart && chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Worked vs required — top 20 by deficit</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={70} interval={0} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--popover-foreground))" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Required" fill="hsl(var(--muted-foreground))" opacity={0.35} />
                <Bar dataKey="Worked" fill="hsl(var(--primary))" />
                <Bar dataKey="Overtime" fill="hsl(var(--success))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">
            {MONTHS[month - 1]} {year} — {filtered.length} employee(s)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={8} columns={8} /></div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No hours data"
              description='Click "Recompute" to rebuild this month from attendance records.'
            />
          ) : (
            <>
              {/* Mobile */}
              <div className="md:hidden divide-y">
                {filtered.map((r) => {
                  const st = statusOf(r);
                  const util = utilisationOf(r);
                  return (
                    <button key={r.employee_id} onClick={() => setDrill(r)} className="w-full text-left p-3 space-y-2 active:bg-muted/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.employee_name}</div>
                          <div className="text-xs text-muted-foreground">{r.badge_id}</div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_META[st].className}`}>{STATUS_META[st].label}</Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-[11px] tabular-nums">
                        <div><div className="text-[10px] text-muted-foreground">Worked</div><div className="text-success font-medium">{hhmm(r.worked_seconds)}</div></div>
                        <div><div className="text-[10px] text-muted-foreground">Required</div><div>{hhmm(r.required_seconds)}</div></div>
                        <div><div className="text-[10px] text-muted-foreground">OT</div><div className="text-info">{hhmm(r.overtime_seconds)}</div></div>
                        <div><div className="text-[10px] text-muted-foreground">Deficit</div><div className="text-warning">{hhmm(r.pending_seconds)}</div></div>
                      </div>
                      <Meter value={util} tone={util >= 90 ? "success" : util >= 70 ? "info" : "warning"} />
                      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
                        <span>P {r.present_days} · A {r.absent_days}</span>
                        <span>Late {r.late_count} ({r.late_minutes}m)</span>
                        <span>Early {r.early_out_count} ({r.early_minutes}m)</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Desktop */}
              <table className="hidden md:table w-full text-sm min-w-[1050px]">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <Th label="Employee" sortKey="employee_name" />
                    <Th label="Present" sortKey="present_days" align="right" />
                    <Th label="Absent" sortKey="absent_days" align="right" />
                    <Th label="Worked" sortKey="worked_seconds" align="right" />
                    <Th label="Required" sortKey="required_seconds" align="right" />
                    <Th label="Utilisation" sortKey="utilisation" />
                    <Th label="Overtime" sortKey="overtime_seconds" align="right" />
                    <Th label="Deficit" sortKey="pending_seconds" align="right" />
                    <Th label="Late" sortKey="late_minutes" align="right" />
                    <Th label="Early out" sortKey="early_minutes" align="right" />
                    <Th label="Status" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const st = statusOf(r);
                    const util = utilisationOf(r);
                    return (
                      <tr
                        key={r.employee_id}
                        className="border-b last:border-0 hover:bg-muted/40 cursor-pointer"
                        onClick={() => setDrill(r)}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium">{r.employee_name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {r.badge_id}{r.department ? ` · ${r.department}` : ""}{r.shift_name ? ` · ${r.shift_name}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.present_days}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.absent_days > 0 ? "text-destructive" : ""}`}>{r.absent_days}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-success font-medium">{hhmm(r.worked_seconds)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{hhmm(r.required_seconds)}</td>
                        <td className="px-3 py-2 w-32">
                          <div className="flex items-center gap-2">
                            <Meter value={util} tone={util >= 90 ? "success" : util >= 70 ? "info" : "warning"} />
                            <span className="text-[11px] tabular-nums w-10 text-right">{util.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.overtime_seconds > 0 ? "text-info font-medium" : "text-muted-foreground"}`}>{hhmm(r.overtime_seconds)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.pending_seconds > 0 ? "text-warning font-medium" : "text-muted-foreground"}`}>{hhmm(r.pending_seconds)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.late_count} <span className="text-[11px] text-muted-foreground">({r.late_minutes}m)</span></td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.early_out_count} <span className="text-[11px] text-muted-foreground">({r.early_minutes}m)</span></td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-[10px] ${STATUS_META[st].className}`}>{STATUS_META[st].label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      <HoursDrilldownDialog row={drill} year={year} month={month} onClose={() => setDrill(null)} />
    </div>
  );
}

function HoursDrilldownDialog({
  row, year, month, onClose,
}: { row: Row | null; year: number; month: number; onClose: () => void }) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = format(new Date(year, month, 0), "yyyy-MM-dd");

  // V1 doctrine: attendance days come only from the sanctioned reader.
  const { data: days = [], isLoading } = useAttendanceDayRange(
    row ? [row.employee_id] : [],
    from,
    to,
  );


  const t = (ts: string | null) =>
    ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {row?.employee_name} · {MONTHS[month - 1]} {year}
          </DialogTitle>
        </DialogHeader>
        {row && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-md border p-2"><div className="text-muted-foreground">Worked</div><div className="font-medium tabular-nums text-success">{hhmm(row.worked_seconds)}</div></div>
            <div className="rounded-md border p-2"><div className="text-muted-foreground">Required</div><div className="font-medium tabular-nums">{hhmm(row.required_seconds)}</div></div>
            <div className="rounded-md border p-2"><div className="text-muted-foreground">Overtime</div><div className="font-medium tabular-nums text-info">{hhmm(row.overtime_seconds)}</div></div>
            <div className="rounded-md border p-2"><div className="text-muted-foreground">Deficit</div><div className="font-medium tabular-nums text-warning">{hhmm(row.pending_seconds)}</div></div>
          </div>
        )}
        {isLoading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : days.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No daily attendance rows for this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Date", "In", "Out", "Hours", "Late", "Early", "Status"].map((h) => (
                    <th key={h} className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date} className="border-b last:border-0">
                    <td className="px-2 py-1.5 whitespace-nowrap">{format(new Date(`${d.date}T00:00:00`), "dd MMM (EEE)")}</td>
                    <td className="px-2 py-1.5 tabular-nums">{t(d.first_in)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{t(d.last_out)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{Number(d.total_hours || 0).toFixed(2)}</td>
                    <td className={`px-2 py-1.5 tabular-nums ${d.late_minutes > 0 ? "text-warning" : "text-muted-foreground"}`}>{d.late_minutes || 0}m</td>
                    <td className={`px-2 py-1.5 tabular-nums ${d.early_minutes > 0 ? "text-warning" : "text-muted-foreground"}`}>{d.early_minutes || 0}m</td>
                    <td className="px-2 py-1.5 capitalize">{String(d.status || "").replace("_", " ")}</td>
                  </tr>
                ))}

              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
