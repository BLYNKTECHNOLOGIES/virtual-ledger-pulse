/**
 * Rules for HRMS → Onboarding → "Send onboarding form".
 *
 * One dialog asks for everything the self-service form, the offer letter and E2
 * need, saves it to the onboarding record (the same fields Stage 1 and Stage 2
 * edit), then sends the form with the offer attached. These pure functions hold
 * its decisions so they can be tested: what to ask, what is wrong, what changes
 * on the record, whether the live offer still matches, and whether the joining
 * package has to be republished.
 */
import { MIN_ANNUAL_CTC, parseAmount } from "@/lib/docCtcBreakdown";
import type { PlaceholderMapping } from "@/lib/docTemplate";
import { isCtcDerivedResolver, type CatalogField } from "@/lib/docResolvers";
import { isSystemMapping } from "@/lib/docLetterPlan";

export type SendMode = "offer" | "form";

/** The dialog's inputs, as typed. */
export interface SendDetails {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  department_id: string;
  position_id: string;
  employee_type: string;
  shift_id: string;
  post_training_shift_id: string;
  ctc: string;
  post_training_ctc: string;
  /** A joining batch date, or "custom". */
  joining_choice: string;
  custom_date: string;
  custom_reason: string;
  probation_end_date: string;
}

export type SendProblems = Partial<Record<keyof SendDetails, string>>;

export const CUSTOM_JOINING = "custom";

/**
 * Dictionary variables the dialog's own inputs fill — the offer letter never
 * asks for them a second time (a missing one is a missing input above).
 */
export const SEND_DIALOG_KEYS = new Set([
  "employee_name", "employee_first_name", "employee_email", "employee_phone",
  "department", "designation", "employment_type", "shift", "date_of_joining", "annual_ctc",
]);

