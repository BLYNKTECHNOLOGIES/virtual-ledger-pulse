import { describe, it, expect } from "vitest";
import { isTaxPassThroughCategory, countsInExpenseStats } from "./operatingExpense";

describe("TDS is not counted as an expense in statistics", () => {
  it("excludes the TDS sub-head", () => {
    expect(countsInExpenseStats({ category: "Finance, Banking & Compliance > TDS" })).toBe(false);
    expect(isTaxPassThroughCategory("TDS")).toBe(true);
  });
  it("keeps other finance expenses", () => {
    expect(countsInExpenseStats({ category: "Finance, Banking & Compliance > GST" })).toBe(true);
    expect(countsInExpenseStats({ category: "Finance, Banking & Compliance > Bank charges" })).toBe(true);
  });
});
