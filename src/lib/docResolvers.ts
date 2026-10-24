import { supabase } from "@/integrations/supabase/client";
import { addMonths, format } from "date-fns";
import { toValidDate } from "@/lib/safe-date";
import {
  STANDARD_STRUCTURE_FALLBACK,
  normaliseStructure,
  parseAmount,
  salarySource,
  type StructureComponent,
} from "@/lib/docCtcBreakdown";

/**
 * Resolver layer for HR Document Studio.
 *
 * `hr_doc_field_catalog` is the one variable dictionary every template shares:
 * a variable is defined once (key + aliases) and filled from the same place for
 * every letter. A letter is issued either to an employee (employee record) or to
 * a candidate (their onboarding form) — the same variable, e.g. {{CANDIDATE_NAME}}
 * or {{EMPLOYEE_NAME}}, resolves from whichever record the letter is for.
 *
 * Every value is a plain string; unresolved fields come back as "" so the
 * generator can prompt the operator instead of silently printing blanks.
 */

export interface CatalogField {
  field_key: string;
  label: string;
  field_group: string;
  data_type: string;
  formatter: string | null;
  resolver_id: string | null;
  is_sensitive: boolean;
  default_value: string | null;
  /** Other spellings templates may use for this variable (normalised, e.g. "candidate_name"). */
  aliases?: string[] | null;
  description?: string | null;
}

export type SubjectKind = "employee" | "candidate";

export interface LetterSubject {
  kind: SubjectKind;
  /** hr_employees.id for an employee, hr_employee_onboarding.id for a candidate. */
  id: string;
}

export interface ResolvedValues {
  values: Record<string, string>;
  /** field keys the resolvers could not fill */
  missing: string[];
  /** Display name of the person the letter is for. */
  employeeName: string;
  subject: SubjectKind;
  /** Employee the letter belongs to — null for a candidate who has not joined yet. */
  employeeId: string | null;
  /** Onboarding record the letter was issued from (candidates only). */
  onboardingId: string | null;
  email: string;
  /** Annual CTC the salary variables were derived from (null when unknown). */
  annualCtc: number | null;
  /** Standard structure used for the break-up. */
  structure: StructureComponent[];
  /** Things HR should know before issuing — never blocking. */
  notes: string[];
  /** Notes about salary figures — shown only for templates that print salary. */
  salaryNotes: string[];
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return (TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "")).trim();
}

/** Indian numbering system words, no currency: "One Lakh Sixty Three Thousand Two Hundred". */
export function amountInWords(amount: number): string {
  const n = Math.floor(Math.abs(amount));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const units: Array<[number, string]> = [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
    [100, "Hundred"],
  ];
  let rest = n;
  for (const [div, name] of units) {
    const q = Math.floor(rest / div);
    if (q > 0) {
      // Above 99 crore the crore count itself needs the full scale.
      parts.push(`${q < 100 ? twoDigits(q) : amountInWords(q)} ${name}`);
      rest %= div;
    }
  }
  if (rest > 0) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** Indian numbering system: crore / lakh / thousand / hundred, with "Rupees Only". */
export function inrInWords(amount: number): string {
  return `${amountInWords(amount)} Rupees Only`;
}

export function formatValue(raw: unknown, dataType: string, formatter: string | null): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (dataType === "date") {
    const d = toValidDate(raw);
    if (!d) return "";
    return format(d, formatter === "DD/MM/YYYY" ? "dd/MM/yyyy" : "dd MMM yyyy");
  }
  if (dataType === "currency") {
    const n = parseAmount(raw);
    if (n === null) return "";
    const figure = n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
    // "INR" fields carry their currency (body text); plain ones sit under an "(INR)" column.
    return formatter === "INR" ? `INR ${figure}` : figure;
  }
  if (formatter === "indian_words" || formatter === "indian_words_plain") {
    const n = parseAmount(raw);
    if (n === null) return "";
    return formatter === "indian_words" ? inrInWords(n) : amountInWords(n);
  }
  return String(raw);
}

