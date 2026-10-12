// ATS imports: reading job-portal files (Excel or CSV) and resumes in the browser, and turning their values into
// ATS fields. Pure helpers (no React, no Supabase), so they can be tested on their own.

export type ImportField =
  | "full_name" | "first_name" | "last_name" | "email" | "phone" | "alt_phone" | "city" | "state"
  | "current_company" | "current_title" | "total_experience_years" | "current_ctc" | "expected_ctc"
  | "notice_period_days" | "skills" | "languages" | "education" | "linkedin_url" | "portfolio_url" | "summary"
  | "position_text" | "applied_at" | "external_ref" | "extra" | "skip";

export const IMPORT_FIELDS: { value: ImportField; label: string }[] = [
  { value: "full_name", label: "Full name" },
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "alt_phone", label: "Other phone" },
  { value: "city", label: "City / location" },
  { value: "state", label: "State" },
  { value: "current_company", label: "Current company" },
  { value: "current_title", label: "Current job title" },
  { value: "total_experience_years", label: "Total experience" },
  { value: "current_ctc", label: "Current salary" },
  { value: "expected_ctc", label: "Expected salary" },
  { value: "notice_period_days", label: "Notice period" },
  { value: "skills", label: "Skills" },
  { value: "languages", label: "Languages" },
  { value: "education", label: "Education" },
  { value: "linkedin_url", label: "LinkedIn profile" },
  { value: "portfolio_url", label: "Portfolio / website" },
  { value: "summary", label: "Summary / cover note" },
  { value: "position_text", label: "Job applied for" },
  { value: "applied_at", label: "Date applied" },
  { value: "external_ref", label: "Portal's candidate ID" },
  { value: "extra", label: "Keep as extra detail" },
  { value: "skip", label: "Don't import" },
];
export const fieldLabel = (f: ImportField) => IMPORT_FIELDS.find((x) => x.value === f)?.label ?? f;
export const isImportField = (v: unknown): v is ImportField => IMPORT_FIELDS.some((x) => x.value === v);

/** Header words used by Indeed, Naukri, Apna, WorkIndia, LinkedIn, Shine, Foundit and common spreadsheets. */
const SYNONYMS: Record<Exclude<ImportField, "extra" | "skip">, string[]> = {
  full_name: ["name", "fullname", "candidatename", "applicantname", "nameofthecandidate", "nameofcandidate", "candidate",
    "jobseekername", "jobseeker", "applicant", "candidatefullname"],
  first_name: ["firstname", "fname", "givenname"],
  last_name: ["lastname", "lname", "surname", "familyname"],
  email: ["email", "emailid", "emailaddress", "mail", "mailid", "candidateemail", "emailaddresses", "eid"],
  phone: ["phone", "phonenumber", "phoneno", "mobile", "mobileno", "mobilenumber", "contactnumber", "contactno", "contact",
    "candidatephone", "whatsappnumber", "whatsappno", "whatsapp", "primaryphone", "mobilephone", "cellphone", "telephone"],
  alt_phone: ["alternatephone", "alternatenumber", "alternatemobile", "alternatemobileno", "secondaryphone", "otherphone",
    "alternatecontact", "phone2", "mobile2"],
  city: ["city", "location", "currentlocation", "candidatelocation", "currentcity", "town"],
  state: ["state", "currentstate", "region"],
  current_company: ["currentcompany", "company", "currentemployer", "employer", "latestcompany", "currentorganization",
    "currentorganisation", "organization", "organisation", "companyname"],
  current_title: ["currentdesignation", "designation", "currentrole", "currenttitle", "currentjobtitle", "latestdesignation",
    "currentposition"],
  total_experience_years: ["experience", "totalexperience", "workexperience", "workexp", "exp", "yearsofexperience",
    "experienceinyears", "totalexp", "totalworkexperience", "relevantexperience", "experienceyears", "expyrs",
    "expinyears", "totalexpyrs"],
  current_ctc: ["currentctc", "ctc", "currentsalary", "annualsalary", "salary", "currentannualsalary", "presentctc",
    "currentctclacs", "currentctcinlacs", "currentctcinlakhs", "monthlysalary", "currentmonthlysalary"],
  expected_ctc: ["expectedctc", "expectedsalary", "expectedctclacs", "expectedctcinlacs", "expectedctcinlakhs",
    "expectedmonthlysalary", "salaryexpectation"],
  notice_period_days: ["noticeperiod", "notice", "noticeperioddays", "availabletojoin", "joiningtime", "availability",
    "noticeperiodindays", "canjoinin"],
  skills: ["skills", "keyskills", "skillset", "itskills", "skill", "topskills"],
  languages: ["languages", "languagesknown", "language", "languageknown"],
  education: ["education", "highestqualification", "qualification", "highesteducation", "degree", "educationlevel",
    "relevanteducation", "ugcourse", "graduation", "educationqualification"],
  linkedin_url: ["linkedin", "linkedinprofile", "linkedinurl", "linkedinprofileurl", "profileurl"],
  portfolio_url: ["portfolio", "website", "github", "portfoliourl", "personalwebsite"],
  summary: ["summary", "coverletter", "profilesummary", "resumeheadline", "headline", "about", "coverletterorsummary"],
  position_text: ["jobtitle", "appliedfor", "jobappliedfor", "position", "jobname", "job", "role", "profile", "appliedjob",
    "jobposting", "opening", "postappliedfor", "positionappliedfor", "jobrole", "vacancy"],
  applied_at: ["dateapplied", "appliedon", "applieddate", "applicationdate", "date", "appliedat", "dateofapplication",
    "submittedon", "appliedtime", "applicationreceivedon", "responsedate", "applieddatetime", "applicationdatetime",
    "appliedondate"],
  external_ref: ["candidateid", "applicationid", "applicantid", "id", "profileid", "referenceid", "responseid"],
};

