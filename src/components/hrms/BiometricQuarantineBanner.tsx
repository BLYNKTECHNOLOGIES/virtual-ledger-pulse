import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Surfaces unresolved biometric punches parked in hr_attendance_quarantine because
 * their PIN could not be matched to an employee. Real people are punching into
 * the void — mapping the PINs replays the punches.
 */
export function BiometricQuarantineBanner() {
  const { data } = useQuery({
    queryKey: ["hr_attendance_quarantine_unresolved"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_attendance_quarantine")
        .select("pin, punch_time")
        .is("replayed_at", null);
      if (error) throw error;
      const pins = new Map<string, number>();
      for (const row of (data || []) as any[]) {
        pins.set(String(row.pin), (pins.get(String(row.pin)) || 0) + 1);
      }
      return {
        total: (data || []).length,
        byPin: Array.from(pins.entries()).sort((a, b) => b[1] - a[1]),
      };
    },
    refetchInterval: 60_000,
  });

  if (!data || data.total === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
      <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
      <div className="flex-1">
        <div className="font-medium text-foreground">
          {data.total} biometric punch{data.total === 1 ? "" : "es"} parked — unmatched PINs
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Real punches are landing in quarantine because the device PIN isn't mapped to an employee.
          Map these PINs and existing punches will replay automatically.
        </div>
        <div className="text-xs mt-1 tabular-nums text-muted-foreground">
          PINs:&nbsp;
          {data.byPin.map(([pin, n]) => (
            <span key={pin} className="mr-2">
              <span className="font-medium text-foreground">{pin}</span>&nbsp;({n})
            </span>
          ))}
        </div>
        <Link
          to="/hrms/biometric-devices"
          className="inline-block mt-1 text-xs text-warning hover:underline"
        >
          Open device users →
        </Link>
      </div>
    </div>
  );
}

export default BiometricQuarantineBanner;
