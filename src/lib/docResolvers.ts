import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toValidDate } from "@/lib/safe-date";

/**
 * Resolver layer for HR Document Studio.
 * Turns an employee id + the field catalog into concrete letter values.
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
}

export interface ResolvedValues {
  values: Record<string, string>;
  /** field keys the resolvers could not fill */
  missing: string[];
  employeeName: string;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return (TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "")).trim();
}

/** Indian numbering system: crore / lakh / thousand / hundred. */
export function inrInWords(amount: number): string {
  const n = Math.floor(Math.abs(amount));
  if (n === 0) return "Zero Rupees Only";
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
      parts.push(`${twoDigits(q)} ${name}`);
      rest %= div;
    }
  }
  if (rest > 0) parts.push(twoDigits(rest));
  return `${parts.join(" ")} Rupees Only`;
}

export function formatValue(raw: unknown, dataType: string, formatter: string | null): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (dataType === "date") {
    const d = toValidDate(raw);
    if (!d) return "";
    return format(d, formatter === "DD/MM/YYYY" ? "dd/MM/yyyy" : "dd MMM yyyy");
  }
  if (dataType === "currency") {
    const n = Number(raw);
    if (!isFinite(n)) return "";
    return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }
  if (formatter === "indian_words") return inrInWords(Number(raw) || 0);
  return String(raw);
}

function tenureText(doj: unknown, lwd: unknown): string {
  const a = toValidDate(doj);
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

export async function fetchCatalog(): Promise<CatalogField[]> {
  const { data, error } = await (supabase as any)
    .from("hr_doc_field_catalog")
    .select("field_key,label,field_group,data_type,formatter,resolver_id,is_sensitive,default_value")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data || []) as CatalogField[];
}

/** Resolve every catalog field for one employee. */
export async function resolveEmployeeValues(
  employeeId: string,
  catalog: CatalogField[]
): Promise<ResolvedValues> {
  const { data: emp, error } = await (supabase as any)
    .from("hr_employees")
    .select("id,badge_id,first_name,last_name,email,phone,address,city,state,zip,country,gender,pan_number,total_salary,basic_salary,last_working_day,resignation_date")
    .eq("id", employeeId)
    .maybeSingle();
  if (error) throw error;
  if (!emp) throw new Error("Employee not found");

  const { data: work } = await (supabase as any)
    .from("hr_employee_work_info")
    .select("job_role,department_id,job_position_id,location,employee_type,work_type,joining_date,reporting_manager_id,company_name")
    .eq("employee_id", employeeId)
    .maybeSingle();

  let department = "";
  let designation = work?.job_role || "";
  if (work?.department_id) {
    const { data: dept } = await (supabase as any)
      .from("departments").select("name").eq("id", work.department_id).maybeSingle();
    department = dept?.name || "";
  }
  if (!designation && work?.job_position_id) {
    const { data: pos } = await (supabase as any)
      .from("positions").select("title").eq("id", work.job_position_id).maybeSingle();
    designation = pos?.title || "";
  }
  let manager = "";
  if (work?.reporting_manager_id) {
    const { data: mgr } = await (supabase as any)
      .from("hr_employees").select("first_name,last_name").eq("id", work.reporting_manager_id).maybeSingle();
    manager = [mgr?.first_name, mgr?.last_name].filter(Boolean).join(" ");
  }

  const fullName = [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim();
  const gender = (emp.gender || "").toLowerCase();
  const isFemale = gender.startsWith("f");
  const addressLine = [emp.address, emp.city, emp.state, emp.zip, emp.country]
    .filter((p: any) => p && String(p).trim())
    .join(", ");
  const annualCtc = Number(emp.total_salary) || 0;

  const source: Record<string, unknown> = {
    "employee.full_name": fullName,
    "employee.first_name": emp.first_name || "",
    "employee.badge_id": emp.badge_id || "",
    "employee.gender": emp.gender || "",
    "employee.address": addressLine,
    "employee.phone": emp.phone || "",
    "employee.email": emp.email || "",
    "employee.pan": emp.pan_number || "",
    "derived.salutation": gender ? (isFemale ? "Ms." : "Mr.") : "",
    "derived.pronoun_subject": gender ? (isFemale ? "she" : "he") : "",
    "derived.pronoun_possessive": gender ? (isFemale ? "her" : "his") : "",
    "employment.designation": designation,
    "employment.department": department,
    "employment.date_of_joining": work?.joining_date || "",
    "employment.last_working_day": emp.last_working_day || "",
    "employment.employment_type": work?.employee_type || work?.work_type || "",
    "employment.reporting_manager": manager,
    "employment.work_location": work?.location || "",
    "derived.tenure": tenureText(work?.joining_date, emp.last_working_day),
    "salary.annual_ctc": annualCtc || "",
    "derived.annual_ctc_words": annualCtc || "",
    "salary.monthly_gross": annualCtc ? Math.round(annualCtc / 12) : "",
    "date.today": new Date().toISOString(),
  };

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
  values["issue_date"] = values["issue_date"] || format(new Date(), "dd MMM yyyy");

  return { values, missing, employeeName: fullName };
}
