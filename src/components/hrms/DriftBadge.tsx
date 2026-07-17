import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

interface Props {
  employeeId: string;
  variant?: "chip" | "inline";
}

/**
 * Small pill showing "⚠ N drifts" for a given employee. Links to the
 * Data Health page filtered to that employee.
 */
export function DriftBadge({ employeeId, variant = "chip" }: Props) {
  const { data } = useQuery({
    queryKey: ["drift_count", employeeId],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("hr_drift_alerts")
        .select("id", { count: "exact", head: true })
        .eq("hr_employee_id", employeeId)
        .is("resolved_at", null);
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  if (!data || data === 0) return null;

  const base = "inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive font-medium";
  const size = variant === "chip" ? "px-2 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[10px]";

  return (
    <Link
      to={`/hrms/data-health?employee=${employeeId}`}
      className={`${base} ${size} hover:bg-destructive/20 transition-colors`}
      title={`${data} data mismatch${data === 1 ? "" : "es"} across HRMS / Razorpay / eSSL`}
    >
      <AlertTriangle className="h-2.5 w-2.5" />
      {data} drift{data === 1 ? "" : "s"}
    </Link>
  );
}
