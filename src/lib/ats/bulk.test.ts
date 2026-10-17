// @ts-nocheck — run with `bun run test` (vitest)
import { describe, expect, test, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("./mail", () => ({ MailError: class {}, PLACEHOLDER_RE: /x/, mailErrorMessage: () => "", renderTemplate: () => "", sendCandidateEmail: () => null }));
const { bulkHireShift } = await import("./bulk");

describe("bulk hire shift", () => {
  test("single-shift job uses that shift", () => { expect(bulkHireShift(["m"], [])).toBe("m"); });
  test("multi-shift job uses the single preference given as an id", () => { expect(bulkHireShift(["m", "n"], ["n"])).toBe("n"); });
  test("multi-shift job maps the preferred shift NAME to the job's shift id (WF6)", () => {
    const names = new Map([["m", "Morning Shift"], ["n", "Night Shift"]]);
    expect(bulkHireShift(["m", "n"], ["night shift"], names)).toBe("n");
  });
  test("a preference outside the job's shifts is not decided in bulk", () => {
    expect(bulkHireShift(["m", "n"], ["Evening Shift"], new Map([["m", "Morning Shift"], ["n", "Night Shift"]]))).toBeUndefined();
  });
  test("multi-shift job without exactly one matching preference is skipped", () => {
    expect(bulkHireShift(["m", "n"], ["m", "n"])).toBeUndefined();
    expect(bulkHireShift(["m", "n"], null)).toBeUndefined();
  });
});
