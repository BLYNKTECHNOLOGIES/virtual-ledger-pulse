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

const pick = (...vals: unknown[]) => vals.map(norm).find(Boolean) || "";

const titleToken = (v: unknown) => ci(v).replace(/[.\s_-]+/g, "");

const inferGenderFromTitle = (v: unknown) => {
  const token = titleToken(v);
  if (!token) return "";
  if (["mr", "mister", "master", "shri", "sri", "dmd"].includes(token)) return "male";
  if (["mrs", "ms", "miss", "misses", "smt", "kumari"].includes(token)) return "female";
  return "";
};

const isGenderTitle = (v: unknown) => !!inferGenderFromTitle(v);

const splitName = (value: unknown) => {
  const s = norm(value).replace(/\s+/g, " ");
  if (!s) return { first: "", last: "" };
  const parts = s.split(" ");
  return {
    first: parts[0] || "",
    last: parts.slice(1).join(" "),
  };
};

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
  probation_end_date?: string | null;
  employee_type?: string | null;
  job_role?: string | null;
  
  ctc?: number | string | null;
  documents?: any;
  bank?: {
    account_number?: string | null;
    ifsc_code?: string | null;
    account_holder?: string | null;
  } | null;
  /**
   * badge_id of the manager selected in the ERP onboarding form. We compare
   * this against the RazorpayX `manager-employee-id` (which is that manager's
   * RazorpayX employee_id === HRMS badge_id under the Unified ID doctrine) to
   * infer whether the reporting manager selection matches on both sides —
   * without ever asking the operator to type a manager employee-id.
   */
  reporting_manager_badge_id?: string | null;
  /** Human-readable name of the selected manager, for the diff display. */
  reporting_manager_label?: string | null;
}


/**
 * Reconcile the ERP onboarding draft against a RazorpayX snapshot.
 * `rp` is the raw people:view body returned by the proxy.
 */
