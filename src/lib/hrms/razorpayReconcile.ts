/**
 * RazorpayX ↔ ERP Onboarding reconciler.
 *
 * Compares the RazorpayX people:view snapshot against the local
 * `hr_employee_onboarding` draft field-by-field. Produces a stable list of
 * diffs the Stage 5 UI renders as a checklist. All comparisons happen
 * client-side — no I/O here.
 *
 * Rules:
 *  - Trim + case-insensitive for names/emails.
 *  - Digit-only for phone (last 10) and PAN uppercased.
 *  - ISO-date normalize for DOB / DOJ (RazorpayX returns dd/mm/yyyy).
 *  - Numeric equal for CTC (allow 1-rupee rounding).
 *  - Empty on either side => `missing_erp` / `missing_rp` (still blocks
 *    unless the operator overrides that row).
 */

export type ReconcileStatus = "match" | "mismatch" | "missing_erp" | "missing_rp";

export interface ReconcileDiff {
  field: string;
  label: string;
  erp: string;
  razorpay: string;
  status: ReconcileStatus;
  /** Value the "Use RazorpayX value" button should write back to ERP. */
  rpRawValue?: string | number | null;
}

const isEmpty = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const norm = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const ci = (v: unknown) => norm(v).toLowerCase();
const digits = (v: unknown) => norm(v).replace(/\D/g, "");
const last10 = (v: unknown) => digits(v).slice(-10);
const upper = (v: unknown) => norm(v).toUpperCase();

