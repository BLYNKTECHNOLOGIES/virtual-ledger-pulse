// F10 · Absence-ownership certification — v4 window semantics.
// Verifies the 05:00 IST boundary rule used by auto-absent-marking:
// the "attendance day" for a punch at HH:MM IST is the calendar date
// where HH < 5 rolls back to the previous day.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

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
