import { describe, it, expect } from "vitest";
import { checkSubmission, effectiveForm, DEFAULT_FIELDS } from "./forms";

describe("application form", () => {
  it("no custom form keeps today's defaults", () => {
    expect(effectiveForm(null).fields).toEqual(DEFAULT_FIELDS);
    expect(effectiveForm(null).fields.expected_ctc).toBe("optional");
  });
  it("hidden expected CTC is dropped", () => {
    const f = effectiveForm({ fields: { expected_ctc: "hidden" } });
    const r = checkSubmission(f, { expected_ctc_text: "5 LPA" }, {});
    expect(r.ok && r.drop.includes("expected_ctc_text")).toBe(true);
  });
  it("required standard field missing is rejected", () => {
    const f = effectiveForm({ fields: { notice_period: "required" } });
    expect(checkSubmission(f, {}, {})).toEqual({ ok: false, field: "required:notice_period" });
  });
  it("required custom question must be answered", () => {
    const f = effectiveForm({ questions: [{ id: "q1", label: "Night shift?", type: "yes_no", required: true }] });
    expect(checkSubmission(f, {}, {})).toEqual({ ok: false, field: "required:q1" });
  });
  it("choice answer outside options is rejected", () => {
    const f = effectiveForm({ questions: [{ id: "q1", label: "City", type: "single_choice", required: false, options: ["Delhi"] }] });
    expect(checkSubmission(f, {}, { q1: "Pune" })).toEqual({ ok: false, field: "answer:q1" });
  });
  it("knockout answer flags but does not reject", () => {
    const f = effectiveForm({ questions: [{ id: "q1", label: "Night shift?", type: "yes_no", required: true, knockout: ["No"] }] });
    const r = checkSubmission(f, {}, { q1: "No" });
    expect(r.ok && r.knockout).toEqual(["q1"]);
  });
  it("phone and email can never both be hidden", () => {
    expect(effectiveForm({ fields: { phone: "hidden", email: "hidden" } }).fields.email).toBe("optional");
  });
});
