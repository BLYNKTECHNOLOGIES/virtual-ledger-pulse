import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";

type Props = { period: string }; // YYYY-MM

/**
 * Read-only mirror of every automatic recovery scheduled for the period:
 * loan/advance EMIs plus security-deposit and error-recovery installments.
 * These are pushed to RazorpayX by the hr-schedule-deposits job, not staged here,
 * so the rows are intentionally not editable.
 */
export function AutoRecoveriesCard({ period }: Props) {
  const periodDate = `${period}-01`;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payroll_auto_recoveries", periodDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_payroll_auto_recoveries")
        .select("*")
        .eq("period_month", periodDate)
        .order("employee_name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const total = useMemo(
    () => (rows as any[]).reduce((s, r) => s + Number(r.amount || 0), 0),
    [rows],
  );

  const statusBadge = (s: string) => {
    if (s === "collected") return <Badge variant="default">Collected (payroll processed)</Badge>;
    if (s === "pushed" || s === "paid") return <Badge variant="secondary">Pushed — awaiting payroll</Badge>;
    if (s === "failed") return <Badge variant="destructive">Failed</Badge>;
    if (s === "cancelled") return <Badge variant="muted">Cancelled</Badge>;
    return <Badge variant="outline">Scheduled</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
        <div>
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            Automatic recoveries for {period}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Loan / advance EMIs and deposit installments. Generated from the loan and deposit
            schedules and pushed automatically — manage them on the Loans and Deposits pages.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {(rows as any[]).length} row(s) · ₹{total.toLocaleString("en-IN")}
        </span>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              {["Employee", "Recovery", "Installment", "Amount", "RazorpayX code", "Status"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
            ) : (rows as any[]).length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No automatic recoveries scheduled for {period}.</td></tr>
            ) : (rows as any[]).map((r) => (
              <tr key={`${r.source_kind}-${r.id}`} className="border-b hover:bg-muted/30">
                <td className="px-3 py-2">
                  {r.employee_name || "—"}{r.badge_id ? ` · ${r.badge_id}` : ""}
                </td>
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-muted-foreground">#{r.installment_no}</td>
                <td className="px-3 py-2 tabular-nums">₹{Number(r.amount || 0).toLocaleString("en-IN")}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.razorpay_code}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    {statusBadge(r.status)}
                    {r.failure_reason && (
                      <span className="text-[11px] text-destructive">{r.failure_reason}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
