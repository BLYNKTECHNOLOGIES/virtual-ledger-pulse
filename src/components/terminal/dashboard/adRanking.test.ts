import { describe, expect, it } from "vitest";
import { rankTopAdsByValue } from "./adRanking";
import { formatExactRupees, formatVolume } from "./dashFormat";

const ad = (advNo: string, tradeType: string, surplusAmount: any, price: any, fiatUnit = "INR") => ({ advNo, tradeType, surplusAmount, price, fiatUnit });

describe("F1 · top ads by rupee value", () => {
  it("(a) per side, ranked by remaining × price", () => {
    const r = rankTopAdsByValue([
      ad("1", "BUY", 150000000, 0.000499), ad("2", "BUY", 5100, 98.6), ad("3", "BUY", "50000", "71450.43"), ad("4", "SELL", 7112.2, 107.35),
    ]);
    expect(r.sell.map((x) => [x.ad.advNo, formatExactRupees(x.value)])).toEqual([["4", "₹7,63,495"]]);
    expect(r.buy.map((x) => [x.ad.advNo, formatExactRupees(x.value)])).toEqual([["3", "₹3,57,25,21,500"], ["2", "₹5,02,860"], ["1", "₹74,850"]]);
  });
  it("(a2) only the top 3 per side", () => {
    const r = rankTopAdsByValue([ad("1", "BUY", 1, 1), ad("2", "BUY", 2, 1), ad("3", "BUY", 3, 1), ad("4", "BUY", 4, 1)]);
    expect(r.buy.map((x) => x.ad.advNo)).toEqual(["4", "3", "2"]);
  });
  it("(b) price 0, remaining '0', missing price are left out", () => {
    const r = rankTopAdsByValue([ad("1", "BUY", 10, 0), ad("2", "BUY", "0", 5), ad("3", "BUY", 10, undefined)]);
    expect(r.buy).toEqual([]);
  });
  it("(c) non-INR ads are left out", () => {
    expect(rankTopAdsByValue([ad("1", "SELL", 10, 5, "USD")]).sell).toEqual([]);
  });
  it("(d) equal values ordered by ad number, independent of input order", () => {
    const list = [ad("b2", "SELL", 10, 10), ad("a1", "SELL", 20, 5)];
    expect(rankTopAdsByValue(list).sell.map((x) => x.ad.advNo)).toEqual(["a1", "b2"]);
    expect(rankTopAdsByValue([...list].reverse()).sell.map((x) => x.ad.advNo)).toEqual(["a1", "b2"]);
  });
  it("(e) value formatting", () => {
    expect([formatVolume(3572521500), formatExactRupees(3572521500)]).toEqual(["₹357.25Cr", "₹3,57,25,21,500"]);
    expect([formatVolume(763494.67), formatExactRupees(763494.67)]).toEqual(["₹7.6L", "₹7,63,495"]);
    expect(formatVolume(74850)).toBe("₹74,850");
  });
});
