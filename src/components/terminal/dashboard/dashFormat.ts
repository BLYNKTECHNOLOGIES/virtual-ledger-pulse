/**
 * Display-only formatting for the Terminal Dashboard. These helpers change how
 * figures are written, never the figures themselves.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Headline rupee value, unchanged dashboard format: ₹1.23Cr · ₹4.5L · ₹12,345. */
export function formatVolume(v: number): string {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** Exact rupees in Indian grouping, e.g. ₹16,15,635. */
export function formatExactRupees(v: number): string {
  return `₹${Math.round(v || 0).toLocaleString('en-IN')}`;
}

/** Fixed decimals with trailing zeros dropped: 2.50 → 2.5, 3.00 → 3. */
const trimZero = (n: number, digits: number) => {
  const s = n.toFixed(digits);
  return digits > 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

/**
 * Chart axis ticks: ₹1.55Cr · ₹2.55L · ₹16.5K · ₹500. Pass the axis maximum so every
 * tick uses the same unit (₹0.85L · ₹1.7L · ₹2.55L rather than ₹85K · ₹1.7L · ₹2.5L).
 */
export function formatAxisRupees(v: number, axisMax?: number): string {
  const a = Math.abs(axisMax ?? v);
  if (v === 0) return '₹0';
  if (a >= 10000000) return `₹${trimZero(v / 10000000, 2)}Cr`;
  if (a >= 100000) return `₹${trimZero(v / 100000, 2)}L`;
  if (a >= 1000) return `₹${trimZero(v / 1000, 2)}K`;
  return `₹${Math.round(v)}`;
}

/**
 * Whole-number percentages of a total that add up to exactly 100
 * (largest remainder), so a list of shares never reads 99% or 101%.
 */
export function roundShares(values: number[]): number[] {
  const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => ((v > 0 ? v : 0) / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((s, v) => s + v, 0);
  const order = exact
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i] += 1;
  return out;
}

/** Ad price: keeps sub-rupee prices readable (₹0.000488); others as before (₹99.84). */
export function formatPrice(p: number): string {
  if (!Number.isFinite(p)) return '—';
  if (p > 0 && p < 1) return `₹${p.toLocaleString('en-IN', { maximumSignificantDigits: 4 })}`;
  return `₹${p.toLocaleString('en-IN')}`;
}

/** IST wall-clock parts of a timestamp. */
function istParts(ts: number) {
  const d = new Date(ts + IST_OFFSET_MS);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clock = (h: number, mi: number, s?: number) =>
  `${h % 12 || 12}:${String(mi).padStart(2, '0')}${s == null ? '' : `:${String(s).padStart(2, '0')}`} ${h >= 12 ? 'PM' : 'AM'}`;

/** Time of day in IST, e.g. 4:38 PM. */
export function formatIstClock(ts: number): string {
  const p = istParts(ts);
  return clock(p.h, p.mi);
}

/** True when both timestamps fall on the same IST calendar day. */
export function isSameIstDay(a: number, b: number): boolean {
  const x = istParts(a), y = istParts(b);
  return x.y === y.y && x.mo === y.mo && x.d === y.d;
}

/** A rough age for tooltips: 17 min · 3 h · 2 days. */
export function formatAge(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 120) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

/** Time of day in IST, with the date when it is not today: 4:38 PM · 13 Oct, 4:38 PM. */
export function formatIstWhen(ts: number, now: number = Date.now()): string {
  if (isSameIstDay(ts, now)) return formatIstClock(ts);
  const p = istParts(ts);
  return `${p.d} ${MONTHS[p.mo]}, ${clock(p.h, p.mi)}`;
}

/** Full date and time in IST for tooltips, e.g. 15 Oct 2026, 4:38:05 PM IST. */
export function formatIstDateTime(ts: number): string {
  const p = istParts(ts);
  return `${p.d} ${MONTHS[p.mo]} ${p.y}, ${clock(p.h, p.mi, p.s)} IST`;
}

/** Start of the IST hour containing ts. */
export function istHourStart(ts: number): number {
  return Math.floor((ts + IST_OFFSET_MS) / 3600000) * 3600000 - IST_OFFSET_MS;
}

/** Hour label in IST, e.g. 09:00. */
export function formatIstHour(ts: number): string {
  return `${String(istParts(ts).h).padStart(2, '0')}:00`;
}

/** 24-hour IST time, e.g. 17:30. */
export function formatIstTime(ts: number): string {
  const p = istParts(ts);
  return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
}

/** Day label in IST for an hour bucket tooltip, e.g. 15 Oct. */
export function formatIstDay(ts: number): string {
  const p = istParts(ts);
  return `${p.d} ${MONTHS[p.mo]}`;
}
