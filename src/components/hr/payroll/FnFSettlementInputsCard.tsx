import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserMinus } from "lucide-react";

/**
 * Full & Final settlement lines for this payroll cycle.
 *
 * These rows are staged by hr-push-fnf when a settlement is approved, using the
 * payroll cycle month chosen on the settlement itself. They are already live on
 * the RazorpayX run, so they are shown read-only and kept out of the normal
 * staging list — F&F is the only thing that schedules payroll for a leaver.
 */
export function FnFSettlementInputsCard({ period, kind }: { period: string; kind: "addition" | "deduction" }) {
  const table = kind === "addition" ? "hr_payroll_input_additions" : "hr_payroll_input_deductions";
  const periodDate = `${period}-01`;

  const { data: rows = [] } = useQuery({
    queryKey: ["fnf_payroll_inputs", table, period],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(table)
        .select("*, hr_employees:hr_employee_id(first_name, last_name, badge_id)")
        .eq("period_month", periodDate)
        .eq("source", "fnf_settlement")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (!rows.length) return null;

  const total = (rows as any[]).reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
        <div>
          <CardTitle className="text-sm flex items-center gap-1.5">
            <UserMinus className="h-4 w-4 text-primary" />
            F&amp;F settlement {kind === "addition" ? "additions (dues)" : "deductions (recoveries)"} — {period}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Consolidated Full &amp; Final lines for leavers whose settlement was assigned to this payroll cycle.
            They are pushed by the F&amp;F approval itself and cannot be staged or re-pushed here.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="text-lg font-bold tabular-nums">₹{total.toLocaleString("en-IN")}</p>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              {["Employee", "Line", "Amount", "Status"].map((h) => (
                <th key={h} className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows as any[]).map((r) => {
              const e = r.hr_employees;
              return (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-2">
                    {e ? `${e.first_name || ""} ${e.last_name || ""}`.trim() + (e.badge_id ? ` · ${e.badge_id}` : "") : r.razorpay_employee_id}
                  </td>
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 tabular-nums">₹{Number(r.amount).toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2">
                    {r.readback_verified_at ? (
                      <Badge className="bg-success/10 text-success">Verified on run</Badge>
                    ) : r.pushed_at ? (
                      <Badge className="bg-warning/10 text-warning">Pushed · unverified</Badge>
                    ) : (
                      <Badge variant="outline">Not on the run</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
