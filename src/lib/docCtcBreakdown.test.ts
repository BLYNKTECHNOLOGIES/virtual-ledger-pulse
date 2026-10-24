import { describe, expect, it } from "vitest";
import {
  STANDARD_STRUCTURE_FALLBACK,
  computeCtcBreakdown,
  normaliseStructure,
  parseAmount,
  salarySource,
} from "./docCtcBreakdown";

const STANDARD = STANDARD_STRUCTURE_FALLBACK;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("standard CTC break-up", () => {
  it("splits 1,63,200 into 50/25/15/10 exactly", () => {
    const b = computeCtcBreakdown(163200, STANDARD);
    expect(b.monthly).toBe(13600);
    const by = Object.fromEntries(b.lines.map((l) => [l.key, l]));
    expect([by.basic.monthly, by.basic.annual]).toEqual([6800, 81600]);
    expect([by.hra.monthly, by.hra.annual]).toEqual([3400, 40800]);
    expect([by.special.monthly, by.special.annual]).toEqual([2040, 24480]);
    expect([by.lta.monthly, by.lta.annual]).toEqual([1360, 16320]);
    expect([by.da.monthly, by.da.annual]).toEqual([0, 0]);
    expect(b.warnings).toEqual([]);
  });

  it("always totals the CTC — rounding drift lands in Special Allowance", () => {
    for (let ctc = 100000; ctc <= 1200000; ctc += 7919) {
      const b = computeCtcBreakdown(ctc, STANDARD);
      expect(sum(b.lines.map((l) => l.monthly))).toBe(b.monthly);
      expect(sum(b.lines.map((l) => l.annual))).toBe(b.annual);
      const special = b.lines.find((l) => l.key === "special")!;
      // Drift is a rupee or two, never a real re-allocation.
      expect(Math.abs(special.annual - (ctc * 15) / 100)).toBeLessThanOrEqual(3);
      expect(b.warnings).toEqual([]);
    }
  });

  it("rounds a fractional CTC to whole rupees", () => {
    const b = computeCtcBreakdown(250000.4, STANDARD);
    expect(b.annual).toBe(250000);
    expect(b.monthly).toBe(20833);
    expect(sum(b.lines.map((l) => l.monthly))).toBe(20833);
  });

  it("warns and balances when the structure does not add up to 100%", () => {
    const b = computeCtcBreakdown(120000, [
      { key: "basic", mode: "percentage", value: 50 },
      { key: "hra", mode: "percentage", value: 25 },
      { key: "special", mode: "percentage", value: 15 },
    ]);
    expect(b.warnings[0]).toMatch(/adds up to 90%/);
    expect(sum(b.lines.map((l) => l.annual))).toBe(120000);
    expect(b.lines.find((l) => l.key === "special")!.annual).toBe(30000);
  });

  it("treats a fixed component as a monthly amount", () => {
    const b = computeCtcBreakdown(240000, [
      { key: "basic", mode: "percentage", value: 50 },
      { key: "lta", mode: "fixed", value: 1000 },
      { key: "special", mode: "percentage", value: 0 },
    ]);
    const lta = b.lines.find((l) => l.key === "lta")!;
    expect([lta.monthly, lta.annual]).toEqual([1000, 12000]);
    expect(sum(b.lines.map((l) => l.monthly))).toBe(20000);
  });

  it("adds a balancing Special Allowance line when the structure has none", () => {
    const b = computeCtcBreakdown(120000, [{ key: "basic", mode: "percentage", value: 60 }]);
    expect(b.lines.map((l) => l.key)).toEqual(["basic", "special"]);
    expect(b.lines[1].annual).toBe(48000);
  });

  it("flags a structure whose fixed parts exceed the CTC", () => {
    const b = computeCtcBreakdown(12000, [
      { key: "basic", mode: "fixed", value: 2000 },
      { key: "special", mode: "percentage", value: 0 },
    ]);
    expect(b.warnings.join(" ")).toMatch(/negative/);
  });
});

describe("salary source for the letter dictionary", () => {
  it("emits resolver keys for every standard component", () => {
    const { source } = salarySource(163200, STANDARD);
    expect(source["salary.annual_ctc"]).toBe(163200);
    expect(source["salary.monthly_ctc"]).toBe(13600);
    expect(source["derived.annual_ctc_words"]).toBe(163200);
    expect(source["salary.special_allowance_monthly"]).toBe(2040);
    expect(source["salary.da_annual"]).toBe(0);
  });

  it("prints 0 for a standard component the structure leaves out", () => {
    const { source } = salarySource(120000, [
      { key: "basic", mode: "percentage", value: 50 },
      { key: "special", mode: "percentage", value: 50 },
    ]);
    expect(source["salary.hra_monthly"]).toBe(0);
    expect(source["salary.lta_annual"]).toBe(0);
  });

  it("leaves every salary value empty when the CTC is unknown", () => {
    const { source, breakdown } = salarySource(null, STANDARD);
    expect(breakdown).toBeNull();
    expect(source["salary.annual_ctc"]).toBe("");
    expect(source["salary.basic_monthly"]).toBe("");
  });
});

describe("amount parsing and structure normalisation", () => {
  it("parses amounts the way HR types them", () => {
    expect(parseAmount("1,63,200")).toBe(163200);
    expect(parseAmount("INR 1,63,200")).toBe(163200);
    expect(parseAmount("₹ 50000")).toBe(50000);
    expect(parseAmount("₹1,63,200/-")).toBe(163200);
    expect(parseAmount("Rs. 1,63,200")).toBe(163200);
    expect(parseAmount("Rs.163200")).toBe(163200);
    expect(parseAmount("Rs163200")).toBe(163200);
    expect(parseAmount("INR163200")).toBe(163200);
    expect(parseAmount("rs 163200 only")).toBe(163200);
    expect(parseAmount("4,80,000/-")).toBe(480000);
    expect(parseAmount("4,80,000 p.a.")).toBe(480000);
    expect(parseAmount("480000 per annum")).toBe(480000);
    expect(parseAmount("163200.50")).toBe(163200.5);
    expect(parseAmount(42)).toBe(42);
  });

  it("rejects anything that is not clearly one rupee figure", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1.5 lakh")).toBeNull();
    expect(parseAmount("12-15k")).toBeNull();
    expect(parseAmount("Rs.")).toBeNull();
    expect(parseAmount(".")).toBeNull();
    expect(parseAmount(Number.NaN)).toBeNull();
  });

  it("keeps only well-formed components from settings JSON", () => {
    expect(
      normaliseStructure([
        { key: "Basic", mode: "percentage", label: "Basic Salary", value: 50 },
        { key: "", value: 10 },
        { key: "hra", value: "x" },
        null,
      ]),
    ).toEqual([{ key: "basic", label: "Basic Salary", mode: "percentage", value: 50 }]);
    expect(normaliseStructure(null)).toEqual([]);
  });
});
