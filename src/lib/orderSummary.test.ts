import { describe, expect, it } from "vitest";
import { aggregateSummaryRows, istDayKey, formatDayFull, type OrderSummaryRow } from "./orderSummary";

const row = (day_ist: string, trade_type: string, fiat_volume: number, status_group = "COMPLETED", source = "rollup"): OrderSummaryRow =>
  ({ day_ist, trade_type, status_group, asset: "USDT", order_count: 1, fiat_volume, asset_qty: 0, commission: 0, appeal_count: 0, source });
const IST = 330 * 60000;
const ist = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - IST;

describe(`F6 · one point per real IST day (TZ=${process.env.TZ ?? "default"})`, () => {
  const repro = [row("2025-03-23", "BUY", 100), row("2026-03-23", "BUY", 200), row("2026-03-24", "SELL", 50)];
  it("(a) same date in different years stays separate, oldest first", () => {
    const a = aggregateSummaryRows(repro);
    expect(a.series.map((p) => [p.day, formatDayFull(p.day), p.buy, p.sell])).toEqual([
      ["2025-03-23", "23 Mar 2025", 100, 0], ["2026-03-23", "23 Mar 2026", 200, 0], ["2026-03-24", "24 Mar 2026", 0, 50],
    ]);
    expect([a.totalBuyVolume, a.totalSellVolume]).toEqual([300, 50]);
  });
  it("(b) rollup + live rows of one day add into one point", () => {
    const a = aggregateSummaryRows([row("2026-09-01", "BUY", 10, "COMPLETED", "rollup"), row("2026-09-01", "SELL", 7, "COMPLETED", "live")]);
    expect(a.series).toHaveLength(1);
    expect([a.series[0].buy, a.series[0].sell]).toEqual([10, 7]);
  });
  it("(c) input order does not matter", () => {
    expect(aggregateSummaryRows([...repro].reverse()).series).toEqual(aggregateSummaryRows(repro).series);
  });
  it("(d) the recent-day key matches day_ist at 00:10 and 23:50 IST, and differs from neighbours", () => {
    expect(istDayKey(ist(2026, 9, 1, 0, 10))).toBe("2026-09-01");
    expect(istDayKey(ist(2026, 9, 1, 23, 50))).toBe("2026-09-01");
    expect(istDayKey(ist(2026, 8, 31, 23, 50))).toBe("2026-08-31");
    expect(istDayKey(ist(2026, 9, 2, 0, 10))).toBe("2026-09-02");
  });
  it("(e) non-completed rows add no point", () => {
    expect(aggregateSummaryRows([row("2026-09-01", "BUY", 10, "CANCELLED")]).series).toHaveLength(0);
  });
});
