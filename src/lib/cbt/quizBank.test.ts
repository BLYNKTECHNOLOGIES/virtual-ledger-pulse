import { describe, expect, it } from "vitest";
import { rowToItem, settingsProblems } from "@/lib/cbt/quizBank";

describe("Excel import rows", () => {
  it("maps an MCQ row's options and lower-cases the correct letter", () => {
    const item = rowToItem({ type: "MCQ", question: "2+2?", option_a: "3", option_b: "4", correct_option: "B" });
    expect(item.type).toBe("mcq");
    expect(item.content).toMatchObject({ options: [{ id: "a", text: "3" }, { id: "b", text: "4" }] });
    expect(item.key).toMatchObject({ correct_option_id: "b" });
  });
  it("defaults numeric tolerance to 0", () => {
    expect(rowToItem({ type: "numeric", question: "x", numeric_answer: "10" }).key).toMatchObject({ numeric_answer: "10", numeric_tolerance: "0" });
  });
});

describe("Quiz settings bounds", () => {
  const ok = { retention_days: 180, max_warnings: 3, heartbeat_seconds: 15, abandon_after_minutes: 20, transition_seconds: 60, deadline_grace_seconds: 5, hr_email: "hr@x.com" };
  it("accepts today's values", () => expect(settingsProblems(ok)).toEqual([]));
  it("refuses retention under 30 days", () => expect(settingsProblems({ ...ok, retention_days: 10 }).length).toBe(1));
  it("refuses a non-https privacy link", () => expect(settingsProblems({ ...ok, privacy_url: "http://x" }).length).toBe(1));
});
