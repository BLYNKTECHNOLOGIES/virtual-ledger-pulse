// @ts-nocheck — run with `bun test src/lib/ats/nextStep.test.ts`
import { describe, expect, test } from "bun:test";
import { nextSteps, ADDRESS_RE, type NextStepCtx } from "./nextStep";

const t1 = { start: "2026-10-15T05:30:00.000Z", label: "Thu 15 Oct, 11:00 AM", dateOnly: false, text: "thursday 11 am" };
const t2 = { start: "2026-10-16T08:30:00.000Z", label: "Fri 16 Oct, 2:00 PM", dateOnly: false, text: "friday 2 pm" };
const base: NextStepCtx = { intent: "other", hasUpcoming: false, upcomingAccepted: false, times: [], appOpen: true, canUseResume: false, mentionsAddress: false };
const labels = (c: Partial<NextStepCtx>) => nextSteps({ ...base, ...c }).map((s) => s.label);

describe("NextStepBar buttons per intent", () => {
  test("confirm with an upcoming, not-yet-accepted interview", () =>
    expect(labels({ intent: "confirm", hasUpcoming: true })).toEqual(["Mark interview confirmed", "Reply: see you then"]));
  test("confirm otherwise", () => {
    expect(labels({ intent: "confirm" })).toEqual(["Reply", "No reply needed"]);
    expect(labels({ intent: "confirm", hasUpcoming: true, upcomingAccepted: true })).toEqual(["Reply", "No reply needed"]);
  });
  test("reschedule with an upcoming interview prefills the first time", () => {
    const s = nextSteps({ ...base, intent: "reschedule", hasUpcoming: true, times: [t1] });
    expect(s.map((x) => x.label)).toEqual(["Change interview time", "Ask for times"]);
    expect(s[0].time?.start).toBe(t1.start);
  });
  test("reschedule without an interview", () => expect(labels({ intent: "reschedule" })).toEqual(["Schedule interview", "Ask for times"]));
  test("availability with times: one button each, max 3, then Other time", () =>
    expect(labels({ intent: "availability", times: [t1, t2] })).toEqual(["Schedule Thu 15 Oct, 11:00 AM", "Schedule Fri 16 Oct, 2:00 PM", "Other time"]));
  test("withdraw on an open application", () => expect(labels({ intent: "withdraw" })).toEqual(["Mark as withdrawn", "Reply"]));
  test("withdraw on a closed application has no withdraw button", () => expect(labels({ intent: "withdraw", appOpen: false })).not.toContain("Mark as withdrawn"));
  test("documents with a usable resume", () => expect(labels({ intent: "documents", canUseResume: true })).toEqual(["Use as resume", "Documents received"]));
  test("documents without a usable resume", () => expect(labels({ intent: "documents" })).toEqual(["Documents received"]));
  test("question mentioning the address", () => expect(labels({ intent: "question", mentionsAddress: true })).toEqual(["Reply", "Send office address", "No reply needed"]));
  test("question otherwise", () => expect(labels({ intent: "question" })).toEqual(["Reply", "No reply needed"]));
  test("thanks / other / auto_reply", () => {
    for (const i of ["thanks", "other", "auto_reply"]) expect(labels({ intent: i })).toEqual(["Reply", "No reply needed"]);
  });
  test("address detection", () => {
    for (const s of ["What is the office address?", "office kahan hai", "पता भेजिए", "share google map"]) expect(ADDRESS_RE.test(s)).toBe(true);
    expect(ADDRESS_RE.test("I will come tomorrow")).toBe(false);
    for (const s of ["office ka pata bhejiye", "How do I reach the office?", "Where is your office", "कहाँ आना है", "Please share the directions"]) expect(ADDRESS_RE.test(s)).toBe(true);
    expect(ADDRESS_RE.test("Thank you")).toBe(false);
  });
});
