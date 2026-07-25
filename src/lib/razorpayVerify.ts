/**
 * RazorpayX push verification.
 *
 * Every write to RazorpayX (identity / bank / employment / salary / statutory /
 * dismissal) must be treated as *not finalized* until we re-read the same
 * fields from RazorpayX and confirm they match what HRMS just wrote.
 *
 * This module owns:
 *   - `buildExpected(kind, hrEmployeeId)`  — snapshot HRMS values that
 *     RazorpayX should now be showing.
 *   - `verifyPush(kind, hrEmployeeId, expected, options)` — reads RazorpayX
 *     via the existing `read_person_by_id` proxy action and produces a
 *     field-by-field diff.
 *   - `RAZORPAY_PUSH_RESULT_EVENT` — a window event fired by the pushback
 *     layer whenever a push resolves to `partial` or `failed`, so the
 *     `RazorpayPushFeedbackProvider` can open the result dialog.
 */
import { supabase } from "@/integrations/supabase/client";

export type PushVerifyKind =
  | "identity"
  | "bank"
  | "employment"
  | "salary"
  | "statutory"
  | "dismissal";

export type FieldDiff = {
  key: string;
  label: string;
  expected: any;
  actual: any;
  /**
   * true  = RazorpayX confirmed the value we sent
   * false = mismatch — RazorpayX is showing something else
   * null  = RazorpayX doesn't expose this field, cannot verify
   */
  match: boolean | null;
  /** true when the write endpoint accepted the value but RazorpayX cannot echo it yet */
  accepted?: boolean;
  reason?: string;
};

export type VerifyOverall = "verified" | "accepted" | "partial" | "failed" | "skipped";

export type PushVerifyResult = {
  ok: boolean;                    // true when overall is verified or accepted-by-write
  overall: VerifyOverall;
  fields: FieldDiff[];
  razorpayEmployeeId: string | null;
  hrEmployeeId: string;
  kind: PushVerifyKind;
  error?: string;
};

export type PushResultEventDetail = PushVerifyResult & {
  employeeName?: string | null;
  triggeredFrom?: string;
  retry?: () => Promise<PushVerifyResult>;
};

export const RAZORPAY_PUSH_RESULT_EVENT = "razorpay:push-result";

// -------------------- normalizers --------------------
const s = (v: any) => (v === null || v === undefined ? "" : String(v).trim());
const lower = (v: any) => s(v).toLowerCase();
const digits = (v: any) => s(v).replace(/\D/g, "");
const last10 = (v: any) => digits(v).slice(-10);
const upper = (v: any) => s(v).toUpperCase();

function normDate(v: any): string {
  const raw = s(v);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/.exec(raw);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw;
}

function pick(obj: any, ...keys: string[]): any {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

// -------------------- field maps --------------------
const NORMALIZERS: Record<string, (v: any) => string> = {
  first_name: lower,
  last_name: lower,
  email: lower,
  phone: last10,
  gender: lower,
  date_of_birth: normDate,
  date_of_joining: normDate,
  probation_end_date: normDate,
  employee_type: lower,
  designation: lower,
  department: lower,
  pan_number: upper,
  bank_account_number: digits,
  ifsc: upper,
  account_holder_name: lower,
  pf_enabled: (v: any) => (v ? "true" : "false"),
  esi_enabled: (v: any) => (v ? "true" : "false"),
  pt_enabled: (v: any) => (v ? "true" : "false"),
  annual_ctc: (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? String(Math.round(n)) : "";
  },
  dismissed: (v: any) => (v ? "true" : "false"),
  date_of_dismissal: normDate,
};

const LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  email: "Work email",
  phone: "Phone",
  gender: "Gender",
  date_of_birth: "Date of birth",
  date_of_joining: "Date of joining",
  probation_end_date: "Probation end date",
  employee_type: "Employment type",
  designation: "Designation / title",
  department: "Department",
  pan_number: "PAN",
  bank_account_number: "Bank account number",
  ifsc: "IFSC",
  account_holder_name: "Account holder",
  pf_enabled: "PF enrolled",
  esi_enabled: "ESI enrolled",
  pt_enabled: "PT enrolled",
  annual_ctc: "Annual CTC",
  dismissed: "Dismissed",
  date_of_dismissal: "Date of dismissal",
};

