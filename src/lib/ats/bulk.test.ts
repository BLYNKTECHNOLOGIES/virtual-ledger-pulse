// @ts-nocheck — run with `bun run test` (vitest)
import { describe, expect, test, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("./mail", () => ({ MailError: class {}, PLACEHOLDER_RE: /x/, mailErrorMessage: () => "", renderTemplate: () => "", sendCandidateEmail: () => null }));
const { bulkHireShift } = await import("./bulk");

describe("bulk hire shift", () => {
  test("single-shift job uses that shift", () => { expect(bulkHireShift(["m"], [])).toBe("m"); });
  test("multi-shift job uses the one matching preference", () => { expect(bulkHireShift(["m", "n"], ["n", "x"])).toBe("n"); });
  test("multi-shift job without exactly one matching preference is skipped", () => {
    expect(bulkHireShift(["m", "n"], ["m", "n"])).toBeUndefined();
    expect(bulkHireShift(["m", "n"], null)).toBeUndefined();
  });
});
