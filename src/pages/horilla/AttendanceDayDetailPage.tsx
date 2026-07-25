import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ArrowLeft, Clock, AlertCircle, CheckCircle2 } from "lucide-react";

// "Show the working" — one-day attendance drill-down. Reveals raw punches,
// suppression reasons, derived sessions, day totals, and any stale/regularization
// context so HR can audit exactly how the engine arrived at the day's status.
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
              <Field label="Suppressed" value={data.daily?.suppressed_count ?? 0} />
              <Field label="Late by (min)" value={data.daily?.late_by_minutes ?? 0} />
              <Field label="Early by (min)" value={data.daily?.early_by_minutes ?? 0} />
              <Field label="Engine" value={data.daily?.engine_version || "—"} />
              <Field label="Late?" value={data.daily?.is_late ? "Yes" : "No"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Raw punches ({data.punches?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(!data.punches || data.punches.length === 0) && (
                <div className="text-sm text-muted-foreground">No punches inside the window.</div>
              )}
              {(data.punches || []).map((p: any) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between text-sm border rounded p-2 ${
                    p.effective ? "" : "opacity-60 bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono">{fmtTs(p.punch_time)}</span>
                    <Badge variant={p.punch_type === "in" ? "default" : "secondary"}>{p.punch_type}</Badge>
                    <span className="text-xs text-muted-foreground">{p.device_name || "—"}</span>
                  </div>
                  <div className="text-xs">
                    {p.effective ? (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> counted
                      </span>
                    ) : (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> suppressed: {p.suppressed_reason || "—"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Derived sessions ({data.sessions?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(!data.sessions || data.sessions.length === 0) && (
                <div className="text-sm text-muted-foreground">No sessions derived.</div>
              )}
              {(data.sessions || []).map((s: any) => (
                <div key={s.id} className="text-sm border rounded p-2 flex items-center justify-between">
                  <div>
                    <span className="font-medium">#{s.session_no}</span> — {fmtTs(s.in_time)} →{" "}
                    {s.out_time ? fmtTs(s.out_time) : <span className="text-amber-600">OPEN</span>}{" "}
                    <span className="text-muted-foreground">({s.minutes ?? "—"} min)</span>
                  </div>
                  {s.is_open && <Badge variant="destructive">open</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>

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
                <CardTitle className="text-base">Regularizations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {data.regularizations.map((r: any) => (
                  <div key={r.id} className="border rounded p-2 flex justify-between">
                    <span>{r.reason || "—"}</span>
                    <Badge variant="outline">{r.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
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
