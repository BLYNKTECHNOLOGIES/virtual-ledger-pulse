import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decide, occurrenceKey, type Schedule } from "./decisions.ts";
const s: Schedule = { id: "00000000-0000-0000-0000-000000000010", name: "Offline", exchange_account_id: "00000000-0000-0000-0000-000000000001", action: "go_offline", day_of_week: 6, start_time: "01:00:00", end_time: "02:00:00", is_active: true };
const now = new Date("2026-10-24T01:00:00+05:30");
Deno.test("offline window starting now rests for 60 minutes", () => {
  const d = decide(s, now, null, new Set());
  assertEquals(d?.outcome, "started"); assertEquals(d?.durationMinutes, 60);
});
Deno.test("overnight Friday 22:00–06:00 at Saturday 01:00 IST has 300 minutes remaining", () => {
  const d = decide({ ...s, day_of_week: 5, start_time: "22:00:00", end_time: "06:00:00" }, now, null, new Set());
  assertEquals(d?.durationMinutes, 300); assertEquals(d?.occurrence_start, "2026-10-23T16:30:00.000Z");
});
Deno.test("go_online ends only the account's schedule rest", () => {
  const d = decide({ ...s, action: "go_online" }, now, { id: "r", source: "schedule", exchange_account_id: s.exchange_account_id, is_active: true }, new Set());
  assertEquals(d?.outcome, "ended_rest"); assertEquals(d?.rest_timer_id, "r");
});
Deno.test("go_online never touches a person's rest", () => {
  assertEquals(decide({ ...s, action: "go_online" }, now, { id: "r", source: "manual", exchange_account_id: s.exchange_account_id, is_active: true }, new Set())?.outcome, "skipped");
});
Deno.test("same occurrence seen twice produces no second decision", () => {
  const seen = new Set<string>(); const d = decide(s, now, null, seen);
  if (d) seen.add(occurrenceKey(d.schedule_id, d.occurrence_start));
  assertEquals(decide(s, now, null, seen), null);
});
Deno.test("never start inside final minute; exact one minute allowed", () => {
  assertEquals(decide(s, new Date("2026-10-24T01:59:01+05:30"), null, new Set()), null);
  assertEquals(decide(s, new Date("2026-10-24T01:59:00+05:30"), null, new Set())?.durationMinutes, 1);
});
Deno.test("active rest on any account blocks another start", () => {
  assertEquals(decide(s, now, { id: "r", source: "schedule", exchange_account_id: "other", is_active: true }, new Set())?.outcome, "skipped");
});