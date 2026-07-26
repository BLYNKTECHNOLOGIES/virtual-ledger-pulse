/**
 * V5 · V7 · V8 · V9 — Pulse tiles data source.
 * Reads the newest self-test run, retention purge marker, drift alert
 * noise ratio, and new-joiner readiness backlog.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GovernanceTiles {
  self_test: {
    last_ran_at: string | null;
    outcome: "pass" | "fail" | "error" | null;
    passed: number;
    total: number;
  };
  retention: {
    last_ran_at: string | null;
    last_status: string | null;
    rows_removed: number | null;
    enabled: boolean;
  };
  alert_noise: {
    opened_7d: number;
    auto_closed_7d: number;
    ratio_pct: number;
    critical_open: number;
  };
  joiner_readiness: {
    tracked: number;
    broken: number;
    receipts_stamped: number;
  };
}

export function useGovernanceTiles() {
  return useQuery<GovernanceTiles>({
    queryKey: ["governance_tiles"],
    refetchInterval: 60_000,
    queryFn: async () => {
      // Self-test — latest row
      const selfTestQ = await (supabase as any)
        .from("hr_attendance_self_test_runs")
        .select("ran_at, outcome, passed, total")
        .order("ran_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Retention settings + last cron run
      const settingsQ = await (supabase as any)
        .from("hr_data_retention_settings")
        .select("enabled")
        .eq("id", true)
        .maybeSingle();

      // Alert noise — last 7 days
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const openedQ = await (supabase as any)
        .from("hr_drift_alerts")
        .select("id", { count: "exact", head: true })
        .gte("first_seen_at", since);
      const autoClosedQ = await (supabase as any)
        .from("hr_drift_alerts")
        .select("id", { count: "exact", head: true })
        .gte("auto_closed_at", since);
      const criticalOpenQ = await (supabase as any)
        .from("hr_drift_alerts")
        .select("id", { count: "exact", head: true })
        .is("resolved_at", null)
        .is("auto_closed_at", null)
        .eq("severity", "critical");

      // Joiner readiness backlog
      const trackedQ = await (supabase as any)
        .from("hr_new_joiner_readiness")
        .select("hr_employee_id, broken_links, receipt_stamped_at");

      const trackedRows: any[] = trackedQ.data ?? [];
      const broken = trackedRows.filter((r) => (r.broken_links?.length ?? 0) > 0).length;
      const receiptsStamped = trackedRows.filter((r) => !!r.receipt_stamped_at).length;

      const opened7d = openedQ.count ?? 0;
      const autoClosed7d = autoClosedQ.count ?? 0;
      const denom = opened7d + autoClosed7d;
      const ratioPct = denom === 0 ? 0 : Math.round((autoClosed7d * 100) / denom);

      return {
        self_test: {
          last_ran_at: selfTestQ.data?.ran_at ?? null,
          outcome: (selfTestQ.data?.outcome as any) ?? null,
          passed: selfTestQ.data?.passed ?? 0,
          total: selfTestQ.data?.total ?? 0,
        },
        retention: {
          last_ran_at: null, // populated from cron heartbeat in Pulse if needed
          last_status: null,
          rows_removed: null,
          enabled: !!settingsQ.data?.enabled,
        },
        alert_noise: {
          opened_7d: opened7d,
          auto_closed_7d: autoClosed7d,
          ratio_pct: ratioPct,
          critical_open: criticalOpenQ.count ?? 0,
        },
        joiner_readiness: {
          tracked: trackedRows.length,
          broken,
          receipts_stamped: receiptsStamped,
        },
      };
    },
  });
}
