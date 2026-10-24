import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { mergeMappings, type ParsedPlaceholder, type PlaceholderMapping } from "./docTemplate";
import { parseDocxPlaceholders } from "./docxPlaceholders";
import {
  employmentTypeLabel,
  probationText,
  shiftLabel,
  valuesFromSource,
  type CatalogField,
  type ResolvedValues,
} from "./docResolvers";
import { STANDARD_STRUCTURE_FALLBACK } from "./docCtcBreakdown";
import {
  effectiveAnnualCtc,
  letterSignatoryIds,
  parseFieldInput,
  planLetter,
  signatoryTokenValues,
  type SignatoryRow,
} from "./docLetterPlan";

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

/** The shared dictionary (the parts the offer letter uses). */
const CATALOG: CatalogField[] = [
  field({ field_key: "employee_name", label: "Employee Name", resolver_id: "employee.full_name", aliases: ["candidate_name"] }),
  field({ field_key: "employee_email", label: "Email", resolver_id: "employee.email", aliases: ["candidate_email"] }),
  field({ field_key: "employee_phone", label: "Mobile", resolver_id: "employee.phone", aliases: ["candidate_mobile"] }),
  field({ field_key: "designation", label: "Designation", resolver_id: "employment.designation" }),
  field({ field_key: "department", label: "Department", resolver_id: "employment.department" }),
  field({ field_key: "date_of_joining", label: "Date of Joining", data_type: "date", formatter: "DD MMM YYYY", resolver_id: "employment.date_of_joining" }),
  field({ field_key: "employment_type", label: "Employment Type", resolver_id: "employment.employment_type" }),
  field({ field_key: "work_location", label: "Work Location", resolver_id: "employment.work_location", default_value: "Bhopal, Madhya Pradesh" }),
  field({ field_key: "shift", label: "Shift", resolver_id: "employment.shift" }),
  field({ field_key: "annual_ctc", label: "Annual CTC", field_group: "salary", data_type: "currency", formatter: "INR", resolver_id: "salary.annual_ctc", aliases: ["ctc"] }),
  field({ field_key: "monthly_ctc", label: "Monthly CTC", field_group: "salary", data_type: "currency", formatter: "INR", resolver_id: "salary.monthly_ctc" }),
  field({ field_key: "annual_ctc_in_words", label: "CTC in words", field_group: "salary", formatter: "indian_words_plain", resolver_id: "derived.annual_ctc_words" }),
  ...["basic", "hra", "special_allowance", "lta"].flatMap((stem) => [
    field({ field_key: `${stem}_monthly`, field_group: "salary", data_type: "currency", resolver_id: `salary.${stem}_monthly` }),
    field({ field_key: `${stem}_annual`, field_group: "salary", data_type: "currency", resolver_id: `salary.${stem}_annual` }),
  ]),
  field({ field_key: "probation_period", label: "Probation Period", field_group: "terms", resolver_id: "terms.probation_period" }),
  field({ field_key: "probation_extension", label: "Probation Extension", field_group: "terms" }),
  field({ field_key: "notice_period_probation", label: "Notice (probation)", field_group: "terms", resolver_id: "terms.notice_period_probation" }),
  field({ field_key: "notice_period_confirmed", label: "Notice (confirmed)", field_group: "terms", resolver_id: "terms.notice_period_confirmed" }),
  field({ field_key: "sign", field_group: "signatory", data_type: "signature", resolver_id: "signatory.signature", aliases: ["signature"] }),
  field({ field_key: "signatory_name", label: "Signatory Name", field_group: "signatory", resolver_id: "signatory.name" }),
  field({ field_key: "signatory_designation", label: "Signatory Designation", field_group: "signatory", resolver_id: "signatory.designation" }),
  field({ field_key: "letter_date", label: "Letter Date", field_group: "system", data_type: "date", formatter: "DD MMM YYYY", resolver_id: "system.today", aliases: ["offer_date"] }),
  field({ field_key: "reference_no", label: "Reference", field_group: "system", resolver_id: "system.reference_no", aliases: ["offer_ref_no"] }),
];

const OFFER_TOKENS = [
  "OFFER_REF_NO", "OFFER_DATE", "CANDIDATE_NAME", "CANDIDATE_EMAIL", "CANDIDATE_MOBILE", "DESIGNATION",
  "DATE_OF_JOINING", "DEPARTMENT", "EMPLOYMENT_TYPE", "WORK_LOCATION", "SHIFT", "MONTHLY_CTC",
  "PROBATION_PERIOD", "NOTICE_PERIOD_PROBATION", "NOTICE_PERIOD_CONFIRMED", "ANNUAL_CTC", "ANNUAL_CTC_IN_WORDS",
  "PROBATION_EXTENSION", "SIGNATORY_NAME", "SIGNATORY_DESIGNATION", "BASIC_MONTHLY", "BASIC_ANNUAL",
  "HRA_MONTHLY", "HRA_ANNUAL", "SPECIAL_ALLOWANCE_MONTHLY", "SPECIAL_ALLOWANCE_ANNUAL", "LTA_MONTHLY", "LTA_ANNUAL",
];

