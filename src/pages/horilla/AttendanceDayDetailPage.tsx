import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ArrowLeft, Clock, AlertCircle, CheckCircle2, Moon, Compass, ShieldAlert } from "lucide-react";

/**
 * "Show the working" — one-day attendance drill-down for the v4 engine.
 *
 * Renders the extended hr_attendance_day_detail payload:
 *   - kept vs suppressed punches with `suppressed_reason`
 *   - session labels ("09:12 – 18:41 = 9h 29m")
 *   - `flags.night_span` / `flags.shift_deviation`
 *   - the day's own LOP contribution (matches the shadow engine SQL)
 *   - stale-session lineage + regularization history
 */
export default function AttendanceDayDetailPage() {
  const { employeeId = "", date = "" } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["hr_day_detail", employeeId, date],
    enabled: !!employeeId && !!date,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_attendance_day_detail", {
        p_employee_id: employeeId,
        p_date: date,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const { data: employee } = useQuery({
    queryKey: ["hr_employee_min", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employees")
        .select("badge_id, first_name, last_name")
        .eq("id", employeeId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const flags = data?.flags || {};
  const lop = Number(data?.lop_contribution ?? 0);
  const suppressed = data?.suppressed_punches || [];
  const kept = data?.kept_punches || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Attendance — ${date}`}
        description={
          employee
            ? `${employee.first_name} ${employee.last_name} (${employee.badge_id}) — window 05:00 → 05:00 IST`
            : "Loading…"
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/hrms/attendance">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
        }
      />

      {isLoading && <div className="text-sm text-muted-foreground p-6">Loading…</div>}
      {error && (
        <Card>
          <CardContent className="p-4 text-destructive text-sm">{(error as Error).message}</CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Flag strip */}
          {(flags.night_span || flags.shift_deviation || lop > 0) && (
            <div className="flex flex-wrap gap-2">
              {flags.night_span && (
                <Badge variant="outline" className="border-indigo-400 text-indigo-700 dark:text-indigo-300">
                  <Moon className="h-3 w-3 mr-1" /> night span
                </Badge>
              )}
              {flags.shift_deviation && (
                <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
                  <Compass className="h-3 w-3 mr-1" /> shift deviation
                </Badge>
              )}
              {lop > 0 && (
                <Badge variant="destructive">
                  <ShieldAlert className="h-3 w-3 mr-1" /> LOP contribution: {lop}
                </Badge>
              )}
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Day summary</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Field label="Status">
                <Badge variant={data.daily?.status === "present" ? "default" : "secondary"}>
                  {data.daily?.status || "no_data"}
                </Badge>
              </Field>
              <Field label="First in" value={fmtTs(data.daily?.first_in)} />
              <Field label="Last out" value={fmtTs(data.daily?.last_out)} />
              <Field label="Total hours" value={data.daily?.total_hours ?? "—"} />
              <Field label="Net work (min)" value={data.daily?.net_work_minutes ?? "—"} />
              <Field label="Break (min)" value={data.daily?.break_minutes ?? "—"} />
              <Field label="Sessions" value={data.daily?.session_count ?? 0} />
              <Field label="Suppressed" value={data.daily?.suppressed_count ?? suppressed.length ?? 0} />
              <Field label="Late by (min)" value={data.daily?.late_by_minutes ?? 0} />
              <Field label="Early by (min)" value={data.daily?.early_by_minutes ?? 0} />
              <Field label="Engine" value={data.daily?.engine_version || "—"} />
              <Field label="Late?" value={data.daily?.is_late ? "Yes" : "No"} />
            </CardContent>
          </Card>

          {/* Derived sessions — arithmetic-friendly label from SQL */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Derived sessions ({data.sessions?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(!data.sessions || data.sessions.length === 0) && (
                <div className="text-sm text-muted-foreground">No sessions derived.</div>
              )}
              {(data.sessions || []).map((s: any) => (
                <div
                  key={s.id}
                  className={`text-sm border rounded p-2 flex items-center justify-between ${
                    s.is_open ? "border-amber-400/60 bg-amber-500/5" : ""
                  }`}
                >
                  <div>
                    <span className="font-medium">#{s.session_no}</span>{" "}
                    <span className="font-mono">{s.label}</span>
                  </div>
                  {s.is_open && <Badge variant="destructive">open</Badge>}
                </div>
              ))}
              <div className="text-xs text-muted-foreground pt-1">
                Sum of closed sessions = <b>{data.daily?.net_work_minutes ?? 0} min</b>
                {" · "}breaks {data.daily?.break_minutes ?? 0} min
                {" · "}lunch {data.daily?.lunch_minutes ?? 0} min.
              </div>
            </CardContent>
          </Card>

          {/* Kept punches */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Counted punches ({kept.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {kept.length === 0 && <div className="text-sm text-muted-foreground">No counted punches.</div>}
              {kept.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-sm border rounded p-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-mono">{fmtTs(p.punch_time)}</span>
                    <Badge variant={p.punch_type === "in" ? "default" : "secondary"}>{p.punch_type}</Badge>
                    <span className="text-xs text-muted-foreground truncate">{p.device_name || "—"}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Suppressed punches with reason chips */}
          {suppressed.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" /> Suppressed punches ({suppressed.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {suppressed.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-sm border rounded p-2 bg-muted/30 opacity-90">
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-mono line-through decoration-muted-foreground/40">{fmtTs(p.punch_time)}</span>
                      <Badge variant="outline">{p.punch_type}</Badge>
                      <span className="text-xs text-muted-foreground truncate">{p.device_name || "—"}</span>
                    </div>
                    <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 shrink-0">
                      {p.suppressed_reason || "suppressed"}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.stale_sessions?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Watchdog history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {data.stale_sessions.map((s: any) => (
                  <div key={s.id} className="border rounded p-2">
                    <div className="flex justify-between">
                      <span>{s.status.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">{s.hours_open}h open</span>
                    </div>
                    {s.resolution_note && (
                      <div className="text-xs text-muted-foreground">{s.resolution_note}</div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.regularizations?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Regularizations / interventions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {data.regularizations.map((r: any) => (
                  <div key={r.id} className="border rounded p-2 space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{r.reason || "—"}</span>
                      <Badge variant="outline">{r.status}</Badge>
                    </div>
                    {r.reason_code && (
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">code: {r.reason_code}</div>
                    )}
                    {r.approver_notes && (
                      <div className="text-xs text-muted-foreground italic">"{r.approver_notes}"</div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* LOP footer — matches shadow engine hr_lop_days */}
          <Card className={lop > 0 ? "border-destructive/40 bg-destructive/5" : "border-success/40 bg-success/5"}>
            <CardContent className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">This day's LOP contribution</div>
                <div className="text-2xl font-semibold mt-0.5">{lop}</div>
                <div className="text-xs text-muted-foreground">
                  Source: <code>hr_lop_days</code> — same SQL the shadow engine consumes. Days blocked by an open Watchdog session are held at 0 until resolved.
                </div>
              </div>
              {lop > 0 ? (
                <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: any; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children ?? (value ?? "—")}</div>
    </div>
  );
}

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return format(new Date(ts), "dd MMM HH:mm:ss");
  } catch {
    return String(ts);
  }
}
