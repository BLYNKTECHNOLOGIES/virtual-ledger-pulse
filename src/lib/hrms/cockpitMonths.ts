import { firstOfMonth } from "@/hooks/hrms/useCockpit";

/** Cockpit history floor — payroll cycles before this month are not tracked in
 *  the cockpit, so they must never be auto-selected or deep-linked. */
export const COCKPIT_FIRST_TRACKED_MONTH = "2026-07-01";

/** Months shown in the cockpit picker, newest first (+forward … current … -back). */
export function generateRecentMonths(countBack: number, countForward: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = countForward; i >= -countBack; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    months.push(firstOfMonth(d));
  }
  return months;
}

export const COCKPIT_PICKER_BACK = 12;
export const COCKPIT_PICKER_FORWARD = 3;

/** True when the cockpit can actually open this month (YYYY-MM-01): it is in
 *  the picker range and on/after the first tracked month. */
export function isCockpitOpenableMonth(month: string): boolean {
  const m = month.slice(0, 10);
  return m >= COCKPIT_FIRST_TRACKED_MONTH &&
    generateRecentMonths(COCKPIT_PICKER_BACK, COCKPIT_PICKER_FORWARD).includes(m);
}
