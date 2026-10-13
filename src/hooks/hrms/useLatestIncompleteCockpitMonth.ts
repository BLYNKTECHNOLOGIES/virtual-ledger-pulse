import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { firstOfMonth, type CockpitStep } from "@/hooks/hrms/useCockpit";
import { COCKPIT_FIRST_TRACKED_MONTH, generateRecentMonths, isCockpitOpenableMonth } from "@/lib/hrms/cockpitMonths";

/** Find the OLDEST cycle month (from the tracked floor onwards) whose payroll
 *  close is not yet acknowledged — that is the cycle still pending work. Future
 *  months are never candidates; if everything past is closed we land on the
 *  current month. */
export function useLatestIncompleteCockpitMonth() {
  return useQuery({
    queryKey: ["hr_cockpit_latest_incomplete_month"],
    queryFn: async () => {
      // current → previous 12 months, then oldest-first, floored at the tracked start
      const candidates = generateRecentMonths(12, 0)
        .slice()
        .reverse()
        .filter((m) => m >= COCKPIT_FIRST_TRACKED_MONTH);

      const results = await Promise.all(
        candidates.map(async (m) => {
          const { data, error } = await (supabase as any).rpc("hr_cockpit_month_state", { _month: m });
          if (error) return { month: m, closed: true }; // don't strand the user on an unreadable month
          const steps = (data ?? []) as CockpitStep[];
          const closeStep = steps.find((s) => s.step_key === "close_month");
          return { month: m, closed: closeStep?.ack_status === "done" };
        })
      );
      const oldestIncomplete = candidates.find((_, idx) => !results[idx].closed);
      const m = oldestIncomplete ?? firstOfMonth(new Date());
      return isCockpitOpenableMonth(m) ? m : null;
    },
    staleTime: 5 * 60 * 1000,
  });
}


