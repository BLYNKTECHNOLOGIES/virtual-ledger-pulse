import { useMemo, useState } from "react";
import { CalendarClock, Save, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { TableSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { WorkforceKpiCard } from "@/components/horilla/workforce/WorkforceKpiCard";
import {
  useForecastAssumptions,
  useHiringRequirements,
  useSaveForecastAssumption,
  useStaffingMatrix,
  useWorkforceFlows,
  useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";
import { formatIstDate, istToday } from "@/lib/hrms/workforce";

type Period = "30" | "60" | "90" | "180" | "custom";

const PERIODS: { value: Period; label: string }[] = [
  { value: "30", label: "Next 30 days" },
  { value: "60", label: "Next 60 days" },
  { value: "90", label: "Next 90 days" },
  { value: "180", label: "Next 6 months" },
  { value: "custom", label: "Custom" },
];

const APPROVED_HIRING_STATUSES = new Set([
  "approved",
  "recruitment_active",
  "partially_fulfilled",
]);

export default function WorkforceForecastPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");

  const [period, setPeriod] = useState<Period>("90");
  const [customEnd, setCustomEnd] = useState("");
  const [departmentId, setDepartmentId] = useState("all");
  const [attritionInput, setAttritionInput] = useState("");

  const { rows, isLoading } = useStaffingMatrix();
  const { data: lookups } = useWorkforceLookups();
  const { data: requirements = [] } = useHiringRequirements();
  const { data: flows } = useWorkforceFlows();
  const { data: assumptions = [] } = useForecastAssumptions();
  const saveAssumption = useSaveForecastAssumption();

  const today = istToday();
  const horizonEnd = useMemo(() => {
    if (period === "custom") return customEnd || today;
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Number(period));
    return d.toISOString().slice(0, 10);
  }, [period, customEnd, today]);

  const months = useMemo(() => {
    const diff =
      (new Date(horizonEnd).getTime() - new Date(today).getTime()) / 86_400_000;
    return Math.max(0, diff / 30);
  }, [horizonEnd, today]);

  const scopedRows = useMemo(
    () => rows.filter((r) => departmentId === "all" || r.department_id === departmentId),
    [rows, departmentId],
  );

  const attritionPct = useMemo(() => {
    const scoped = assumptions.find((a: any) =>
      departmentId === "all" ? a.department_id === null : a.department_id === departmentId,
    );
    const fallback = assumptions.find((a: any) => a.department_id === null);
    return Number(scoped?.expected_monthly_attrition_pct ?? fallback?.expected_monthly_attrition_pct ?? 0);
  }, [assumptions, departmentId]);

  const forecast = useMemo(() => {
    const current = scopedRows.reduce((a, r) => a + r.current_hc, 0);
    const required = scopedRows.reduce((a, r) => a + r.required_hc, 0);
    const approvedHc = scopedRows.reduce((a, r) => a + r.approved_hc, 0);

    const confirmedJoiners = (flows?.joiners || []).filter((c: any) => {
      if (!c.joining_date) return false;
      if (c.joining_date < today || c.joining_date > horizonEnd) return false;
      if (departmentId === "all") return true;
      return scopedRows.some((r) => r.position_id === c.job_position_id);
    }).length;

    const approvedHiring = requirements
      .filter((r: any) => {
        if (!APPROVED_HIRING_STATUSES.has(r.status)) return false;
        if (departmentId !== "all" && r.department_id !== departmentId) return false;
        if (r.target_joining_date && r.target_joining_date > horizonEnd) return false;
        return true;
      })
      .reduce(
        (a: number, r: any) =>
          a + Math.max(0, (r.number_required || 0) - (r.positions_filled || 0)),
        0,
      );

    const noticeExits = (flows?.notice || []).length;
    const estimatedAttrition = Math.round((current * (attritionPct / 100)) * months);
    const expectedSeparations = noticeExits + estimatedAttrition;

    const projected = current + confirmedJoiners + approvedHiring - expectedSeparations;

    return {
      current,
      required,
      approvedHc,
      confirmedJoiners,
      approvedHiring,
      noticeExits,
      estimatedAttrition,
      expectedSeparations,
      projected,
      gap: required - projected,
    };
  }, [scopedRows, flows, requirements, departmentId, horizonEnd, today, attritionPct, months]);

  const departmentBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { name: string; current: number; required: number; hiring: number }
    >();
    scopedRows.forEach((r) => {
      const name = r.department_name || "Unassigned";
      const e = map.get(name) || { name, current: 0, required: 0, hiring: 0 };
      e.current += r.current_hc;
      e.required += r.required_hc;
      e.hiring += r.uncoveredHiringRequirement;
      map.set(name, e);
    });
    return Array.from(map.values()).sort((a, b) => b.required - a.required);
  }, [scopedRows]);

  return (
    <div className="space-y-4 p-3 md:p-6">
      <PageHeader
        title="Workforce forecast"
        description={`Where staffing lands by ${formatIstDate(horizonEnd)}, using confirmed joiners, approved hiring and people already on notice.`}
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:items-end md:justify-between md:p-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Forecast period</Label>
            <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <TabsList className="flex-wrap">
                {PERIODS.map((p) => (
                  <TabsTrigger key={p.value} value={p.value}>
                    {p.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {period === "custom" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Up to</Label>
                <Input
                  type="date"
                  className="h-9 text-foreground"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1 sm:w-56">
              <Label className="text-xs text-muted-foreground">Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="h-9 text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {(lookups?.departments || []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <WorkforceKpiCard label="On roll today" value={forecast.current} icon={Users} />
            <WorkforceKpiCard
              label="Confirmed joiners"
              value={forecast.confirmedJoiners}
              hint="Offers accepted with a joining date"
              icon={TrendingUp}
              tone="success"
            />
            <WorkforceKpiCard
              label="Approved hiring"
              value={forecast.approvedHiring}
              hint="Still to be filled"
              icon={CalendarClock}
            />
            <WorkforceKpiCard
              label="Expected exits"
              value={forecast.expectedSeparations}
              hint={`${forecast.noticeExits} on notice + ${forecast.estimatedAttrition} estimated`}
              icon={TrendingDown}
              tone={forecast.expectedSeparations > 0 ? "warning" : "default"}
            />
            <WorkforceKpiCard
              label="Projected headcount"
              value={forecast.projected}
              hint={`By ${formatIstDate(horizonEnd)}`}
            />
            <WorkforceKpiCard label="Required headcount" value={forecast.required} />
            <WorkforceKpiCard label="Approved headcount" value={forecast.approvedHc} />
            <WorkforceKpiCard
              label="Projected gap"
              value={forecast.gap}
              hint={forecast.gap > 0 ? "Still short of people" : "Covered"}
              tone={forecast.gap > 0 ? "danger" : "success"}
            />
          </div>

          <Alert>
            <AlertDescription>
              The estimated exits figure is a planning assumption based on{" "}
              {attritionPct || 0}% expected monthly attrition over {months.toFixed(1)} month
              {months >= 2 ? "s" : ""} — it is not a list of named employees. Only the{" "}
              {forecast.noticeExits} people already on notice are actual records.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Department outlook</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {departmentBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No staffing lines in this scope.</p>
                ) : (
                  departmentBreakdown.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center justify-between rounded-lg border border-border p-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          On roll {d.current} · Required {d.required}
                        </p>
                      </div>
                      {d.hiring > 0 ? (
                        <Badge variant="outline" className="border-destructive/30 bg-destructive/15 text-destructive">
                          Hire {d.hiring}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/15 text-emerald-600">
                          Covered
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Attrition assumption</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Expected monthly attrition for{" "}
                  {departmentId === "all"
                    ? "the whole company"
                    : lookups?.departments.find((d) => d.id === departmentId)?.name}
                  .
                </p>
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Percent per month</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      className="h-9 w-28 text-foreground"
                      value={attritionInput === "" ? String(attritionPct) : attritionInput}
                      onChange={(e) => setAttritionInput(e.target.value)}
                      disabled={!canManage}
                    />
                  </div>
                  {canManage && (
                    <Button
                      className="h-9"
                      disabled={saveAssumption.isPending}
                      onClick={() =>
                        saveAssumption.mutate(
                          {
                            departmentId: departmentId === "all" ? null : departmentId,
                            pct: Number(attritionInput || attritionPct) || 0,
                          },
                          { onSuccess: () => setAttritionInput("") },
                        )
                      }
                    >
                      <Save className="h-4 w-4" /> Save
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
