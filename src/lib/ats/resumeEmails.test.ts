// @ts-nocheck — run with `bun run test` (vitest)
import { describe, expect, test } from "vitest";
import { guessFromResume, resumeEmails } from "./importParse";

const E = "test.candidate@gmail.com";

describe("emails in a resume's text", () => {
  test("plain contact line", () => { expect(resumeEmails(`Ravi Kumar Verma\nEmail: ${E} | Mobile: 9876543210`)).toEqual([E]); });
  test("reading order is kept and repeats are dropped", () => {
    expect(resumeEmails(`${E}\nReferences: hr.manager@abccorp.com\n${E}`)).toEqual([E, "hr.manager@abccorp.com"]);
  });
  test("lower case, trailing full stop removed", () => { expect(resumeEmails("Write to Test.Candidate@Gmail.com.")).toEqual([E]); });
  test("line break after the @", () => { expect(resumeEmails("test.candidate@\ngmail.com")).toEqual([E]); });
  test("line break before .com", () => { expect(resumeEmails("test.candidate@gmail\n.com")).toEqual([E]); });
  test("line break after the dot", () => { expect(resumeEmails("test.candidate@gmail.\ncom")).toEqual([E]); });
  test("line break before a country ending", () => {
    expect(resumeEmails("ravi.kumar@yahoo.co\n.in")).toEqual(["ravi.kumar@yahoo.co.in"]);
    expect(resumeEmails("ravi.kumar@yahoo.co.\nin")).toEqual(["ravi.kumar@yahoo.co.in"]);
    expect(resumeEmails("ravi@cse.iitd.ac\n.in")).toEqual(["ravi@cse.iitd.ac.in"]);
  });
  test("a break anywhere inside a big provider's domain", () => {
    expect(resumeEmails("ravi@gmail.co\nm")).toEqual(["ravi@gmail.com"]);
    expect(resumeEmails("test.candidate@gma\nil.com")).toEqual([E]);
    expect(resumeEmails("ravi@rediff\nmail.com")).toEqual(["ravi@rediffmail.com"]);
  });
  test("a word run on after the address is cut off", () => {
    expect(resumeEmails(`Email:${E}Mobile:9876543210`)).toEqual([E]);
    expect(resumeEmails(`${E}.Experience in sales`)).toEqual([E]);
  });
  test("a label glued in front is cut off", () => {
    expect(resumeEmails("Email-ravi@gmail.com")).toEqual(["ravi@gmail.com"]);
    expect(resumeEmails("E-mail-ID-ravi@gmail.com")).toEqual(["ravi@gmail.com"]);
  });
  test("what follows a complete address on the next line is not joined", () => {
    expect(resumeEmails(`Mail me at ${E}.\nExperience: 2 years`)).toEqual([E]);
    expect(resumeEmails(`${E}\n.Net developer`)).toEqual([E]);
    expect(resumeEmails(`${E}\n.net developer`)).toEqual([E]);
    expect(resumeEmails(`${E}.\nworked in sales`)).toEqual([E]);
    expect(resumeEmails(`${E}\nMobile 9876543210`)).toEqual([E]);
  });
  test("country domains with capitals stay whole", () => { expect(resumeEmails("ravi@abc.co.In")).toEqual(["ravi@abc.co.in"]); });
  test("image names and example addresses are not emails", () => {
    expect(resumeEmails("cid:image001.png@01D6A1B2.ABCDEF youremail@example.com")).toEqual([]);
  });
  test("an address written only in a link (added on its own line) is found", () => {
    expect(resumeEmails(`Email\n${E}\n  |  LinkedIn`)).toEqual([E]);
  });
  test("a long run of letters is scanned quickly", () => {
    const t0 = Date.now();
    expect(resumeEmails("a".repeat(20000))).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(200);
  });
});

describe("guessFromResume", () => {
  test("name, email and phone", () => {
    expect(guessFromResume(`Ravi Kumar Verma\nEmail: ${E} | Mobile: +91 98765 43210`, "cv.pdf"))
      .toEqual({ name: "Ravi Kumar Verma", email: E, phone: "+91 98765 43210", nameFrom: "text" });
  });
  test("the candidate's own address comes before a referee's", () => {
    expect(guessFromResume(`Ravi Kumar Verma\nEmail ${E}\nReferences: Mr. A. Sharma, hr.manager@abccorp.com`, "x.pdf").email).toBe(E);
  });
  test("a phone split over two lines is kept on one line", () => {
    expect(guessFromResume("Ravi Kumar Verma\n+91 98765\n43210", "x.pdf").phone).toBe("+91 98765 43210");
  });
  test("headings are not names", () => {
    expect(guessFromResume("BIO DATA\nJob Application\nDear Sir\nRavi Kumar Verma", "x.pdf")).toMatchObject({ name: "Ravi Kumar Verma", nameFrom: "text" });
  });
  test("no name line: the name comes from the file name and says so", () => {
    expect(guessFromResume("", "Ravi_Kumar_Resume.pdf")).toEqual({ name: "Ravi Kumar", email: null, phone: null, nameFrom: "file" });
    expect(guessFromResume("Objective: sales", "Resume.pdf")).toMatchObject({ name: "", nameFrom: null });
  });
});
