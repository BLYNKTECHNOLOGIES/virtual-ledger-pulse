const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function lastClosedAttendanceDate(now = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const shiftDays = ist.getUTCHours() < 5 ? 2 : 1;
  ist.setUTCDate(ist.getUTCDate() - shiftDays);
  return ist.toISOString().slice(0, 10);
}

export function rollingClosedDates(now = new Date(), days = 7): string[] {
  const safeDays = Math.min(Math.max(Math.trunc(days), 1), 31);
  const lastClosed = new Date(`${lastClosedAttendanceDate(now)}T00:00:00.000Z`);
  return Array.from({ length: safeDays }, (_, index) =>
    new Date(lastClosed.getTime() - (safeDays - index - 1) * DAY_MS).toISOString().slice(0, 10)
  );
}

export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}