export const EMPLOYEE_TYPES = [
  { value: "permanent", label: "Permanent" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** A stored amount as HR reads it: 163200 → "1,63,200". */
const amountText = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(v);
};

/** Legacy drafts stored full_time / part_time; the form offers permanent / contract / intern. */
export function normaliseEmployeeType(raw: unknown): string {
  const t = text(raw).trim();
  return t === "full_time" || t === "part_time" ? "permanent" : t;
}

/** Prefill the dialog from the onboarding record and its joining package. */
export function detailsFromRecord(rec: Record<string, any>, choices: string[]): SendDetails {
  const p = rec?.prejoining || {};
  const doj = text(rec?.date_of_joining);
  const inBatch = !!doj && choices.includes(doj);
  return {
    first_name: text(rec?.first_name),
    last_name: text(rec?.last_name),
    email: text(rec?.email),
    phone: text(rec?.phone),
    department_id: text(rec?.department_id),
    position_id: text(rec?.position_id),
    employee_type: normaliseEmployeeType(rec?.employee_type),
    shift_id: text(rec?.shift_id),
    post_training_shift_id: text(rec?.post_training_shift_id),
    ctc: amountText(rec?.ctc),
    post_training_ctc: amountText(rec?.post_training_ctc),
    joining_choice: inBatch ? doj : doj ? CUSTOM_JOINING : choices[0] || "",
    custom_date: inBatch ? "" : doj,
    custom_reason: !inBatch && doj && p.joining_custom && p.joining_date === doj ? text(p.joining_custom.reason) : "",
    probation_end_date: text(rec?.probation_end_date),
  };
}

/** The joining date the details choose (a batch, or the custom date). */
export function joiningDateOf(d: SendDetails): string {
  return d.joining_choice === CUSTOM_JOINING ? d.custom_date : d.joining_choice;
}

export interface ProblemContext {
  mode: SendMode;
  /** Shifts with their training flag (active ones). */
  shifts: Array<{ id: string; is_training_shift?: boolean | null }>;
  /** Today in IST, YYYY-MM-DD. */
  today: string;
  /** Joining batches on offer. */
  choices: string[];
  /** The record has a training period (post-training CTC is shown). */
  hasTraining: boolean;
}

/** What is wrong with the details, by field — empty when the dialog may send. */
export function sendDetailProblems(d: SendDetails, ctx: ProblemContext): SendProblems {
  const out: SendProblems = {};
  if (!d.first_name.trim()) out.first_name = "Enter the first name";
  if (!EMAIL_RE.test(d.email.trim())) out.email = "Enter a valid email address";
  if (d.phone.replace(/\D/g, "").length < 10) out.phone = "Enter a 10-digit mobile number";
  if (ctx.mode !== "offer") return out;

  if (!d.department_id) out.department_id = "Choose the department";
  if (!d.position_id) out.position_id = "Choose the designation";
  if (!d.employee_type) out.employee_type = "Choose the employee type";
  if (!d.shift_id) out.shift_id = "Choose the shift";
  const training = ctx.shifts.find((s) => s.id === d.shift_id)?.is_training_shift;
  if (training && !d.post_training_shift_id) out.post_training_shift_id = "Choose the shift after training — this person starts on a training shift";

  const ctc = parseAmount(d.ctc);
  if (ctc === null || ctc < MIN_ANNUAL_CTC) out.ctc = "Enter the annual CTC in rupees, e.g. 1,63,200";
  if (ctx.hasTraining) {
    const after = parseAmount(d.post_training_ctc);
    if (after === null || after < MIN_ANNUAL_CTC) out.post_training_ctc = "Enter the annual CTC after training in rupees";
    else if (ctc !== null && after === ctc) out.post_training_ctc = "The CTC after training must differ from the training CTC";
  }

  const date = joiningDateOf(d);
  if (d.joining_choice === CUSTOM_JOINING) {
    if (!ISO_DATE.test(d.custom_date) || Number.isNaN(Date.parse(`${d.custom_date}T00:00:00Z`))) out.custom_date = "Enter the joining date";
    else if (d.custom_date <= ctx.today) out.custom_date = "A custom joining date must be after today";
    if (d.custom_reason.trim().length < 5) out.custom_reason = "Give the reason for a date outside the joining batches";
  } else if (!ctx.choices.includes(d.joining_choice)) {
    out.joining_choice = "Choose a joining date";
  }
  if (d.probation_end_date && ISO_DATE.test(date) && d.probation_end_date <= date) {
    out.probation_end_date = "The probation end date must be after the joining date";
  }
  return out;
}

/**
 * Does the dialog ask for the shift after training? Always for a training shift;
 * also whenever the record has a training period or already stores a shift after
 * training — the offer prints that shift, so HR must see and be able to change it.
 */
export function showsShiftAfterTraining(
  rec: Record<string, any> | null | undefined,
  shiftId: string,
  shifts: Array<{ id: string; is_training_shift?: boolean | null }>,
): boolean {
  if (shifts.find((s) => s.id === shiftId)?.is_training_shift) return true;
  return !!(rec?.post_training_shift_id || rec?.post_training_ctc || rec?.training_completion_date);
}

/**
 * Onboarding fields as the details set them — what the letter is resolved from
 * before saving, and what is written to the record. Form-only sends touch the
 * contact fields alone. `afterTrainingShown`: the dialog showed "Shift after
 * training", so its value (or "same as shift" = none) is written too.
 */
export function draftFromDetails(
  d: SendDetails,
  mode: SendMode,
  positions: Array<{ id: string; title?: string | null }>,
  hasTraining: boolean,
  afterTrainingShown: boolean,
): Record<string, unknown> {
  const draft: Record<string, unknown> = {
    first_name: d.first_name.trim(),
    last_name: d.last_name.trim(),
    email: d.email.trim(),
    phone: d.phone.trim(),
  };
  if (mode !== "offer") return draft;
  draft.department_id = d.department_id || null;
  draft.position_id = d.position_id || null;
  draft.job_role = positions.find((p) => p.id === d.position_id)?.title || null;
  draft.employee_type = d.employee_type || null;
  draft.shift_id = d.shift_id || null;
  if (afterTrainingShown) draft.post_training_shift_id = d.post_training_shift_id || null;
  draft.ctc = parseAmount(d.ctc);
  if (hasTraining) draft.post_training_ctc = parseAmount(d.post_training_ctc);
  draft.date_of_joining = joiningDateOf(d) || null;
  draft.probation_end_date = d.probation_end_date || null;
  return draft;
}

/** Same stored value? Blank and null are the same; numbers compare as numbers. */
export function sameValue(a: unknown, b: unknown): boolean {
  return same(a, b);
}

function same(a: unknown, b: unknown): boolean {
  const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  if (blank(a) || blank(b)) return blank(a) && blank(b);
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a).trim() === String(b).trim();
}

