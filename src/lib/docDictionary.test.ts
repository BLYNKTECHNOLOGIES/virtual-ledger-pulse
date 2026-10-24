import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { autoFillMappings, autoMapToken, buildAliasIndex, mergeMappings, type ParsedPlaceholder } from "./docTemplate";
import {
  amountInWords,
  employmentTypeLabel,
  formatValue,
  inrInWords,
  isCtcDerivedResolver,
  probationText,
  salaryValues,
  shiftLabel,
  valuesFromSource,
  type CatalogField,
} from "./docResolvers";
import { STANDARD_STRUCTURE_FALLBACK } from "./docCtcBreakdown";
import { parseDocxPlaceholders } from "./docxPlaceholders";

const field = (f: Partial<CatalogField> & { field_key: string }): CatalogField => ({
  label: f.field_key,
  field_group: "employee",
  data_type: "text",
  formatter: null,
  resolver_id: null,
  is_sensitive: false,
  default_value: null,
  aliases: [],
  ...f,
});

/** The shared dictionary as the migration seeds it (the parts these tests need). */
const CATALOG: CatalogField[] = [
  field({ field_key: "employee_name", resolver_id: "employee.full_name", aliases: ["candidate_name", "full_name", "name"] }),
  field({ field_key: "employee_email", resolver_id: "employee.email", aliases: ["candidate_email", "email"] }),
  field({ field_key: "employee_phone", resolver_id: "employee.phone", aliases: ["candidate_mobile", "candidate_phone", "mobile"] }),
  field({ field_key: "designation", resolver_id: "employment.designation" }),
  field({ field_key: "department", resolver_id: "employment.department" }),
  field({ field_key: "date_of_joining", data_type: "date", formatter: "DD MMM YYYY", resolver_id: "employment.date_of_joining", aliases: ["doj", "joining_date"] }),
  field({ field_key: "employment_type", resolver_id: "employment.employment_type" }),
  field({ field_key: "work_location", resolver_id: "employment.work_location", default_value: "Bhopal, Madhya Pradesh", aliases: ["place_of_posting"] }),
  field({ field_key: "shift", resolver_id: "employment.shift" }),
  field({ field_key: "annual_ctc", field_group: "salary", data_type: "currency", formatter: "INR", resolver_id: "salary.annual_ctc", aliases: ["ctc"] }),
  field({ field_key: "monthly_ctc", field_group: "salary", data_type: "currency", formatter: "INR", resolver_id: "salary.monthly_ctc" }),
  field({ field_key: "annual_ctc_words", field_group: "salary", formatter: "indian_words", resolver_id: "derived.annual_ctc_words" }),
  field({ field_key: "annual_ctc_in_words", field_group: "salary", formatter: "indian_words_plain", resolver_id: "derived.annual_ctc_words" }),
  ...["basic", "hra", "special_allowance", "lta", "da"].flatMap((stem) => [
    field({ field_key: `${stem}_monthly`, field_group: "salary", data_type: "currency", resolver_id: `salary.${stem}_monthly` }),
    field({ field_key: `${stem}_annual`, field_group: "salary", data_type: "currency", resolver_id: `salary.${stem}_annual` }),
  ]),
  field({ field_key: "probation_period", field_group: "terms", resolver_id: "terms.probation_period", aliases: ["probation"] }),
  field({ field_key: "probation_extension", field_group: "terms" }),
  field({ field_key: "notice_period_probation", field_group: "terms", resolver_id: "terms.notice_period_probation" }),
  field({ field_key: "notice_period_confirmed", field_group: "terms", resolver_id: "terms.notice_period_confirmed" }),
  field({ field_key: "sign", field_group: "signatory", data_type: "signature", resolver_id: "signatory.signature", aliases: ["signature"] }),
  field({ field_key: "signatory_name", field_group: "signatory", resolver_id: "signatory.name", aliases: ["hr_name"] }),
  field({ field_key: "signatory_designation", field_group: "signatory", resolver_id: "signatory.designation" }),
  field({ field_key: "letter_date", field_group: "system", data_type: "date", formatter: "DD MMM YYYY", resolver_id: "system.today", aliases: ["offer_date", "date", "issue_date"] }),
  field({ field_key: "reference_no", field_group: "system", resolver_id: "system.reference_no", aliases: ["ref_no", "offer_ref_no", "reference_number"] }),
];

