/**
 * Workforce forecast — month-by-month projection per staffing line.
 *
 * Opening on roll comes from the staffing matrix (same people it counts);
 * dated movements come from hr_workforce_forecast_events. Required and gap
 * are sums of per-line values; a surplus on one line never hides a shortage
 * on another. Attrition is a planning estimate not tied to any line.
 */

export type ForecastEventKind = "exit" | "joiner" | "trainee" | "hire";

export interface ForecastEvent {
  kind: ForecastEventKind;
  plan_id: string | null;
  department_id: string | null;
  position_id: string | null;
  event_date: string | null;
  qty: number;
  ref_id: string;
  person_name?: string | null;
  badge_id?: string | null;
  role_title?: string | null;
  shift_name?: string | null;
  requirement_no?: string | null;
  requirement_status?: string | null;
  related_requirement_no?: string | null;
}

export interface ForecastLine {
  plan_id: string;
  required_hc: number;
  current_hc: number;
}

export interface ForecastMonth {
  key: string; // YYYY-MM
  start: string;
  end: string;
  partial: boolean;
  opening: number;
  trainees: number;
  joiners: number;
  hires: number;
  /** Expected hires in this month that had no target date (placed at the end of the horizon). */
  undatedHires: number;
  exits: number;
  attrition: number;
  closing: number;
  required: number;
  /** Σ max(0, line required − line projected) at the month's end. */
  lineGap: number;
  /** Cumulative attrition estimate — extra need not tied to a line. */
  estimatedExtraNeed: number;
}

export const APPROVED_REQ_STATUSES = new Set(["approved", "recruitment_active", "partially_fulfilled"]);

/** Add days to an ISO date (UTC-safe). */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthEnd(iso: string): string {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
}

export function horizonEndFor(today: string, period: string, customEnd?: string): string {
  if (period === "custom") return customEnd && customEnd >= today ? customEnd : today;
  if (period === "180") {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 6);
    return d.toISOString().slice(0, 10);
  }
  return addDays(today, Number(period) || 0);
}

/** Calendar-month segments from today to the horizon end (first and last may be partial). */
export function monthSegments(today: string, end: string) {
  const out: { key: string; start: string; end: string; partial: boolean; fraction: number }[] = [];
  let s = today;
  while (s <= end) {
    const me = monthEnd(s);
    const e = me < end ? me : end;
    const full = daysBetween(`${s.slice(0, 7)}-01`, me);
    const days = daysBetween(s, e);
    out.push({ key: s.slice(0, 7), start: s, end: e, partial: days < full, fraction: days / full });
    s = addDays(e, 1);
  }
  return out;
}

/** Which segment an event falls in: past dates → first, no date → last, beyond horizon → none. */
export function segmentIndex(
  segs: { start: string; end: string }[],
  date: string | null,
): number {
  if (segs.length === 0) return -1;
  if (!date) return segs.length - 1;
  if (date < segs[0].start) return 0;
  return segs.findIndex((s) => date >= s.start && date <= s.end);
}

export function isCountedHire(e: ForecastEvent, includePending: boolean): boolean {
  if (e.kind !== "hire") return true;
  if (APPROVED_REQ_STATUSES.has(e.requirement_status || "")) return true;
  return includePending && e.requirement_status === "pending_approval";
}

export function buildForecast(opts: {
  today: string;
  end: string;
  lines: ForecastLine[];
  events: ForecastEvent[];
  includePending: boolean;
  attritionPct: number;
}): { months: ForecastMonth[]; totals: Omit<ForecastMonth, "key" | "start" | "end" | "partial"> } {
  const segs = monthSegments(opts.today, opts.end);
  const lineIds = new Set(opts.lines.map((l) => l.plan_id));
  const delta = segs.map(() => new Map<string, number>());
  const flows = segs.map(() => ({ trainees: 0, joiners: 0, hires: 0, undatedHires: 0, exits: 0 }));

  for (const e of opts.events) {
    if (!e.plan_id || !lineIds.has(e.plan_id)) continue;
    if (!isCountedHire(e, opts.includePending)) continue;
    const i = segmentIndex(segs, e.event_date);
    if (i < 0) continue;
    const q = Number(e.qty) || 0;
    const sign = e.kind === "exit" ? -1 : 1;
    delta[i].set(e.plan_id, (delta[i].get(e.plan_id) || 0) + sign * q);
    if (e.kind === "exit") flows[i].exits += q;
    else if (e.kind === "trainee") flows[i].trainees += q;
    else if (e.kind === "joiner") flows[i].joiners += q;
    else {
      flows[i].hires += q;
      if (!e.event_date) flows[i].undatedHires += q;
    }
  }

  const projected = new Map(opts.lines.map((l) => [l.plan_id, Number(l.current_hc) || 0]));
  const required = opts.lines.reduce((a, l) => a + (Number(l.required_hc) || 0), 0);
  let opening = opts.lines.reduce((a, l) => a + (Number(l.current_hc) || 0), 0);
  let cumAttrition = 0;
  const rate = Math.max(0, Number(opts.attritionPct) || 0) / 100;

  const months: ForecastMonth[] = segs.map((s, i) => {
    delta[i].forEach((v, k) => projected.set(k, (projected.get(k) || 0) + v));
    const f = flows[i];
    const attrition = Math.round(rate * opening * s.fraction);
    cumAttrition += attrition;
    const closing = opening + f.trainees + f.joiners + f.hires - f.exits - attrition;
    let lineGap = 0;
    for (const l of opts.lines) lineGap += Math.max(0, (Number(l.required_hc) || 0) - (projected.get(l.plan_id) || 0));
    const m: ForecastMonth = {
      key: s.key, start: s.start, end: s.end, partial: s.partial, opening, ...f, attrition, closing,
      required, lineGap, estimatedExtraNeed: cumAttrition,
    };
    opening = closing;
    return m;
  });

  const last = months[months.length - 1];
  const sum = (k: keyof ForecastMonth) => months.reduce((a, m) => a + (m[k] as number), 0);
  return {
    months,
    totals: {
      opening: months[0]?.opening ?? opening,
      trainees: sum("trainees"), joiners: sum("joiners"), hires: sum("hires"), undatedHires: sum("undatedHires"),
      exits: sum("exits"), attrition: sum("attrition"), closing: last?.closing ?? opening,
      required, lineGap: last?.lineGap ?? 0, estimatedExtraNeed: cumAttrition,
    },
  };
}

export interface AttritionMonth {
  month_start: string;
  opening_hc: number;
  closing_hc: number;
  exits: number;
  joiners: number;
  attrition_pct: number;
}

/** Actual monthly rate = total exits ÷ Σ monthly average headcount. */
export function actualAttrition(history: AttritionMonth[]) {
  const exits = history.reduce((a, m) => a + (Number(m.exits) || 0), 0);
  const avgSum = history.reduce((a, m) => a + ((Number(m.opening_hc) || 0) + (Number(m.closing_hc) || 0)) / 2, 0);
  const pct = avgSum > 0 ? Math.round((exits / avgSum) * 1000) / 10 : 0;
  return { exits, months: history.length, pct };
}
