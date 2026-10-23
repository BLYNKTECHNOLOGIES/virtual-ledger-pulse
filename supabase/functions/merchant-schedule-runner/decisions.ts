export interface Schedule {
  id: string; name: string; exchange_account_id: string; action: "go_online" | "go_offline" | "take_rest";
  day_of_week: number; start_time: string; end_time: string; is_active: boolean;
}
export interface CurrentRest { id: string; source: string; exchange_account_id: string | null; is_active: boolean }
export interface Decision {
  schedule_id: string; schedule_name: string; exchange_account_id: string; action: string;
  occurrence_start: string; occurrence_end: string | null;
  outcome: "started" | "ended_rest" | "skipped" | "nothing_to_do";
  message: string; durationMinutes?: number; rest_timer_id?: string;
}
const DAY = 86_400_000, IST = 19_800_000;
const timeMs = (t: string) => {
  const [h, m, s = 0] = t.split(":").map(Number);
  return (h * 3600 + m * 60 + s) * 1000;
};
export function occurrence(s: Schedule, now: Date) {
  const local = new Date(now.getTime() + IST);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - IST;
  for (const day of [midnight, midnight - DAY]) {
    if (new Date(day + IST).getUTCDay() !== s.day_of_week) continue;
    const start = day + timeMs(s.start_time);
    const end = day + timeMs(s.end_time) + (timeMs(s.end_time) < timeMs(s.start_time) ? DAY : 0);
    if (now.getTime() >= start && now.getTime() < (s.action === "go_online" ? start + DAY : end)) return { start, end };
  }
  return null;
}
export const occurrenceKey = (id: string, start: string) => `${id}:${start}`;
export function decide(s: Schedule, now: Date, rest: CurrentRest | null, seen: Set<string>): Decision | null {
  if (!s.is_active) return null;
  const w = occurrence(s, now);
  if (!w) return null;
  const start = new Date(w.start).toISOString();
  if (seen.has(occurrenceKey(s.id, start))) return null;
  // Never start a rest inside its final minute. Integer minutes end no later than the window end.
  if (s.action !== "go_online" && w.end - now.getTime() < 60_000) return null;
  const base = { schedule_id: s.id, schedule_name: s.name, exchange_account_id: s.exchange_account_id,
    action: s.action, occurrence_start: start, occurrence_end: s.action === "go_online" ? null : new Date(w.end).toISOString() };
  if (s.action === "go_online") {
    if (!rest?.is_active) return { ...base, outcome: "nothing_to_do", message: "No rest is running" };
    if (rest.source !== "schedule" || rest.exchange_account_id !== s.exchange_account_id) {
      return { ...base, outcome: "skipped", message: "A person's rest or another account's rest is running — left alone" };
    }
    return { ...base, outcome: "ended_rest", message: "End the schedule-owned rest", rest_timer_id: rest.id };
  }
  if (rest?.is_active) return { ...base, outcome: "skipped", message: "A rest is already running — left alone" };
  return { ...base, outcome: "started", message: "Start a schedule-owned rest for the remaining window",
    durationMinutes: Math.max(1, Math.floor((w.end - now.getTime()) / 60_000)) };
}