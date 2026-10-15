import { describe, expect, it } from "vitest";
import { makeDataEntry, makeMatchPairs, moveDecimal, rngFrom, splitSource, LEVEL_DIFFICULTY, type Level } from "../../../supabase/functions/_shared/cbtGenerate";

const levels: Level[] = ["beginner", "intermediate", "advanced"];

describe("generated data-entry records", () => {
  for (const level of levels) {
    it(`${level}: fields follow Indian banking formats`, () => {
      const r = rngFrom(7);
      for (let i = 0; i < 200; i++) {
        const { record } = makeDataEntry(r, level).content;
        expect(record.pan).toMatch(/^[A-Z]{5}\d{4}[A-Z]$/);
        expect(record.account_number).toMatch(/^\d{9,18}$/);
        expect(record.ifsc).toMatch(/^[A-Z]{4}0[A-Z0-9]{6}$/);
        expect(record.utr).toMatch(/^\d{12}$/);
        expect(record.amount).toMatch(/^[\d,]+\.\d{2}$/);
        expect(record.txn_date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      }
    });
  }
  it("advanced account numbers are longer than beginner ones", () => {
    const len = (l: Level) => makeDataEntry(rngFrom(3), l).content.record.account_number.length;
    expect(len("advanced")).toBeGreaterThanOrEqual(14);
    expect(len("beginner")).toBeLessThanOrEqual(11);
  });
});

describe("generated match pairs", () => {
  for (const level of levels) {
    it(`${level}: exactly half match and a mismatch differs by one change`, () => {
      const pairs = makeMatchPairs(rngFrom(11), level, 10);
      expect(pairs.filter((p) => p.key.match).length).toBe(5);
      for (const p of pairs) {
        if (p.key.match) expect(p.content.left).toBe(p.content.right);
        else { expect(p.content.left).not.toBe(p.content.right); expect(p.key.difference).toBeTruthy(); }
        expect(p.content).not.toHaveProperty("match");
      }
    });
  }
});

describe("item source split", () => {
  it("Both takes half generated, rounded up", () => expect(splitSource("both", 7)).toEqual({ generated: 4, bank: 3 }));
  it("Bank stays bank only", () => expect(splitSource("bank", 4)).toEqual({ generated: 0, bank: 4 }));
  it("levels map to bank difficulty", () => {
    expect(LEVEL_DIFFICULTY.beginner[0]).toBe("easy");
    expect(LEVEL_DIFFICULTY.advanced[0]).toBe("hard");
  });
});

describe("QZ7a decimal-moved mismatches", () => {
  it("keep INR commas and 2 decimals on both sides", () => {
    const r = rngFrom(5);
    let seen = 0;
    for (let i = 0; i < 400; i++) {
      const p = makeMatchPairs(r, "advanced", 10).find((x) => x.key.difference === "Decimal point moved in the amount");
      if (!p) continue;
      seen++;
      for (const side of [p.content.left, p.content.right]) expect(side).toMatch(/Rs \d{1,2}(,\d{2})*(,\d{3})?\.\d{2}$|Rs \d{1,3}\.\d{2}$/);
    }
    expect(seen).toBeGreaterThan(10);
  });
  it("moves the digits one place", () => expect(moveDecimal("4,52,075.00")).toBe("45,207.50"));
});
