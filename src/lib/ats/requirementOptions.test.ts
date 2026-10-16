import { describe, expect, it } from "vitest";
import { hiddenRequirementOptions } from "./requirementOptions";

const options = [
  { id: "morning", raw: { plan_shift_ids: ["morning"] } },
  { id: "evening", raw: { plan_shift_ids: ["evening"] } },
  { id: "any", raw: { plan_shift_ids: null } },
];
const linked = new Map(options.map((o) => [o.id, "Existing job"]));

describe("hidden linked requirements", () => {
  it("reveals only requirements selectable for the selected shifts", () => {
    expect(hiddenRequirementOptions(options, linked, new Set(), ["morning", "night"]).map((o) => o.id))
      .toEqual(["morning", "any"]);
  });
  it("keeps chosen links out of the hidden list", () => {
    expect(hiddenRequirementOptions(options, linked, new Set(["morning", "any"]), ["morning", "night"]))
      .toEqual([]);
  });
  it("retains the unrestricted single-picker options before shift autofill", () => {
    expect(hiddenRequirementOptions(options, linked, new Set(), []).map((o) => o.id))
      .toEqual(["morning", "evening", "any"]);
  });
});