/** Column names this screen adds to the "rows not imported" file; they are not imported again. */
const OWN_COLUMNS = new Set(["importrow", "notimportedbecause"]);

/** Lower-case letters and digits only ("Email ID" → "emailid"). */
export const normHeader = (h: unknown) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const KNOWN = new Map<string, ImportField>();
for (const [f, words] of Object.entries(SYNONYMS)) for (const w of words) if (!KNOWN.has(w)) KNOWN.set(w, f as ImportField);

/** The field a header most likely means, or null. */
export function guessField(header: unknown): ImportField | null {
  const h = normHeader(header);
  if (!h) return null;
  if (KNOWN.has(h)) return KNOWN.get(h)!;
  // A few safe partial matches ("Candidate Email ID", "Mobile Number (Primary)").
  if (h.includes("email")) return "email";
  if (h.includes("linkedin")) return "linkedin_url";
  if ((h.includes("mobile") || h.includes("phone")) && !h.includes("alternate") && !h.includes("other")) return "phone";
  if (h.includes("expected") && (h.includes("ctc") || h.includes("salary"))) return "expected_ctc";
  if (h.includes("ctc") || h.includes("salary")) return "current_ctc";
  if (h.includes("notice")) return "notice_period_days";
  if (h.includes("skill")) return "skills";
  if (h.includes("experience")) return "total_experience_years";
  if (h.includes("qualification") || h.includes("education")) return "education";
  if (h.includes("date") && (h.includes("appl") || h.includes("response"))) return "applied_at";
  return null;
}

/** One field per header. Each field is used by the first header that means it; the rest are kept as extra details. */
export function autoMap(headers: unknown[]): ImportField[] {
  const used = new Set<ImportField>();
  return headers.map((h) => {
    if (!normHeader(h) || OWN_COLUMNS.has(normHeader(h))) return "skip";
    const f = guessField(h);
    if (!f || used.has(f)) return "extra";
    // A full name column wins over first/last name columns, and the other way round.
    if ((f === "first_name" || f === "last_name") && used.has("full_name")) return "extra";
    if (f === "full_name" && (used.has("first_name") || used.has("last_name"))) return "extra";
    used.add(f);
    return f;
  });
}

/** The header row: the first of the first 15 rows with 2+ filled cells and at least one header we know. */
export function findHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).map((c) => cellText(c)).filter(Boolean);
    if (cells.length >= 2 && cells.some((c) => guessField(c) !== null)) return i;
  }
  for (let i = 0; i < limit; i++) if ((rows[i] ?? []).filter((c) => cellText(c)).length >= 2) return i;
  return 0;
}