const KIND_FIELDS: Record<PushVerifyKind, string[]> = {
  identity: ["first_name", "last_name", "email", "phone", "gender", "date_of_birth", "pan_number"],
  bank: ["bank_account_number", "ifsc", "account_holder_name"],
  employment: ["date_of_joining", "probation_end_date", "designation", "department", "employee_type"],
  salary: ["annual_ctc"],
  statutory: ["pf_enabled", "esi_enabled", "pt_enabled"],
  dismissal: ["dismissed", "date_of_dismissal"],
};

// -------------------- expected builder (HRMS → normalized) --------------------
export async function buildExpected(
  kind: PushVerifyKind,
  hrEmployeeId: string,
  overrides?: Record<string, any>,
): Promise<Record<string, any>> {
  const fields = KIND_FIELDS[kind] || [];
  const out: Record<string, any> = {};

  const wantsCore = fields.some((f) =>
    ["first_name", "last_name", "email", "phone", "gender", "date_of_birth", "pan_number",
     "pf_enabled", "esi_enabled", "pt_enabled", "annual_ctc",
     "dismissed", "date_of_dismissal"].includes(f),
  );
  const wantsWork = fields.some((f) =>
    ["date_of_joining", "probation_end_date", "designation", "department", "employee_type"].includes(f),
  );
  const wantsBank = fields.some((f) =>
    ["bank_account_number", "ifsc", "account_holder_name"].includes(f),
  );

  const [empRes, workRes, bankRes] = await Promise.all([
    wantsCore
      ? (supabase as any)
          .from("hr_employees")
          .select("first_name,last_name,email,phone,gender,dob,pan_number,pf_enabled,esi_enabled,pt_enabled,total_salary,termination_date,resignation_status")
          .eq("id", hrEmployeeId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    wantsWork
      ? (supabase as any)
          .from("hr_employee_work_info")
          .select("joining_date,employee_type,job_role,department_id,probation_end_date")
          .eq("employee_id", hrEmployeeId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    wantsBank
      ? (supabase as any)
          .from("hr_employee_bank_details")
          .select("account_number,ifsc_code")
          .eq("employee_id", hrEmployeeId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const emp = empRes?.data || {};
  const work = workRes?.data || {};
  const bank = bankRes?.data || {};

  let departmentName: string | null = null;
  if (wantsWork && work?.department_id) {
    const { data: d } = await (supabase as any)
      .from("departments").select("name").eq("id", work.department_id).maybeSingle();
    departmentName = d?.name || null;
  }

  const map: Record<string, any> = {
    first_name: emp.first_name,
    last_name: emp.last_name,
    email: emp.email,
    phone: emp.phone,
    gender: emp.gender,
    date_of_birth: emp.dob,
    pan_number: emp.pan_number,
    date_of_joining: work.joining_date,
    probation_end_date: work.probation_end_date,
    employee_type: work.employee_type,
    designation: work.job_role,
    department: departmentName,
    bank_account_number: bank.account_number,
    ifsc: bank.ifsc_code,
    account_holder_name: [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim() || null,
    pf_enabled: emp.pf_enabled,
    esi_enabled: emp.esi_enabled,
    pt_enabled: emp.pt_enabled,
    annual_ctc: emp.total_salary,
    dismissed: !!emp.termination_date || String(emp.resignation_status || "").toLowerCase() === "dismissed",
    date_of_dismissal: emp.termination_date,
  };

  for (const k of fields) {
    out[k] = overrides?.[k] !== undefined ? overrides[k] : map[k];
  }
  return out;
}

// -------------------- snapshot extractor (RazorpayX → normalized) --------------------
function extractActual(kind: PushVerifyKind, snap: any): Record<string, any> {
  const bank = snap?.bank || snap?.["bank-details"] || snap?.bank_details || {};
  const liveSalaryBlock =
    snap?.salary ||
    snap?.["salary-structure"] ||
    snap?.salary_structure ||
    null;
  const nameParts = s(snap?.name || snap?.full_name).split(/\s+/).filter(Boolean);

  // Salary verification must use the LIVE people:view salary block only.
  // `__salary.annual_ctc` comes from payroll:view-payroll and reflects the
  // last executed payroll month, so using it here can produce a false green
  // badge after a CTC revision. If people:view does not expose the current
  // salary block, keep this unverified instead of falling back to stale payroll.
  const liveCtc =
    pick(liveSalaryBlock, "ctc-annual", "annual-ctc", "ctc_annual", "annual_ctc", "annualCtc") ??
    pick(snap, "ctc-annual", "annual-ctc", "ctc_annual");

  const raw: Record<string, any> = {
    first_name: pick(snap, "first_name", "firstName", "first-name") || nameParts[0] || null,
    last_name: pick(snap, "last_name", "lastName", "last-name") || nameParts.slice(1).join(" ") || null,
    email: pick(snap, "email", "work_email", "personal_email", "work-email", "personal-email"),
    phone: pick(snap, "phone_number", "phoneNumber", "phone", "contact_number", "phone-number", "mobile-number"),
    gender: pick(snap, "gender", "sex"),
    date_of_birth: pick(snap, "date-of-birth", "date_of_birth", "dob"),
    date_of_joining: pick(snap, "date-of-hiring", "date-of-joining", "date_of_hiring", "date_of_joining", "hire_date", "joining_date"),
    probation_end_date: pick(snap, "probation-end-date", "probation_end_date"),
    designation: pick(snap, "title", "designation", "job_title", "job-title"),
    department: pick(snap, "department", "department_name", "department-name"),
    employee_type: pick(snap, "employment_type", "employment-type", "employee-type", "type"),
    pan_number: pick(snap, "pan", "pan_number", "panNumber", "pan-number"),
    bank_account_number:
      pick(bank, "account_number", "accountNumber", "account-number") ||
      pick(snap, "account_number", "bank_account_number", "bank-account-number"),
    ifsc:
      pick(bank, "ifsc", "ifsc_code", "ifscCode") ||
      pick(snap, "ifsc", "ifsc_code", "bank_ifsc", "bank-ifsc"),
    account_holder_name:
      pick(bank, "name", "account_holder", "accountHolder", "account_holder_name") ||
      pick(snap, "bank_account_holder", "bank_account_holder_name", "bank-account-holder-name"),
    pf_enabled: pick(snap, "pf-enabled", "pf_enabled", "is_pf_enabled"),
    esi_enabled: pick(snap, "esi-enabled", "esi_enabled", "is_esi_enabled"),
    pt_enabled: pick(snap, "pt-enabled", "pt_enabled", "is_pt_enabled"),
    annual_ctc: liveCtc ?? null,
    dismissed: snap?.__dismissed === true || String(snap?.status || "").toLowerCase() === "dismissed",
    date_of_dismissal: pick(snap, "date-of-dismissal", "date_of_dismissal", "dismissed_at"),
  };

  const out: Record<string, any> = {};
  for (const k of KIND_FIELDS[kind]) out[k] = raw[k];
  return out;
}


// -------------------- diff --------------------
function diffFields(
  kind: PushVerifyKind,
  expected: Record<string, any>,
  actual: Record<string, any>,
  probeError?: string,
  acceptedUnknownFields: Set<string> = new Set(),
): FieldDiff[] {
  const rows: FieldDiff[] = [];
  for (const k of KIND_FIELDS[kind]) {
    const exp = expected[k];
    const act = actual[k];
    const norm = NORMALIZERS[k] || s;
    const expN = norm(exp);

    // Exposure gating — some fields are not readable from RazorpayX until a
    // payroll run has executed, or when the tenant hides them.
    if (k === "annual_ctc" && (act === null || act === undefined)) {
      const accepted = acceptedUnknownFields.has(k);
      rows.push({
        key: k,
        label: LABELS[k] || k,
        expected: exp,
        actual: null,
        match: null,
        accepted,
        reason: accepted
          ? "RazorpayX accepted the salary write, but its API will not echo current CTC until a payroll run exposes it."
          : "RazorpayX does not expose CTC until the first payroll run is executed.",
      });
      continue;
    }
    if ((act === null || act === undefined) && expN === "") {
      rows.push({ key: k, label: LABELS[k] || k, expected: exp, actual: act, match: true });
      continue;
    }
    if (act === null || act === undefined) {
      rows.push({
        key: k, label: LABELS[k] || k, expected: exp, actual: null, match: null,
        reason: probeError ? `RazorpayX read failed: ${probeError}` : "RazorpayX did not return this field.",
      });
      continue;
    }
    const actN = norm(act);
    const match = expN === actN;
    rows.push({
      key: k, label: LABELS[k] || k, expected: exp, actual: act,
      match,
      reason: match ? undefined : "RazorpayX is still showing the old value.",
    });
  }
  return rows;
}

function overallOf(fields: FieldDiff[]): VerifyOverall {
  if (fields.length === 0) return "skipped";
  const hasFail = fields.some((f) => f.match === false);
  if (hasFail) return "failed";
  const hasUnknown = fields.some((f) => f.match === null);
  if (hasUnknown) {
    const allUnknownAccepted = fields.every((f) => f.match === true || f.accepted === true);
    return allUnknownAccepted ? "accepted" : "partial";
  }
  return "verified";
}

// -------------------- proxy read --------------------
async function readActual(
  razorpayId: string,
  kind: PushVerifyKind,
): Promise<{ snap: any | null; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
      body: { action: "read_person_by_id", razorpay_employee_id: razorpayId },
    });
    if (error) return { snap: null, error: error.message || String(error) };
    const d = data as any;
    if (d?.ok === false) {
      // For dismissal verification, the proxy refuses dismissed employees with
      // RAZORPAY_EMPLOYEE_DISMISSED — that's the confirmation we wanted.
      if (kind === "dismissal" && d?.code === "RAZORPAY_EMPLOYEE_DISMISSED") {
        return { snap: { __dismissed: true } };
      }
      return { snap: null, error: d?.error || "RazorpayX read rejected" };
    }
    return { snap: d?.snapshot ?? null };
  } catch (e: any) {
    return { snap: null, error: e?.message || String(e) };
  }
}

// -------------------- public API --------------------
export async function verifyPush(
  kind: PushVerifyKind,
  hrEmployeeId: string,
  expected: Record<string, any>,
  opts?: {
    razorpayEmployeeId?: string | null;
    initialDelayMs?: number;
    retryDelayMs?: number;
    acceptedUnknownFields?: string[];
  },
): Promise<PushVerifyResult> {
  let razorpayId = opts?.razorpayEmployeeId ?? null;
  if (!razorpayId) {
    const { data } = await (supabase as any)
      .from("hr_razorpay_employee_map")
      .select("razorpay_employee_id")
      .eq("hr_employee_id", hrEmployeeId)
      .maybeSingle();
    razorpayId = data?.razorpay_employee_id ?? null;
  }
  if (!razorpayId) {
    return {
      ok: false, overall: "skipped", fields: [], razorpayEmployeeId: null,
      hrEmployeeId, kind, error: "Employee is not linked to RazorpayX.",
    };
  }

  await new Promise((r) => setTimeout(r, opts?.initialDelayMs ?? 800));

  let read = await readActual(String(razorpayId), kind);
  const acceptedUnknownFields = new Set(opts?.acceptedUnknownFields || []);
  let fields = diffFields(kind, expected, extractActual(kind, read.snap || {}), read.error, acceptedUnknownFields);
  let overall = overallOf(fields);

  // Give RazorpayX one more chance to become consistent before flagging a mismatch.
  if (overall === "failed" || overall === "partial") {
    await new Promise((r) => setTimeout(r, opts?.retryDelayMs ?? 2000));
    read = await readActual(String(razorpayId), kind);
    fields = diffFields(kind, expected, extractActual(kind, read.snap || {}), read.error, acceptedUnknownFields);
    overall = overallOf(fields);
  }

  return {
    ok: overall === "verified" || overall === "accepted",
    overall,
    fields,
    razorpayEmployeeId: String(razorpayId),
    hrEmployeeId,
    kind,
    error: read.error,
  };
}

export function emitPushResult(detail: PushResultEventDetail) {
  try {
    window.dispatchEvent(new CustomEvent(RAZORPAY_PUSH_RESULT_EVENT, { detail }));
  } catch { /* SSR / no-window guard */ }
}
