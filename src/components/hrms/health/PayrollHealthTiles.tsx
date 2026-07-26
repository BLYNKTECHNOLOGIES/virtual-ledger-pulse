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
            {good ? "All local payslips mirror RazorpayX" : "legacy payslips missing a RazorpayX mirror"}
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
