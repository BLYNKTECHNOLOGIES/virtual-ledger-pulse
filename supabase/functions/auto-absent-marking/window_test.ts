// F10 · Absence-ownership certification — v4 window semantics.
// Verifies the 05:00 IST boundary rule used by auto-absent-marking:
// the "attendance day" for a punch at HH:MM IST is the calendar date
// where HH < 5 rolls back to the previous day.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dayOfWeek, lastClosedAttendanceDate, rollingClosedDates } from "./dates.ts";

function windowDateIST(iso: string): string {
  const d = new Date(iso);
  // Shift to IST (+05:30)
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  const h = ist.getUTCHours();
  const rolled = h < 5 ? new Date(ist.getTime() - 24 * 3600_000) : ist;
  return rolled.toISOString().slice(0, 10);
}

Deno.test("punch at 04:30 IST belongs to previous attendance day", () => {
  // 2026-07-25 04:30 IST == 2026-07-24T23:00:00Z
  assertEquals(windowDateIST("2026-07-24T23:00:00Z"), "2026-07-24");
});

Deno.test("punch at 05:00 IST belongs to same calendar day", () => {
  // 2026-07-25 05:00 IST == 2026-07-24T23:30:00Z
  assertEquals(windowDateIST("2026-07-24T23:30:00Z"), "2026-07-25");
});

Deno.test("punch at 23:59 IST belongs to same calendar day", () => {
  // 2026-07-25 23:59 IST == 2026-07-25T18:29:00Z
  assertEquals(windowDateIST("2026-07-25T18:29:00Z"), "2026-07-25");
});

Deno.test("last closed day before 05:00 IST is two calendar dates back", () => {
  assertEquals(lastClosedAttendanceDate(new Date("2026-09-01T22:30:00Z")), "2026-08-31");
});

Deno.test("last closed day after 05:00 IST is yesterday", () => {
  assertEquals(lastClosedAttendanceDate(new Date("2026-09-01T00:30:00Z")), "2026-08-31");
});

Deno.test("rolling reconciliation crosses month boundaries without gaps", () => {
  assertEquals(rollingClosedDates(new Date("2026-09-01T00:30:00Z"), 7), [
    "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28",
    "2026-08-29", "2026-08-30", "2026-08-31",
  ]);
});

Deno.test("weekly-off day numbers are stable across month boundaries", () => {
  assertEquals(dayOfWeek("2026-08-30"), 0);
  assertEquals(dayOfWeek("2026-08-31"), 1);
  assertEquals(dayOfWeek("2026-09-01"), 2);
});
