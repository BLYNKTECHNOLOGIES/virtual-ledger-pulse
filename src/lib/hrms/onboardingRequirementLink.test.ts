import { describe, expect, test } from "vitest";
import { designationCleared, requirementLinkCleared } from "./onboardingRequirementLink";

const existing = { hiring_requirement_id: "req-4", department_id: "ops", position_id: "oa" };
describe("onboarding requirement link", () => {
  test("choosing None clears the stored link", () => {
    expect(requirementLinkCleared(existing, { ...existing, hiring_requirement_id: "", hiring_requirement_declined: true })).toBe(true);
  });
  test("changing the position clears the stored link", () => {
    expect(requirementLinkCleared(existing, { ...existing, position_id: "kyc", hiring_requirement_id: "" })).toBe(true);
  });
  test("moving to another department with no designation clears the stored one", () => {
    expect(designationCleared(existing, { ...existing, department_id: "cmp", position_id: "", job_role: "" })).toBe(true);
  });
  test("a partial save with a blank designation in the same department keeps it", () => {
    expect(designationCleared(existing, { position_id: "" })).toBe(false);
    expect(designationCleared(existing, { ...existing, position_id: "" })).toBe(false);
    expect(designationCleared(existing, { ...existing, department_id: "cmp", position_id: "kyc" })).toBe(false);
    // A form that hasn't loaded yet sends blanks for both: nothing is cleared.
    expect(designationCleared(existing, { department_id: "", position_id: "", job_role: "" })).toBe(false);
  });
  test("a partial save with a blank link and the same role keeps it", () => {
    expect(requirementLinkCleared(existing, { hiring_requirement_id: "" })).toBe(false);
    expect(requirementLinkCleared(existing, { ...existing, hiring_requirement_id: "", hiring_requirement_declined: false })).toBe(false);
  });
});