/**
 * The update for the onboarding record: only fields that change. A new
 * department or designation clears the linked hiring requirement, exactly as
 * Stage 1 does (the old link no longer fits and the database would refuse it).
 */
export function onboardingPatch(
  rec: Record<string, any>,
  draft: Record<string, unknown>,
): { patch: Record<string, unknown>; requirementCleared: boolean } {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(draft)) {
    if (k === "job_role") continue; // follows the designation (database trigger)
    if (!same(rec?.[k], v)) patch[k] = v;
  }
  if ("position_id" in patch && draft.job_role) patch.job_role = draft.job_role;
  let requirementCleared = false;
  if ("position_id" in patch || "department_id" in patch) {
    if (rec?.hiring_requirement_id) requirementCleared = true;
    if (rec?.hiring_requirement_id || rec?.hiring_requirement_declined) {
      patch.hiring_requirement_id = null;
      patch.hiring_requirement_declined = false;
    }
  }
  return { patch, requirementCleared };
}

export interface LiveOffer {
  id: string;
  reference_no: string;
  template_version_id: string | null;
  values_snapshot: Record<string, unknown> | null;
  pdf_path: string | null;
  status: string;
  issued_at?: string | null;
}

/** Frozen with every issued letter: what HR typed (field key → printed value) and who signed. */
export const TYPED_FIELDS_KEY = "typed_fields";
export const SIGNED_BY_KEY = "signed_by";
/** Native letters: token → printed value (Word letters are token-keyed already). */
export const PRINTED_KEY = "printed";

/**
 * Which printed values of the live offer differ from what would be issued now.
 * Empty means the live offer still says exactly this and is sent again as it is.
 * The letter date only counts when HR set it explicitly; the reference never.
 * A different signer counts even when only a signature image shows it, and so
 * do values HR typed for tokens no variable covers.
 */
export function offerChanges(
  live: LiveOffer,
  docxValues: Record<string, string>,
  mappings: PlaceholderMapping[],
  versionId: string | null | undefined,
  overrides: Record<string, string>,
  signerId?: string | null,
): string[] {
  const changes: string[] = [];
  if (versionId && live.template_version_id !== versionId) changes.push("template");
  const snap = live.values_snapshot || {};
  // What each token printed (native letters keep a separate map; Word letters are token-keyed).
  const printed = snap[PRINTED_KEY] && typeof snap[PRINTED_KEY] === "object" ? (snap[PRINTED_KEY] as Record<string, unknown>) : null;
  for (const m of mappings) {
    if (isSystemMapping(m)) continue;
    const key = m.field_key || m.token;
    if (key === "reference_no") continue;
    if (key === "letter_date" && !("letter_date" in overrides)) continue;
    const was = text(printed && m.token in printed ? printed[m.token] : snap[m.token] ?? snap[key]);
    const now = text(docxValues[m.token]);
    if (was.trim() !== now.trim()) changes.push(m.token);
  }
  const signedBy = text(snap[SIGNED_BY_KEY]);
  if (signedBy && signerId && signedBy !== signerId) changes.push("signatory");
  // Values typed for tokens no variable covers (native letters) print under their own name.
  const typedBefore = (snap[TYPED_FIELDS_KEY] && typeof snap[TYPED_FIELDS_KEY] === "object" ? snap[TYPED_FIELDS_KEY] : {}) as Record<string, unknown>;
  const mapped = new Set(mappings.map((m) => m.field_key || m.token));
  for (const k of new Set([...Object.keys(typedBefore), ...Object.keys(overrides)])) {
    if (mapped.has(k) || k === "letter_date" || SEND_DIALOG_KEYS.has(k)) continue;
    if (text(typedBefore[k]).trim() !== text(overrides[k]).trim()) changes.push(k);
  }
  return changes;
}

