import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Declared company holidays for a month, keyed by yyyy-MM-dd.
 * Calendars overlay these so a declared holiday reads as "Holiday" even when the
 * attendance engine wrote no daily row for it (holidays are non-working days, so
 * the absent-marker intentionally skips them — the LOP engine excludes them too).
 */
export function useMonthHolidays(from: string, to: string) {
  return useQuery<Record<string, string>>({
    queryKey: ["hr_month_holidays", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_holidays")
        .select("date, name")
        .eq("is_active", true)
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((h: any) => { map[h.date] = h.name; });
      return map;
    },
  });
}
