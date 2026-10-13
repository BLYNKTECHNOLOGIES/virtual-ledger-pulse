import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, GraduationCap, RotateCcw, Save, TrendingDown, TrendingUp, Users } from "lucide-react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { WorkforceKpiCard } from "@/components/horilla/workforce/WorkforceKpiCard";
import {
  useAttritionHistory,
  useForecastAssumptions,
  useForecastEvents,
  useSaveForecastAssumption,
  useStaffingMatrix,
  useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";
import { formatIstDate, istToday, planningShifts } from "@/lib/hrms/workforce";
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
          (positionId === "all" || r.position_id === positionId) &&
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

  const events = (eventsQ.data || []) as ForecastEvent[];
  const forecast = useMemo(
    () => buildForecast({ today, end, lines, events, includePending, attritionPct }),
    [today, end, lines, events, includePending, attritionPct],
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

  return (
    <div className="space-y-4 p-3 md:p-6">
      <PageHeader
        title="Workforce forecast"
        description={`Month by month to ${formatIstDate(end)}: on roll + trainees moving to the floor + confirmed joiners + expected hires − people leaving − estimated attrition, against what each staffing line requires.`}
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Horizon</Label>
              <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <TabsList className="flex-wrap">
                  {PERIODS.map((p) => <TabsTrigger key={p.value} value={p.value}>{p.label}</TabsTrigger>)}
                </TabsList>
              </Tabs>
            </div>
            {period === "custom" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Up to</Label>
                <Input type="date" min={today} className="h-9 text-foreground" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ScopeSelect label="Department" value={departmentId} onChange={setDepartmentId} all="All departments"
              options={(lookups?.departments || []).map((d) => ({ value: d.id, label: d.name }))} />
            <ScopeSelect label="Shift" value={shift} onChange={setShift} all="All shifts"
              options={planningShifts((lookups?.shifts || []) as any[]).map((s: any) => ({ value: s.name, label: s.name }))} />
            <ScopeSelect label="Role" value={positionId} onChange={setPositionId} all="All roles"
              options={(lookups?.positions || []).filter((p: any) => p.in_workforce_planning !== false)
                .filter((p: any) => departmentId === "all" || p.department_id === departmentId)
                .map((p: any) => ({ value: p.id, label: p.title }))} />
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <Switch checked={includePending} onCheckedChange={setIncludePending} />
              Include requests awaiting approval
            </label>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <TableSkeleton />
      ) : matrix.isError || eventsQ.isError ? (
        <ErrorState title="Couldn't load the forecast" error={matrix.error || eventsQ.error}
          onRetry={() => { matrix.refetch(); eventsQ.refetch(); }} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <WorkforceKpiCard label="On roll today" value={t.opening} icon={Users} hint={`${lines.length} staffing lines in scope`} />
            <WorkforceKpiCard label="Coming in" value={t.trainees + t.joiners + t.hires} icon={TrendingUp} tone="success"
              hint={`${t.trainees} trainees · ${t.joiners} joiners · ${t.hires} expected hires`} />
            <WorkforceKpiCard label="Going out" value={t.exits + t.attrition} icon={TrendingDown}
              tone={t.exits + t.attrition > 0 ? "warning" : "default"} hint={`${t.exits} on notice · ${t.attrition} estimated`} />
            <WorkforceKpiCard label={`Projected by ${formatIstDate(end)}`} value={t.closing} hint={`Required ${t.required}`} />
            <WorkforceKpiCard label="Short on lines" value={t.lineGap} icon={CalendarClock} tone={t.lineGap > 0 ? "danger" : "success"}
              hint="Sum of each line's shortfall at the horizon" />
            <WorkforceKpiCard label="Estimated extra need" value={t.estimatedExtraNeed} tone={t.estimatedExtraNeed > 0 ? "warning" : "default"}
              hint="From attrition estimate — not tied to a line" />
            <WorkforceKpiCard label="Attrition used" value={`${attritionPct}%`} hint={`a month · ${sourceText}`} />
            <WorkforceKpiCard label="Undated hires" value={t.undatedHires} icon={GraduationCap}
              hint="No target date — placed at the end of the horizon" />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Month by month</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Month</th>
                    <th className="px-1 text-right font-medium">Opening</th>
                    <th className="px-1 text-right font-medium">+ Trainees</th>
                    <th className="px-1 text-right font-medium">+ Joiners</th>
                    <th className="px-1 text-right font-medium">+ Hires</th>
                    <th className="px-1 text-right font-medium">− Leaving</th>
                    <th className="px-1 text-right font-medium">− Attrition (estimate)</th>
                    <th className="px-1 text-right font-medium">Closing</th>
                    <th className="px-1 text-right font-medium">Required</th>
                    <th className="px-1 text-right font-medium">Short on lines</th>
                    <th className="pl-1 text-right font-medium">Extra need (estimate)</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {forecast.months.map((m) => (
                    <tr key={m.key} className="border-b border-border/60">
                      <td className="py-2 pr-2 font-sans text-foreground">
                        {monthName(m.key)}
                        {m.partial && <span className="ml-1 text-xs text-muted-foreground">{formatIstDate(m.start).slice(0, 6)}–{formatIstDate(m.end).slice(0, 6)}</span>}
                      </td>
                      <td className="px-1 text-right">{m.opening}</td>
                      <td className="px-1 text-right">{m.trainees || "—"}</td>
                      <td className="px-1 text-right">{m.joiners || "—"}</td>
                      <td className="px-1 text-right">{m.hires || "—"}{m.undatedHires > 0 && <span className="font-sans text-xs text-muted-foreground"> ({m.undatedHires} undated)</span>}</td>
                      <td className="px-1 text-right">{m.exits || "—"}</td>
                      <td className="px-1 text-right text-muted-foreground">{m.attrition || "—"}</td>
                      <td className="px-1 text-right font-semibold text-foreground">{m.closing}</td>
                      <td className="px-1 text-right">{m.required}</td>
                      <td className={`px-1 text-right ${m.lineGap > 0 ? "text-destructive" : "text-success"}`}>{m.lineGap}</td>
                      <td className="pl-1 text-right text-muted-foreground">{m.estimatedExtraNeed || "—"}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-foreground">
                    <td className="py-2 pr-2 font-sans">Total</td>
                    <td className="px-1 text-right">{t.opening}</td>
                    <td className="px-1 text-right">{t.trainees}</td>
                    <td className="px-1 text-right">{t.joiners}</td>
                    <td className="px-1 text-right">{t.hires}</td>
                    <td className="px-1 text-right">{t.exits}</td>
                    <td className="px-1 text-right">{t.attrition}</td>
                    <td className="px-1 text-right">{t.closing}</td>
                    <td className="px-1 text-right">{t.required}</td>
                    <td className="px-1 text-right">{t.lineGap}</td>
                    <td className="pl-1 text-right">{t.estimatedExtraNeed}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Short on lines adds up each staffing line's own shortfall (required − projected, when positive); a surplus on one line never covers another.
                Expected hires are the people still to hire on {includePending ? "approved, recruiting and awaiting-approval" : "approved and recruiting"} requirements, on their target joining date.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Closing vs required</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <ChartTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                  <Bar dataKey="In" fill="hsl(var(--success))" />
                  <Bar dataKey="Out" fill="hsl(var(--destructive))" />
                  <Line type="monotone" dataKey="Closing" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="Required" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 4" />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Alert>
            <AlertDescription>
              Estimated attrition ({attritionPct}% a month of the opening figure) is a planning assumption, not an actual employee count — it names nobody.
              People actually leaving are counted separately from their last working day.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Leaving in this period ({leavers.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {leavers.length === 0 ? <p className="text-sm text-muted-foreground">Nobody on notice leaves in this period.</p> :
                  leavers.map((e) => (
                    <div key={e.ref_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{e.person_name}{e.badge_id ? ` (${e.badge_id})` : ""}</p>
                        <p className="text-xs text-muted-foreground">{e.role_title} · {e.shift_name || "No shift"} · last day {formatIstDate(e.event_date)}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {!e.plan_id && <Badge variant="outline">Not on a staffing line — outside the figures</Badge>}
                        {e.related_requirement_no
                          ? <Badge variant="outline">Replacement {e.related_requirement_no}</Badge>
                          : <Badge variant="outline" className="text-muted-foreground">No replacement request</Badge>}
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Joining in this period ({joiners.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {joiners.length === 0 ? <p className="text-sm text-muted-foreground">No confirmed joiners or trainees finishing in this period.</p> :
                  joiners.map((e) => (
                    <div key={`${e.kind}-${e.ref_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{e.person_name}{e.badge_id ? ` (${e.badge_id})` : ""}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.kind === "trainee" ? "Finishes training" : "Joins"} {e.event_date ? formatIstDate(e.event_date) : "— no date (counted at the end)"}
                          {" · "}{e.plan_id ? lineLabel.get(e.plan_id) : e.role_title}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{e.kind === "trainee" ? "Trainee" : "Onboarding"}</Badge>
                        {e.requirement_no && <Badge variant="outline">{e.requirement_no}</Badge>}
                        {!e.plan_id && <Badge variant="outline">Not on a staffing line</Badge>}
                      </div>
                    </div>
                  ))}
                {hires.length > 0 && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    Plus {hires.reduce((a, h) => a + h.qty, 0)} expected hires from{" "}
                    {hires.map((h, i) => <span key={h.ref_id}>{i > 0 && ", "}<Link className="text-primary underline" to={`/hrms/workforce-planning/hiring-requirements?req=${h.ref_id}`}>{h.requirement_no}</Link></span>)}.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Attrition assumption — {deptName}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {historyQ.isError ? "Actual history couldn't be loaded." :
                  `${actual.exits} exit${actual.exits === 1 ? "" : "s"} in the last ${actual.months} months · ${actual.pct}% a month (planned roles only).`}
                {" "}Using: <span className="font-medium text-foreground">{attritionPct}% — {sourceText}</span>.
                {override?.notes ? ` Note: ${override.notes}` : ""}
              </p>
              {canManage && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Custom % per month {deptKey ? "for this department" : "company-wide"}</Label>
                    <Input type="number" min={0} max={100} step="0.1" className="h-9 w-32 text-foreground"
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
            </CardContent>
          </Card>
        </>
      )}
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
