import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  CUSTOM_JOINING,
  detailsFromRecord,
  draftFromDetails,
  joiningDateOf,
  offerChanges,
  offerPrefill,
  onboardingPatch,
  packageNeedsPublish,
  recordChangedSince,
  recordFieldWords,
  sendDetailProblems,
  showsShiftAfterTraining,
  type SendDetails,
} from "./selfServiceSend";
import { CANDIDATE_LETTER_FIELDS, type CatalogField } from "@/lib/docResolvers";
import type { PlaceholderMapping } from "@/lib/docTemplate";

const CHOICES = ["2026-11-02", "2026-11-07", "2026-11-14", "2026-11-21"];
const SHIFTS = [
  { id: "sh-morning", is_training_shift: false },
  { id: "sh-training", is_training_shift: true },
];
const POSITIONS = [{ id: "pos-cse", title: "Customer Support Executive" }];

const record = (over: Record<string, unknown> = {}) => ({
  id: "onb-1",
  first_name: "Aarav",
  last_name: "Sample",
  email: "aarav@example.invalid",
  phone: "9000000000",
  department_id: "dep-ops",
  position_id: "pos-cse",
  job_role: "Customer Support Executive",
  employee_type: "permanent",
  shift_id: "sh-morning",
  post_training_shift_id: null,
  ctc: 163200,
  post_training_ctc: null,
  date_of_joining: "2026-11-02",
  probation_end_date: null,
  hiring_requirement_id: null,
  hiring_requirement_declined: false,
  prejoining: {},
  ...over,
});

const ctx = (over: Partial<Parameters<typeof sendDetailProblems>[1]> = {}) => ({
  mode: "offer" as const, shifts: SHIFTS, today: "2026-10-24", choices: CHOICES, hasTraining: false, ...over,
});

describe("send dialog — details", () => {
  it("prefills from the onboarding record and its joining batch", () => {
    const d = detailsFromRecord(record(), CHOICES);
    expect(d.joining_choice).toBe("2026-11-02");
    expect(d.ctc).toBe("1,63,200");
    expect(sendDetailProblems(d, ctx())).toEqual({});
  });

  it("treats a joining date outside the batches as a custom date and keeps its reason", () => {
    const d = detailsFromRecord(record({ date_of_joining: "2026-11-05", prejoining: { joining_date: "2026-11-05", joining_custom: { reason: "Notice ends on the 4th" } } }), CHOICES);
    expect(d.joining_choice).toBe(CUSTOM_JOINING);
    expect(d.custom_date).toBe("2026-11-05");
    expect(d.custom_reason).toBe("Notice ends on the 4th");
    expect(joiningDateOf(d)).toBe("2026-11-05");
  });

  it("maps legacy employee types and starts empty records on the next batch", () => {
    const d = detailsFromRecord(record({ employee_type: "full_time", date_of_joining: null }), CHOICES);
    expect(d.employee_type).toBe("permanent");
    expect(d.joining_choice).toBe("2026-11-02");
  });

  it("asks only for contact details when no offer is attached", () => {
    const d: SendDetails = { ...detailsFromRecord(record(), CHOICES), position_id: "", ctc: "", email: "not-an-email", phone: "12345" };
    const form = sendDetailProblems(d, ctx({ mode: "form" }));
    expect(Object.keys(form).sort()).toEqual(["email", "phone"]);
    const offer = sendDetailProblems(d, ctx());
    expect(offer.position_id).toBeTruthy();
    expect(offer.ctc).toBeTruthy();
  });

  it("needs the shift after training for a training shift, and a sane CTC", () => {
    const d = { ...detailsFromRecord(record({ shift_id: "sh-training" }), CHOICES), ctc: "13,600" };
    const p = sendDetailProblems(d, ctx());
    expect(p.post_training_shift_id).toBeTruthy();
    expect(p.ctc).toBeUndefined();
    expect(sendDetailProblems({ ...d, ctc: "900" }, ctx()).ctc).toBeTruthy();
    expect(sendDetailProblems({ ...d, ctc: "1.6 lakh" }, ctx()).ctc).toBeTruthy();
  });

  it("checks custom dates and probation against the joining date", () => {
    const base = detailsFromRecord(record(), CHOICES);
    const custom = { ...base, joining_choice: CUSTOM_JOINING, custom_date: "2026-10-24", custom_reason: "x" };
    const p = sendDetailProblems(custom, ctx());
    expect(p.custom_date).toMatch(/after today/);
    expect(p.custom_reason).toBeTruthy();
    expect(sendDetailProblems({ ...base, probation_end_date: "2026-11-01" }, ctx()).probation_end_date).toBeTruthy();
    expect(sendDetailProblems({ ...base, probation_end_date: "2027-01-31" }, ctx()).probation_end_date).toBeUndefined();
  });

  it("requires a different CTC after training when the record has a training period", () => {
    const d = { ...detailsFromRecord(record({ post_training_ctc: 163200 }), CHOICES) };
    expect(sendDetailProblems(d, ctx({ hasTraining: true })).post_training_ctc).toMatch(/differ/);
  });
});

