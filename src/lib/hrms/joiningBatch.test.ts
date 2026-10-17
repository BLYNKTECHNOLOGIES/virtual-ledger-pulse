import { describe, expect, it } from "vitest";
import { isJoiningBatch, joiningDispatchProblem, joiningSendDateIST, nextJoiningBatch } from "./joiningBatch";

describe("owner joining batches", () => {
  it("uses the first across year-end", () => { expect(nextJoiningBatch("2026-12-31")).toBe("2027-01-01"); });
  it("uses the seventh", () => { expect(nextJoiningBatch("2026-11-03")).toBe("2026-11-07"); });
  it("uses the fourteenth", () => { expect(nextJoiningBatch("2026-11-08")).toBe("2026-11-14"); });
  it("uses the twenty-first", () => { expect(nextJoiningBatch("2026-10-17")).toBe("2026-10-21"); });
  it("moves a Sunday first to Monday", () => {
    expect(nextJoiningBatch("2026-10-31")).toBe("2026-11-02");
    expect(isJoiningBatch("2026-11-01")).toBe(false);
    expect(isJoiningBatch("2026-11-02")).toBe(true);
  });
  it("moves Sunday seventh to Monday", () => { expect(nextJoiningBatch("2026-06-02")).toBe("2026-06-08"); });
  it("moves Sunday fourteenth to Monday", () => { expect(nextJoiningBatch("2026-06-09")).toBe("2026-06-15"); });
  it("moves Sunday twenty-first to Monday", () => { expect(nextJoiningBatch("2026-06-16")).toBe("2026-06-22"); });
  it("keeps Saturdays", () => { expect(nextJoiningBatch("2026-11-06")).toBe("2026-11-07"); });
  it("does not choose the same send day", () => {
    expect(nextJoiningBatch("2026-10-21")).toBe("2026-11-02");
    expect(nextJoiningBatch("2026-11-02")).toBe("2026-11-07");
  });
  it("uses IST midnight rather than host time", () => {
    expect(joiningSendDateIST(new Date("2026-10-20T18:29:59Z"))).toBe("2026-10-20");
    expect(joiningSendDateIST(new Date("2026-10-20T18:30:00Z"))).toBe("2026-10-21");
  });
  it("refuses arbitrary reschedule days", () => { expect(isJoiningBatch("2026-11-03")).toBe(false); });
  it("rejects stale offers at first send", () => {
    expect(joiningDispatchProblem("2026-10-21", new Date("2026-10-21T10:00:00Z"))).toBe("The offer joining date must be 2026-11-02. Revise the offer before sending.");
  });
  it("keeps original scheduling on resend", () => {
    expect(joiningDispatchProblem("2026-10-21", new Date("2026-10-21T10:00:00Z"), "2026-10-17")).toBe(null);
  });
  it("rejects impossible dates", () => { expect(() => nextJoiningBatch("2026-02-30")).toThrow("Invalid calendar date"); });
});