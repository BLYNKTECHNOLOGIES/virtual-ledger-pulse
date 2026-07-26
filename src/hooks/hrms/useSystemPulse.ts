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
