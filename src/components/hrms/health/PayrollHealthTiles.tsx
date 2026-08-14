import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, FileText, AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

/** Payslip parity — how many legacy hr_payslips rows lack a RazorpayX counterpart. */
export function PayslipParityTile() {
  const { data, isLoading } = useQuery({
    queryKey: ["hr_payslip_link_orphans_count"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_payslip_link_orphans");
      if (error) throw error;
      return (data ?? []) as Array<any>;
    },
    refetchInterval: 5 * 60_000,
  });

  const count = data?.length ?? 0;
  const good = count === 0;

  return (
    <Card className={good ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg ${good ? "bg-success/10" : "bg-warning/10"}`}>
          {good ? <CheckCircle2 className="h-5 w-5 text-success" /> : <FileText className="h-5 w-5 text-warning" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Payslip parity</div>
          <div className="text-2xl font-semibold mt-0.5">{isLoading ? "…" : count}</div>
          <div className="text-xs text-muted-foreground">
            {good ? "in sync" : "missing RazorpayX mirror"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Email dispatch — last 24h send/fail counts + last activity timestamp. */
export function EmailDispatchHealthTile() {
  const { data, isLoading } = useQuery({
    queryKey: ["hr_email_dispatch_health"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_email_dispatch_health");
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as {
        sent_24h: number;
        failed_24h: number;
        pending_now: number;
        last_activity: string | null;
      } | null;
    },
    refetchInterval: 5 * 60_000,
  });

  const failed = data?.failed_24h ?? 0;
  const bad = failed > 0 || (data?.pending_now ?? 0) > 25;

  return (
    <Card className={bad ? "border-destructive/40 bg-destructive/5" : ""}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg ${bad ? "bg-destructive/10" : "bg-info/10"}`}>
          {bad ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <Mail className="h-5 w-5 text-info" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Email dispatch (24h)</div>
          <div className="text-2xl font-semibold mt-0.5">
            {isLoading ? "…" : `${data?.sent_24h ?? 0} sent`}
          </div>
          <div className="text-xs text-muted-foreground">
            {failed > 0 && <span className="text-destructive font-medium">{failed} failed · </span>}
            {(data?.pending_now ?? 0) > 0 && <span>{data?.pending_now} pending · </span>}
            {data?.last_activity
              ? `last ${formatDistanceToNow(new Date(data.last_activity))} ago`
              : "no activity yet"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Roster completeness — how many active employees are missing a current shift
 * assignment or a current weekly-off pattern. The attendance v4 engine can't
 * decide "late" or "weekly-off day" without these, so any non-zero here means
 * silent under-counting downstream (people appearing "absent" who are really
 * on a WO). Click through to the profile to assign.
 */
export function RosterCompletenessTile() {
  const { data, isLoading } = useQuery({
    queryKey: ["hr_roster_completeness"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_roster_completeness");
      if (error) throw error;
      return (data ?? null) as {
        active_total: number;
        missing_shift_count: number;
        missing_weekly_off_count: number;
        missing_shift: Array<{ id: string; badge_id: string; first_name: string; last_name: string }>;
        missing_weekly_off: Array<{ id: string; badge_id: string; first_name: string; last_name: string }>;
      } | null;
    },
    refetchInterval: 10 * 60_000,
  });

  const shift = data?.missing_shift_count ?? 0;
  const woff = data?.missing_weekly_off_count ?? 0;
  const total = shift + woff;
  const good = total === 0;
  const first = (data?.missing_shift ?? [])[0] || (data?.missing_weekly_off ?? [])[0];

  return (
    <Card className={good ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg ${good ? "bg-success/10" : "bg-warning/10"}`}>
          {good ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Users className="h-5 w-5 text-warning" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Roster completeness</div>
          <div className="text-2xl font-semibold mt-0.5">{isLoading ? "…" : total}</div>
          <div className="text-xs text-muted-foreground">
            {good
              ? `${data?.active_total ?? 0} active · complete`
              : `${shift} missing shift · ${woff} missing weekly-off`}
            {first && (
              <>
                {" · "}
                <Link className="underline hover:text-foreground" to={`/hrms/employee/${first.id}`}>
                  fix {first.first_name}
                </Link>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
