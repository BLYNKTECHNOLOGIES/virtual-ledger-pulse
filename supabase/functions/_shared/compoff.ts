// Shared comp-off month math.
//
// Comp-off (CO) is a strictly monthly currency: earned in a month, first used
// to cancel that month's loss of pay, remainder encashed in the same payroll.
// Both `generate-lop-deductions` (which applies the offset) and
// `generate-compoff-encashment` (which pays the remainder) MUST derive the
// pool and the offset from this file, otherwise the two engines drift.

export interface CompoffPool {
  days_earned: number;
  days_opening: number;
  days_taken: number;
  days_available: number;
}

export async function fetchCompoffPool(
  supabase: any,
  employeeIds: string[],
  periodStr: string, // YYYY-MM-01
): Promise<Map<string, CompoffPool>> {
  const map = new Map<string, CompoffPool>();
  if (!employeeIds.length) return map;
  const { data, error } = await supabase.rpc("hr_compoff_month_pool", {
    p_employee_ids: employeeIds,
    p_period_month: periodStr,
  });
  if (error) throw error;
  for (const r of (data ?? []) as any[]) {
    map.set(r.employee_id, {
      days_earned: Number(r.days_earned ?? 0),
      days_opening: Number(r.days_opening ?? 0),
      days_taken: Number(r.days_taken ?? 0),
      days_available: Number(r.days_available ?? 0),
    });
  }
  return map;
}

/** LOP is cancelled by comp-off first; whatever comp-off is left gets encashed. */
export function splitCompoff(available: number, lopDays: number) {
  const pool = Math.max(0, Number(available) || 0);
  const lop = Math.max(0, Number(lopDays) || 0);
  const offset = Math.min(pool, lop);
  return {
    offset_days: offset,
    lop_after_offset: Number((lop - offset).toFixed(2)),
    encash_days: Number((pool - offset).toFixed(2)),
  };
}
