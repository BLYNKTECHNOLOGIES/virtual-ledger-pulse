/**
 * V9 — New-Joiner First-Payroll Readiness Card
 * HR-admin visible only (RLS returns empty for non-admins → card renders nothing).
 * Shows the 5-link chain per new joiner: mapping · salary push+verify · deposit
 * scheduled · training swap · shift proposal. Auto-refreshes on demand.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface Props { employeeId: string; }

const LABELS: Record<string, string> = {
  mapping_ok: "Biometric mapping",
  salary_pushed_verified: "Salary push + verified",
  deposit_scheduled: "Deposit scheduled",
  training_swap_applied: "Training swap",
  shift_proposal_ripe: "Shift assignment",
};

export default function NewJoinerReadinessCard({ employeeId }: Props) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["hr_new_joiner_readiness", employeeId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_new_joiner_readiness")
        .select("*")
        .eq("hr_employee_id", employeeId)
        .maybeSingle();
      return data;
    },
    enabled: !!employeeId,
  });

  const recheck = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_new_joiner_check", { p_employee_id: employeeId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Readiness re-checked");
      qc.invalidateQueries({ queryKey: ["hr_new_joiner_readiness", employeeId] });
    },
    onError: (e: any) => toast.error(e?.message || "Re-check failed"),
  });

  // Non-HR-admin: RLS returns no row and no error → hide the card entirely.
  if (isLoading || !data) return null;

  const chain: [keyof typeof LABELS, boolean][] = [
    ["mapping_ok", !!data.mapping_ok],
    ["salary_pushed_verified", !!data.salary_pushed_verified],
    ["deposit_scheduled", !!data.deposit_scheduled],
    ["training_swap_applied", !!data.training_swap_applied],
    ["shift_proposal_ripe", !!data.shift_proposal_ripe],
  ];
  const broken = chain.filter(([, ok]) => !ok);
  const stamped = !!data.receipt_stamped_at;

  return (
    <Card className={broken.length > 0 ? "border-destructive/40" : "border-emerald-500/30"}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {broken.length > 0 ? (
              <ShieldAlert className="h-4 w-4 text-destructive" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
            <span className="text-sm font-semibold text-foreground">
              New-joiner first-payroll readiness
            </span>
            {stamped && (
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/40 text-xs">
                Receipt stamped
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => recheck.mutate()}
            disabled={recheck.isPending}
            className="h-7 px-2 text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${recheck.isPending ? "animate-spin" : ""}`} />
            Re-check
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          Joined {data.joined_at} · first payroll month{" "}
          {data.first_payroll_month ?? "—"} · last checked{" "}
          {data.last_checked_at ? new Date(data.last_checked_at).toLocaleString("en-IN") : "never"}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {chain.map(([key, ok]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              {ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
              )}
              <span className={ok ? "text-foreground" : "text-destructive font-medium"}>
                {LABELS[key]}
              </span>
            </div>
          ))}
        </div>

        {broken.length > 0 && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1.5">
            {broken.length} broken link{broken.length === 1 ? "" : "s"}: {broken.map(([k]) => LABELS[k]).join(", ")}.
            Payroll may fail silently — resolve before the first payday.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
