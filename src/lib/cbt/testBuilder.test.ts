import { describe, expect, it } from "vitest";
import { newSection, summarise, toPayload } from "@/lib/cbt/testBuilder";

describe("test editor summary", () => {
  it("weights are shown as their share of the total", () => {
    const a = { ...newSection("grammar", []), weight: "30" };
    const b = { ...newSection("typing", []), weight: "10" };
    expect(summarise([a, b]).shares).toEqual([75, 25]);
  });
  it("warns above 60 minutes", () => {
    const s = { ...newSection("objective", []), minutes: "61" };
    expect(summarise([s]).overHour).toBe(true);
    expect(summarise([{ ...s, minutes: "60" }]).overHour).toBe(false);
  });
  it("only data entry and match pairs carry an item source", () => {
    const p = toPayload([newSection("match_pairs", []), newSection("grammar", [])]);
    expect(p[0].item_source).toBe("generated");
    expect(p[1].item_source).toBe("bank");
  });
  it("reordering changes order_index", () => {
    const p = toPayload([newSection("written", []), newSection("typing", [])]);
    expect(p.map((x) => x.section_type)).toEqual(["written", "typing"]);
    expect(p.map((x) => x.order_index)).toEqual([1, 2]);
  });
});
