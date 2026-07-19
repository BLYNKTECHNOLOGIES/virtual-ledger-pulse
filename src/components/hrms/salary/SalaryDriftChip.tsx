import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface DriftItem {
  component: string;
  intent: number | null;
  observed: number | null;
  delta: number;
  drift: boolean;
}

interface DriftResult {
  status: "in_sync" | "drift" | "no_observed" | "no_assignment" | "no_employee";
  drift_count?: number;
  items?: DriftItem[];
  template_name?: string | null;
  annual_ctc?: number | null;
  observed_source?: string | null;
  observed_period?: string | null;
  observed_at?: string | null;
}

interface Props {
  employeeId: string;
  compact?: boolean;
}

const rupees = (n: number | null | undefined) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function SalaryDriftChip({ employeeId, compact }: Props) {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<DriftResult>({
    queryKey: ["hr_salary_drift", employeeId],
    enabled: !!employeeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_compute_salary_structure_drift", {
        p_hr_employee_id: employeeId,
      });
      if (error) throw error;
      return data as DriftResult;
    },
  });

  const pullMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_pull_observed_salary", {
        p_hr_employee_id: employeeId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Observed structure refreshed");
      qc.invalidateQueries({ queryKey: ["hr_salary_drift", employeeId] });
      qc.invalidateQueries({ queryKey: ["hr_employee_salary_structure_assignments"] });
      refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Pull failed"),
  });

  if (isLoading) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> checking
      </Badge>
    );
  }

  if (!data || data.status === "no_assignment" || data.status === "no_employee") {
    return null;
  }

  const size = compact ? "text-[10px] py-0 px-1.5" : "text-[10px]";

  if (data.status === "no_observed") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Badge variant="outline" className={`${size} gap-1 cursor-pointer`}>
            <HelpCircle className="h-2.5 w-2.5" /> no observed
          </Badge>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 text-sm">
          <p className="font-medium mb-1">No observed structure yet</p>
          <p className="text-xs text-muted-foreground mb-3">
            The employee has a template pushed to RazorpayX, but no payslip mirror or Salary Register
            row has been imported yet. Import a payslip or upload the monthly Salary Register CSV to
            observe what RazorpayX actually applied.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => pullMutation.mutate()}
            disabled={pullMutation.isPending}
          >
            {pullMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Try pull now
          </Button>
        </PopoverContent>
      </Popover>
    );
  }

  const isDrift = data.status === "drift";
  const chipClass = isDrift
    ? "bg-destructive/10 text-destructive border-destructive/30"
    : "bg-success/10 text-success border-success/30";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge variant="outline" className={`${size} ${chipClass} gap-1 cursor-pointer`}>
          {isDrift ? (
            <>
              <AlertTriangle className="h-2.5 w-2.5" />
              {data.drift_count} drift{data.drift_count === 1 ? "" : "s"}
            </>
          ) : (
            <>
              <CheckCircle2 className="h-2.5 w-2.5" /> in sync
            </>
          )}
        </Badge>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 text-sm">
        <div className="flex items-start justify-between mb-2 gap-2">
          <div>
            <p className="font-medium">Intent vs observed</p>
            <p className="text-[11px] text-muted-foreground">
              Template <span className="font-medium">{data.template_name ?? "—"}</span> · CTC{" "}
              {rupees(data.annual_ctc)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Observed from <span className="font-medium">{data.observed_source ?? "—"}</span>
              {data.observed_period ? ` · ${data.observed_period}` : ""}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => pullMutation.mutate()}
            disabled={pullMutation.isPending}
            title="Re-pull observed"
          >
            {pullMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <div className="divide-y border rounded">
          {(data.items ?? []).map((it) => (
            <div
              key={it.component}
              className={`flex items-center justify-between px-2 py-1.5 text-xs ${
                it.drift ? "bg-destructive/5" : ""
              }`}
            >
              <span className="font-mono text-[11px]">{it.component}</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{rupees(it.intent)}</span>
                <span className="text-muted-foreground">→</span>
                <span className={it.drift ? "text-destructive font-medium" : ""}>
                  {rupees(it.observed)}
                </span>
                {it.drift && (
                  <span className="text-destructive text-[10px] font-medium">
                    ({it.delta > 0 ? "+" : ""}
                    {rupees(it.delta)})
                  </span>
                )}
              </div>
            </div>
          ))}
          {(!data.items || data.items.length === 0) && (
            <p className="text-xs text-muted-foreground px-2 py-3 text-center">No comparable components.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
