import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Gift, Award, Wallet, Sparkles } from "lucide-react";

interface Row {
  id: string;
  effective_from: string;
  revision_type: string;
  previous_basic: number | null;
  new_basic: number | null;
  previous_total: number | null;
  new_total: number | null;
  one_time_amount: number | null;
  payout_month: string | null;
  revision_reason: string | null;
  notes: string | null;
  approved_by: string | null;
  status: string;
  created_at: string;
}

const TYPE_META: Record<string, { label: string; icon: any; tone: string }> = {
  increment: { label: "Increment", icon: TrendingUp, tone: "text-success" },
  promotion: { label: "Promotion", icon: Award, tone: "text-primary" },
  correction: { label: "Correction", icon: Sparkles, tone: "text-muted-foreground" },
  demotion: { label: "Demotion", icon: TrendingDown, tone: "text-destructive" },
  bonus: { label: "Bonus", icon: Gift, tone: "text-amber-500" },
  performance_incentive: { label: "Performance Incentive", icon: Award, tone: "text-amber-500" },
  retention_bonus: { label: "Retention Bonus", icon: Gift, tone: "text-amber-500" },
  special_allowance: { label: "Special Allowance", icon: Wallet, tone: "text-primary" },
  ad_hoc: { label: "Ad-hoc", icon: Sparkles, tone: "text-muted-foreground" },
};

const ONE_TIME_KINDS = new Set(["bonus", "performance_incentive", "retention_bonus", "special_allowance", "ad_hoc"]);

export function CompensationHistory({ employeeId }: { employeeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["employee-compensation-history", employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_salary_revisions")
        .select("*")
        .eq("employee_id", employeeId)
        .order("effective_from", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Row[];
    },
    enabled: !!employeeId,
  });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading compensation history…</p>;
  }

  const rows = data || [];
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-lg p-6 text-center">
        <p className="text-sm text-muted-foreground">No compensation history yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Salary revisions, bonuses and incentives appear here.</p>
      </div>
    );
  }

  // Summary totals
  const totalBonuses = rows
    .filter(r => ONE_TIME_KINDS.has(r.revision_type) && r.status === "APPLIED")
    .reduce((s, r) => s + Number(r.one_time_amount || 0), 0);
  const revisionCount = rows.filter(r => !ONE_TIME_KINDS.has(r.revision_type)).length;
  const bonusCount = rows.filter(r => ONE_TIME_KINDS.has(r.revision_type)).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border rounded-lg p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground">Salary Revisions</p>
          <p className="text-lg font-bold text-foreground">{revisionCount}</p>
        </div>
        <div className="border border-border rounded-lg p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground">One-time Payouts</p>
          <p className="text-lg font-bold text-foreground">{bonusCount}</p>
        </div>
        <div className="border border-border rounded-lg p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground">Total Bonuses Paid</p>
          <p className="text-lg font-bold text-success">₹{totalBonuses.toLocaleString("en-IN")}</p>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Effective</th>
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Type</th>
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Change / Amount</th>
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Reason / Notes</th>
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Approved by</th>
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = TYPE_META[r.revision_type] || { label: r.revision_type, icon: Sparkles, tone: "text-muted-foreground" };
              const Icon = meta.icon;
              const oneTime = ONE_TIME_KINDS.has(r.revision_type);
              const prev = Number(r.previous_total || 0);
              const next = Number(r.new_total || 0);
              const delta = next - prev;
              const pct = prev > 0 ? (delta / prev) * 100 : 0;

              return (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-2.5 px-3 text-foreground whitespace-nowrap">
                    {format(new Date(r.effective_from), "dd MMM yyyy")}
                    {oneTime && r.payout_month && (
                      <div className="text-[10px] text-muted-foreground">
                        Payout · {format(new Date(r.payout_month), "MMM yyyy")}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.tone}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {oneTime ? (
                      <span className="font-semibold text-success">
                        +₹{Number(r.one_time_amount || 0).toLocaleString("en-IN")}
                      </span>
                    ) : (
                      <div>
                        <div className="text-foreground">
                          ₹{prev.toLocaleString("en-IN")} → <span className="font-semibold">₹{next.toLocaleString("en-IN")}</span>
                        </div>
                        {prev > 0 && (
                          <div className={`text-[10px] ${delta >= 0 ? "text-success" : "text-destructive"}`}>
                            {delta >= 0 ? "+" : ""}₹{delta.toLocaleString("en-IN")} ({pct.toFixed(1)}%)
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground text-xs max-w-[220px]">
                    <div className="line-clamp-2">
                      {r.revision_reason || r.notes || "—"}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground text-xs">{r.approved_by || "—"}</td>
                  <td className="py-2.5 px-3">
                    <Badge
                      variant={r.status === "APPLIED" ? "default" : r.status === "SCHEDULED" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {r.status}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