export function reconcileOnboarding(erp: ErpInput, rp: any): ReconcileDiff[] {
  const docs = (erp.documents as any) || {};
  const erpPan = upper(docs.pan?.value);
  const erpUan = digits(docs.uan?.value);

  const rpBank = (rp?.bank_account ?? rp?.bank_details ?? rp?.bank_information ?? rp?.bank ?? {}) as any;
  const rpName = splitName(rp?.name);
  const rpFirstName = pick(rp?.first_name, rp?.firstName, rp?.["first-name"], rpName.first);
  const rpLastName = pick(rp?.last_name, rp?.lastName, rp?.["last-name"], rpName.last);
  const rpEmail = pick(rp?.email, rp?.work_email, rp?.personal_email, rp?.["work-email"], rp?.["personal-email"]);
  const rpPhone = pick(
    rp?.contact_number,
    rp?.contactNumber,
    rp?.phone_number,
    rp?.phoneNumber,
    rp?.phone,
    rp?.mobile_number,
    rp?.mobileNumber,
    rp?.["phone-number"],
    rp?.["mobile-number"],
  );
  const rpDob = rpDateToIso(pick(rp?.dob, rp?.date_of_birth, rp?.dateOfBirth, rp?.["date-of-birth"]));
  const rpDoj = rpDateToIso(pick(
    rp?.hire_date,
    rp?.hiring_date,
    rp?.date_of_hiring,
    rp?.date_of_joining,
    rp?.joining_date,
    rp?.["date-of-hiring"],
    rp?.["date-of-joining"],
  ));
  const rpProbationEnd = rpDateToIso(pick(
    rp?.probation_end_date,
    rp?.probationEndDate,
    rp?.["probation-end-date"],
    rp?.probation?.end_date,
  ));
  const rpEmployeeType = ci(pick(
    rp?.employee_type,
    rp?.employeeType,
    rp?.["employee-type"],
    rp?.employment_type,
    rp?.["employment-type"],
  ));
  const rpTitle = pick(rp?.title, rp?.salutation, rp?.["name-title"], rp?.name_title);
  const rpJobRole = pick(
    rp?.job_title,
    rp?.jobTitle,
    rp?.["job-title"],
    rp?.designation,
    isGenderTitle(rpTitle) ? "" : rp?.title,
  );
  const rpPan = upper(pick(rp?.pan, rp?.pan_number, rp?.panNumber, rp?.["pan-number"]));
  const rpUan = digits(pick(rp?.uan, rp?.uan_number, rp?.uanNumber, rp?.["uan-number"]));

  const rpBankAccount = pick(rpBank?.account_number, rpBank?.accountNumber, rp?.account_number, rp?.bank_account_number, rp?.["bank-account-number"]);
  const rpBankIfsc = upper(pick(rpBank?.ifsc, rpBank?.ifsc_code, rpBank?.ifscCode, rp?.ifsc, rp?.ifsc_code, rp?.bank_ifsc, rp?.["bank-ifsc"]));
  const rpBankHolder = pick(
    rpBank?.name,
    rpBank?.account_holder,
    rpBank?.accountHolder,
    rpBank?.account_holder_name,
    rp?.bank_account_holder,
    rp?.bank_account_holder_name,
    rp?.["bank-account-holder-name"],
  );

  // Manager identity: RazorpayX exposes the manager's employee_id under
  // `manager-employee-id` (or dotted variants / `manager.id`). Under the
  // Unified ID doctrine that RazorpayX ID is identical to the manager's HRMS
  // badge_id, so a straight digits-only compare tells us whether the manager
  // chosen in the ERP dropdown matches the one set on RazorpayX — no
  // free-text "manager employee ID" field required from the operator.
  const rpManagerId = digits(pick(
    rp?.["manager-employee-id"],
    rp?.manager_employee_id,
    rp?.managerEmployeeId,
    rp?.manager?.id,
    rp?.manager?.employee_id,
    rp?.manager?.["employee-id"],
  ));
  const erpManagerBadge = digits(erp.reporting_manager_badge_id);
  const erpManagerLabel = norm(erp.reporting_manager_label) || (erpManagerBadge ? `Badge ${erpManagerBadge}` : "");

  const rows: Array<Omit<ReconcileDiff, "status"> & {
    compareErp: string;
    compareRp: string;
  }> = [
    {
      field: "first_name",
      label: "First name",
      erp: norm(erp.first_name),
      razorpay: rpFirstName,
      rpRawValue: rpFirstName || null,
      compareErp: ci(erp.first_name),
      compareRp: ci(rpFirstName),
    },
    {
      field: "last_name",
      label: "Last name",
      erp: norm(erp.last_name),
      razorpay: rpLastName,
      rpRawValue: rpLastName || null,
      compareErp: ci(erp.last_name),
      compareRp: ci(rpLastName),
    },
    {
      field: "email",
      label: "Email",
      erp: norm(erp.email),
      razorpay: rpEmail,
      rpRawValue: rpEmail || null,
      compareErp: ci(erp.email),
      compareRp: ci(rpEmail),
    },
    {
      field: "phone",
      label: "Phone",
      erp: norm(erp.phone),
      razorpay: rpPhone,
      rpRawValue: rpPhone || null,
      compareErp: last10(erp.phone),
      compareRp: last10(rpPhone),
    },
    (() => {
      // RazorpayX exposes gender under several key spellings depending on
      // whether the record came from Payroll vs the newer HRMS module. We
      // also fall back to the `title`/`salutation` prefix. For this tenant,
      // RazorpayX has emitted `title: "Dmd"` as the only gender-bearing field
      // for a male employee, with no explicit `gender` key in people:view.
      const rawGender = pick(
        rp?.gender,
        rp?.sex,
        rp?.gender_identity,
        rp?.["gender-identity"],
        rp?.personal_details?.gender,
        rp?.["personal-details"]?.gender,
      );
      const inferred = rawGender || inferGenderFromTitle(rpTitle);
      const display = norm(inferred);
      return {
        field: "gender",
        label: "Gender",
        erp: norm(erp.gender),
        razorpay: display,
        rpRawValue: inferred || null,
        compareErp: ci(erp.gender),
        compareRp: ci(inferred),
      };
    })(),
    {
      field: "date_of_birth",
      label: "Date of birth",
      erp: norm(erp.date_of_birth),
      razorpay: rpDob,
      rpRawValue: rpDob || null,
      compareErp: norm(erp.date_of_birth),
      compareRp: rpDob,
    },
    {
      field: "date_of_joining",
      label: "Date of joining",
      erp: norm(erp.date_of_joining),
      razorpay: rpDoj,
      rpRawValue: rpDoj || null,
      compareErp: norm(erp.date_of_joining),
      compareRp: rpDoj,
    },
    {
      field: "probation_end_date",
      label: "Probation end date",
      erp: norm(erp.probation_end_date),
      razorpay: rpProbationEnd,
      rpRawValue: rpProbationEnd || null,
      compareErp: norm(erp.probation_end_date),
      compareRp: rpProbationEnd,
    },
    {
      field: "employee_type",
      label: "Employee type",
      erp: norm(erp.employee_type),
      razorpay: rpEmployeeType,
      rpRawValue: rpEmployeeType || null,
      compareErp: ci(erp.employee_type),
      compareRp: rpEmployeeType,
    },
    {
      field: "job_role",
      label: "Job title",
      erp: norm(erp.job_role),
      razorpay: rpJobRole,
      rpRawValue: rpJobRole || null,
      compareErp: ci(erp.job_role),
      compareRp: ci(rpJobRole),
    },
    {
      field: "tax_regime",
      label: "Tax regime",
      erp: norm(erp.tax_regime),
      razorpay: rpTaxRegime,
      rpRawValue: rpTaxRegime || null,
      compareErp: ci(erp.tax_regime).replace(/[^a-z]/g, ""),
      compareRp: rpTaxRegime,
    },

    (() => {
      const rpCtcRaw =
        rp?.annual_ctc ??
        rp?.__salary?.annual_ctc ??
        rp?.ctc ??
        rp?.["annual-ctc"] ??
        rp?.["ctc-annual"] ??
        (rp?.__salary?.monthly_gross ? rp.__salary.monthly_gross * 12 : null);
      const rpCtc = num(rpCtcRaw);
      return {
        field: "ctc",
        label: "Annual CTC (₹)",
        erp: num(erp.ctc) != null ? String(num(erp.ctc)) : "",
        razorpay: rpCtc != null ? String(rpCtc) : "",
        rpRawValue: rpCtc,
        compareErp: (() => { const n = num(erp.ctc); return n == null ? "" : String(Math.round(n)); })(),
        compareRp: rpCtc == null ? "" : String(Math.round(rpCtc)),
      };
    })(),
    {
      field: "pan",
      label: "PAN",
      erp: erpPan,
      razorpay: rpPan,
      rpRawValue: rpPan || null,
      compareErp: erpPan,
      compareRp: rpPan,
    },
    {
      field: "uan",
      label: "UAN (PF)",
      erp: erpUan,
      razorpay: rpUan,
      rpRawValue: rpUan || null,
      compareErp: erpUan,
      compareRp: rpUan,
    },
    {
      field: "bank_account_number",
      label: "Bank account number",
      erp: norm(erp.bank?.account_number),
      razorpay: rpBankAccount,
      rpRawValue: rpBankAccount || null,
      compareErp: digits(erp.bank?.account_number),
      compareRp: digits(rpBankAccount),
    },
    {
      field: "bank_ifsc_code",
      label: "Bank IFSC",
      erp: upper(erp.bank?.ifsc_code),
      razorpay: rpBankIfsc,
      rpRawValue: rpBankIfsc || null,
      compareErp: upper(erp.bank?.ifsc_code),
      compareRp: rpBankIfsc,
    },
    {
      field: "bank_account_holder",
      label: "Bank account holder",
      erp: norm(erp.bank?.account_holder),
      razorpay: rpBankHolder,
      rpRawValue: rpBankHolder || null,
      compareErp: ci(erp.bank?.account_holder),
      compareRp: ci(rpBankHolder),
    },
    {
      field: "reporting_manager",
      label: "Reporting manager",
      erp: erpManagerLabel + (erpManagerBadge ? ` (#${erpManagerBadge})` : ""),
      razorpay: rpManagerId ? `#${rpManagerId}` : "",
      rpRawValue: rpManagerId || null,
      compareErp: erpManagerBadge,
      compareRp: rpManagerId,
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
