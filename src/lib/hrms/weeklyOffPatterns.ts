import { supabase } from "@/integrations/supabase/client";

/** Single cache key for ALL weekly-off patterns (active + inactive). Screens
 *  that should only offer active ones filter locally — never refetch under the
 *  same key with a narrower filter, or the cache collides between pages. */
export const WEEKLY_OFF_PATTERNS_KEY = ["hr_weekly_off_patterns"] as const;

export async function fetchAllWeeklyOffPatterns(): Promise<any[]> {
  const { data, error } = await (supabase as any).from("hr_weekly_off_patterns").select("*").order("name");
  if (error) throw error;
  return data || [];
}

/** Stable pattern code derived from its name (same shape for every creator). */
export function weeklyOffPatternCode(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 40);
}