const offerMappings = (): PlaceholderMapping[] =>
  mergeMappings(parseDocxPlaceholders(OFFER_TOKENS.map((t) => `{{${t}}}`).join(" ")) as ParsedPlaceholder[], [], CATALOG);

/** A fictional candidate as the resolver returns them. */
function candidate(over: Record<string, unknown> = {}, annualCtc: number | null = 163200): ResolvedValues {
  const doj = "2026-11-02";
  const source: Record<string, unknown> = {
    "employee.full_name": "Aarav Sample",
    "employee.email": "aarav@example.invalid",
    "employee.phone": "9000000000",
    "employment.designation": "Customer Support Executive",
    "employment.department": "Operations",
    "employment.date_of_joining": doj,
    "employment.employment_type": employmentTypeLabel("permanent"),
    "employment.work_location": "",
    "employment.shift": shiftLabel({ name: "Morning Shift", start_time: "09:00:00", end_time: "17:00:00" }),
    "terms.probation_period": probationText(doj, null, 90),
    "terms.notice_period_probation": "15 days",
    "terms.notice_period_confirmed": "30 days",
    "system.today": "2026-10-24",
    "system.reference_no": "",
    ...over,
  };
  const { values, missing } = valuesFromSource(source, CATALOG);
  return {
    values, missing, employeeName: "Aarav Sample", subject: "candidate", employeeId: null, onboardingId: "onb-1",
    email: "aarav@example.invalid", annualCtc, structure: STANDARD_STRUCTURE_FALLBACK, notes: [], salaryNotes: [],
  };
}

const signer = (over: Partial<SignatoryRow> = {}): SignatoryRow => ({ id: "s1", display_name: "A. Signatory", designation: "", ...over });

const plan = (over: Partial<Parameters<typeof planLetter>[0]> = {}) =>
  planLetter({
    mappings: offerMappings(),
    catalog: CATALOG,
    signatories: [signer()],
    resolved: candidate(),
    overrides: {},
    rawOverrides: {},
    isDocx: true,
    ...over,
  });

