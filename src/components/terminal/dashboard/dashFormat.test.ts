import { describe, expect, it } from "vitest";
import {
  formatAge,
  formatAxisRupees,
  formatExactRupees,
  formatIstClock,
  formatIstDateTime,
  formatIstDay,
  formatIstHour,
  formatIstTime,
  formatIstWhen,
  formatPrice,
  formatVolume,
  istHourStart,
  isSameIstDay,
  roundShares,
} from "./dashFormat";
import { buildShiftWindows, getTimestampsForFilter } from "./TimePeriodFilter";

const IST = 330 * 60000;
const istTs = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) - IST;

describe("dashboard number formats", () => {
  it("keeps the headline volume format", () => {
    expect(formatVolume(1615635)).toBe("₹16.2L");
    expect(formatVolume(123456789)).toBe("₹12.35Cr");
    expect(formatVolume(43407)).toBe("₹43,407");
    expect(formatExactRupees(1615635.4)).toBe("₹16,15,635");
  });

  it("axis ticks keep their decimals so evenly spaced ticks read evenly", () => {
    expect([0, 499, 1000, 5500, 11000, 16500, 22000, 99999, 100000, 150000, 255000, 2850000, 10000000, 15500000].map((v) => formatAxisRupees(v)))
      .toEqual(["₹0", "₹499", "₹1K", "₹5.5K", "₹11K", "₹16.5K", "₹22K", "₹100K", "₹1L", "₹1.5L", "₹2.55L", "₹28.5L", "₹1Cr", "₹1.55Cr"]);
  });

  it("one unit per axis, taken from the axis maximum", () => {
    expect([0, 85000, 170000, 255000, 340000].map((v) => formatAxisRupees(v, 340000)))
      .toEqual(["₹0", "₹0.85L", "₹1.7L", "₹2.55L", "₹3.4L"]);
    expect([0, 5500, 11000].map((v) => formatAxisRupees(v, 22000))).toEqual(["₹0", "₹5.5K", "₹11K"]);
  });

  it("sub-rupee ad prices stay readable", () => {
    expect(formatPrice(0.000488)).toBe("₹0.000488");
    expect(formatPrice(99.84)).toBe("₹99.84");
    expect(formatPrice(NaN)).toBe("—");
  });

  it("shares always add up to 100", () => {
    expect(roundShares([82, 19, 11, 2, 1])).toEqual([71, 16, 10, 2, 1]);
    expect(roundShares([82, 19, 11, 2, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(roundShares([455, 545]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(roundShares([300, 700])).toEqual([30, 70]);
    expect(roundShares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(roundShares([0, 0])).toEqual([0, 0]);
    expect(roundShares([5, 0])).toEqual([100, 0]);
  });

  it("ages for tooltips", () => {
    expect(formatAge(17 * 60000)).toBe("17 min");
    expect(formatAge(3 * 3600000)).toBe("3 h");
    expect(formatAge(50 * 3600000)).toBe("2 days");
  });
});

describe("IST time labels", () => {
  it("clock, date and hour labels", () => {
    const t = istTs(2026, 10, 15, 16, 38, 5);
    expect(formatIstClock(t)).toBe("4:38 PM");
    expect(formatIstClock(istTs(2026, 10, 15, 0, 5))).toBe("12:05 AM");
    expect(formatIstClock(istTs(2026, 10, 15, 12, 0))).toBe("12:00 PM");
    expect(formatIstDateTime(t)).toBe("15 Oct 2026, 4:38:05 PM IST");
    expect(istHourStart(t)).toBe(istTs(2026, 10, 15, 16, 0));
    expect(formatIstHour(istHourStart(t))).toBe("16:00");
    expect(formatIstTime(istTs(2026, 10, 15, 17, 30))).toBe("17:30");
    expect(formatIstDay(istTs(2026, 10, 16, 0, 30))).toBe("16 Oct");
  });

  it("adds the date only when it is not today (IST)", () => {
    const now = istTs(2026, 10, 15, 16, 40);
    expect(formatIstWhen(istTs(2026, 10, 15, 16, 38), now)).toBe("4:38 PM");
    expect(formatIstWhen(istTs(2026, 10, 14, 23, 50), now)).toBe("14 Oct, 11:50 PM");
    // 00:10 IST on 15 Oct is still 14 Oct in UTC: the IST day decides.
    expect(isSameIstDay(istTs(2026, 10, 15, 0, 10), now)).toBe(true);
  });

  it("an evening shift on a past day runs 17:30 → 01:00 and ends on a half hour", () => {
    const f = { mode: "1d" as const, date: new Date(istTs(2026, 10, 10, 12, 0)), shift: "shift3" as const };
    expect(buildShiftWindows(f).length).toBe(1);
    const b = getTimestampsForFilter(f);
    expect(b.startTimestamp).toBe(istTs(2026, 10, 10, 17, 30));
    expect(b.endTimestamp).toBe(istTs(2026, 10, 11, 1, 0));
    // The dashboard treats a window end that is not on a half hour as "cut at the time the page opened".
    expect(b.endTimestamp % 1800000).toBe(0);
    const labels: string[] = [];
    for (let t = istHourStart(b.startTimestamp); t <= istHourStart(b.endTimestamp - 1); t += 3600000) labels.push(formatIstHour(t));
    expect(labels).toEqual(["17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "00:00"]);
  });
});