/** What differs from the live offer, in words — salary figures read as one change. */
export function describeOfferChanges(
  changes: string[],
  mappings: PlaceholderMapping[],
  byKey: Map<string, CatalogField>,
): string[] {
  const out = new Set<string>();
  for (const t of changes) {
    if (t === "template") { out.add("the offer template"); continue; }
    if (t === "signatory") { out.add("the signatory"); continue; }
    if (t === "date_of_joining_iso") { out.add("the joining date"); continue; }
    const field = byKey.get(mappings.find((m) => m.token === t)?.field_key || t);
    const rid = field?.resolver_id || "";
    if (rid === "salary.annual_ctc" || isCtcDerivedResolver(rid)) out.add("the CTC and salary break-up");
    else out.add(field?.label || t.replace(/_/g, " "));
  }
  return [...out];
}

/**
 * Terms to start a resend from: only what HR typed for the live offer (probation
 * extension, a signatory designation, an adjusted work location…), so values the
 * records give are never frozen into overrides and a record change still shows.
 * Offers issued before typed terms were recorded contribute their prompt answers
 * only — fields no record can fill. The dialog pre-fills text inputs only (dates and
 * amounts are typed in their own input format); `allTypes` carries every typed value,
 * as printed, for the check that has no one to re-type them.
 */
export function offerPrefill(
  snapshot: Record<string, unknown> | null | undefined,
  mappings: PlaceholderMapping[],
  promptFields: CatalogField[],
  editableFields: CatalogField[],
  opts: { allTypes?: boolean } = {},
): Record<string, string> {
  const snap = snapshot || {};
  const typed = snap[TYPED_FIELDS_KEY] && typeof snap[TYPED_FIELDS_KEY] === "object" ? (snap[TYPED_FIELDS_KEY] as Record<string, unknown>) : null;
  const prompts = new Set(promptFields.map((f) => f.field_key));
  const out: Record<string, string> = {};
  for (const f of [...promptFields, ...editableFields]) {
    if ((!opts.allTypes && f.data_type !== "text") || f.field_key === "letter_date") continue;
    let was = "";
    if (typed) was = text(typed[f.field_key]);
    else if (prompts.has(f.field_key)) {
      const token = mappings.find((m) => m.field_key === f.field_key)?.token;
      was = text((token ? snap[token] : undefined) ?? snap[f.field_key]);
    }
    if (was.trim()) out[f.field_key] = was.trim();
  }
  return out;
}

/**
 * Republishing bumps the package version and asks the candidate to sign again,
 * so it happens only when the package does not already carry this offer and date.
 */
export function packageNeedsPublish(prejoining: Record<string, any> | null | undefined, offerId: string, joiningDate: string): boolean {
  const p = prejoining || {};
  if (!p.enabled) return true;
  if (p.state === "revision_required") return true;
  if (p.offer_file?.issued_id !== offerId) return true;
  return p.joining_date !== joiningDate;
}

/** Human labels for changed tokens (falls back to the token spelled out). */
export function changeLabels(tokens: string[], labelOf: (token: string) => string | undefined): string[] {
  return tokens.map((t) => (t === "template" ? "the offer template" : labelOf(t) || t.replace(/_/g, " ")));
}

/**
 * Fields of the onboarding record that changed since the dialog loaded it — the
 * dialog stops instead of overwriting someone else's change or issuing an offer
 * from values HR has not seen.
 */
export function recordChangedSince(
  loaded: Record<string, any>,
  fresh: Record<string, any>,
  keys: readonly string[],
): string[] {
  return keys.filter((k) => !same(loaded?.[k], fresh?.[k]));
}

const RECORD_FIELD_WORDS: Record<string, string> = {
  first_name: "first name", last_name: "last name", email: "email", phone: "mobile", gender: "gender",
  date_of_birth: "date of birth", address: "address", city: "city", state: "state", zip: "PIN code", country: "country",
  department_id: "department", position_id: "designation", job_role: "designation", shift_id: "shift",
  post_training_shift_id: "shift after training", employee_type: "employment type", ctc: "CTC",
  post_training_ctc: "CTC after training", training_completion_date: "training completion date",
  date_of_joining: "joining date", probation_end_date: "probation end date", reporting_manager_id: "reporting manager",
};

/** Onboarding record columns in words, once each (designation and job role read as one). */
export function recordFieldWords(keys: readonly string[]): string[] {
  return [...new Set(keys.map((k) => RECORD_FIELD_WORDS[k] || k.replace(/_id$/, "").replace(/_/g, " ")))];
}