describe("letter plan — offer letter for a candidate", () => {
  it("fills everything from the records and asks only what they cannot give", () => {
    const p = plan();
    expect(p.promptFields.map((f) => f.field_key).sort()).toEqual(["probation_extension", "signatory_designation"]);
    expect(p.docxValues.candidate_name).toBe("Aarav Sample");
    expect(p.docxValues.annual_ctc).toBe("INR 1,63,200");
    expect(p.docxValues.monthly_ctc).toBe("INR 13,600");
    expect(p.docxValues.work_location).toBe("Bhopal, Madhya Pradesh");
    expect(p.docxValues.signatory_name).toBe("A. Signatory");
    expect(p.unresolvedTokens.sort()).toEqual(["probation_extension", "signatory_designation"]);
    expect(p.stillToFill).toBe(2);
  });

  it("keeps a prompt on screen while HR types and clears the block once filled", () => {
    const p = plan({ overrides: { probation_extension: "3 months", signatory_designation: "HR Manager" } });
    expect(p.promptFields.map((f) => f.field_key).sort()).toEqual(["probation_extension", "signatory_designation"]);
    expect(p.stillToFill).toBe(0);
    expect(p.unresolvedTokens).toEqual([]);
    expect(p.docxValues.signatory_designation).toBe("HR Manager");
  });

  it("asks for the annual CTC once when the record has none — never each salary figure", () => {
    const p = plan({ resolved: candidate({}, null) });
    const keys = p.promptFields.map((f) => f.field_key);
    expect(keys).toContain("annual_ctc");
    expect(keys.filter((k) => /_(monthly|annual)$|monthly_ctc|in_words/.test(k))).toEqual([]);
    const typed = plan({ resolved: candidate({}, null), rawOverrides: { annual_ctc: "4,80,000" }, overrides: { annual_ctc: "INR 4,80,000" } });
    expect(typed.docxValues.monthly_ctc).toBe("INR 40,000");
    expect(typed.docxValues.basic_monthly).toBe("20,000");
    expect(typed.promptFields.map((f) => f.field_key)).toContain("annual_ctc");
  });

  it("does not ask twice for details the calling screen collects itself", () => {
    const p = plan({
      resolved: candidate({ "employment.designation": "", "employment.shift": "" }),
      exclude: new Set(["designation", "shift", "probation_period"]),
    });
    const keys = p.promptFields.map((f) => f.field_key);
    expect(keys).not.toContain("designation");
    expect(keys).not.toContain("shift");
    // Excluded keys still block issuing until the screen fills them.
    expect(p.unresolvedTokens).toContain("designation");
    expect(p.editableFields.map((f) => f.field_key)).not.toContain("probation_period");
  });

  it("lists the resolved terms HR may adjust", () => {
    expect(plan().editableFields.map((f) => f.field_key).sort()).toEqual(
      ["letter_date", "notice_period_confirmed", "notice_period_probation", "probation_period", "work_location"],
    );
  });

  it("uses the signer's designation when it is set and asks HR to choose among several", () => {
    expect(plan({ signatories: [signer({ designation: "HR Manager" })] }).promptFields.map((f) => f.field_key)).toEqual(["probation_extension"]);
    const two = plan({ signatories: [signer(), signer({ id: "s2", display_name: "B. Signer" })] });
    expect(two.needsSignerChoice).toBe(true);
    expect(two.notes).toContain("Choose who signs this letter.");
    const chosen = plan({ signatories: [signer(), signer({ id: "s2", display_name: "B. Signer" })], signerId: "s2" });
    expect(chosen.docxValues.signatory_name).toBe("B. Signer");
    expect(letterSignatoryIds(chosen, offerMappings())).toEqual(["s2"]);
  });

  it("follows a signature image bound to a signatory", () => {
    const mappings: PlaceholderMapping[] = [
      { token: "sign", field_key: "sign", kind: "signature", signatory_id: "s2" },
      { token: "signatory_name", field_key: "signatory_name" },
    ];
    const p = planLetter({
      mappings, catalog: CATALOG, signatories: [signer(), signer({ id: "s2", display_name: "B. Signer" })],
      signerId: "s1", resolved: candidate(), overrides: {}, rawOverrides: {}, isDocx: true,
    });
    expect(p.fixedSignatoryId).toBe("s2");
    expect(p.docxValues.signatory_name).toBe("B. Signer");
    expect(p.imageTokens.has("sign")).toBe(true);
    expect(signatoryTokenValues(mappings, [signer({ designation: "" })], signer())).toEqual({ signatory_name: "A. Signatory" });
  });
});

describe("letter plan — native lane", () => {
  it("keeps an unmapped token's prompt while HR types into it", () => {
    const html = "<p>Dear {employee_name}, your team lead is {team_lead}.</p>";
    const mappings: PlaceholderMapping[] = [{ token: "employee_name", field_key: "employee_name" }];
    const base = { mappings, catalog: CATALOG, signatories: [], resolved: candidate(), isDocx: false, native: { html, images: {} } };
    const empty = planLetter({ ...base, overrides: {}, rawOverrides: {} });
    expect(empty.promptFields.map((f) => f.field_key)).toEqual(["team_lead"]);
    expect(empty.unresolvedTokens).toEqual(["team_lead"]);
    const typed = planLetter({ ...base, overrides: { team_lead: "R. Lead" }, rawOverrides: { team_lead: "R. Lead" } });
    expect(typed.promptFields.map((f) => f.field_key)).toEqual(["team_lead"]);
    expect(typed.unresolvedTokens).toEqual([]);
    expect(typed.rendered?.html).toContain("R. Lead");
  });
});

describe("letter inputs", () => {
  const ctc = CATALOG.find((f) => f.field_key === "annual_ctc")!;
  it("reads amounts exactly or refuses them", () => {
    expect(parseFieldInput(ctc, "Rs. 1,63,200")).toEqual({ printable: "INR 1,63,200", error: "" });
    expect(parseFieldInput(ctc, "1.6 lakh").error).toMatch(/Enter the amount/);
    expect(parseFieldInput(ctc, "13600").error).toBe("");
    expect(parseFieldInput(ctc, "900").error).toMatch(/too small/);
    expect(parseFieldInput(ctc, "  ")).toEqual({ printable: "", error: "" });
  });
  it("prefers a typed CTC over the record only when it is a real annual figure", () => {
    expect(effectiveAnnualCtc("4,80,000", 163200)).toBe(480000);
    expect(effectiveAnnualCtc("900", 163200)).toBe(163200);
    expect(effectiveAnnualCtc(undefined, null)).toBeNull();
  });
});
