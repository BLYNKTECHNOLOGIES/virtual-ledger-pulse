import { designationByTitle } from "./designations";
import type { ReconcileDiff } from "./razorpayReconcile";

/**
 * Onboarding Stage 5: which designation and department choices ("Use RazorpayX" / "Use HRMS") HRMS can carry out.
 *
 * The database keeps an open onboarding's title and department in step with its designation. Taking RazorpayX's
 * title therefore means taking a designation, and HRMS ends with that designation's department. RazorpayX must end
 * with the same department, or the after-Finalize tally reopens the onboarding after the employee was created.
 */
export type ReconcileChoice = "hrms" | "razorpay";

export interface ChoiceContext {
  diffs: ReconcileDiff[] | null | undefined;
  departments: { id: string; name: string }[] | null | undefined;
  designations: { id: string; title: string; department_id: string | null; is_active?: boolean | null }[] | null | undefined;
  onboarding: { department_id?: string | null; position_id?: string | null } | null | undefined;
}

/** Same text with case and spacing ignored. */
export const sameText = (a: unknown, b: unknown) =>
  String(a ?? "").trim().toLowerCase().replace(/\s+/g, " ") === String(b ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** The active designation RazorpayX's title points to: same name, in RazorpayX's department first, then the onboarding's. */
export function rpDesignationFor(ctx: ChoiceContext, title: string) {
  const rpDept = (ctx.diffs || []).find((x) => x.field === "department")?.rpRawValue;
  const rpDeptId = rpDept ? (ctx.departments || []).find((d) => sameText(d.name, rpDept))?.id : null;
  const active = (ctx.designations || []).filter((x) => x.is_active !== false);
  return designationByTitle(active, title, [rpDeptId, ctx.onboarding?.department_id]);
}

/** Why "Use RazorpayX" can't be carried out for a designation or department row, or null. */
export function rpChoiceProblem(ctx: ChoiceContext, d: ReconcileDiff): string | null {
  if (d.field !== "job_role" && d.field !== "department") return null;
  const v = String(d.rpRawValue ?? "").trim();
  if (!v) return `RazorpayX has no ${d.field === "job_role" ? "designation" : "department"}. Use HRMS to send ours.`;
  if (d.field === "job_role") {
    if (!ctx.designations) return "Loading designations…";
    if (rpDesignationFor(ctx, v)) return null;
    return ctx.designations.some((x) => sameText(x.title, v))
      ? `"${v}" is tentative in HRMS. Mark it active on Organization › Designations, or use HRMS.`
      : `No designation is called "${v}". Add it on Organization › Designations, or use HRMS.`;
  }
  if (!ctx.departments) return "Loading departments…";
  return ctx.departments.some((x) => sameText(x.name, v))
    ? null
    : `No department is called "${v}". Add it on Organization › Departments, or use HRMS.`;
}

/** Why "Use HRMS" can't be carried out for a designation or department row (nothing to send), or null. */
export function hrmsChoiceProblem(d: ReconcileDiff): string | null {
  if (d.field !== "job_role" && d.field !== "department") return null;
  if (String(d.erp ?? "").trim()) return null;
  return `HRMS has no ${d.field === "job_role" ? "designation" : "department"} to send. Choose one in Basic Details, or use RazorpayX.`;
}

/** Why the chosen combination would leave HRMS and RazorpayX with different departments after Finalize, or "". */
export function departmentClash(ctx: ChoiceContext, ov: Record<string, ReconcileChoice | undefined>): string {
  const diffs = ctx.diffs || [];
  const nameOf = (id: unknown) => (ctx.departments || []).find((x) => x.id === id)?.name;
  const t = diffs.find((d) => d.field === "job_role" && d.status !== "match" && ov.job_role === "razorpay");
  const des = t
    ? rpDesignationFor(ctx, String(t.rpRawValue ?? ""))
    : (ctx.designations || []).find((x) => x.id === ctx.onboarding?.position_id);
  const desDept = nameOf(des?.department_id);
  const dep = diffs.find((d) => d.field === "department");
  if (!des || !desDept || !dep) return "";
  const rpDept = String(dep.rpRawValue ?? "").trim();
  const pushesHrms = dep.status !== "match" && ov.department === "hrms";
  const rpEnds = pushesHrms ? nameOf(ctx.onboarding?.department_id) : rpDept;
  if (!rpEnds || sameText(rpEnds, desDept)) return "";
  if (t) {
    return sameText(rpDept, desDept)
      ? `${des.title} belongs to ${desDept}. Use RazorpayX for the department too, or use HRMS for the designation.`
      : `${des.title} belongs to ${desDept}, but RazorpayX has ${rpDept || "no department"}. Correct the department in RazorpayX, or use HRMS for the designation.`;
  }
  return `${des.title} belongs to ${desDept}, so HRMS can't take RazorpayX's department (${rpEnds}) on its own. Use HRMS for the department, or correct it in RazorpayX.`;
}

/** The first designation / department choice that can't work, or "". Checked for the Finalize button and inside Finalize. */
export function designationChoiceProblem(ctx: ChoiceContext, ov: Record<string, ReconcileChoice | undefined>): string {
  for (const d of ctx.diffs || []) {
    if (d.status === "match") continue;
    const r = ov[d.field] === "razorpay" ? rpChoiceProblem(ctx, d) : ov[d.field] === "hrms" ? hrmsChoiceProblem(d) : null;
    if (r) return r;
  }
  return departmentClash(ctx, ov);
}
