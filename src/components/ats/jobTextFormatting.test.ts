import { describe, expect, test } from "bun:test";
import { continueJobList, formatJobList } from "./jobTextFormatting";

describe("job list formatting", () => {
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