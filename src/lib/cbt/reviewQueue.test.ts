import { describe, expect, it } from "vitest";
import { isReviewShortcut, pairDifference } from "@/components/hrms/quiz/QuestionReviewQueue";

describe("QZ7b review queue", () => {
  it("highlights exactly the differing part of a match pair", () => {
    expect(pairDifference("Rs 4,52,075.00", "Rs 45,207.50")).toEqual({ start: 4, endL: 12, endR: 10 });
    expect(pairDifference("SBIN0001234", "SBIN0001234")).toBeNull();
  });
  it("shortcuts are ignored while typing or with modifier keys", () => {
    const input = { tagName: "INPUT", isContentEditable: false, getAttribute: () => null, closest: () => null };
    expect(isReviewShortcut({ ctrlKey: false, metaKey: false, altKey: false, target: input as unknown as EventTarget })).toBe(false);
    expect(isReviewShortcut({ ctrlKey: true, metaKey: false, altKey: false, target: null })).toBe(false);
    const body = { tagName: "BODY", isContentEditable: false, getAttribute: () => null, closest: () => null };
    expect(isReviewShortcut({ ctrlKey: false, metaKey: false, altKey: false, target: body as unknown as EventTarget })).toBe(true);
  });
});
