import { describe, it, expect } from "vitest";
import { pickChanged, sameAllocation, sameValue, toAmount } from "./order-edit-changes";

describe("toAmount", () => {
  it("reads numbers, numeric strings and blanks", () => {
    expect(toAmount(62155.25)).toBe(62155.25);
    expect(toAmount("62,155.25")).toBe(62155.25);
    expect(toAmount(" 631.2193 ")).toBe(631.2193);
    expect(toAmount(null)).toBe(0);
    expect(toAmount(undefined)).toBe(0);
    expect(toAmount("")).toBe(0);
    expect(toAmount("abc")).toBe(0);
  });
});

describe("sameValue", () => {
  it("treats null, undefined and empty text as the same id", () => {
    expect(sameValue(null, "")).toBe(true);
    expect(sameValue(undefined, null)).toBe(true);
    expect(sameValue("", undefined)).toBe(true);
    expect(sameValue("wallet-a", "wallet-a")).toBe(true);
    expect(sameValue("wallet-a", "")).toBe(false);
    expect(sameValue(null, "wallet-b")).toBe(false);
    expect(sameValue("wallet-a", "wallet-b")).toBe(false);
  });

  it("compares amounts as numbers", () => {
    expect(sameValue(62783.08, "62783.08")).toBe(true);
    expect(sameValue(0, null)).toBe(true);
    expect(sameValue(62783.08, 62730.574034)).toBe(false);
  });

  it("compares flags as booleans", () => {
    expect(sameValue(false, null)).toBe(true);
    expect(sameValue(true, true)).toBe(true);
    expect(sameValue(true, null)).toBe(false);
  });
});

describe("pickChanged", () => {
  const stored = {
    supplier_name: "Test Seller One",
    contact_number: null,
    description: "Terminal purchase",
    total_amount: 62783.08,
    tds_applied: true,
    wallet_id: "wallet-a",
    assigned_to: null,
  };

  it("returns nothing when the form holds the stored values", () => {
    expect(
      pickChanged(
        { supplier_name: "Test Seller One", contact_number: "", description: "Terminal purchase", total_amount: 62783.08, tds_applied: true, wallet_id: "wallet-a", assigned_to: "" },
        stored,
      ),
    ).toEqual({});
  });

  it("returns only the columns that changed", () => {
    expect(pickChanged({ description: "Edited", total_amount: 62783.08, wallet_id: "wallet-b" }, stored)).toEqual({
      description: "Edited",
      wallet_id: "wallet-b",
    });
  });

  it("keeps a deliberate clear of a stored value", () => {
    expect(pickChanged({ description: "" }, stored)).toEqual({ description: "" });
  });

  it("lists every column when there is no stored row", () => {
    expect(pickChanged({ description: "New" }, null)).toEqual({ description: "New" });
  });
});

describe("sameAllocation", () => {
  it("matches the same rows in any order", () => {
    expect(
      sameAllocation(
        [{ id: "m1", amount: "30000" }, { id: "m2", amount: "23447.03" }],
        [{ id: "m2", amount: 23447.03 }, { id: "m1", amount: 30000 }],
      ),
    ).toBe(true);
  });

  it("sees a changed amount, method or row count", () => {
    const stored = [{ id: "m1", amount: 30000 }, { id: "m2", amount: 23447.03 }];
    expect(sameAllocation([{ id: "m1", amount: "29000" }, { id: "m2", amount: "24447.03" }], stored)).toBe(false);
    expect(sameAllocation([{ id: "m1", amount: "30000" }, { id: "m3", amount: "23447.03" }], stored)).toBe(false);
    expect(sameAllocation([{ id: "m1", amount: "53447.03" }], stored)).toBe(false);
  });
});