/** RazorpayX returns dd/mm/yyyy; convert to yyyy-mm-dd for compare + display. */
const rpDateToIso = (v: unknown): string => {
  const s = norm(v);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return s;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface ErpInput {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  date_of_joining?: string | null;
  ctc?: number | string | null;
  documents?: any;
  bank?: {
    account_number?: string | null;
    ifsc_code?: string | null;
    account_holder?: string | null;
  } | null;
}

/**
 * Reconcile the ERP onboarding draft against a RazorpayX snapshot.
 * `rp` is the raw people:view body returned by the proxy.
 */
export function reconcileOnboarding(erp: ErpInput, rp: any): ReconcileDiff[] {
  const docs = (erp.documents as any) || {};
  const erpPan = upper(docs.pan?.value);
  const erpUan = digits(docs.uan?.value);

  const rpBank = (rp?.bank_account ?? rp?.bank_details ?? {}) as any;

  const rows: Array<Omit<ReconcileDiff, "status"> & {
    compareErp: string;
    compareRp: string;
  }> = [
    {
      field: "first_name",
      label: "First name",
      erp: norm(erp.first_name),
      razorpay: norm(rp?.first_name),
      rpRawValue: rp?.first_name ?? null,
      compareErp: ci(erp.first_name),
      compareRp: ci(rp?.first_name),
    },
    {
      field: "last_name",
      label: "Last name",
      erp: norm(erp.last_name),
      razorpay: norm(rp?.last_name),
      rpRawValue: rp?.last_name ?? null,
      compareErp: ci(erp.last_name),
      compareRp: ci(rp?.last_name),
    },
    {
      field: "email",
      label: "Email",
      erp: norm(erp.email),
      razorpay: norm(rp?.email ?? rp?.work_email ?? rp?.personal_email),
      rpRawValue: rp?.email ?? rp?.work_email ?? rp?.personal_email ?? null,
      compareErp: ci(erp.email),
      compareRp: ci(rp?.email ?? rp?.work_email ?? rp?.personal_email),
    },
    {
      field: "phone",
      label: "Phone",
      erp: norm(erp.phone),
      razorpay: norm(rp?.contact_number ?? rp?.phone ?? rp?.mobile_number),
      rpRawValue: rp?.contact_number ?? rp?.phone ?? rp?.mobile_number ?? null,
      compareErp: last10(erp.phone),
      compareRp: last10(rp?.contact_number ?? rp?.phone ?? rp?.mobile_number),
    },
    {
      field: "gender",
      label: "Gender",
      erp: norm(erp.gender),
      razorpay: norm(rp?.gender),
      rpRawValue: rp?.gender ?? null,
      compareErp: ci(erp.gender),
      compareRp: ci(rp?.gender),
    },
    {
      field: "date_of_birth",
      label: "Date of birth",
      erp: norm(erp.date_of_birth),
      razorpay: rpDateToIso(rp?.dob ?? rp?.date_of_birth),
      rpRawValue: rpDateToIso(rp?.dob ?? rp?.date_of_birth) || null,
      compareErp: norm(erp.date_of_birth),
      compareRp: rpDateToIso(rp?.dob ?? rp?.date_of_birth),
    },
    {
      field: "date_of_joining",
      label: "Date of joining",
      erp: norm(erp.date_of_joining),
      razorpay: rpDateToIso(rp?.hire_date ?? rp?.date_of_joining),
      rpRawValue: rpDateToIso(rp?.hire_date ?? rp?.date_of_joining) || null,
      compareErp: norm(erp.date_of_joining),
      compareRp: rpDateToIso(rp?.hire_date ?? rp?.date_of_joining),
    },
    {
      field: "ctc",
      label: "Annual CTC (₹)",
      erp: num(erp.ctc) != null ? String(num(erp.ctc)) : "",
      razorpay: num(rp?.annual_ctc ?? rp?.ctc) != null ? String(num(rp?.annual_ctc ?? rp?.ctc)) : "",
      rpRawValue: num(rp?.annual_ctc ?? rp?.ctc),
      compareErp: (() => { const n = num(erp.ctc); return n == null ? "" : String(Math.round(n)); })(),
      compareRp: (() => { const n = num(rp?.annual_ctc ?? rp?.ctc); return n == null ? "" : String(Math.round(n)); })(),
    },
    {
      field: "pan",
      label: "PAN",
      erp: erpPan,
      razorpay: upper(rp?.pan ?? rp?.pan_number),
      rpRawValue: upper(rp?.pan ?? rp?.pan_number) || null,
      compareErp: erpPan,
      compareRp: upper(rp?.pan ?? rp?.pan_number),
    },
    {
      field: "uan",
      label: "UAN (PF)",
      erp: erpUan,
      razorpay: digits(rp?.uan ?? rp?.uan_number),
      rpRawValue: digits(rp?.uan ?? rp?.uan_number) || null,
      compareErp: erpUan,
      compareRp: digits(rp?.uan ?? rp?.uan_number),
    },
    {
      field: "bank_account_number",
      label: "Bank account number",
      erp: norm(erp.bank?.account_number),
      razorpay: norm(rpBank?.account_number),
      rpRawValue: rpBank?.account_number ?? null,
      compareErp: digits(erp.bank?.account_number),
      compareRp: digits(rpBank?.account_number),
    },
    {
      field: "bank_ifsc_code",
      label: "Bank IFSC",
      erp: upper(erp.bank?.ifsc_code),
      razorpay: upper(rpBank?.ifsc ?? rpBank?.ifsc_code),
      rpRawValue: upper(rpBank?.ifsc ?? rpBank?.ifsc_code) || null,
      compareErp: upper(erp.bank?.ifsc_code),
      compareRp: upper(rpBank?.ifsc ?? rpBank?.ifsc_code),
    },
    {
      field: "bank_account_holder",
      label: "Bank account holder",
      erp: norm(erp.bank?.account_holder),
      razorpay: norm(rpBank?.name ?? rpBank?.account_holder),
      rpRawValue: rpBank?.name ?? rpBank?.account_holder ?? null,
      compareErp: ci(erp.bank?.account_holder),
      compareRp: ci(rpBank?.name ?? rpBank?.account_holder),
    },
  ];

  return rows.map(r => {
    let status: ReconcileStatus;
    const erpEmpty = isEmpty(r.compareErp);
    const rpEmpty = isEmpty(r.compareRp);
    if (erpEmpty && rpEmpty) status = "match"; // both blank = nothing to reconcile
    else if (erpEmpty) status = "missing_erp";
    else if (rpEmpty) status = "missing_rp";
    else status = r.compareErp === r.compareRp ? "match" : "mismatch";
    const { compareErp, compareRp, ...rest } = r;
    return { ...rest, status };
  });
}

export function isReconciled(
  diffs: ReconcileDiff[],
  overrides: Record<string, boolean>,
): boolean {
  return diffs.every(d => d.status === "match" || overrides[d.field]);
}

export function unresolvedCount(
  diffs: ReconcileDiff[],
  overrides: Record<string, boolean>,
): number {
  return diffs.filter(d => d.status !== "match" && !overrides[d.field]).length;
}
