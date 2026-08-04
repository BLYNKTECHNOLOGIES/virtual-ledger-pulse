import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Info } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Payroll inputs for the month that were NOT staged on this page — today that
 * means one-time payouts (bonus / incentive / special allowance) raised from
 * the Salary Revisions module and pushed straight to the RazorpayX run.
 *
 * The cockpit's purpose is to see EVERYTHING landing on a month's payroll, so
 * these are surfaced read-only here with their real push/verify state instead
 * of being invisible because they live in a different table.
 */
const ONE_TIME_KINDS = ["bonus", "performance_incentive", "retention_bonus", "special_allowance", "ad_hoc", "one_time_correction"];

export function OtherPayrollInputsCard({ period }: { period: string }) {
  const periodDate = `${period}-01`;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payroll_other_inputs", periodDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_salary_revisions")
        .select("id, employee_id, revision_type, one_time_amount, payout_month, status, notes, revision_reason, razorpay_pushed_at, razorpay_verified_at, razorpay_push_error, hr_employees:employee_id(first_name,last_name,badge_id)")
        .eq("payout_month", periodDate)
        .in("revision_type", ONE_TIME_KINDS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 15_000,
  });

  const list = rows as any[];
  const total = list.reduce((s, r) => s + Number(r.one_time_amount || 0), 0);
  const unpushed = list.filter((r) => !r.razorpay_pushed_at).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap space-y-0">
        <div>
          <CardTitle className="text-sm">One-time payouts from Salary Revisions · {period}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Bonuses and incentives raised outside this page but landing on the same RazorpayX run. Read-only here — manage them in Salary Revisions.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
          <Link to="/hrms/payroll/salary-revisions">Open Salary Revisions <ExternalLink className="h-3 w-3 ml-1" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {isLoading ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No one-time payouts scheduled for {period}.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {["Employee", "Type", "Note", "Amount", "Status"].map((h) => (
                    <th key={h} className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const e = r.hr_employees;
                  return (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2">
                        {e ? `${e.first_name || ""} ${e.last_name || ""}`.trim() + (e.badge_id ? ` · ${e.badge_id}` : "") : "—"}
                      </td>
                      <td className="px-3 py-2 capitalize">{String(r.revision_type).replace(/_/g, " ")}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[240px] truncate">{r.revision_reason || r.notes || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">₹{Number(r.one_time_amount || 0).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2">
                        {r.razorpay_verified_at ? (
                          <Badge className="bg-success/10 text-success">Verified on run</Badge>
                        ) : r.razorpay_pushed_at ? (
                          <Badge className="bg-warning/10 text-warning">Pushed · unverified</Badge>
                        ) : (
                          <Badge variant="outline" title={r.razorpay_push_error || ""}>Not pushed</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
              <span>{list.length} payout{list.length === 1 ? "" : "s"} · total <span className="tabular-nums font-medium text-foreground">₹{total.toLocaleString("en-IN")}</span></span>
              {unpushed > 0 && (
                <span className="inline-flex items-center gap-1 text-warning">
                  <Info className="h-3 w-3" /> {unpushed} not pushed to RazorpayX yet
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
