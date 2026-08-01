import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

const STALE_MINUTES = 45;

/**
 * Silent-outage guard.
 *
 * If a reader stops pushing (network/power), its punches never arrive — and
 * because IN/OUT direction is derived from which device saw the punch, a dead
 * IN reader turns every later OUT punch into an `orphan_out` and the day reads
 * "Not Punched". That looked identical to genuine absence. This banner makes
 * the outage visible instead.
 */
export function BiometricDeviceOfflineBanner() {
  const { data: stale = [] } = useQuery({
    queryKey: ["hr_biometric_device_heartbeat"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_biometric_devices")
        .select("id, name, device_serial, device_direction, last_sync_at");
      const cutoff = Date.now() - STALE_MINUTES * 60 * 1000;
      return (data || []).filter(
        (d: any) => !d.last_sync_at || new Date(d.last_sync_at).getTime() < cutoff,
      );
    },
  });

  if (stale.length === 0) return null;

  const fmt = (ts: string | null) =>
    ts
      ? new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
      : "never";

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-destructive">
            {stale.length === 1 ? "A biometric reader is not pushing data" : `${stale.length} biometric readers are not pushing data`}
          </p>
          <ul className="text-muted-foreground space-y-0.5">
            {stale.map((d: any) => (
              <li key={d.id}>
                <span className="font-medium text-foreground">{d.name}</span>
                {d.device_direction ? ` (${d.device_direction})` : ""} — last push {fmt(d.last_sync_at)}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Punches made on an offline reader are buffered on the device and arrive when it reconnects. Until then,
            days may show as <em>Not Punched</em> even though the employee was present — do not treat this as absence.{" "}
            <Link to="/hrms/biometric-devices" className="underline text-foreground">Check devices</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
