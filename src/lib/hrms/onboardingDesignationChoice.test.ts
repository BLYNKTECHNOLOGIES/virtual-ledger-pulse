import { describe, expect, it } from "vitest";
import { designationChoiceProblem, hrmsChoiceProblem, rpChoiceProblem, rpDesignationFor, type ChoiceContext } from "./onboardingDesignationChoice";
import type { ReconcileDiff } from "./razorpayReconcile";

const departments = [
  { id: "ops", name: "Operations" },
  { id: "cmp", name: "Compliance" },
];
const designations = [
  { id: "oa", title: "Operations Associate", department_id: "ops", is_active: true },
  { id: "kyc", title: "KYC Associate", department_id: "cmp", is_active: true },
  { id: "pe", title: "Purchase Executive", department_id: "ops", is_active: false },
];
const row = (field: string, erp: string, rp: string | null, status: ReconcileDiff["status"] = "mismatch"): ReconcileDiff => ({
  field, label: field, erp, razorpay: rp ?? "", rpRawValue: rp, status,
});
const ctx = (diffs: ReconcileDiff[], over: Partial<ChoiceContext> = {}): ChoiceContext => ({
  diffs, departments, designations, onboarding: { department_id: "ops", position_id: "oa" }, ...over,
});

describe("taking RazorpayX's designation", () => {
  it("picks the active designation of that name", () => {
    expect(rpDesignationFor(ctx([row("department", "Operations", "Compliance")]), "kyc associate")?.id).toBe("kyc");
  });

  it("is fine when RazorpayX's department is the designation's department", () => {
    const c = ctx([row("job_role", "Operations Associate", "KYC Associate"), row("department", "Operations", "Compliance")]);
    expect(designationChoiceProblem(c, { job_role: "razorpay", department: "razorpay" })).toBe("");
  });

  it("is blocked when RazorpayX keeps another department", () => {
    const c = ctx([row("job_role", "Operations Associate", "KYC Associate"), row("department", "Operations", "Operations", "match")]);
    expect(designationChoiceProblem(c, { job_role: "razorpay" })).toMatch(/belongs to Compliance, but RazorpayX has Operations/);
  });

  it("asks to take RazorpayX's department too when that one fits", () => {
    const c = ctx([row("job_role", "Operations Associate", "KYC Associate"), row("department", "Operations", "Compliance")]);
    expect(designationChoiceProblem(c, { job_role: "razorpay", department: "hrms" })).toMatch(/Use RazorpayX for the department too/);
  });

  it("names unknown, tentative and blank titles", () => {
    expect(rpChoiceProblem(ctx([]), row("job_role", "Operations Associate", "Ops Lead"))).toMatch(/No designation is called "Ops Lead"/);
    expect(rpChoiceProblem(ctx([]), row("job_role", "Operations Associate", "Purchase Executive"))).toMatch(/is tentative/);
    expect(rpChoiceProblem(ctx([]), row("job_role", "Operations Associate", null, "missing_rp"))).toMatch(/RazorpayX has no designation/);
    expect(rpChoiceProblem(ctx([], { designations: undefined }), row("job_role", "Operations Associate", "KYC Associate"))).toBe("Loading designations…");
  });
});

describe("taking RazorpayX's department", () => {
  it("is blocked while the HRMS designation belongs elsewhere", () => {
    const c = ctx([row("department", "Operations", "Compliance")]);
    expect(designationChoiceProblem(c, { department: "razorpay" })).toMatch(/can't take RazorpayX's department \(Compliance\) on its own/);
  });

  it("is fine when keeping HRMS's department", () => {
    const c = ctx([row("department", "Operations", "Compliance")]);
    expect(designationChoiceProblem(c, { department: "hrms" })).toBe("");
  });

  it("names an unknown department", () => {
    expect(rpChoiceProblem(ctx([]), row("department", "Operations", "Managment"))).toMatch(/No department is called "Managment"/);
  });
});

describe("sending HRMS's value", () => {
  it("needs a value on the HRMS side", () => {
    expect(hrmsChoiceProblem(row("job_role", "", "KYC Associate", "missing_erp"))).toMatch(/HRMS has no designation to send/);
    expect(hrmsChoiceProblem(row("department", "Operations", "Compliance"))).toBe(null);
    expect(hrmsChoiceProblem(row("email", "", "a@b.c", "missing_erp"))).toBe(null);
  });

  it("matching rows and other fields never block", () => {
    const c = ctx([row("job_role", "Operations Associate", "Operations Associate", "match"), row("email", "x", "y")]);
    expect(designationChoiceProblem(c, { email: "razorpay" })).toBe("");
  });
});