/** Every variable in the Blynk offer letter template, as written in Word. */
const OFFER_TEMPLATE_TOKENS = [
  "OFFER_REF_NO", "OFFER_DATE", "CANDIDATE_NAME", "CANDIDATE_EMAIL", "CANDIDATE_MOBILE", "DESIGNATION",
  "DATE_OF_JOINING", "DEPARTMENT", "EMPLOYMENT_TYPE", "WORK_LOCATION", "SHIFT", "MONTHLY_CTC",
  "PROBATION_PERIOD", "NOTICE_PERIOD_PROBATION", "NOTICE_PERIOD_CONFIRMED", "ANNUAL_CTC", "ANNUAL_CTC_IN_WORDS",
  "PROBATION_EXTENSION", "SIGNATORY_NAME", "SIGNATORY_DESIGNATION", "BASIC_MONTHLY", "BASIC_ANNUAL",
  "HRA_MONTHLY", "HRA_ANNUAL", "SPECIAL_ALLOWANCE_MONTHLY", "SPECIAL_ALLOWANCE_ANNUAL", "LTA_MONTHLY", "LTA_ANNUAL",
];

describe("shared variable dictionary — auto-mapping", () => {
  const index = buildAliasIndex(CATALOG);

  it("maps every variable of the offer letter template with no manual mapping", () => {
    const placeholders = parseDocxPlaceholders(OFFER_TEMPLATE_TOKENS.map((t) => `{{${t}}}`).join(" "));
    const mappings = mergeMappings(placeholders as ParsedPlaceholder[], [], CATALOG);
    const unmapped = mappings.filter((m) => !m.field_key).map((m) => m.token);
    expect(unmapped).toEqual([]);
    const byToken = Object.fromEntries(mappings.map((m) => [m.token, m.field_key]));
    expect(byToken.candidate_name).toBe("employee_name");
    expect(byToken.candidate_mobile).toBe("employee_phone");
    expect(byToken.offer_ref_no).toBe("reference_no");
    expect(byToken.offer_date).toBe("letter_date");
    expect(byToken.annual_ctc_in_words).toBe("annual_ctc_in_words");
  });

  it("resolves the same variable from either spelling", () => {
    expect(autoMapToken("EMPLOYEE_NAME", index)).toBe("employee_name");
    expect(autoMapToken("Candidate Name", index)).toBe("employee_name");
    expect(autoMapToken("hr_name", index)).toBe("signatory_name");
    expect(autoMapToken("ref_no", index)).toBe("reference_no");
  });

  it("maps numbered instances to their base variable", () => {
    expect(autoMapToken("sign2", index)).toBe("sign");
    expect(mergeMappings([{ raw: "%SIGN", token: "sign", base: "sign", instance: null, count: 1 }], [], CATALOG)[0])
      .toMatchObject({ field_key: "sign", kind: "signature" });
  });

  it("leaves unknown variables unmapped", () => {
    expect(autoMapToken("joining_bonus", index)).toBeNull();
  });

  it("never lets an alias override another field's own key", () => {
    const idx = buildAliasIndex([
      { field_key: "email" },
      { field_key: "employee_email", aliases: ["email"] },
    ]);
    expect(autoMapToken("email", idx)).toBe("email");
  });

  it("never overwrites a mapping HR chose", () => {
    const merged = mergeMappings(
      [{ raw: "CANDIDATE_NAME", token: "candidate_name", base: "candidate_name", instance: null, count: 1 }],
      [{ token: "candidate_name", field_key: "employee_first_name", kind: "text", signatory_id: null }],
      CATALOG,
    );
    expect(merged[0].field_key).toBe("employee_first_name");
  });

  it("works without a dictionary (old behaviour)", () => {
    expect(mergeMappings([{ raw: "X", token: "x", base: "x", instance: null, count: 1 }], [])[0].field_key).toBeNull();
  });

  it("fills only empty mappings when the dictionary arrives — never drops or changes one", () => {
    const saved = [
      { token: "candidate_name", field_key: null, signatory_id: null },
      { token: "sign", field_key: "sign", kind: "signature" as const, signatory_id: "sig-1" },
      { token: "joining_bonus", field_key: null, signatory_id: null },
    ];
    const out = autoFillMappings(saved, CATALOG);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ token: "candidate_name", field_key: "employee_name", kind: "text" });
    expect(out[1]).toBe(saved[1]);
    expect(out[2].field_key).toBeNull();
    // Nothing to fill → the very same array (no re-render churn).
    expect(autoFillMappings(out, CATALOG)).toBe(out);
    expect(autoFillMappings([], CATALOG)).toEqual([]);
  });
});