describe("send dialog — what is saved", () => {
  it("writes only the fields that change", () => {
    const d = { ...detailsFromRecord(record(), CHOICES), phone: "9111111111", ctc: "1,80,000" };
    const { patch, requirementCleared } = onboardingPatch(record(), draftFromDetails(d, "offer", POSITIONS, false, false));
    expect(patch).toEqual({ phone: "9111111111", ctc: 180000 });
    expect(requirementCleared).toBe(false);
  });

  it("saves nothing when nothing changed, and only contact fields for a form-only send", () => {
    const d = detailsFromRecord(record(), CHOICES);
    expect(onboardingPatch(record(), draftFromDetails(d, "offer", POSITIONS, false, false)).patch).toEqual({});
    const form = draftFromDetails({ ...d, ctc: "999999", first_name: " Aarav " }, "form", POSITIONS, false, false);
    expect(Object.keys(form).sort()).toEqual(["email", "first_name", "last_name", "phone"]);
    expect(onboardingPatch(record(), form).patch).toEqual({});
  });

  it("clears a hiring requirement link when the designation changes, as Stage 1 does", () => {
    const rec = record({ hiring_requirement_id: "req-1" });
    const d = { ...detailsFromRecord(rec, CHOICES), position_id: "pos-other" };
    const { patch, requirementCleared } = onboardingPatch(rec, draftFromDetails(d, "offer", [...POSITIONS, { id: "pos-other", title: "Team Lead" }], false, false));
    expect(patch.position_id).toBe("pos-other");
    expect(patch.job_role).toBe("Team Lead");
    expect(patch.hiring_requirement_id).toBeNull();
    expect(requirementCleared).toBe(true);
  });

  it("keeps the joining date the details choose", () => {
    const d = { ...detailsFromRecord(record(), CHOICES), joining_choice: "2026-11-14" };
    expect(onboardingPatch(record(), draftFromDetails(d, "offer", POSITIONS, false, false)).patch).toEqual({ date_of_joining: "2026-11-14" });
  });
});

