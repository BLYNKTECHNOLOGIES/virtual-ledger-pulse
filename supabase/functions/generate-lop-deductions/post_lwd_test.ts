import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { postLwdAmount, postLwdDays } from "../_shared/postLwd.ts";

Deno.test("leaver on 10 Oct: 21 days after LWD are charged", () => {
  assertEquals(postLwdDays("2026-10-10", "2026-10-01", "2026-10-31"), 21);
});
Deno.test("LWD on the last day of the month: nothing extra", () => {
  assertEquals(postLwdDays("2026-10-31", "2026-10-01", "2026-10-31"), 0);
});
Deno.test("LWD in another month: nothing extra", () => {
  assertEquals(postLwdDays("2026-11-02", "2026-10-01", "2026-10-31"), 0);
  assertEquals(postLwdDays("2026-09-30", "2026-10-01", "2026-10-31"), 0);
});
Deno.test("Satyam Sep 2026: LWD 7 Sep on 15,000 = 11,500 (what was typed by hand)", () => {
  const d = postLwdDays("2026-09-07", "2026-09-01", "2026-09-30");
  assertEquals(d, 23);
  assertEquals(postLwdAmount(15000, 30, d), 11500);
});
