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
import { buildRequirementSlots, requirementFitsJob, slotsToLinks } from "./requirementOptions";

describe("job editor requirement options (WF6)", () => {
  const ops = { department_id: "ops", position_id: "assoc", plan_role_ids: ["assoc"] };
  const pooled = { department_id: "pay", position_id: "pay-assoc", plan_role_ids: ["pay-assoc", "pay-exec"] };
  it("hides a requirement of another department (KYC job is not offered Operations Associate)", () => {
    expect(requirementFitsJob(ops, "kyc", "kyc-assoc")).toBe(false);
  });
  it("hides a requirement of another role in the same department", () => {
    expect(requirementFitsJob(ops, "ops", "ops-exec")).toBe(false);
  });
  it("offers a pooled line's requirement to any of the line's roles", () => {
    expect(requirementFitsJob(pooled, "pay", "pay-exec")).toBe(true);
  });
  it("does not restrict before a department or role is chosen", () => {
    expect(requirementFitsJob(ops, "", "")).toBe(true);
  });
});

describe("per-shift pickers keep the main link (WF6)", () => {
  const raw = (id: string) => ({ m1: { plan_shift_ids: ["m"] }, m2: { plan_shift_ids: ["m"] }, n1: { plan_shift_ids: ["n"] } } as any)[id];
  it("places links on the shift they cover", () => {
    expect(buildRequirementSlots(["m", "n"], "n1", ["m1"], raw)).toEqual({ m: "m1", n: "n1" });
  });
  it("picking for an earlier shift does not swap the main link", () => {
    expect(slotsToLinks({ m: "m1", n: "n1" }, ["m", "n"], "n1")).toEqual({ primary: "n1", extras: ["m1"] });
  });
  it("a linked requirement whose shift was removed is kept as an extra, never dropped", () => {
    expect(buildRequirementSlots(["n"], "m1", ["n1"], raw)).toEqual({ n: "n1", __extra_0: "m1" });
  });
});
