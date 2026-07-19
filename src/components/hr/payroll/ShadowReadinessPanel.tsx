import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ShadowReadiness } from "@/hooks/hrms/useShadowReadiness";

type Light = "green" | "amber" | "red";

function LightDot({ light }: { light: Light }) {
  const map: Record<Light, string> = {
    green: "bg-success shadow-[0_0_0_3px_hsl(var(--success)/0.2)]",
    amber: "bg-warning shadow-[0_0_0_3px_hsl(var(--warning)/0.2)]",
    red: "bg-destructive shadow-[0_0_0_3px_hsl(var(--destructive)/0.2)]",
  };
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full shrink-0", map[light])} />;
}

function Signal({
  light, label, value, hint,
}: { light: Light; label: string; value: string; hint: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-background">
      <LightDot light={light} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{label}</div>
          <div className="text-sm font-semibold text-foreground whitespace-nowrap">{value}</div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>
      </div>
    </div>
  );
}

export function ShadowReadinessPanel({
  data,
  isLoading,
  period,
}: {
  data: ShadowReadiness | undefined;
  isLoading: boolean;
  period: string;
}) {
  if (isLoading || !data) {
    return (
      <Card className="p-4 flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Checking shadow readiness for {period.slice(0, 7)}…</span>
      </Card>
    );
  }

  const attLight: Light = data.attendance_coverage_pct >= 90 ? "green" : data.attendance_coverage_pct >= 50 ? "amber" : "red";
  const regLight: Light = data.register_imported ? "green" : "red";
  const inpLight: Light = data.inputs_staged_count > 0 ? "green" : "amber";
  const enrLight: Light = data.enrollment_resolved_pct >= 80 ? "green" : data.enrollment_resolved_pct >= 40 ? "amber" : "red";

  const tier = data.readiness_tier;
  const tierMeta = {
    trustworthy: {
      icon: <CheckCircle2 className="h-4 w-4" />, label: "Trustworthy",
      className: "border-success/50 text-success bg-success/10",
      copy: "Attendance, register and enrollment are all present. Drift alerts from this run will be treated as authoritative.",
    },
    approximate: {
      icon: <AlertTriangle className="h-4 w-4" />, label: "Approximate",
      className: "border-warning/50 text-warning bg-warning/10",
      copy: "Some inputs are missing. The run will complete but downstream drift alerts will be tagged as approximate — do not act on them without verifying the missing input.",
    },
    unusable: {
      icon: <XCircle className="h-4 w-4" />, label: "Unusable",
      className: "border-destructive/50 text-destructive bg-destructive/10",
      copy: "Neither attendance nor a payroll register exists for this month. Import one before running — Run is disabled until then.",
    },
  }[tier];

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-foreground">Shadow readiness · {period.slice(0, 7)}</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Which inputs are available for this month. Persisted on every run as <code className="text-[10px]">input_completeness</code> so drift alerts stay honest.
          </p>
        </div>
        <Badge variant="outline" className={cn("gap-1.5", tierMeta.className)}>
          {tierMeta.icon}
          <span className="font-semibold">{tierMeta.label}</span>
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Signal
          light={attLight}
          label="Attendance coverage"
          value={`${data.attendance_coverage_pct}%`}
          hint={data.active_employees > 0
            ? `${Math.round((data.attendance_coverage_pct / 100) * data.active_employees)} / ${data.active_employees} employees with any punch this month`
            : "No active employees"}
        />
        <Signal
          light={regLight}
          label="Register imported"
          value={data.register_imported ? "Yes" : "No"}
          hint={data.register_imported
            ? `${data.register_employee_count} employee${data.register_employee_count === 1 ? "" : "s"} in the imported salary register`
            : "Import via Payslip History Import or Salary Register Import"}
        />
        <Signal
          light={inpLight}
          label="Inputs staged"
          value={`${data.inputs_staged_count}`}
          hint={data.inputs_staged_count > 0
            ? "Approved additions + deductions ready to fold in"
            : "No OT / KPI-Loss / one-off inputs approved for this period"}
        />
        <Signal
          light={enrLight}
          label="Enrollment resolved"
          value={`${data.enrollment_resolved_pct}%`}
          hint={`${Math.round((data.enrollment_resolved_pct / 100) * data.active_employees)} / ${data.active_employees} employees have PF/ESI/PT flags set (rest fall back to global toggles)`}
        />
      </div>

      <div className={cn("text-xs rounded-md border p-2.5", tierMeta.className)}>
        {tierMeta.copy}
      </div>
    </Card>
  );
}
