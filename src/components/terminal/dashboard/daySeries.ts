/**
 * TD-FIX-B-R1 R5 — the volume chart's day series: one point per real IST day, pre-computed
 * days and raw completed orders merged on the same day key (the split day sums both parts).
 * Axis labels carry the two-digit year whenever two plotted days would otherwise share a label.
 */
import { dayKeyToMs, formatDayFull, formatDayLabel, istDayKey } from '@/lib/orderSummary';

export type DayPoint = { date: string; full: string; buy: number; sell: number };
type PreDay = { day: string; buy: number; sell: number };
type RawOrder = { createTime: number; tradeType?: string; totalPrice?: string };

export function buildDaySeries(pre: PreDay[], completed: RawOrder[], forceYear = false): DayPoint[] {
  const byDay = new Map<string, { buy: number; sell: number }>();
  for (const p of pre) {
    const e = byDay.get(p.day) || { buy: 0, sell: 0 };
    e.buy += p.buy; e.sell += p.sell;
    byDay.set(p.day, e);
  }
  for (const o of completed) {
    const day = istDayKey(o.createTime);
    const e = byDay.get(day) || { buy: 0, sell: 0 };
    const price = parseFloat(o.totalPrice || '0');
    if (o.tradeType === 'BUY') e.buy += price; else e.sell += price;
    byDay.set(day, e);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => dayKeyToMs(a) - dayKeyToMs(b));
  const short = days.map((d) => formatDayLabel(d, false));
  const withYear = forceYear || new Set(short).size < short.length;
  return days.map((day, i) => {
    const v = byDay.get(day)!;
    return { date: withYear ? formatDayLabel(day, true) : short[i], full: formatDayFull(day), buy: Math.round(v.buy), sell: Math.round(v.sell) };
  });
}
