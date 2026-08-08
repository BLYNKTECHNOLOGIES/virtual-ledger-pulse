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
      const [quarantineRes, devUsersRes] = await Promise.all([
        (supabase as any)
          .from("hr_attendance_quarantine")
          .select("pin, punch_time")
          .is("replayed_at", null),
        (supabase as any)
          .from("hr_biometric_device_users")
          .select("pin"),
      ]);
      if (quarantineRes.error) throw quarantineRes.error;
      if (devUsersRes.error) throw devUsersRes.error;

      // PINs that are never employees: 0 (unset) and 100 (shared visitor PIN).
      const IGNORED_PINS = new Set(["0", "100"]);

      // Only surface PINs that still exist on at least one eSSL device.
      // PINs that were deleted from the device (ex-employees, test entries)
      // are noise — the punches were captured historically but the identity
      // is gone, so no mapping is possible or useful.
      const activePins = new Set<string>(
        ((devUsersRes.data || []) as any[])
          .map((r) => String(r.pin))
          .filter((p) => p && !IGNORED_PINS.has(p))
      );

      const pins = new Map<string, number>();
      let total = 0;
      for (const row of (quarantineRes.data || []) as any[]) {
        const pin = String(row.pin);
        if (IGNORED_PINS.has(pin)) continue;
        if (!activePins.has(pin)) continue;
        pins.set(pin, (pins.get(pin) || 0) + 1);
        total += 1;
      }
      return {
        total,
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
          Map these PINs and existing punches will replay automatically. Only PINs still enrolled on an eSSL device are listed — deleted / ex-employee PINs and the visitor PIN 100 are hidden.
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
          to="/hrms/attendance/biometric-devices"
          className="inline-block mt-1 text-xs text-warning hover:underline"
        >
          Open device users →
        </Link>
      </div>
    </div>
  );
}

export default BiometricQuarantineBanner;
