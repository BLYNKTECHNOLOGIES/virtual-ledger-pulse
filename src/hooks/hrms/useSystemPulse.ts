import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CronPulseRow {
  jobname: string;
  schedule: string;
  active: boolean;
  last_status: string | null;
  last_run_at: string | null;
  seconds_since: number | null;
}

export interface SystemPulse {
  generated_at: string;
  cron: CronPulseRow[];
  email: { pending?: number; failed_24h?: number; sent_24h?: number; oldest_pending_age_min?: number };
  devices: { pending?: number; failed_24h?: number; oldest_pending_age_min?: number };
  drift: { open?: number; critical_open?: number };
  stale_sessions: { open?: number; oldest_age_hours?: number };
  sandbox: { enabled?: boolean; expires_at?: string | null };
  razorpay_freshness: Record<string, any>;
  clock?: {
    total_devices?: number;
    max_drift_seconds?: number;
    devices_over_30s?: number;
    devices_over_120s?: number;
    last_time_sync_at?: string | null;
    oldest_since_sync_hours?: number;
    per_device?: Array<{
      device_serial: string;
      name: string | null;
      drift_seconds: number | null;
      last_sync_at: string | null;
      checked_at: string | null;
    }>;
  };
  interventions?: {
    this_month?: number;
    unsupported_overrides_this_month?: number;
  };
}

export function useSystemPulse(refetchMs = 60_000) {
  return useQuery({
    queryKey: ["hr_system_pulse"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_system_pulse");
      if (error) throw error;
      return data as SystemPulse;
    },
    refetchInterval: refetchMs,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// F8 / F9 / F10 extras — piggy-back on hr_system_pulse with direct reads.
// Kept separate so hr_system_pulse RPC stays untouched.
// ---------------------------------------------------------------------------
export interface SystemPulseExtras {
  unexplained_drift: number;
  dead_lettered_emails: number;
  ghost_email_residual: number;
  absent_marker_last_run_at: string | null;
  absent_marker_last_status: string | null;
  absent_marker_age_hours: number | null;
}

export function useSystemPulseExtras(refetchMs = 60_000) {
  return useQuery({
    queryKey: ["hr_system_pulse_extras"],
    queryFn: async (): Promise<SystemPulseExtras> => {
      const client: any = supabase;

      const [{ data: unexplained }, deadLetter, ghost, marker] = await Promise.all([
        client.rpc("hr_open_unexplained_drift_count"),
        client
          .from("hr_email_send_log")
          .select("id", { count: "exact", head: true })
          .eq("status", "dead_lettered"),
        client
          .from("hr_ghost_email_residual_v")
          .select("id", { count: "exact", head: true }),
        client
          .from("hr_absent_marker_last_run_v")
          .select("*")
          .maybeSingle(),
      ]);

      const lastRunAt: string | null = marker?.data?.ran_at ?? null;
      const ageHours = lastRunAt
        ? Math.max(0, (Date.now() - new Date(lastRunAt).getTime()) / 36e5)
        : null;

      return {
        unexplained_drift: Number(unexplained ?? 0),
        dead_lettered_emails: deadLetter?.count ?? 0,
        ghost_email_residual: ghost?.count ?? 0,
        absent_marker_last_run_at: lastRunAt,
        absent_marker_last_status: marker?.data?.status ?? null,
        absent_marker_age_hours: ageHours,
      };
    },
    refetchInterval: refetchMs,
    staleTime: 30_000,
  });
}
