/**
 * Calendar days in the payroll month AFTER a leaver's last working day.
 * RazorpayX pays the whole month until the person is dismissed there, so these
 * days must be deducted by HRMS (owner ruling 12-Oct-2026). 0 when the LWD is
 * outside the month or is its last day.
 */
export function postLwdDays(lwd: string | null | undefined, periodStr: string, monthEndStr: string): number {
  const d = lwd ? String(lwd).slice(0, 10) : null;
  if (!d || d < periodStr || d >= monthEndStr) return 0;
  return Number(monthEndStr.slice(8, 10)) - Number(d.slice(8, 10));
}

/** Rupee amount: monthly gross ÷ calendar days × days, rounded. */
export const postLwdAmount = (monthlyGross: number, calendarDays: number, days: number) =>
  calendarDays > 0 && days > 0 ? Math.round((monthlyGross / calendarDays) * days) : 0;
