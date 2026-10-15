import { describe, expect, it } from "vitest";
import * as ui from "./tradeRules";
import * as edge from "../../../../supabase/functions/binance-assets/tradeRules";
import { readFileSync } from "node:fs";

// Live Binance rules fetched 15 Oct 2026 (exchangeInfo, MARKET order view).
const BTC = { symbol: "BTCUSDT", status: "TRADING", baseAsset: "BTC", quoteAsset: "USDT", stepSize: "0.00001", minQty: "0.00001", maxQty: "126.19843267", minNotional: "5", quotePrecision: 8 };
const ETH = { ...BTC, symbol: "ETHUSDT", baseAsset: "ETH", stepSize: "0.0001", minQty: "0.0001", maxQty: "3676.47999916" };

describe("both copies are identical", () => {
  it("edge and screen share the same rules file", () => {
    const a = readFileSync("src/components/terminal/assets/tradeRules.ts", "utf8");
    const b = readFileSync("supabase/functions/binance-assets/tradeRules.ts", "utf8");
    expect(a).toBe(b);
  });
});

for (const [name, R] of [["screen", ui], ["edge", edge]] as const) {
  describe(`F1 funding shortfall (${name})`, () => {
    it("BUY 100 USDT, Spot 30 / Funding 500 → moves 70", () => {
      expect(R.computeFundingShortfall("100", "30", "500", "USDT")).toEqual({ ok: true, move: "70" });
    });
    it("Spot 120 → moves 0", () => {
      expect(R.computeFundingShortfall("100", "120", "500", "USDT")).toEqual({ ok: true, move: "0" });
    });
    it("Spot 30 / Funding 50 → rejected, nothing moved", () => {
      const r = R.computeFundingShortfall("100", "30", "50", "USDT");
      expect(r.ok).toBe(false);
      expect(r.move).toBe("0");
    });
    it("SELL 0.5 ETH, Spot 0.1 / Funding 1.2 → moves 0.4", () => {
      expect(R.computeFundingShortfall("0.5", "0.1", "1.2", "ETH")).toEqual({ ok: true, move: "0.4" });
    });
    it("rounds the shortfall up at 8 decimals but never above Funding", () => {
      expect(R.computeFundingShortfall("1.000000001", "0", "2").move).toBe("1.00000001");
    });
  });

  describe(`F3 order checks (${name})`, () => {
    it("SELL 0.00000512 BTC is blocked as too small", () => {
      const r = R.checkOrder({ side: "SELL", amount: "0.00000512", available: "0.00000512", price: "60000", rules: BTC });
      expect(r.ok).toBe(false);
      expect(r.message).toContain("minimum is 0.00001 BTC");
    });
    it("SELL 17188.72 ETH is blocked (more than available)", () => {
      const r = R.checkOrder({ side: "SELL", amount: "17188.72", available: "2", price: "2400", rules: ETH });
      expect(r.ok).toBe(false);
      expect(r.message).toContain("Not enough ETH");
    });
    it("SELL above the market max is blocked even with the balance", () => {
      const r = R.checkOrder({ side: "SELL", amount: "17188.72", available: "20000", price: "2400", rules: ETH });
      expect(r.message).toContain("at most 3676.47999916 ETH");
    });
    it("BUY 1 USDT of BTC is below the 5 USDT minimum", () => {
      const r = R.checkOrder({ side: "BUY", amount: "1", available: "100", price: "60000", rules: BTC });
      expect(r.ok).toBe(false);
      expect(r.message).toContain("minimum of 5 USDT");
    });
    it("SELL floors quantity to the step", () => {
      expect(R.checkOrder({ side: "SELL", amount: "0.123456", available: "1", price: "60000", rules: BTC }).quantity).toBe("0.12345");
    });
  });

  describe(`Max rounds down (${name})`, () => {
    it("BUY Max on 99.996 USDT never exceeds the balance (toFixed(2) gave 100.00)", () => {
      const v = R.percentOfAvailable("99.996", 100, "BUY", BTC);
      expect(v).toBe("99.996");
      expect(R.percentOfAvailable("99.996", 100, "BUY", null)).toBe("99.99");
      expect(Number(v)).toBeLessThanOrEqual(99.996);
    });
    it("SELL 25% floors to step", () => {
      expect(R.percentOfAvailable("0.00007", 25, "SELL", BTC)).toBe("0.00001");
    });
  });
}