/** A cell as trimmed text. Whole numbers are written out in full (phone numbers), dates as YYYY-MM-DD. */
export function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : ymd(v);
  if (typeof v === "number") {
    if (!isFinite(v)) return "";
    return Number.isInteger(v) ? v.toFixed(0) : String(v);
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v).replace(/\xa0/g, " ").trim();
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** A sheet's header row and data rows. Blank rows are left out; each data row keeps its row number in the file. */
export interface SheetData {
  headers: string[];
  body: unknown[][];
  /** rowNumbers[i] is the row number of body[i] in the file (as Excel shows it). */
  rowNumbers: number[];
  headerRowNo: number;
}

/**
 * Finds the header row and the data rows under it. `firstRow` is the file row number of rows[0]. Columns after the
 * last one with any value are dropped, and at most `maxCols` columns are read.
 */
export function prepareSheet(rows: unknown[][], firstRow = 1, maxCols = 100): SheetData {
  const h = findHeaderRow(rows);
  let width = 0;
  for (let i = h; i < rows.length; i++) {
    const r = rows[i] ?? [];
    for (let j = Math.min(r.length, maxCols) - 1; j >= width; j--) {
      if (cellText(r[j]) !== "") { width = j + 1; break; }
    }
  }
  const headers = Array.from({ length: width }, (_, j) => cut(cellText(rows[h]?.[j]), 100));
  const body: unknown[][] = [];
  const rowNumbers: number[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    let any = false;
    for (let j = 0; j < width && !any; j++) if (cellText(r[j]) !== "") any = true;
    if (!any) continue;
    body.push(Array.from({ length: width }, (_, j) => r[j] ?? ""));
    rowNumbers.push(firstRow + i);
  }
  return { headers, body, rowNumbers, headerRowNo: firstRow + h };
}

export const columnHasData = (body: unknown[][], j: number) => body.some((r) => cellText(r[j]) !== "");

