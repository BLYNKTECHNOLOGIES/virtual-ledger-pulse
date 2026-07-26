import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Activity,
  Mail,
  Cpu,
  ScaleIcon,
  Clock,
  Beaker,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldAlert,
  FileCheck,
} from "lucide-react";
import { useSystemPulse, useSystemPulseExtras, type CronPulseRow } from "@/hooks/hrms/useSystemPulse";

type Tone = "ok" | "warn" | "bad" | "muted";

function StatusIcon({ tone }: { tone: Tone }) {
  if (tone === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (tone === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (tone === "bad") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

function Tile({
  icon: Icon,
  title,
  tone,
  primary,
  secondary,
  actionHref,
  actionLabel,
}: {
  icon: any;
  title: string;
  tone: Tone;
  primary: string;
  secondary?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const border =
    tone === "bad" ? "border-destructive/40" :
    tone === "warn" ? "border-amber-500/40" :
    tone === "ok" ? "border-emerald-500/30" :
    "border-border";

  return (
    <Card className={border}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Icon className="h-4 w-4 text-primary" />
            {title}
          </div>
          <StatusIcon tone={tone} />
        </div>
        <div className="text-2xl font-semibold tabular-nums text-foreground">{primary}</div>
        {secondary && <div className="text-xs text-muted-foreground">{secondary}</div>}
        {actionHref && (
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
            {actionHref.startsWith("http") ? (
              <a href={actionHref} target="_blank" rel="noreferrer">
                {actionLabel} <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            ) : (
              <Link to={actionHref}>{actionLabel} →</Link>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function cronTone(rows: CronPulseRow[]): { tone: Tone; failing: number; stale: number } {
  let failing = 0, stale = 0;
  for (const r of rows) {
    if (r.last_status && r.last_status !== "succeeded") failing++;
    // "stale" = no run in > 26 h for daily-or-more-frequent jobs
    if (r.seconds_since === null || r.seconds_since === undefined) stale++;
    else if (!r.schedule.includes("*/") && r.seconds_since > 60 * 60 * 26) stale++;
  }
  const tone: Tone = failing > 0 ? "bad" : stale > 0 ? "warn" : "ok";
  return { tone, failing, stale };
}

export default function SystemPulsePage() {
  const { data, isLoading, refetch, isFetching } = useSystemPulse();
  const { data: extras, refetch: refetchExtras } = useSystemPulseExtras();

  const cron = data?.cron ?? [];
  const cronStat = cronTone(cron);
  const email = data?.email ?? {};
  const devices = data?.devices ?? {};
  const drift = data?.drift ?? {};
  const stale = data?.stale_sessions ?? {};
  const sandbox = data?.sandbox ?? {};
  const clock = data?.clock ?? {};
  const interv = data?.interventions ?? {};

  const unexplainedDrift = extras?.unexplained_drift ?? 0;
  const deadLettered = extras?.dead_lettered_emails ?? 0;
  const ghostResidual = extras?.ghost_email_residual ?? 0;
  const markerAge = extras?.absent_marker_age_hours;
  const markerStatus = extras?.absent_marker_last_status;
  const roster = extras?.roster_reconciliation;
  const rosterAgeHours = roster?.last_ran_at
    ? Math.max(0, (Date.now() - new Date(roster.last_ran_at).getTime()) / 36e5)
    : null;


  const emailTone: Tone =
    deadLettered > 0 || (email.failed_24h ?? 0) > 0 ? "bad" :
    (email.pending ?? 0) > 10 || (email.oldest_pending_age_min ?? 0) > 30 ? "warn" : "ok";
  const deviceTone: Tone =
    (devices.failed_24h ?? 0) > 0 ? "bad" :
    (devices.pending ?? 0) > 20 || (devices.oldest_pending_age_min ?? 0) > 60 ? "warn" : "ok";
  // Drift tone now honors F8 triage — only unexplained rows escalate.
  const driftTone: Tone =
    (drift.critical_open ?? 0) > 0 && unexplainedDrift > 0 ? "bad" :
    unexplainedDrift > 0 ? "warn" : "ok";
  const staleTone: Tone =
    (stale.oldest_age_hours ?? 0) > 24 ? "bad" :
    (stale.open ?? 0) > 0 ? "warn" : "ok";
  const sandboxTone: Tone = sandbox.enabled ? "warn" : "ok";
  const clockTone: Tone =
    (clock.max_drift_seconds ?? 0) > 120 ? "bad" :
    (clock.max_drift_seconds ?? 0) > 30 ? "warn" : "ok";
  const intervTone: Tone =
    (interv.unsupported_overrides_this_month ?? 0) > 0 ? "warn" : "ok";
  const deadLetterTone: Tone = deadLettered > 0 ? "bad" : ghostResidual > 0 ? "warn" : "ok";
  const markerTone: Tone =
    markerStatus && markerStatus !== "ok" && markerStatus !== "succeeded" ? "bad" :
    markerAge == null ? "warn" :
    markerAge > 30 ? "bad" :
    markerAge > 26 ? "warn" : "ok";
  const rosterTone: Tone =
    (roster?.total_unsafe ?? 0) > 0 ? "bad" :
    rosterAgeHours == null ? "warn" :
    rosterAgeHours > 72 ? "warn" :
    (roster?.total_discrepancies ?? 0) > (roster?.total_auto_fixed ?? 0) ? "warn" : "ok";
  const coverage = extras?.payslip_coverage;
  const coverageMissing = coverage?.missing_names?.length ?? 0;
  const coverageTone: Tone =
    !coverage?.period_month ? "warn" :
    coverage.coverage_pct >= 100 ? "ok" :
    coverage.coverage_pct >= 95 ? "warn" : "bad";


  return (
    <div className="hrms-page space-y-4 p-3 md:p-6 page-mount">
      <PageHeader
        title="System Pulse"
        description="Silent failures made loud — one glance to know the platform is healthy."
      />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => { refetch(); refetchExtras(); }} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        {data?.generated_at && (
          <span className="text-xs text-muted-foreground">
            Last: {new Date(data.generated_at).toLocaleTimeString("en-IN")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <Tile
          icon={Clock}
          title="Cron heartbeats"
          tone={cronStat.tone}
          primary={`${cron.length - cronStat.failing - cronStat.stale}/${cron.length} healthy`}
          secondary={`${cronStat.failing} failing · ${cronStat.stale} stale`}
        />
        <Tile
          icon={Mail}
          title="Email dispatcher"
          tone={emailTone}
          primary={`${email.pending ?? 0} pending`}
          secondary={`${email.failed_24h ?? 0} failed 24h · oldest ${email.oldest_pending_age_min ?? 0}m`}
        />
        <Tile
          icon={Cpu}
          title="Device commands"
          tone={deviceTone}
          primary={`${devices.pending ?? 0} queued`}
          secondary={`${devices.failed_24h ?? 0} failed 24h · oldest ${devices.oldest_pending_age_min ?? 0}m`}
          actionHref="/hrms/attendance/biometric-devices"
          actionLabel="Biometric devices"
        />
        <Tile
          icon={Clock}
          title="Device clock drift"
          tone={clockTone}
          primary={
            (clock.max_drift_seconds ?? 0) > 0
              ? `±${clock.max_drift_seconds}s max`
              : "in sync"
          }
          secondary={`${clock.devices_over_30s ?? 0} > 30s · ${clock.devices_over_120s ?? 0} > 2m · sweep every 30m`}
          actionHref="/hrms/attendance/biometric-devices"
          actionLabel="Devices"
        />
        <Tile
          icon={ScaleIcon}
          title="Drift alerts (unexplained)"
          tone={driftTone}
          primary={`${unexplainedDrift} unexplained`}
          secondary={`${drift.open ?? 0} raw open · ±₹5 & TDS auto-tolerated · nightly re-audit 02:00 IST`}
          actionHref="/hrms/data-health?unexplained=1"
          actionLabel="Data Health"
        />
        <Tile
          icon={Mail}
          title="Email dead-letter"
          tone={deadLetterTone}
          primary={`${deadLettered} dead-lettered`}
          secondary={`${ghostResidual} ghost residual · retry every 5m · escalates after 3 attempts`}
          actionHref="/hrms/data-health"
          actionLabel="Data Health"
        />
        <Tile
          icon={Activity}
          title="Auto-absent marker"
          tone={markerTone}
          primary={
            markerAge == null
              ? "never run"
              : markerAge < 1
              ? `${Math.round(markerAge * 60)}m ago`
              : `${markerAge.toFixed(1)}h ago`
          }
          secondary={`Last: ${markerStatus ?? "—"} · daily 05:15 IST`}
        />
        <Tile
          icon={Activity}
          title="Stale attendance"
          tone={staleTone}
          primary={`${stale.open ?? 0} open`}
          secondary={`Oldest ${stale.oldest_age_hours ?? 0}h`}
          actionHref="/hrms/attendance/regularization"
          actionLabel="Watchdog"
        />
        <Tile
          icon={ShieldAlert}
          title="Interventions (this month)"
          tone={intervTone}
          primary={`${interv.this_month ?? 0}`}
          secondary={`${interv.unsupported_overrides_this_month ?? 0} unsupported override${(interv.unsupported_overrides_this_month ?? 0) === 1 ? "" : "s"}`}
          actionHref="/hrms/attendance/regularization"
          actionLabel="Interventions"
        />
        <Tile
          icon={Beaker}
          title="Sandbox mode"
          tone={sandboxTone}
          primary={sandbox.enabled ? "ENABLED" : "Production"}
          secondary={sandbox.expires_at ? `Expires ${new Date(sandbox.expires_at).toLocaleString("en-IN")}` : "Live RazorpayX"}
          actionHref="/hrms/payroll/razorpay-sync"
          actionLabel="Razorpay sync"
        />
        <Tile
          icon={Cpu}
          title="Device roster parity"
          tone={rosterTone}
          primary={
            roster?.last_ran_at == null
              ? "never reconciled"
              : `${roster.total_discrepancies} discrepanc${roster.total_discrepancies === 1 ? "y" : "ies"}`
          }
          secondary={
            roster?.last_ran_at
              ? `${roster.total_auto_fixed} auto-fixed · ${roster.total_unsafe} unsafe · last ${
                  rosterAgeHours != null && rosterAgeHours < 1
                    ? `${Math.round(rosterAgeHours * 60)}m`
                    : `${Math.round(rosterAgeHours ?? 0)}h`
                } ago`
              : "48h sync will populate on next run"
          }
          actionHref="/hrms/attendance/biometric-devices"
          actionLabel="Biometric devices"
        />
        <Tile
          icon={FileCheck}
          title="Payslip import coverage"
          tone={coverageTone}
          primary={
            !coverage?.period_month
              ? "no pull yet"
              : `${coverage.coverage_pct}% (${coverage.imported_count}/${coverage.expected_count})`
          }
          secondary={
            coverage?.period_month
              ? coverageMissing > 0
                ? `Missing: ${coverage.missing_names.slice(0, 3).join(", ")}${coverageMissing > 3 ? ` +${coverageMissing - 3} more` : ""}`
                : `All expected employees present · ${coverage.excluded_count} excluded (dismissed/pre-join)`
              : "Pull payslips from Cockpit Step 6 to populate"
          }
          actionHref="/hrms/payroll/cockpit"
          actionLabel="Cockpit"
        />

      </div>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-semibold text-foreground mb-3">Cron detail</div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : cron.length === 0 ? (
            <div className="text-sm text-muted-foreground">No HR/Razorpay/dispatch cron jobs registered.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 px-2 font-medium">Job</th>
                    <th className="py-2 px-2 font-medium">Schedule</th>
                    <th className="py-2 px-2 font-medium">Last status</th>
                    <th className="py-2 px-2 font-medium">Last run</th>
                    <th className="py-2 px-2 font-medium text-right">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {cron.map((r) => {
                    const bad = r.last_status && r.last_status !== "succeeded";
                    const stale = !r.schedule.includes("*/") && (r.seconds_since ?? Infinity) > 60 * 60 * 26;
                    return (
                      <tr key={r.jobname} className="border-b border-border/50">
                        <td className="py-2 px-2 font-mono text-xs">{r.jobname}</td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">{r.schedule}</td>
                        <td className="py-2 px-2">
                          {r.last_status ? (
                            <Badge variant={bad ? "destructive" : "outline"} className={!bad ? "text-emerald-500 border-emerald-500/30" : ""}>
                              {r.last_status}
                            </Badge>
                          ) : (
                            <Badge variant="outline">no runs</Badge>
                          )}
                        </td>
                        <td className="py-2 px-2 text-xs">
                          {r.last_run_at ? new Date(r.last_run_at).toLocaleString("en-IN") : "—"}
                        </td>
                        <td className={`py-2 px-2 text-xs text-right tabular-nums ${stale ? "text-amber-500 font-medium" : "text-muted-foreground"}`}>
                          {r.seconds_since != null
                            ? r.seconds_since < 3600
                              ? `${Math.round(r.seconds_since / 60)}m`
                              : r.seconds_since < 86400
                              ? `${Math.round(r.seconds_since / 3600)}h`
                              : `${Math.round(r.seconds_since / 86400)}d`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
