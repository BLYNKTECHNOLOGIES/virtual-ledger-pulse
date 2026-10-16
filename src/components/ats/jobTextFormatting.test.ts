import { describe, expect, test } from "vitest";
import { continueJobList, formatJobList, pasteJobList } from "./jobTextFormatting";

describe("job list formatting", () => {
  test("automatically bullets the owner's eight blank-line-separated responsibilities", () => {
    const points = [
      "Execute and process buy/sell orders across designated digital asset exchange platforms.",
      "Verify and match payment confirmations against corresponding orders.",
      "Monitor live order queues and action requests within defined response timelines.",
      "Maintain accurate, up-to-date transaction records and shift logs.",
      "Coordinate with Relationship, KYC, and Compliance teams as required.",
      "Identify, flag, and escalate discrepancies or processing errors per SOP.",
      "Complete shift handover documentation at the close of each shift.",
      "Follow all internal compliance, reporting, and data-handling protocols.",
    ];
    expect(pasteJobList("", 0, 0, points.join("\n\n"))?.value).toBe(points.map((point) => `• ${point}`).join("\n"));
  });
  test("preserves existing bullets and numbering, including Windows line endings", () => {
    expect(pasteJobList("", 0, 0, "• Accuracy\r\n\r\n• Speed")?.value).toBe("• Accuracy\n\n• Speed");
    expect(pasteJobList("", 0, 0, "1. Accuracy\n2. Speed")?.value).toBe("1. Accuracy\n2. Speed");
  });
  test("single paragraphs use normal paste and selected content is replaced", () => {
    expect(pasteJobList("", 0, 0, "A single paragraph.\n")).toBeNull();
    expect(pasteJobList("Intro\nOld\nOutro", 6, 9, "Accuracy\nSpeed")?.value).toBe("Intro\n• Accuracy\n• Speed\nOutro");
  });
  test("preserves section headings, open-circle bullets and numbered responsibilities", () => {
    const text = "Key Responsibilities\n\n1. Payment Execution\n\n○ Execute UPI or IMPS payments promptly.\n○ Ensure accuracy in amounts.\n\n2. Timely Response\n\n○ Act on payment requests immediately.";
    expect(pasteJobList("", 0, 0, text)?.value).toBe(text);
  });
  test("preserves prose paragraphs instead of bulleting them", () => {
    const paragraph = "The Junior External Compliance Officer will support the Compliance Department in managing regulatory, documentation, and external coordination activities. This role requires frequent intercity and interstate travel.";
    expect(pasteJobList("", 0, 0, `${paragraph}\n\nThe ideal candidate should be comfortable with travel.`)?.value).toBe(`${paragraph}\n\nThe ideal candidate should be comfortable with travel.`);
  });
  test("preserves indented nested lists", () => {
    const text = "Travel & Field Operations\n\n• Travel regularly.\n  ◦ Visit government offices.\n\nDocumentation & Reporting\n\n• Maintain records.";
    expect(pasteJobList("", 0, 0, text)?.value).toBe(text);
    expect(continueJobList("  ◦ Visit offices.", 18, 18)?.value).toBe("  ◦ Visit offices.\n  ◦ ");
  });
  test("pasting into an empty bullet does not duplicate its marker", () => {
    const edit = pasteJobList("• ", 2, 2, "Accuracy\nSpeed");
    expect(edit).toEqual({ value: "• Accuracy\n• Speed", start: 18, end: 18 });
  });
  test("formats selected lines without changing surrounding paragraphs", () => {
    expect(formatJobList("Intro\nAccuracy\nSpeed\nOutro", 6, 20, false).value).toBe("Intro\n• Accuracy\n• Speed\nOutro");
  });
  test("converts bullets to numbered lines and toggles numbering off", () => {
    const text = "• Accuracy\n• Speed";
    const numbered = formatJobList(text, 0, text.length, true).value;
    expect(numbered).toBe("1. Accuracy\n2. Speed");
    expect(formatJobList(numbered, 0, numbered.length, true).value).toBe("Accuracy\nSpeed");
  });
  test("continues numbered and bulleted lists", () => {
    expect(continueJobList("3. Accuracy", 11, 11)?.value).toBe("3. Accuracy\n4. ");
    expect(continueJobList("• Speed", 7, 7)?.value).toBe("• Speed\n• ");
  });
  test("empty list item exits the list and ordinary text stays unchanged", () => {
    expect(continueJobList("• Speed\n• ", 10, 10)?.value).toBe("• Speed\n");
    expect(continueJobList("Intro", 5, 5)).toBeNull();
  });
  test("selection ending at the next line leaves that line untouched", () => {
    expect(formatJobList("One\nTwo\nThree", 0, 8, false).value).toBe("• One\n• Two\nThree");
  });
});