/** Up to `n` different example values from a column. */
export function columnSamples(body: unknown[][], j: number, n = 3): string[] {
  const out: string[] = [];
  for (const r of body) {
    const t = cut(cellText(r[j]), 60);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

/** The suggested mapping: autoMap, and a column with values but no header is kept as an extra detail. */
export function initialMapping(headers: string[], body: unknown[][]): ImportField[] {
  return autoMap(headers).map((f, j) =>
    f === "skip" && !normHeader(headers[j]) && columnHasData(body, j) ? "extra" : f);
}

/** What the mapping is missing: a name column, an email or phone column, and fields chosen for two columns. */
export function checkMapping(mapping: ImportField[]): { hasName: boolean; hasContact: boolean; repeated: number[] } {
  const count = new Map<ImportField, number>();
  for (const f of mapping) count.set(f, (count.get(f) ?? 0) + 1);
  return {
    hasName: count.has("full_name") || count.has("first_name") || count.has("last_name"),
    hasContact: count.has("email") || count.has("phone"),
    repeated: mapping.map((f, j) => (f !== "extra" && f !== "skip" && (count.get(f) ?? 0) > 1 ? j : -1)).filter((j) => j >= 0),
  };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
/** "Oct", "October", "Sept" → 10, 10, 9; anything else → null. */
const monthOf = (w: string): number | null => MONTHS[w.slice(0, 3).toLowerCase()] ?? null;

/**
 * A date as ISO text at noon IST, or null. Reads Excel dates and serial numbers, "2026-10-12", "12/10/2026" and
 * "12-10-26" (day first, as used in India), "12 Oct 2026", "Oct 12, 2026" and ISO timestamps.
 */
export function parseDate(v: unknown): string | null {
  const iso = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000;
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00+05:30`;
  };
  if (v instanceof Date) return isNaN(v.getTime()) ? null : iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number") {
    // Excel serial date (days since 1899-12-30).
    if (v < 30000 || v > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = cellText(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}).*)?$/);
  if (m) {
    if (m[4] && /[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
      const t = new Date(s);
      if (!isNaN(t.getTime())) return t.toISOString();
    }
    return iso(+m[1], +m[2], +m[3]);
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{2}|\d{4})(?:\s.*)?$/);
  if (m && monthOf(m[2])) return iso(+m[3], monthOf(m[2])!, +m[1]);
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})(?:\s.*)?$/);
  if (m && monthOf(m[1])) return iso(+m[3], monthOf(m[1])!, +m[2]);
  return null;
}

/** Years of experience: "2 Year(s) 6 Month(s)" → 2.5, "3 yrs" → 3, "6 months" → 0.5, "Fresher" → 0, "10+ years" → 10. */
export function parseExperience(v: unknown): number | null {
  const s = cellText(v).toLowerCase();
  if (!s) return null;
  if (/fresh|no experience|^nil$|^none$/.test(s)) return 0;
  const yrs = s.match(/(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?|y\b|year\(s\))/);
  const mos = s.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?|m\b|month\(s\))/);
  let n: number | null = null;
  if (yrs || mos) n = (yrs ? +yrs[1] : 0) + (mos ? +mos[1] / 12 : 0);
  else {
    const plain = s.match(/^(\d+(?:\.\d+)?)/);
    if (plain) n = +plain[1];
  }
  if (n == null || !isFinite(n) || n < 0 || n > 60) return null;
  return Math.round(n * 10) / 10;
}

/** Notice period in days: "Immediate" → 0, "15 days or less" → 15, "1 Month" → 30, "3 months" → 90. */
export function parseNotice(v: unknown): number | null {
  const s = cellText(v).toLowerCase();
  if (!s) return null;
  if (/immediate|^0$|no notice|available now|joining now/.test(s)) return 0;
  const d = s.match(/(\d+)\s*(?:days?|d\b)/);
  const w = s.match(/(\d+)\s*(?:weeks?|wks?)/);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:months?|mons?|mths?)/);
  let n: number | null = null;
  if (d) n = +d[1];
  else if (w) n = +w[1] * 7;
  else if (m) n = Math.round(+m[1] * 30);
  else if (/^\d+$/.test(s)) n = +s;
  if (n == null || n < 0 || n > 365) return null;
  return n;
}

export type SalaryUnit = "year" | "month" | "lakh";
export const SALARY_UNITS: { value: SalaryUnit; label: string }[] = [
  { value: "month", label: "Rupees per month" },
  { value: "year", label: "Rupees per year" },
  { value: "lakh", label: "Lakhs per year (LPA)" },
];

/** The unit most values in a salary column seem to be in. Values that name their own unit ("4.5 LPA", "25k",
 *  "20000 per month") are read correctly whatever is chosen, so only plain numbers decide, when there are any. */
export function guessSalaryUnit(values: unknown[]): SalaryUnit {
  const plain = { lakh: 0, month: 0, year: 0 };
  const worded = { lakh: 0, month: 0, year: 0 };
  for (const v of values) {
    const s = cellText(v).toLowerCase();
    if (!s) continue;
    const yearly = /year|annum|pa\b|yearly|annual/.test(s);
    if (/lakh|lac|lpa|\bl\b/.test(s)) { worded.lakh++; continue; }
    if (/\bk\b|\d\s*k\b|thousand/.test(s)) { if (yearly) worded.year++; else worded.month++; continue; }
    if (/month|pm\b|p\.m\.|monthly/.test(s)) { worded.month++; continue; }
    if (yearly) { worded.year++; continue; }
    const n = firstNumber(s);
    if (n == null) continue;
    if (n < 100) plain.lakh++;
    else if (n < 150000) plain.month++;
    else plain.year++;
  }
  const c = plain.lakh + plain.month + plain.year > 0 ? plain : worded;
  if (c.lakh >= c.month && c.lakh >= c.year && c.lakh > 0) return "lakh";
  return c.year > c.month ? "year" : "month";
}

function firstNumber(s: string): number | null {
  const m = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? +m[1] : null;
}

/** A salary as rupees per month (whole number), or null. Words in the cell ("4.5 LPA", "25k", "3 lakh") win over the unit. */
export function parseSalaryMonthly(v: unknown, unit: SalaryUnit): number | null {
  const s = cellText(v).toLowerCase();
  if (!s || /not disclosed|confidential|negotiable|^na$|^n\/a$|^-$/.test(s)) return null;
  const n = firstNumber(s);
  if (n == null || n <= 0) return null;
  let perYear: number | null = null;
  let perMonth: number | null = null;
  if (/lakh|lac|lpa|\bl\b/.test(s)) perYear = n * 100000;
  else if (/\bk\b|\d\s*k\b|thousand/.test(s)) {
    const val = n * 1000;
    if (/year|annum|pa\b|yearly|annual/.test(s)) perYear = val; else perMonth = val;
  } else if (/month|pm\b|p\.m\.|monthly/.test(s)) perMonth = n;
  else if (/year|annum|pa\b|yearly|annual/.test(s)) perYear = n;
  else if (unit === "lakh") perYear = n * 100000;
  else if (unit === "year") perYear = n;
  else perMonth = n;
  const monthly = perMonth ?? (perYear != null ? perYear / 12 : null);
  if (monthly == null || !isFinite(monthly) || monthly < 1000 || monthly > 10000000) return null;
  return Math.round(monthly);
}

/** "Excel, KYC; Tally | MS Office" → ["Excel", "KYC", "Tally", "MS Office"] (no duplicates, at most 30). */
export function splitList(v: unknown, max = 30): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of cellText(v).split(/[,;|\n\r•]+/)) {
    const t = part.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Collapses spaces; a name written in capitals ("RAHUL SHARMA") becomes "Rahul Sharma". */
export function tidyName(v: unknown): string {
  const s = cellText(v).replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) {
    return s.toLowerCase().replace(/(^|[\s'.-])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
  }
  return s;
}

/** A web address with https:// in front, or null. */
export function tidyUrl(v: unknown): string | null {
  let s = cellText(v);
  if (!s || /\s/.test(s)) return null;
  if (/^www\.|^[a-z0-9-]+\.[a-z]{2,}\//i.test(s) || /^linkedin\.com/i.test(s)) s = `https://${s}`;
  if (/^http:\/\//i.test(s)) s = `https://${s.slice(7)}`;
  return /^https:\/\/[^\s<>"]+$/i.test(s) && s.length <= 300 ? s : null;
}

/** Source code ("indeed", "naukri", …) suggested by the file name, or null. */
export function guessSourceCode(fileName: string): string | null {
  const n = fileName.toLowerCase();
  for (const code of ["indeed", "naukri", "apna", "workindia", "linkedin", "internshala", "foundit", "shine"]) {
    if (n.includes(code)) return code;
  }
  if (n.includes("monster")) return "foundit";
  if (n.includes("work india") || n.includes("work_india")) return "workindia";
  return null;
}

export interface ImportRow {
  row_no: number;
  candidate: Record<string, unknown>;
  position_text: string | null;
  applied_at: string | null;
  external_ref: string | null;
  answers: Record<string, string>;
  /** For the check screen. */
  name: string;
  email: string | null;
  phone: string | null;
  problems: ("no_name" | "no_contact")[];
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

/** Digits of a phone number as typed, or null when it has fewer than 8 digits. */
export function tidyPhone(v: unknown): string | null {
  const s = cellText(v);
  const digits = s.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return cut(s, 32);
}

/**
 * Turns data rows into import rows with the chosen mapping. `rowNumbers[i]` is the file row number of data[i].
 * Columns marked "extra" are kept as extra details under their header (made unique: "Status", "Status (2)").
 */
export function buildRows(
  headers: unknown[], data: unknown[][], mapping: ImportField[],
  opts: { salaryUnit: SalaryUnit; rowNumbers: number[] },
): ImportRow[] {
  const col = (f: ImportField) => mapping.indexOf(f);
  const at = (r: unknown[], f: ImportField) => (col(f) >= 0 ? r[col(f)] : undefined);
  const extraKeys: [number, string][] = [];
  const usedKeys = new Set<string>();
  mapping.forEach((f, j) => {
    if (f !== "extra") return;
    const base = cut(cellText(headers[j]) || `Column ${j + 1}`, 94);
    let key = base;
    for (let n = 2; usedKeys.has(key.toLowerCase()); n++) key = `${base} (${n})`;
    usedKeys.add(key.toLowerCase());
    extraKeys.push([j, key]);
  });
  return data.map((r, i) => {
    const first = tidyName(at(r, "first_name"));
    const last = tidyName(at(r, "last_name"));
    const name = cut(tidyName(at(r, "full_name")) || [first, last].filter(Boolean).join(" "), 120);
    const emailRaw = cellText(at(r, "email")).toLowerCase();
    const email = EMAIL_RE.test(emailRaw) && emailRaw.length <= 254 ? emailRaw : null;
    const phone = tidyPhone(at(r, "phone"));
    const c: Record<string, unknown> = {};
    const put = (k: string, v: unknown) => { if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) c[k] = v; };
    put("full_name", name);
    put("email", email);
    put("phone", phone);
    put("alt_phone", tidyPhone(at(r, "alt_phone")));
    put("city", cut(cellText(at(r, "city")), 100));
    put("state", cut(cellText(at(r, "state")), 100));
    put("current_company", cut(cellText(at(r, "current_company")), 150));
    put("current_title", cut(cellText(at(r, "current_title")), 150));
    const exp = parseExperience(at(r, "total_experience_years"));
    put("total_experience_years", exp == null ? null : String(exp));
    const cur = parseSalaryMonthly(at(r, "current_ctc"), opts.salaryUnit);
    put("current_ctc_monthly", cur == null ? null : String(cur));
    const want = parseSalaryMonthly(at(r, "expected_ctc"), opts.salaryUnit);
    put("expected_ctc_monthly", want == null ? null : String(want));
    const notice = parseNotice(at(r, "notice_period_days"));
    put("notice_period_days", notice == null ? null : String(notice));
    put("skills", splitList(at(r, "skills")));
    put("languages", splitList(at(r, "languages"), 10));
    put("education", cut(cellText(at(r, "education")), 300));
    put("linkedin_url", tidyUrl(at(r, "linkedin_url")));
    put("portfolio_url", tidyUrl(at(r, "portfolio_url")));
    put("summary", cut(cellText(at(r, "summary")), 2000));

    const answers: Record<string, string> = {};
    for (const [j, key] of extraKeys) {
      const val = cut(cellText(r[j]), 1000);
      if (val && Object.keys(answers).length < 40) answers[key] = val;
    }
    // Values that could not be read into a field are kept as written, so nothing is lost.
    const keep = (f: ImportField, ok: boolean) => {
      const raw = cellText(at(r, f));
      if (!raw || ok || Object.keys(answers).length >= 40) return;
      const key = cut(cellText(headers[col(f)]) || fieldLabel(f), 100);
      if (!(key in answers)) answers[key] = cut(raw, 1000);
    };
    keep("total_experience_years", exp != null);
    keep("current_ctc", cur != null);
    keep("expected_ctc", want != null);
    keep("notice_period_days", notice != null);

    const problems: ImportRow["problems"] = [];
    if (!name) problems.push("no_name");
    if (!email && !phone) problems.push("no_contact");
    return {
      row_no: opts.rowNumbers[i],
      candidate: c,
      position_text: cut(cellText(at(r, "position_text")), 200) || null,
      applied_at: parseDate(at(r, "applied_at")),
      external_ref: cut(cellText(at(r, "external_ref")), 120) || null,
      answers,
      name, email, phone, problems,
    };
  });
}

/** Rows that are the same person as an earlier row (same email or phone): row_no → earlier row_no. */
export function sameAsEarlier(rows: ImportRow[]): Map<number, number> {
  const byEmail = new Map<string, number>();
  const byPhone = new Map<string, number>();
  const out = new Map<number, number>();
  const ph = (p: string | null) => {
    if (!p) return null;
    let d = p.replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    return d.length >= 8 ? d : null;
  };
  for (const r of rows) {
    const p = ph(r.phone);
    const prev = (r.email && byEmail.get(r.email)) || (p && byPhone.get(p)) || null;
    if (prev) out.set(r.row_no, prev);
    if (r.email && !byEmail.has(r.email)) byEmail.set(r.email, r.row_no);
    if (p && !byPhone.has(p)) byPhone.set(p, r.row_no);
  }
  return out;
}

// ---------------------------------------------------------------- the check before importing

/** What the database found for a row before importing (ats_import_check). */
export interface CheckResult {
  row_no: number; candidate_id: string | null; full_name: string | null; ref_no: string | null;
  conflict: boolean; job_id: string | null; applied: boolean;
}

export type RowStatusKey = "new" | "add" | "applied" | "same" | "skip" | "conflict";
export interface RowStatus { key: RowStatusKey; label: string; tone: "green" | "blue" | "muted" | "amber" | "red" }

export const ROW_STATUS_FILTERS: { value: RowStatusKey | "all"; label: string }[] = [
  { value: "all", label: "All rows" },
  { value: "new", label: "New candidates" },
  { value: "add", label: "Already in the ATS" },
  { value: "applied", label: "Already applied" },
  { value: "same", label: "Repeated in this file" },
  { value: "skip", label: "Will be skipped" },
  { value: "conflict", label: "Need a look" },
];

/** What will happen to a row when it is imported. */
export function rowStatus(r: ImportRow, c: CheckResult | undefined, sameAs: number | undefined): RowStatus {
  if (r.problems.includes("no_name")) return { key: "skip", label: "Will be skipped: no name", tone: "amber" };
  if (r.problems.includes("no_contact")) return { key: "skip", label: "Will be skipped: no email or phone", tone: "amber" };
  if (c?.conflict) return { key: "conflict", label: "Email and phone belong to two different candidates: not imported", tone: "red" };
  if (sameAs) return { key: "same", label: `Same person as row ${sameAs}`, tone: "muted" };
  if (c?.applied) return { key: "applied", label: "Already applied: left as it is", tone: "muted" };
  if (c?.candidate_id) return { key: "add", label: "Already in the ATS: application added", tone: "blue" };
  return { key: "new", label: "New candidate", tone: "green" };
}

/** How many rows have each status. */
export function countStatuses(list: RowStatus[]): Record<RowStatusKey, number> {
  const out: Record<RowStatusKey, number> = { new: 0, add: 0, applied: 0, same: 0, skip: 0, conflict: 0 };
  for (const s of list) out[s.key]++;
  return out;
}

/**
 * The rows that were not imported, as they were in the file, for a CSV the user can fix and import again. A row with
 * no result (the import was stopped before it) is included too. The two added columns are ignored by autoMap.
 */
export function notImportedRows(
  sheet: Pick<SheetData, "headers" | "body" | "rowNumbers">,
  results: Map<number, { outcome: string; error: string | null }>,
  reason: (error: string | null) => string,
): unknown[][] {
  const out: unknown[][] = [[...sheet.headers, "Import row", "Not imported because"]];
  sheet.body.forEach((cells, i) => {
    const no = sheet.rowNumbers[i];
    const r = results.get(no);
    if (r && r.outcome !== "skipped" && r.outcome !== "error") return;
    out.push([...cells, no, r ? reason(r.error) : "The import was stopped before this row"]);
  });
  return out;
}

// ---------------------------------------------------------------- resumes

const RESUME_WORDS = /\b(resume|résumé|curriculum|vitae|cv|biodata|bio-data|profile|objective|summary|contact|email|e-mail|phone|mobile|address|career|personal|details|declaration|experience|education|skills)\b/i;

/** Name, email and phone read from a resume's text, with the file name as a fallback for the name. */
export function guessFromResume(text: string, fileName: string): { name: string; email: string | null; phone: string | null } {
  const t = text.replace(/\xa0/g, " ");
  const emailM = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  const email = emailM && EMAIL_RE.test(emailM[0]) ? emailM[0].toLowerCase().replace(/\.$/, "") : null;
  const phoneM = t.match(/(?:\+?91[\s-]*)?(?:\(?0\)?[\s-]*)?[6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/) ?? t.match(/(?:\+?91[\s-]*)?[6-9]\d{4}[\s-]?\d{5}\b/);
  const phone = phoneM ? tidyPhone(phoneM[0]) : null;
  let name = "";
  const lines = t.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 25);
  for (const l of lines) {
    const cleaned = l.replace(/^(name|candidate name)\s*[:\-–]\s*/i, "");
    if (cleaned.length < 3 || cleaned.length > 40) continue;
    if (/[@\d/\\|:]/.test(cleaned) || RESUME_WORDS.test(cleaned)) continue;
    const words = cleaned.split(" ");
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w))) continue;
    name = tidyName(cleaned);
    break;
  }
  if (!name) name = nameFromFileName(fileName);
  return { name: cut(name, 120), email, phone };
}

/** "Rahul_Sharma_Resume (2).pdf" → "Rahul Sharma". */
export function nameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.()[\]{}]+/g, " ")
    .replace(/\b(resume|résumé|cv|curriculum|vitae|biodata|naukri|indeed|apna|updated|latest|new|final|copy|profile)\b/gi, " ")
    .replace(/\b\d+\s*(?:y|yr|yrs|years?|m|mo|months?)\b/gi, " ")
    .replace(/\d+/g, " ")
    .replace(/\b[A-Za-z]\b/g, " ")
    .replace(/\s+/g, " ").trim();
  if (!base || !/[A-Za-z]/.test(base)) return "";
  return base.split(" ").slice(0, 4).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