describe("letter formatting", () => {
  it("prints INR amounts with the currency and component amounts bare", () => {
    expect(formatValue(163200, "currency", "INR")).toBe("INR 1,63,200");
    expect(formatValue("1,63,200", "currency", "INR")).toBe("INR 1,63,200");
    expect(formatValue(6800, "currency", null)).toBe("6,800");
    expect(formatValue(0, "currency", null)).toBe("0");
    expect(formatValue("", "currency", "INR")).toBe("");
  });

  it("writes the CTC in words with and without the currency", () => {
    expect(formatValue(163200, "text", "indian_words_plain")).toBe("One Lakh Sixty Three Thousand Two Hundred");
    expect(formatValue(163200, "text", "indian_words")).toBe("One Lakh Sixty Three Thousand Two Hundred Rupees Only");
    expect(inrInWords(0)).toBe("Zero Rupees Only");
    expect(amountInWords(12500000)).toBe("One Crore Twenty Five Lakh");
    expect(amountInWords(1500000000)).toBe("One Hundred Fifty Crore");
  });

  it("states probation by the HRMS rule: the person's end date, else the policy's 90 days", () => {
    // No end date on the record → the HR probation policy.
    expect(probationText("2026-11-02", null, 90)).toBe("90 days");
    expect(probationText(null, null, 90)).toBe("90 days");
    expect(probationText(null, null, null)).toBe("");
    // An end date of joining + 90 days reads as 90 days, even where it lands on a month boundary.
    expect(probationText("2026-11-02", "2027-01-31", 90)).toBe("90 days");
    expect(probationText("2027-02-01", "2027-05-02", 90)).toBe("90 days");
    // HR set a different end date on the record → the letter follows it.
    expect(probationText("2026-11-02", "2027-02-02", 90)).toBe("3 months");
    expect(probationText("2026-11-02", "2027-02-01", 90)).toBe("3 months");
    expect(probationText("2026-11-02", "2027-03-02", 90)).toBe("4 months");
    expect(probationText("2026-11-02", "2026-12-17", 90)).toBe("45 days");
  });

  it("words the employee type for a letter", () => {
    expect(employmentTypeLabel("permanent")).toBe("Full-time, permanent");
    expect(employmentTypeLabel("full_time")).toBe("Full-time, permanent");
    expect(employmentTypeLabel("intern")).toBe("Internship");
    expect(employmentTypeLabel("contract")).toBe("Contract");
    expect(employmentTypeLabel("")).toBe("");
    expect(employmentTypeLabel("on_call")).toBe("On call");
  });

  it("prints a shift with its hours", () => {
    expect(shiftLabel({ name: "Morning Shift", start_time: "09:00:00", end_time: "17:00:00" })).toBe("Morning Shift (09:00 to 17:00)");
    expect(shiftLabel({ name: "Rotational" })).toBe("Rotational");
    expect(shiftLabel(null)).toBe("");
  });
});

describe("dictionary values", () => {
  it("fills defaults and reports what is still missing", () => {
    const { values, missing } = valuesFromSource({ "employee.full_name": "A Candidate", "employment.work_location": "" }, CATALOG);
    expect(values.employee_name).toBe("A Candidate");
    expect(values.work_location).toBe("Bhopal, Madhya Pradesh");
    expect(missing).toContain("probation_extension");
    expect(missing).not.toContain("work_location");
    // Signatory fields come from the signatory registry, never the resolver.
    expect(values).not.toHaveProperty("signatory_name");
  });

  it("re-derives every salary variable from an annual CTC", () => {
    const v = salaryValues(163200, STANDARD_STRUCTURE_FALLBACK, CATALOG);
    expect(v.annual_ctc).toBe("INR 1,63,200");
    expect(v.monthly_ctc).toBe("INR 13,600");
    expect(v.annual_ctc_in_words).toBe("One Lakh Sixty Three Thousand Two Hundred");
    expect(v.basic_monthly).toBe("6,800");
    expect(v.special_allowance_annual).toBe("24,480");
    expect(v.lta_annual).toBe("16,320");
  });

  it("knows which variables follow from the CTC", () => {
    expect(isCtcDerivedResolver("salary.monthly_ctc")).toBe(true);
    expect(isCtcDerivedResolver("salary.basic_monthly")).toBe(true);
    expect(isCtcDerivedResolver("derived.annual_ctc_words")).toBe(true);
    expect(isCtcDerivedResolver("salary.annual_ctc")).toBe(false);
    expect(isCtcDerivedResolver("employee.full_name")).toBe(false);
    expect(isCtcDerivedResolver(null)).toBe(false);
  });
});