describe("send dialog — offer and package", () => {
  const mappings: PlaceholderMapping[] = [
    { token: "offer_ref_no", field_key: "reference_no" },
    { token: "offer_date", field_key: "letter_date" },
    { token: "candidate_name", field_key: "employee_name" },
    { token: "date_of_joining", field_key: "date_of_joining" },
    { token: "annual_ctc", field_key: "annual_ctc" },
  ];
  const live = {
    id: "off-1", reference_no: "BLYNK/OFFER/2026-27/0001", template_version_id: "v1", pdf_path: "x.pdf", status: "issued",
    values_snapshot: { offer_ref_no: "BLYNK/OFFER/2026-27/0001", offer_date: "20 Oct 2026", candidate_name: "Aarav Sample", date_of_joining: "02 Nov 2026", annual_ctc: "INR 1,63,200" },
  };
  const now = { offer_ref_no: "", offer_date: "24 Oct 2026", candidate_name: "Aarav Sample", date_of_joining: "02 Nov 2026", annual_ctc: "INR 1,63,200" };

  it("reuses the live offer when it prints the same — whatever today's date is", () => {
    expect(offerChanges(live, now, mappings, "v1", {})).toEqual([]);
  });
  it("revises it when a printed value, the template or an explicit letter date changes", () => {
    expect(offerChanges(live, { ...now, annual_ctc: "INR 1,80,000" }, mappings, "v1", {})).toEqual(["annual_ctc"]);
    expect(offerChanges(live, now, mappings, "v2", {})).toEqual(["template"]);
    expect(offerChanges(live, now, mappings, "v1", { letter_date: "24 Oct 2026" })).toEqual(["offer_date"]);
  });
  it("republishes the package only when its offer or date changes", () => {
    const p = { enabled: true, state: "published", offer_file: { issued_id: "off-1" }, joining_date: "2026-11-02" };
    expect(packageNeedsPublish(p, "off-1", "2026-11-02")).toBe(false);
    expect(packageNeedsPublish(p, "off-2", "2026-11-02")).toBe(true);
    expect(packageNeedsPublish(p, "off-1", "2026-11-07")).toBe(true);
    expect(packageNeedsPublish({ ...p, state: "revision_required" }, "off-1", "2026-11-02")).toBe(true);
    expect(packageNeedsPublish({}, "off-1", "2026-11-02")).toBe(true);
  });
});

describe("send dialog — review fixes", () => {
  it("shows the shift after training whenever the offer would print it, and saves what HR picks", () => {
    expect(showsShiftAfterTraining(record(), "sh-morning", SHIFTS)).toBe(false);
    expect(showsShiftAfterTraining(record(), "sh-training", SHIFTS)).toBe(true);
    // A stored shift after training is printed by the offer, so it must be visible and changeable.
    const stale = record({ shift_id: "sh-training", post_training_shift_id: "sh-morning" });
    expect(showsShiftAfterTraining(stale, "sh-evening", [...SHIFTS, { id: "sh-evening", is_training_shift: false }])).toBe(true);
    const d = { ...detailsFromRecord(stale, CHOICES), shift_id: "sh-evening", post_training_shift_id: "" };
    const { patch } = onboardingPatch(stale, draftFromDetails(d, "offer", POSITIONS, false, true));
    expect(patch).toEqual({ shift_id: "sh-evening", post_training_shift_id: null });
  });

  const field = (field_key: string, data_type = "text"): CatalogField => ({
    field_key, label: field_key, field_group: "terms", data_type, formatter: null, resolver_id: null, is_sensitive: false, default_value: null,
  });
  const mappings: PlaceholderMapping[] = [
    { token: "probation_extension", field_key: "probation_extension" },
    { token: "probation_period", field_key: "probation_period" },
    { token: "work_location", field_key: "work_location" },
  ];

  it("starts a resend only from terms HR typed, never from values the records gave", () => {
    const snapshot = { probation_extension: "3 months", probation_period: "90 days", work_location: "Indore", typed_fields: { probation_extension: "3 months", work_location: "Indore" } };
    expect(offerPrefill(snapshot, mappings, [field("probation_extension")], [field("probation_period"), field("work_location"), field("letter_date", "date")]))
      .toEqual({ probation_extension: "3 months", work_location: "Indore" });
    // Offers from before typed terms were kept: prompt answers only.
    const legacy = { probation_extension: "3 months", probation_period: "90 days" };
    expect(offerPrefill(legacy, mappings, [field("probation_extension")], [field("probation_period")])).toEqual({ probation_extension: "3 months" });
  });

  it("treats a different signer, or a changed value typed for an unmapped token, as a change", () => {
    const live = {
      id: "o1", reference_no: "R1", template_version_id: "v1", pdf_path: "x", status: "issued",
      values_snapshot: { probation_extension: "3 months", signed_by: "sig-1", typed_fields: { probation_extension: "3 months", team_lead: "R. Lead" } },
    };
    const now = { probation_extension: "3 months", probation_period: "", work_location: "" };
    const m = [mappings[0]];
    expect(offerChanges(live, now, m, "v1", { probation_extension: "3 months", team_lead: "R. Lead" }, "sig-1")).toEqual([]);
    expect(offerChanges(live, now, m, "v1", { probation_extension: "3 months", team_lead: "R. Lead" }, "sig-2")).toEqual(["signatory"]);
    expect(offerChanges(live, now, m, "v1", { probation_extension: "3 months", team_lead: "S. Lead" }, "sig-1")).toEqual(["team_lead"]);
  });
});

