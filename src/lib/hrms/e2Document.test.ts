import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { E2_CANDIDATE_FIELDS, E2_OFFER_FIELDS, e2Date, e2Problems, e2Values } from "./e2Document";

const pkg = {
  offer_reference: "BLYNK/OFFER/2026-27/0001",
  role_title: "Customer Support Executive",
  department: "Operations",
  joining_date: "2026-11-02",
  company_name: "Blynk Virtual Technologies Private Limited",
  letterhead_url: "https://example.invalid/letterhead.png",
};
const form = {
  first_name: "Aarav", last_name: "Sample", date_of_birth: "1998-04-12", phone: "90000 00000", email: "aarav@example.invalid",
  address: "1 Sample Street", city: "Bhopal", state: "Madhya Pradesh", zip: "462001", country: "India",
  pan_number: "abcde1234f", aadhaar_number: "123412341234",
  e2_disclosures: { criminal: "None", bank: "None", platforms: "None", relationships: "None" },
};

describe("E2 declaration", () => {
  it("uses the shared dictionary's variable names", () => {
    const keys = [...E2_OFFER_FIELDS, ...E2_CANDIDATE_FIELDS].map((f) => f.key);
    expect(keys).toEqual([
      "reference_no", "designation", "department", "date_of_joining", "company_legal_name",
      "employee_name", "employee_date_of_birth", "employee_phone", "employee_email", "employee_address", "employee_pan",
    ]);
  });

  it("fills offer facts from the package and candidate facts from the form", () => {
    const v = e2Values(form, pkg);
    expect(v.reference_no).toBe("BLYNK/OFFER/2026-27/0001");
    expect(v.date_of_joining).toBe("02 Nov 2026");
    expect(v.employee_date_of_birth).toBe("12 Apr 1998");
    expect(v.employee_address).toBe("1 Sample Street, Bhopal, Madhya Pradesh, 462001, India");
    expect(v.employee_pan).toBe("ABCDE1234F");
    expect(Object.values(v).join(" ")).not.toContain("123412341234");
    expect(e2Problems(form, pkg)).toEqual([]);
  });

  it("says what to fill before E2 can be prepared", () => {
    const problems = e2Problems({ ...form, date_of_birth: "", pan_number: "ABC", zip: "46", e2_disclosures: { criminal: "None" } }, pkg);
    expect(problems).toEqual([
      "Enter your date of birth",
      "Enter your full address with city, state and 6-digit PIN code",
      "Enter your PAN in the format ABCDE1234F",
      "Complete all four disclosures, writing None where applicable",
    ]);
    expect(e2Problems(form, { ...pkg, offer_reference: "" })[0]).toMatch(/offer or company letterhead is unavailable/);
    expect(e2Problems(form, { ...pkg, department: "" })).toEqual([]);
  });
});

describe("E2 dates", () => {
  it("prints the same calendar day in every time zone", () => {
    const before = process.env.TZ;
    try {
      for (const tz of ["Asia/Kolkata", "America/New_York", "Pacific/Honolulu", "UTC"]) {
        process.env.TZ = tz;
        // West of UTC a UTC-midnight reading would fall on the previous day.
        if (tz === "America/New_York") expect(new Date("2026-11-02").getDate()).toBe(1);
        expect(e2Date("2026-11-02")).toBe("02 Nov 2026");
        expect(e2Values(form, pkg).employee_date_of_birth).toBe("12 Apr 1998");
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
    expect(e2Date("2026-13-02")).toBe("");
    expect(e2Date("2026-02-31")).toBe("");
    expect(e2Date("2026-02-29")).toBe("");
    expect(e2Date("2028-02-29")).toBe("29 Feb 2028");
    expect(e2Date("2026-04-31")).toBe("");
    expect(e2Date("2026-00-10")).toBe("");
    expect(e2Date("")).toBe("");
  });
});
