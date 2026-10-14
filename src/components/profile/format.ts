/**
 * Display helpers for the employee profile (ESS) page.
 * Presentation only — every date and time is shown in IST, whatever the
 * device's own time zone is.
 */
import { formatDistanceToNowStrict } from 'date-fns';

const TZ = 'Asia/Kolkata';

/** 'YYYY-MM-DD' (a calendar date) or a timestamp → Date. Calendar dates are pinned to IST midnight. */
function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00+05:30`) : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const fmt = (v: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions, fallback = '—') => {
  const d = toDate(v);
  return d ? new Intl.DateTimeFormat('en-IN', { timeZone: TZ, ...opts }).format(d) : fallback;
};

/** 14 Oct 2026 */
export const fmtDay = (v: string | Date | null | undefined, fallback = '—') =>
  fmt(v, { day: 'numeric', month: 'short', year: 'numeric' }, fallback);
/** 14 Oct */
export const fmtDayShort = (v: string | Date | null | undefined, fallback = '—') =>
  fmt(v, { day: 'numeric', month: 'short' }, fallback);
/** Wed, 14 Oct */
export const fmtWeekday = (v: string | Date | null | undefined, fallback = '—') =>
  fmt(v, { weekday: 'short', day: 'numeric', month: 'short' }, fallback);
/** September 2026 */
export const fmtMonth = (v: string | Date | null | undefined, fallback = '—') =>
  fmt(v, { month: 'long', year: 'numeric' }, fallback);
/** Sep 2026 */
export const fmtMonthShort = (v: string | Date | null | undefined, fallback = '—') =>
  fmt(v, { month: 'short', year: 'numeric' }, fallback);
/** 09:04 am (IST) */
export const fmtTime = (v: string | Date | null | undefined, fallback = '—') =>
  fmt(v, { hour: '2-digit', minute: '2-digit', hour12: true }, fallback);

/** "14 Oct 2026", "14–16 Oct 2026", "28 Sep – 2 Oct 2026", "30 Dec 2026 – 2 Jan 2027" */
export function fmtRange(start?: string | null, end?: string | null): string {
  if (!start) return '—';
  if (!end || end === start) return fmtDay(start);
  const s = toDate(start), e = toDate(end);
  if (!s || !e) return `${fmtDay(start)} – ${fmtDay(end)}`;
  const part = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, ...o }).format(d);
  const sy = part(s, { year: 'numeric' }), ey = part(e, { year: 'numeric' });
  const sm = part(s, { month: 'short' }), em = part(e, { month: 'short' });
  if (sy === ey && sm === em) return `${part(s, { day: 'numeric' })}–${part(e, { day: 'numeric' })} ${em} ${ey}`;
  if (sy === ey) return `${part(s, { day: 'numeric', month: 'short' })} – ${part(e, { day: 'numeric', month: 'short' })} ${ey}`;
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

/** "3 days ago" */
export function fmtAgo(v: string | Date | null | undefined, fallback = '—') {
  const d = toDate(v);
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : fallback;
}

/** 7h 51m */
export function fmtMinutes(min: number | null | undefined, fallback = '—') {
  const m = Math.round(Number(min) || 0);
  if (m <= 0) return fallback;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h ${String(r).padStart(2, '0')}m` : `${r}m`;
}

/** ₹24,000 — Indian grouping, whole rupees unless decimals are asked for. */
export function fmtINR(n: number | null | undefined, decimals = 0) {
  const v = Number(n) || 0;
  return `${v < 0 ? '−' : ''}₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** 1.5 → "1.5", 2 → "2" */
export function fmtDays(n: number | null | undefined) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Today's calendar date in IST, 'YYYY-MM-DD'. */
export function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** 'YYYY-MM-DD' plus n calendar days. */
export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "1 yr 7 mo" since a joining date. */
export function tenure(joining?: string | null): string | null {
  const d = toDate(joining);
  if (!d) return null;
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) return null;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y && !m) return 'joined this month';
  return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ');
}

/** Title-case a snake_case / lower-case code: "salary_advance" → "Salary advance". */
export function humanize(v?: string | null, fallback = '—') {
  const s = String(v || '').trim();
  if (!s) return fallback;
  const t = s.replace(/[_-]+/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Leave request stage as the employee should read it. */
export function leaveStage(status?: string | null, managerStatus?: string | null): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  switch ((status || '').toLowerCase()) {
    case 'requested':
      return { label: managerStatus === 'not_applicable' ? 'Awaiting HR' : 'Awaiting manager', tone: 'warning' };
    case 'manager_approved':
      return { label: 'Awaiting HR', tone: 'warning' };
    case 'approved':
      return { label: 'Approved', tone: 'success' };
    case 'rejected':
      return { label: 'Rejected', tone: 'danger' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' };
    default:
      return { label: humanize(status), tone: 'neutral' };
  }
}