function tenureText(doj: unknown, lwd: unknown): string {
  const a = toValidDate(doj);
  // For a serving employee (no last working day) tenure runs up to today.
  const b = toValidDate(lwd) || new Date();
  if (!a) return "";
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const bits: string[] = [];
  if (y) bits.push(`${y} year${y > 1 ? "s" : ""}`);
  if (m) bits.push(`${m} month${m > 1 ? "s" : ""}`);
  return bits.join(" ") || "less than a month";
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/**
 * Probation length as letter text. The person's own probation end date wins —
 * "N months" when it falls on a month boundary (±1 day), otherwise "N days" —
 * and the offer-letter policy's default applies only when no end date is set.
 */
export function probationText(doj: unknown, probationEnd: unknown, policyMonths: number | null | undefined): string {
  const start = toValidDate(doj);
  const end = toValidDate(probationEnd);
  if (start && end && end.getTime() > start.getTime()) {
    const DAY = 86400000;
    for (let n = 1; n <= 24; n++) {
      const drift = Math.round((end.getTime() - addMonths(start, n).getTime()) / DAY);
      if (Math.abs(drift) <= 1) return plural(n, "month");
    }
    return plural(Math.round((end.getTime() - start.getTime()) / DAY), "day");
  }
  const m = Number(policyMonths);
  return Number.isFinite(m) && m > 0 ? plural(m, "month") : "";
}

/** RazorpayX-aligned employee type → wording for a letter. */
export function employmentTypeLabel(raw: unknown): string {
  const key = String(raw ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (!key) return "";
  const map: Record<string, string> = {
    permanent: "Full-time, permanent",
    full_time: "Full-time, permanent",
    fulltime: "Full-time, permanent",
    contract: "Contract",
    contractual: "Contract",
    intern: "Internship",
    internship: "Internship",
    part_time: "Part-time",
    trainee: "Trainee",
  };
  if (map[key]) return map[key];
  const text = String(raw).replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Morning Shift (09:00 to 17:00)". */
export function shiftLabel(shift: { name?: string | null; start_time?: string | null; end_time?: string | null } | null | undefined): string {
  if (!shift?.name) return "";
  const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : "");
  const s = hhmm(shift.start_time);
  const e = hhmm(shift.end_time);
  return s && e ? `${shift.name} (${s} to ${e})` : String(shift.name);
}

/** Today in Asia/Kolkata — a UTC date would print yesterday before 05:30 IST. */
export function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/**
 * Where each resolver takes its value from — shown in the Variables tab so the
 * dictionary documents itself. Keys are `hr_doc_field_catalog.resolver_id`.
 */
export const RESOLVER_SOURCES: Record<string, string> = {
  "employee.full_name": "First + last name — onboarding form (candidates) or employee record",
  "employee.first_name": "First name — onboarding form or employee record",
  "employee.badge_id": "Badge / eSSL ID — employee record (onboarding badge for candidates)",
  "employee.gender": "Gender — onboarding form or employee record",
  "employee.address": "Address, city, state, PIN — onboarding form or employee record",
  "employee.phone": "Mobile — onboarding form or employee record",
  "employee.email": "Email — onboarding form or employee record",
  "employee.pan": "PAN — employee record (not collected on the onboarding form)",
  "derived.salutation": "Mr./Ms. from gender",
  "derived.pronoun_subject": "he/she from gender",
  "derived.pronoun_possessive": "his/her from gender",
  "employment.designation": "Designation — onboarding position (candidates) or work info",
  "employment.department": "Department — onboarding form or work info",
  "employment.date_of_joining": "Date of joining — onboarding form or work info",
  "employment.last_working_day": "Last working day — separation / F&F records",
  "employment.resignation_date": "Resignation date — employee record",
  "employment.employment_type": "Employee type (Permanent / Contract / Intern) — onboarding form or work info",
  "employment.reporting_manager": "Reporting manager — onboarding form or work info",
  "employment.work_location": "Work location — work info; the variable's default applies otherwise",
  "employment.shift": "Shift name and hours — onboarding (shift after training wins) or work info",
  "derived.tenure": "Joining date to last working day",
  "salary.annual_ctc": "Annual CTC — onboarding (post-training CTC wins) or employee salary",
  "salary.monthly_ctc": "Annual CTC ÷ 12",
  "derived.annual_ctc_words": "Annual CTC in words",
  "salary.basic_monthly": "Standard structure share of CTC (Basic), monthly",
  "salary.basic_annual": "Standard structure share of CTC (Basic), yearly",
  "salary.da_monthly": "Standard structure share of CTC (DA), monthly",
  "salary.da_annual": "Standard structure share of CTC (DA), yearly",
  "salary.hra_monthly": "Standard structure share of CTC (HRA), monthly",
  "salary.hra_annual": "Standard structure share of CTC (HRA), yearly",
  "salary.special_allowance_monthly": "Standard structure share of CTC (Special Allowance, takes rounding), monthly",
  "salary.special_allowance_annual": "Standard structure share of CTC (Special Allowance, takes rounding), yearly",
  "salary.lta_monthly": "Standard structure share of CTC (LTA), monthly",
  "salary.lta_annual": "Standard structure share of CTC (LTA), yearly",
  "terms.probation_period": "Person's probation end date; else Offer letter policy months",
  "terms.notice_period_probation": "Offer letter policy — notice during probation (days)",
  "terms.notice_period_confirmed": "Offer letter policy — notice after confirmation (days)",
  "company.name": "Company identity — trade name",
  "company.legal_name": "Company identity — legal name",
  "company.address": "Company identity — corporate address",
  "company.registered_address": "Company identity — registered address",
  "company.gstin": "Company identity — GSTIN",
  "company.cin": "Company identity — CIN",
  "company.pan": "Company identity — PAN",
  "company.phone": "Company identity — phone",
  "company.email": "Company identity — email",
  "company.website": "Company identity — website",
  "signatory.signature": "Signature image of the chosen signatory",
  "signatory.seal": "Seal image of the chosen signatory",
  "signatory.name": "Name of the signatory signing the letter",
  "signatory.designation": "Designation of the signatory signing the letter",
  "system.today": "Today's date (IST) — editable",
  "system.reference_no": "Allocated when the letter is issued",
  "system.actor_name": "The HR user issuing the letter",
};

/** Resolver ids whose values follow from the annual CTC (recomputed when HR enters the CTC). */
export function isCtcDerivedResolver(resolverId: string | null | undefined): boolean {
  if (!resolverId) return false;
  return resolverId === "salary.monthly_ctc" || resolverId === "derived.annual_ctc_words" ||
    /^salary\.[a-z0-9_]+_(monthly|annual)$/.test(resolverId);
}

export async function fetchCatalog(): Promise<CatalogField[]> {
  const { data, error } = await (supabase as any)
    .from("hr_doc_field_catalog")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return ((data || []) as any[]).map((f) => ({
    field_key: f.field_key,
    label: f.label,
    field_group: f.field_group,
    data_type: f.data_type,
    formatter: f.formatter ?? null,
    resolver_id: f.resolver_id ?? null,
    is_sensitive: !!f.is_sensitive,
    default_value: f.default_value ?? null,
    aliases: Array.isArray(f.aliases) ? f.aliases : [],
    description: f.description ?? null,
  }));
}

/** Company letterhead facts — one row, one truth (`hr_company_identity`). */
async function fetchCompany(): Promise<Record<string, string>> {
  const { data } = await (supabase as any)
    .from("hr_company_identity")
    .select("legal_name,trade_name,cin,gstin,pan,registered_address,corporate_address,phone,email,website")
    .limit(1)
    .maybeSingle();
  const c = (data || {}) as any;
  return {
    "company.name": (c.trade_name || c.legal_name || "").trim(),
    "company.legal_name": (c.legal_name || "").trim(),
    "company.address": (c.corporate_address || c.registered_address || "").trim(),
    "company.registered_address": (c.registered_address || "").trim(),
    "company.gstin": (c.gstin || "").trim(),
    "company.cin": (c.cin || "").trim(),
    "company.pan": (c.pan || "").trim(),
    "company.phone": (c.phone || "").trim(),
    "company.email": (c.email || "").trim(),
    "company.website": (c.website || "").trim(),
  };
}

interface LetterPolicy {
  probation_months: number | null;
  notice_confirmed_days: number | null;
  notice_probation_forfeit_days: number | null;
}

/** Offer-letter terms (probation, notice) — Settings → Offer letter policy. */
async function fetchLetterPolicy(): Promise<LetterPolicy> {
  const { data } = await (supabase as any)
    .from("hr_offer_letter_policy")
    .select("probation_months,notice_confirmed_days,notice_probation_forfeit_days")
    .limit(1)
    .maybeSingle();
  return {
    probation_months: data?.probation_months ?? null,
    notice_confirmed_days: data?.notice_confirmed_days ?? null,
    notice_probation_forfeit_days: data?.notice_probation_forfeit_days ?? null,
  };
}

/**
 * The company's standard CTC structure. Payroll settings are not readable by
 * every HR login, so a SECURITY DEFINER RPC returns just the component split.
 */
export async function fetchStandardStructure(): Promise<{
  structure: StructureComponent[];
  fromSettings: boolean;
  /** Whether payroll itself splits salaries with this structure (Settings toggle). */
  payrollUsesIt: boolean;
}> {
  try {
    const { data, error } = await (supabase as any).rpc("hr_doc_standard_ctc_structure");
    if (error) throw error;
    const structure = normaliseStructure((data as any)?.components);
    if (structure.length) return { structure, fromSettings: true, payrollUsesIt: !!(data as any)?.enabled };
  } catch (e) {
    console.warn("Standard CTC structure unavailable, using the built-in standard:", e);
  }
  return { structure: STANDARD_STRUCTURE_FALLBACK, fromSettings: false, payrollUsesIt: false };
}

async function fetchShift(id: string | null | undefined) {
  if (!id) return null;
  const { data } = await (supabase as any)
    .from("hr_shifts").select("name,start_time,end_time,is_training_shift").eq("id", id).maybeSingle();
  return data || null;
}

async function fetchName(table: "departments" | "positions", column: "name" | "title", id: string | null | undefined) {
  if (!id) return "";
  const { data } = await (supabase as any).from(table).select(column).eq("id", id).maybeSingle();
  return String((data as any)?.[column] || "");
}

async function fetchManagerName(id: string | null | undefined) {
  if (!id) return "";
  const { data: mgr } = await (supabase as any)
    .from("hr_employees").select("first_name,last_name").eq("id", id).maybeSingle();
  return [mgr?.first_name, mgr?.last_name].filter(Boolean).join(" ");
}

const fmtInr = (n: number) => `INR ${Math.round(n).toLocaleString("en-IN")}`;

/** Turn resolver-keyed raw facts into printable values for every catalog field. */
export function valuesFromSource(
  source: Record<string, unknown>,
  catalog: CatalogField[],
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const f of catalog) {
    if (f.field_group === "signatory") continue; // resolved from the signatory registry
    let raw: unknown = f.resolver_id ? source[f.resolver_id] : undefined;
    if (raw === undefined || raw === null || raw === "") raw = f.default_value ?? "";
    const out = formatValue(raw, f.data_type, f.formatter);
    values[f.field_key] = out;
    if (!out) missing.push(f.field_key);
  }
  return { values, missing };
}

/** Salary variables (monthly CTC, words, standard break-up) for a given annual CTC. */
export function salaryValues(
  annualCtc: number | null,
  structure: StructureComponent[],
  catalog: CatalogField[],
): Record<string, string> {
  const { source } = salarySource(annualCtc, structure);
  const out: Record<string, string> = {};
  for (const f of catalog) {
    if (!f.resolver_id || !(f.resolver_id in source)) continue;
    out[f.field_key] = formatValue(source[f.resolver_id], f.data_type, f.formatter);
  }
  return out;
}

async function sharedSource(actorName?: string) {
  const [company, policy, structure] = await Promise.all([fetchCompany(), fetchLetterPolicy(), fetchStandardStructure()]);
  const source: Record<string, unknown> = {
    ...company,
    "terms.notice_period_probation": policy.notice_probation_forfeit_days ? plural(policy.notice_probation_forfeit_days, "day") : "",
    "terms.notice_period_confirmed": policy.notice_confirmed_days ? plural(policy.notice_confirmed_days, "day") : "",
    "system.today": istToday(),
    "system.actor_name": actorName || "",
    // Allocated only at issue time; the generator substitutes it before printing.
    "system.reference_no": "",
  };
  const salaryNotes: string[] = [];
  if (!structure.fromSettings) {
    salaryNotes.push("The standard salary structure could not be read from settings — the break-up uses 50% Basic, 25% HRA, 15% Special Allowance and 10% LTA.");
  } else if (!structure.payrollUsesIt) {
    salaryNotes.push("Payroll's default-structure setting is off, so payroll may split this CTC differently from the letter's break-up.");
  }
  return { source, policy, structure: structure.structure, salaryNotes };
}

async function employeeSource(employeeId: string, policy: LetterPolicy) {
  const { data: emp, error } = await (supabase as any)
    .from("hr_employees")
    .select("id,badge_id,first_name,last_name,email,phone,address,city,state,zip,country,gender,pan_number,total_salary,basic_salary,last_working_day,resignation_date,notice_period_end_date,account_deletion_date")
    .eq("id", employeeId)
    .maybeSingle();
  if (error) throw error;
  if (!emp) throw new Error("Employee not found");

  /**
   * Last working day is recorded in several places depending on how the person
   * left (separation flow, F&F, or a plain deactivation). Read them in order of
   * authority instead of prompting the operator for a date the ERP already has.
   */
  let lastWorkingDay: string = emp.last_working_day || "";
  if (!lastWorkingDay) {
    const { data: fnf } = await (supabase as any)
      .from("hr_fnf_settlements")
      .select("last_working_day")
      .eq("employee_id", employeeId)
      .not("last_working_day", "is", null)
      .order("last_working_day", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastWorkingDay = fnf?.last_working_day || emp.notice_period_end_date || emp.account_deletion_date || "";
  }

  const { data: work } = await (supabase as any)
    .from("hr_employee_work_info")
    .select("job_role,department_id,job_position_id,location,employee_type,work_type,joining_date,reporting_manager_id,company_name,shift_id,probation_end_date")
    .eq("employee_id", employeeId)
    .maybeSingle();

  let designation = work?.job_role || "";
  if (!designation && work?.job_position_id) designation = await fetchName("positions", "title", work.job_position_id);
  const [department, manager, shift] = await Promise.all([
    fetchName("departments", "name", work?.department_id),
    fetchManagerName(work?.reporting_manager_id),
    fetchShift(work?.shift_id),
  ]);

  const fullName = [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim();
  const addressLine = [emp.address, emp.city, emp.state, emp.zip, emp.country]
    .filter((p: any) => p && String(p).trim())
    .join(", ");
  const annualCtc = Number(emp.total_salary) || 0;

  const source: Record<string, unknown> = {
    ...personFacts(fullName, emp.first_name, emp.gender),
    "employee.badge_id": emp.badge_id || "",
    "employee.address": addressLine,
    "employee.phone": emp.phone || "",
    "employee.email": emp.email || "",
    "employee.pan": emp.pan_number || "",
    "employment.designation": designation,
    "employment.department": department,
    "employment.date_of_joining": work?.joining_date || "",
    // Last working day is a distinct fact from the resignation date — never
    // substitute one for the other; an empty value prompts the operator instead.
    "employment.last_working_day": lastWorkingDay,
    "employment.resignation_date": emp.resignation_date || "",
    "employment.employment_type": employmentTypeLabel(work?.employee_type || work?.work_type || ""),
    "employment.reporting_manager": manager,
    "employment.work_location": work?.location || work?.company_name || "",
    "employment.shift": shift && !shift.is_training_shift ? shiftLabel(shift) : "",
    "derived.tenure": tenureText(work?.joining_date, lastWorkingDay),
    "terms.probation_period": probationText(work?.joining_date, work?.probation_end_date, policy.probation_months),
  };

  return {
    source,
    fullName,
    email: String(emp.email || ""),
    annualCtc: annualCtc || null,
    employeeId: emp.id as string,
    onboardingId: null as string | null,
    notes: [] as string[],
    salaryNotes: [] as string[],
  };
}

async function candidateSource(onboardingId: string, policy: LetterPolicy) {
  const { data: o, error } = await (supabase as any)
    .from("hr_employee_onboarding")
    .select("id,status,first_name,last_name,email,phone,gender,address,city,state,zip,country,department_id,position_id,job_role,shift_id,post_training_shift_id,employee_type,ctc,post_training_ctc,training_completion_date,date_of_joining,probation_end_date,reporting_manager_id,employee_id,essl_badge_id")
    .eq("id", onboardingId)
    .maybeSingle();
  if (error) throw error;
  if (!o) throw new Error("Onboarding record not found");

  const [positionTitle, department, manager, mainShift, laterShift] = await Promise.all([
    fetchName("positions", "title", o.position_id),
    fetchName("departments", "name", o.department_id),
    fetchManagerName(o.reporting_manager_id),
    fetchShift(o.shift_id),
    fetchShift(o.post_training_shift_id),
  ]);

  let badge = o.essl_badge_id || "";
  if (!badge && o.employee_id) {
    const { data: emp } = await (supabase as any).from("hr_employees").select("badge_id").eq("id", o.employee_id).maybeSingle();
    badge = emp?.badge_id || "";
  }

  const notes: string[] = [];
  const salaryNotes: string[] = [];
  // The offer is for the role, so the regular shift (after training) is the one to print.
  const shift = laterShift || (mainShift && !mainShift.is_training_shift ? mainShift : null);
  if (!shift && mainShift?.is_training_shift) {
    notes.push(`The onboarding record only has a training shift (${mainShift.name}). Set "Shift after training" on the record, or type the shift below.`);
  }

  const trainingCtc = Number(o.ctc) || 0;
  const regularCtc = Number(o.post_training_ctc) || 0;
  const annualCtc = regularCtc || trainingCtc;
  if (regularCtc && trainingCtc && regularCtc !== trainingCtc) {
    const until = o.training_completion_date ? ` until ${formatValue(o.training_completion_date, "date", null)}` : "";
    salaryNotes.push(
      `Training CTC is ${fmtInr(trainingCtc)} a year${until}; the letter states the regular CTC of ${fmtInr(regularCtc)} and its break-up. Check what the letter says about pay during training.`,
    );
  }
  if (o.employee_id) notes.push("This onboarding record is linked to an employee — the letter will also be filed in that employee's documents.");

  const fullName = [o.first_name, o.last_name].filter(Boolean).join(" ").trim();
  const addressLine = [o.address, o.city, o.state, o.zip, o.country]
    .filter((p: any) => p && String(p).trim())
    .join(", ");

  const source: Record<string, unknown> = {
    ...personFacts(fullName, o.first_name, o.gender),
    "employee.badge_id": badge,
    "employee.address": addressLine,
    "employee.phone": o.phone || "",
    "employee.email": o.email || "",
    "employee.pan": "",
    "employment.designation": positionTitle || o.job_role || "",
    "employment.department": department,
    "employment.date_of_joining": o.date_of_joining || "",
    "employment.last_working_day": "",
    "employment.resignation_date": "",
    "employment.employment_type": employmentTypeLabel(o.employee_type),
    "employment.reporting_manager": manager,
    "employment.work_location": "",
    "employment.shift": shift ? shiftLabel(shift) : "",
    "derived.tenure": "",
    "terms.probation_period": probationText(o.date_of_joining, o.probation_end_date, policy.probation_months),
  };

  return {
    source,
    fullName,
    email: String(o.email || ""),
    annualCtc: annualCtc || null,
    employeeId: (o.employee_id as string) || null,
    onboardingId: o.id as string,
    notes,
    salaryNotes,
  };
}

function personFacts(fullName: string, firstName: unknown, genderRaw: unknown): Record<string, unknown> {
  const gender = String(genderRaw || "").toLowerCase();
  const isFemale = gender.startsWith("f");
  return {
    "employee.full_name": fullName,
    "employee.first_name": firstName || "",
    "employee.gender": genderRaw || "",
    "derived.salutation": gender ? (isFemale ? "Ms." : "Mr.") : "",
    "derived.pronoun_subject": gender ? (isFemale ? "she" : "he") : "",
    "derived.pronoun_possessive": gender ? (isFemale ? "her" : "his") : "",
  };
}

/** Resolve every catalog field for the person a letter is issued to. */
export async function resolveSubjectValues(
  subject: LetterSubject,
  catalog: CatalogField[],
  actorName?: string,
): Promise<ResolvedValues> {
  const shared = await sharedSource(actorName);
  const person = subject.kind === "candidate"
    ? await candidateSource(subject.id, shared.policy)
    : await employeeSource(subject.id, shared.policy);

  const salary = salarySource(person.annualCtc, shared.structure);
  const source = { ...shared.source, ...person.source, ...salary.source };
  const { values, missing } = valuesFromSource(source, catalog);

  return {
    values,
    missing,
    employeeName: person.fullName,
    subject: subject.kind,
    employeeId: person.employeeId,
    onboardingId: person.onboardingId,
    email: person.email,
    annualCtc: person.annualCtc,
    structure: shared.structure,
    notes: person.notes,
    salaryNotes: [...shared.salaryNotes, ...person.salaryNotes, ...(salary.breakdown?.warnings || [])],
  };
}

/** Resolve every catalog field for one employee. */
export async function resolveEmployeeValues(
  employeeId: string,
  catalog: CatalogField[],
  actorName?: string,
): Promise<ResolvedValues> {
  return resolveSubjectValues({ kind: "employee", id: employeeId }, catalog, actorName);
}

/** Field keys that must never block issuing — they are filled by the system itself. */
export const SYSTEM_FILLED_KEYS = new Set(["reference_no", "generated_by"]);

/**
 * Fields the operator must always be able to override even when they resolved —
 * letters are routinely back-dated, and offer terms are agreed per person.
 */
export const ALWAYS_EDITABLE_KEYS = new Set([
  "letter_date", "last_working_day", "resignation_date", "conduct",
  "probation_period", "probation_extension", "notice_period_probation", "notice_period_confirmed", "work_location",
]);