describe("send dialog — changes made elsewhere", () => {
  it("stops only for letter fields someone else changed, read the way the database stores them", () => {
    const loaded = record();
    // Unrelated columns (documents, updated_at) and number formatting never stop a send.
    expect(recordChangedSince(loaded, { ...loaded, ctc: "163200.00", updated_at: "later", documents: { pan: {} } }, CANDIDATE_LETTER_FIELDS)).toEqual([]);
    expect(recordChangedSince(loaded, { ...loaded, ctc: 180000, phone: "9000000001" }, CANDIDATE_LETTER_FIELDS)).toEqual(["phone", "ctc"]);
    expect(recordFieldWords(["position_id", "job_role", "ctc", "post_training_shift_id"])).toEqual(["designation", "CTC", "shift after training"]);
  });

  it("compares native letters by what each token printed", () => {
    const live = {
      id: "o1", reference_no: "R1", template_version_id: "v1", pdf_path: "x", status: "issued",
      values_snapshot: { printed: { annual_ctc: "INR 1,63,200" }, annual_ctc: "163200" },
    };
    const m: PlaceholderMapping[] = [{ token: "annual_ctc", field_key: "annual_ctc" }];
    expect(offerChanges(live, { annual_ctc: "INR 1,63,200" }, m, "v1", {})).toEqual([]);
    expect(offerChanges(live, { annual_ctc: "INR 1,80,000" }, m, "v1", {})).toEqual(["annual_ctc"]);
  });

  it("detects a changed value typed for a token the template prints but never mapped", () => {
    const live = {
      id: "o1", reference_no: "R1", template_version_id: "v1", pdf_path: "x", status: "issued",
      values_snapshot: { typed_fields: { joining_venue: "Indore office" } },
    };
    expect(offerChanges(live, {}, [], "v1", { joining_venue: "Indore office" })).toEqual([]);
    expect(offerChanges(live, {}, [], "v1", { joining_venue: "Bhopal office" })).toEqual(["joining_venue"]);
  });

  it("carries typed dates and amounts, as printed, only for the check that cannot re-type them", () => {
    const f = (field_key: string, data_type: string): CatalogField => ({
      field_key, label: field_key, field_group: "terms", data_type, formatter: null, resolver_id: null, is_sensitive: false, default_value: null,
    });
    const snapshot = { typed_fields: { valid_until: "15 Nov 2026", probation_extension: "3 months", letter_date: "20 Oct 2026" } };
    const fields = [f("valid_until", "date"), f("probation_extension", "text"), f("letter_date", "date")];
    expect(offerPrefill(snapshot, [], fields, [])).toEqual({ probation_extension: "3 months" });
    expect(offerPrefill(snapshot, [], fields, [], { allTypes: true })).toEqual({ valid_until: "15 Nov 2026", probation_extension: "3 months" });
  });
});
