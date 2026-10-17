import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Save } from "lucide-react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricStrip, StatusPill } from "@/components/ats/AtsUi";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import {
  useAttritionHistory,
  useForecastAssumptions,
  useForecastEvents,
  useSaveForecastAssumption,
  useStaffingMatrix,
  useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";
import { formatIstDate, istToday, planningShifts, rotaOrder } from "@/lib/hrms/workforce";
import {
  actualAttrition,
  buildForecast,
  horizonEndFor,
  isCountedHire,
  type ForecastEvent,
} from "@/lib/hrms/workforceForecast";

type Period = "30" | "60" | "90" | "180" | "custom";
const PERIODS: { value: Period; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "6 months" },
  { value: "custom", label: "Custom" },
];

const monthName = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export default function WorkforceForecastPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");

  const [period, setPeriod] = useState<Period>("90");
  const [customEnd, setCustomEnd] = useState("");
  const [departmentId, setDepartmentId] = useState("all");
  const [shift, setShift] = useState("all");
  const [positionId, setPositionId] = useState("all");
  const [includePending, setIncludePending] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const matrix = useStaffingMatrix();
  const { data: lookups } = useWorkforceLookups();
  const eventsQ = useForecastEvents();
  const deptKey = departmentId === "all" ? null : departmentId;
  const historyQ = useAttritionHistory(deptKey);
  const { data: assumptions = [] } = useForecastAssumptions();
  const saveAssumption = useSaveForecastAssumption();

  const today = istToday();
  const end = horizonEndFor(today, period, customEnd);

  const lines = useMemo(
    () =>
      matrix.rows.filter(
        (r) =>
          (departmentId === "all" || r.department_id === departmentId) &&
          // A line counts for a role when the role is any of its roles (shared lines included).
          (positionId === "all" || r.position_id === positionId || (r.role_ids ?? []).includes(positionId)) &&
          (shift === "all" || r.shiftLabel === shift),
      ),
    [matrix.rows, departmentId, positionId, shift],
  );
  const lineIds = useMemo(() => new Set(lines.map((l) => l.plan_id)), [lines]);
  const lineLabel = useMemo(
    () => new Map(matrix.rows.map((r) => [r.plan_id, `${r.position_title} · ${r.shiftLabel}`])),
    [matrix.rows],
  );

  // Attrition source: department override → company override → actual history.
  const override = useMemo(() => {
    const own = (assumptions as any[]).find((a) => (deptKey ? a.department_id === deptKey : a.department_id === null));
    const company = (assumptions as any[]).find((a) => a.department_id === null);
    return own ?? (deptKey ? company : undefined) ?? null;
  }, [assumptions, deptKey]);
  const actual = useMemo(() => actualAttrition((historyQ.data || []) as any), [historyQ.data]);
  const attritionPct = override ? Number(override.expected_monthly_attrition_pct) || 0 : actual.pct;

  const { data: setByName } = useQuery({
    queryKey: ["workforce_user_name", override?.updated_by],
    enabled: !!override?.updated_by,
    queryFn: async () => {
      const { data } = await supabase.from("users").select("first_name, last_name, username").eq("id", override.updated_by).maybeSingle();
      return data ? [data.first_name, data.last_name].filter(Boolean).join(" ") || data.username || null : null;
    },
  });

  useEffect(() => setCustomInput(""), [deptKey]);

  const events = useMemo(() => (eventsQ.data || []) as ForecastEvent[], [eventsQ.data]);
  // Leavers on no line follow the department / role filters (they have no shift line, so not when a shift is chosen).
  const scopedEvents = useMemo(() => events.filter((e) => e.plan_id ||
    ((departmentId === "all" || e.department_id === departmentId) && (positionId === "all" || e.position_id === positionId) && shift === "all")),
  [events, departmentId, positionId, shift]);
  const forecast = useMemo(
    () => buildForecast({ today, end, lines, events: scopedEvents, includePending, attritionPct }),
    [today, end, lines, scopedEvents, includePending, attritionPct],
  );

  // People lists: in the horizon and in the selected department / role (shift via their line).
  const inScopePerson = (e: ForecastEvent) =>
    (departmentId === "all" || e.department_id === departmentId) &&
    (positionId === "all" || e.position_id === positionId) &&
    (shift === "all" || (e.plan_id ? lineIds.has(e.plan_id) : false)) &&
    (!e.event_date || e.event_date <= end);
  const leavers = events.filter((e) => e.kind === "exit" && inScopePerson(e))
    .sort((a, b) => (a.event_date || "9").localeCompare(b.event_date || "9"));
  const joiners = events.filter((e) => (e.kind === "joiner" || e.kind === "trainee") && inScopePerson(e))
    .sort((a, b) => (a.event_date || "9").localeCompare(b.event_date || "9"));
  const hires = events.filter((e) => e.kind === "hire" && e.plan_id && lineIds.has(e.plan_id) && isCountedHire(e, includePending)
    && (!e.event_date || e.event_date <= end));

  const chartData = forecast.months.map((m) => ({
    name: monthName(m.key),
    Closing: m.closing,
    Required: m.required,
    In: m.trainees + m.joiners + m.hires,
    Out: -(m.exits + m.attrition),
  }));

  const deptName = deptKey ? lookups?.departments.find((d) => d.id === deptKey)?.name : "the whole company";
  const sourceText = override
    ? `Custom${override.department_id === null && deptKey ? " (company-wide)" : ""}, set by ${setByName || "an HR manager"} on ${formatIstDate(override.updated_at)}`
    : `Actual, last ${actual.months} months`;
  const t = forecast.totals;
  const loading = matrix.isLoading || eventsQ.isLoading;

  const historyReady = !!override || historyQ.isSuccess || historyQ.isError;
  const inflow = t.trainees + t.joiners + t.hires;
  const outflow = t.exits + t.attrition;

  return (
    <div className="hrms-page space-y-4">
      <PageHeader
        title="Workforce forecast"
        description={`Headcount month by month up to ${formatIstDate(end)}: people on roll, trainees moving to the floor, joiners and expected hires in, people leaving and estimated attrition out — against what each staffing line requires.`}
      />

      <div className="space-y-3 rounded-xl border border-border bg-card p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl<Period> aria-label="Horizon" size="sm" value={period} onValueChange={setPeriod}
            options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} />
          {period === "custom" && (
            <Input type="date" min={today} aria-label="Forecast up to" className="h-9 w-44 text-foreground" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          )}
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Switch checked={includePending} onCheckedChange={setIncludePending} />
            Count requests awaiting approval
          </label>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))] lg:max-w-3xl">
          <ScopeSelect label="Department" value={departmentId} onChange={(v) => { setDepartmentId(v); setPositionId("all"); }} all="All departments"
            options={(lookups?.departments || []).map((d) => ({ value: d.id, label: d.name }))} />
          <ScopeSelect label="Shift" value={shift} onChange={setShift} all="All shifts"
            options={rotaOrder(planningShifts((lookups?.shifts || []) as any[])).map((s: any) => ({ value: s.name, label: s.name }))} />
          <ScopeSelect label="Role" value={positionId} onChange={setPositionId} all="All roles"
            options={(lookups?.positions || []).filter((p: any) => p.in_workforce_planning !== false)
              .filter((p: any) => departmentId === "all" || p.department_id === departmentId)
              .map((p: any) => ({ value: p.id, label: p.title }))} />
        </div>
      </div>

      {loading ? (
        <>
          <MetricStrip className="sm:grid-cols-4 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card px-4 py-3.5"><Skeleton className="h-3 w-20" /><Skeleton className="mt-2 h-7 w-14" /><Skeleton className="mt-2 h-3 w-28" /></div>
          ))}</MetricStrip>
          <Skeleton className="h-72 w-full rounded-xl" />
        </>
      ) : (matrix.isError && !matrix.data) || (eventsQ.isError && !eventsQ.data) ? (
        <ErrorState title="Couldn't load the forecast" error={matrix.error || eventsQ.error}
          onRetry={() => { matrix.refetch(); eventsQ.refetch(); }} />
      ) : (
        <>
          <div className="space-y-1.5">
            <MetricStrip className="sm:grid-cols-4 xl:grid-cols-4">
              <Cell label="On roll today" value={t.opening} helper={`${lines.length} staffing line${lines.length === 1 ? "" : "s"} in scope`} />
              <Cell label={`By ${formatIstDate(end)}`} value={historyReady ? <>{t.closing}<span className="text-lg font-medium text-muted-foreground"> / {t.required}</span></> : "…"}
                helper={`+${inflow} in · −${historyReady ? outflow : "…"} out`} />
              <Cell label="Short on lines then" tone={t.lineGap > 0 ? "danger" : "success"} value={t.lineGap}
                helper={includePending ? "if approved and pending hiring lands on time" : "if approved hiring lands on its target date"} />
              <Cell label="Attrition estimate" value={historyReady ? `${attritionPct}%` : "…"} helper={`a month · ${override ? "custom" : "actual, last 12 months"}`} />
            </MetricStrip>
            {t.undatedHires > 0 && (
              <p className="text-xs text-muted-foreground">
                {t.undatedHires} expected hire{t.undatedHires === 1 ? " has" : "s have"} no target joining date and {t.undatedHires === 1 ? "is" : "are"} counted at the end of the period.
              </p>
            )}
          </div>

          <section className="rounded-xl border border-border bg-card p-4" aria-label="Closing against required">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-[15px] font-semibold text-foreground">Closing headcount against required</h2>
              <p className="text-xs text-muted-foreground">Bars: people coming in (green) and going out (red) each month</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="In" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Out" fill="hsl(var(--destructive))" radius={[0, 0, 3, 3]} maxBarSize={28} />
                  <Line type="monotone" dataKey="Closing" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Required" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card" aria-label="Month by month">
            <header className="border-b border-border px-4 py-3">
              <h2 className="font-display text-[15px] font-semibold text-foreground">Month by month</h2>
              <p className="text-xs text-muted-foreground">Short on lines adds up each line's own shortfall; a surplus on one line never covers another.</p>
            </header>
            {/* Phones: one card per month (no sideways scrolling) */}
            <div className="space-y-2 p-3 md:hidden">
              {forecast.months.map((m) => (
                <div key={m.key} className="rounded-lg border border-border p-2.5 text-sm">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2">
                    <p className="font-medium text-foreground">{monthName(m.key)}{m.partial && <span className="ml-1 text-xs text-muted-foreground">{formatIstDate(m.start).slice(0, 6)}–{formatIstDate(m.end).slice(0, 6)}</span>}</p>
                    <p className={`text-xs font-medium ${m.lineGap > 0 ? "text-destructive" : "text-success"}`}>{m.lineGap > 0 ? `short ${m.lineGap}` : "met"}</p>
                  </div>
                  <dl className="mt-1 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-3 gap-y-0.5 text-xs tabular-nums">
                    <dt className="text-muted-foreground">Opening</dt><dd className="text-right">{m.opening}</dd>
                    <dt className="text-muted-foreground">+ Trainees / joiners</dt><dd className="text-right">{m.trainees} / {m.joiners}</dd>
                    <dt className="text-muted-foreground">+ Expected hires</dt><dd className="text-right">{m.hires}{m.undatedHires > 0 ? ` (${m.undatedHires} undated)` : ""}</dd>
                    <dt className="text-muted-foreground">− Leaving</dt><dd className="text-right">{m.exits}{m.outsideExits > 0 ? ` (+${m.outsideExits} off-line)` : ""}</dd>
                    <dt className="text-muted-foreground">− Attrition (estimate)</dt><dd className="text-right">{m.attrition}</dd>
                    <dt className="text-muted-foreground">Closing / required</dt><dd className="text-right font-semibold text-foreground">{m.closing} / {m.required}</dd>
                  </dl>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Month</th>
                    <th className="px-2 py-2 text-right font-medium">Opening</th>
                    <th className="px-2 py-2 text-right font-medium">+ Trainees</th>
                    <th className="px-2 py-2 text-right font-medium">+ Joiners</th>
                    <th className="px-2 py-2 text-right font-medium">+ Hires</th>
                    <th className="px-2 py-2 text-right font-medium">− Leaving</th>
                    <th className="px-2 py-2 text-right font-medium">− Attrition</th>
                    <th className="px-2 py-2 text-right font-medium">Closing</th>
                    <th className="px-2 py-2 text-right font-medium">Required</th>
                    <th className="px-4 py-2 text-right font-medium">Short on lines</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {forecast.months.map((m) => (
                    <tr key={m.key} className="border-b border-border/60">
                      <td className="px-4 py-2 text-foreground">
                        {monthName(m.key)}
                        {m.partial && <span className="ml-1 text-xs text-muted-foreground">{formatIstDate(m.start).slice(0, 6)}–{formatIstDate(m.end).slice(0, 6)}</span>}
                      </td>
                      <td className="px-2 py-2 text-right">{m.opening}</td>
                      <td className="px-2 py-2 text-right">{m.trainees || "—"}</td>
                      <td className="px-2 py-2 text-right">{m.joiners || "—"}</td>
                      <td className="px-2 py-2 text-right">{m.hires || "—"}{m.undatedHires > 0 && <span className="text-xs text-muted-foreground"> ({m.undatedHires} undated)</span>}</td>
                      <td className="px-2 py-2 text-right">{m.exits || "—"}{m.outsideExits > 0 && <span className="text-xs text-muted-foreground"> (+{m.outsideExits} off-line)</span>}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">{m.attrition || "—"}</td>
                      <td className="px-2 py-2 text-right font-semibold text-foreground">{m.closing}</td>
                      <td className="px-2 py-2 text-right">{m.required}</td>
                      <td className={`px-4 py-2 text-right font-medium ${m.lineGap > 0 ? "text-destructive" : "text-success"}`}>{m.lineGap > 0 ? m.lineGap : "met"}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-foreground">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-2 py-2 text-right">{t.opening}</td>
                    <td className="px-2 py-2 text-right">{t.trainees}</td>
                    <td className="px-2 py-2 text-right">{t.joiners}</td>
                    <td className="px-2 py-2 text-right">{t.hires}</td>
                    <td className="px-2 py-2 text-right">{t.exits}{t.outsideExits > 0 && <span className="text-xs font-normal text-muted-foreground"> (+{t.outsideExits} off-line)</span>}</td>
                    <td className="px-2 py-2 text-right">{t.attrition}</td>
                    <td className="px-2 py-2 text-right">{t.closing}</td>
                    <td className="px-2 py-2 text-right">{t.required}</td>
                    <td className="px-4 py-2 text-right">{t.lineGap}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              Expected hires are the people still to find on {includePending ? "approved, recruiting and awaiting-approval" : "approved and recruiting"} requests, on their target joining date.
              {t.outsideExits > 0 ? ` "Off-line" = people leaving who sit on no staffing line; they are not in the opening or closing figures.` : ""}
            </p>
          </section>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card" aria-label="Leaving in this period">
              <header className="border-b border-border px-4 py-3">
                <h2 className="font-display text-[15px] font-semibold text-foreground">Leaving in this period ({leavers.length})</h2>
              </header>
              <div className="space-y-2 p-3">
                {leavers.length === 0 ? <p className="px-1 py-2 text-sm text-muted-foreground">Nobody on notice leaves in this period.</p> :
                  leavers.map((e) => (
                    <div key={e.ref_id} className="rounded-lg border border-border p-2.5 text-sm">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                        {e.person_name}{e.badge_id && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-normal text-muted-foreground">ID {e.badge_id}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{e.role_title} · {e.shift_name || "No shift"} · last day {formatIstDate(e.event_date)}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {!e.plan_id && <StatusPill tone="neutral">Not on a staffing line</StatusPill>}
                        {e.related_requirement_no
                          ? <StatusPill tone="success">Replacement {e.related_requirement_no}</StatusPill>
                          : <StatusPill tone="warning">No replacement request</StatusPill>}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
            <section className="rounded-xl border border-border bg-card" aria-label="Joining in this period">
              <header className="border-b border-border px-4 py-3">
                <h2 className="font-display text-[15px] font-semibold text-foreground">Joining in this period ({joiners.length})</h2>
              </header>
              <div className="space-y-2 p-3">
                {joiners.length === 0 ? <p className="px-1 py-2 text-sm text-muted-foreground">No confirmed joiners or trainees finishing in this period.</p> :
                  joiners.map((e) => (
                    <div key={`${e.kind}-${e.ref_id}`} className="rounded-lg border border-border p-2.5 text-sm">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                        {e.person_name}{e.badge_id && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-normal text-muted-foreground">ID {e.badge_id}</span>}
                        <StatusPill tone={e.kind === "trainee" ? "primary" : "success"}>{e.kind === "trainee" ? "Finishes training" : "Joins"}</StatusPill>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {e.event_date ? formatIstDate(e.event_date) : "No date (counted at the end)"} · {e.plan_id ? lineLabel.get(e.plan_id) : `${e.role_title} · not on a staffing line`}
                        {e.requirement_no ? ` · ${e.requirement_no}` : ""}
                      </p>
                    </div>
                  ))}
                {hires.length > 0 && (
                  <p className="px-1 pt-1 text-xs text-muted-foreground">
                    Plus {hires.reduce((a, h) => a + h.qty, 0)} expected hires from{" "}
                    {hires.map((h, i) => <span key={h.ref_id}>{i > 0 && ", "}<Link className="text-primary underline-offset-2 hover:underline" to={`/hrms/workforce-planning/hiring-requirements?req=${h.ref_id}`}>{h.requirement_no}</Link>{!h.event_date && " (no date)"}</span>)}.
                  </p>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-border bg-card p-4" aria-label="Attrition estimate">
            <h2 className="font-display text-[15px] font-semibold text-foreground">Attrition estimate — {deptName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A planning assumption ({attritionPct}% a month of the opening figure), not real people — it names nobody. People actually leaving are counted from their last working day.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {historyQ.isError ? "Actual history couldn't be loaded." : !historyQ.data ? "Loading the actual history…" :
                `${actual.exits} exit${actual.exits === 1 ? "" : "s"} in the last ${actual.months} months = ${actual.pct}% a month (planned roles only).`}
              {" "}In use: <span className="font-medium text-foreground">{attritionPct}% — {sourceText}</span>.
              {override?.notes ? ` Note: ${override.notes}` : ""}
            </p>
            {canManage && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="fc-custom" className="text-xs text-muted-foreground">Custom % per month {deptKey ? "for this department" : "company-wide"}</Label>
                  <Input id="fc-custom" type="number" min={0} max={100} step="0.1" className="h-9 w-32 text-foreground"
                    value={customInput} placeholder={String(attritionPct)} onChange={(e) => setCustomInput(e.target.value)} />
                </div>
                <Button className="h-9" disabled={saveAssumption.isPending || customInput === "" || Number(customInput) < 0 || Number(customInput) > 100}
                  onClick={() => saveAssumption.mutate(
                    { departmentId: deptKey, pct: Number(customInput),
                      notes: `Custom rate replaces actual ${actual.pct}% (${actual.exits} exits / ${actual.months} months)` },
                    { onSuccess: () => setCustomInput("") })}>
                  <Save className="h-4 w-4" /> Use custom rate
                </Button>
                {override && (override.department_id === deptKey) && (
                  <Button variant="outline" className="h-9" disabled={saveAssumption.isPending}
                    onClick={() => saveAssumption.mutate({ departmentId: deptKey, pct: null })}>
                    <RotateCcw className="h-4 w-4" /> Use actual
                  </Button>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const CELL_TONE: Record<string, string> = { default: "text-foreground", danger: "text-destructive", success: "text-emerald-600 dark:text-emerald-400" };
function Cell({ label, value, helper, tone = "default" }: { label: string; value: React.ReactNode; helper?: React.ReactNode; tone?: keyof typeof CELL_TONE }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className={cn("mt-1 font-display text-[28px] font-semibold leading-8 tabular-nums", CELL_TONE[tone])}>{value}</div>
      <div className="mt-0.5 min-h-4 text-xs leading-4 text-muted-foreground">{helper}</div>
    </div>
  );
}

function ScopeSelect({ label, value, onChange, all, options }: {
  label: string; value: string; onChange: (v: string) => void; all: string; options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{all}</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
