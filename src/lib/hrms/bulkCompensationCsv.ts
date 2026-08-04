import { supabase } from "@/integrations/supabase/client";
import { additionTypeCode } from "@/lib/hrms/additionType";

/**
 * Bulk compensation change CSV — template building, parsing, validation and apply.
 *
 * Rule enforced everywhere: a row whose value columns are ALL blank means
 * "no change for this employee" and is skipped entirely.
 */

export type BulkMode = "recurring" | "addition" | "deduction" | "one_time" | "statutory";

export interface EmployeeLite {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  badge_id?: string | null;
  is_active?: boolean | null;
  total_salary?: number | null;
  basic_salary?: number | null;
  pf_enabled?: boolean | null;
  esi_enabled?: boolean | null;
  pt_enabled?: boolean | null;
}

const ID_COLS = ["badge_id", "employee_name"];

export const MODE_COLUMNS: Record<BulkMode, string[]> = {
  recurring: ["new_total_ctc", "new_basic", "revision_type", "effective_from", "reason"],
  addition: ["amount", "label", "period_month", "addition_kind", "taxable", "notes"],
  deduction: ["amount", "label", "period_month", "notes"],
  one_time: ["amount", "type", "paid_on", "reason", "notes"],
  statutory: ["pf", "esi", "pt", "effective_from", "reason"],
};

export const MODE_LABEL: Record<BulkMode, string> = {
  recurring: "CTC change",
  addition: "Addition",
  deduction: "Deduction",
  one_time: "One-time payout",
  statutory: "Statutory toggle",
};

const MODE_HINT: Record<BulkMode, string> = {
  recurring:
    "new_total_ctc = new annual CTC (number). new_basic optional. revision_type = increment | promotion | correction | demotion (reason mandatory for promotion/demotion). effective_from = YYYY-MM-DD.",
  addition:
    "amount = number > 0. label appears on the payslip. period_month = YYYY-MM (current or future). addition_kind = bonus | arrears | reimbursement | other. taxable = yes | no.",
  deduction:
    "amount = number > 0. label appears on the payslip. period_month = YYYY-MM (current or future).",
  one_time:
    "amount = number > 0. type = bonus | performance_incentive | retention_bonus | special_allowance | ad_hoc | one_time_correction. paid_on = YYYY-MM-DD. reason becomes the pay-head name on RazorpayX.",
  statutory:
    "pf / esi / pt = yes | no | blank (blank keeps the current value). effective_from = YYYY-MM-DD. reason mandatory.",
};

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function buildTemplateCsv(mode: BulkMode, employees: EmployeeLite[]): string {
  const cols = [...ID_COLS, ...MODE_COLUMNS[mode]];
  const lines: string[] = [];
  lines.push(
    esc(
      `# ${MODE_LABEL[mode]} bulk template — fill ONLY the rows you want to change. A row left blank means no change. Do not edit badge_id. ${MODE_HINT[mode]}`,
    ),
  );
  lines.push(cols.join(","));
  const sorted = [...employees].sort((a, b) => {
    const act = Number(!!b.is_active) - Number(!!a.is_active);
    if (act) return act;
    const na = Number(String(a.badge_id ?? "").replace(/\D/g, "") || 1e9);
    const nb = Number(String(b.badge_id ?? "").replace(/\D/g, "") || 1e9);
    return na - nb;
  });
  for (const e of sorted) {
    const name = [e.first_name, e.last_name].filter(Boolean).join(" ");
    const row = [esc(String(e.badge_id ?? "")), esc(name + (e.is_active ? "" : " (Separated)"))];
    for (let i = 0; i < MODE_COLUMNS[mode].length; i++) row.push("");
    lines.push(row.join(","));
  }
  return "\ufeff" + lines.join("\n") + "\n";
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Tolerant CSV parser (quotes, BOM, CRLF, blank lines, leading # comment rows). */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const clean = text.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQ) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQ = true;
    else if (c === ",") {
      cur.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      cur.push(field);
      field = "";
      rows.push(cur);
      cur = [];
    } else field += c;
  }
  cur.push(field);
  if (cur.some((f) => f !== "")) rows.push(cur);

  const usable = rows.filter(
    (r) => r.some((f) => String(f).trim() !== "") && !String(r[0] ?? "").trim().startsWith("#"),
  );
  const header = (usable.shift() ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return { header, rows: usable };
}

export type RowStatus = "apply" | "skip" | "error";

export interface ParsedRow {
  line: number;
  badge_id: string;
  employee_name: string;
  employee?: EmployeeLite;
  values: Record<string, string>;
  status: RowStatus;
  error?: string;
  summary?: string;
}

const yn = (v: string): boolean | null => {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (["yes", "y", "true", "1", "enrolled"].includes(s)) return true;
  if (["no", "n", "false", "0", "exempt"].includes(s)) return false;
  return null;
};
const isYnValid = (v: string) => !v.trim() || yn(v) !== null;
const num = (v: string) => Number(String(v).replace(/[₹,\s]/g, ""));
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) && !isNaN(Date.parse(v.trim()));
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function validateRows(
  mode: BulkMode,
  header: string[],
  rows: string[][],
  employees: EmployeeLite[],
  razorpayMap: Record<string, string>,
): ParsedRow[] {
  const byBadge = new Map<string, EmployeeLite>();
  employees.forEach((e) => {
    const k = String(e.badge_id ?? "").trim().toLowerCase();
    if (k) byBadge.set(k, e);
  });

  const cols = MODE_COLUMNS[mode];
  const idxOf = (name: string) => header.indexOf(name);

  return rows.map((r, i) => {
    const get = (c: string) => String(r[idxOf(c)] ?? "").trim();
    const badge = get("badge_id");
    const values: Record<string, string> = {};
    cols.forEach((c) => (values[c] = get(c)));
    const out: ParsedRow = {
      line: i + 2,
      badge_id: badge,
      employee_name: get("employee_name"),
      values,
      status: "skip",
    };

    const filled = cols.filter((c) => values[c] !== "");
    if (filled.length === 0) return out; // blank row → no change

    const emp = byBadge.get(badge.toLowerCase());
    if (!badge) return { ...out, status: "error", error: "Missing badge_id" };
    if (!emp) return { ...out, status: "error", error: `No employee with badge ID ${badge}` };
    out.employee = emp;

    const err = (m: string): ParsedRow => ({ ...out, status: "error", error: m });

    if (mode === "recurring") {
      const total = num(values.new_total_ctc);
      if (!values.new_total_ctc) return err("new_total_ctc is required");
      if (!isFinite(total) || total <= 0) return err("new_total_ctc must be a positive number");
      if (values.new_basic && (!isFinite(num(values.new_basic)) || num(values.new_basic) < 0))
        return err("new_basic must be a number");
      const type = (values.revision_type || "increment").toLowerCase();
      if (!["increment", "promotion", "correction", "demotion"].includes(type))
        return err(`revision_type "${values.revision_type}" is not valid`);
      if (values.effective_from && !isDate(values.effective_from))
        return err("effective_from must be YYYY-MM-DD");
      if ((type === "promotion" || type === "demotion") && !values.reason)
        return err("reason is mandatory for promotion / demotion");
      out.status = "apply";
      out.summary = `CTC ${inr(Number(emp.total_salary || 0))} → ${inr(total)} · ${type}`;
      return out;
    }

    if (mode === "addition" || mode === "deduction") {
      const amt = num(values.amount);
      if (!values.amount) return err("amount is required");
      if (!isFinite(amt) || amt <= 0) return err("amount must be a positive number");
      if (!values.label) return err("label is required — it appears on the payslip");
      if (!/^\d{4}-\d{2}$/.test(values.period_month)) return err("period_month must be YYYY-MM");
      const [y, m] = values.period_month.split("-").map(Number);
      if (new Date(y, m - 1, 1) < monthStart(new Date()))
        return err("period_month cannot be earlier than the current month");
      if (mode === "addition") {
        const kind = (values.addition_kind || "bonus").toLowerCase();
        if (!["bonus", "arrears", "reimbursement", "other"].includes(kind))
          return err(`addition_kind "${values.addition_kind}" is not valid`);
        if (!isYnValid(values.taxable)) return err("taxable must be yes or no");
      }
      if (!razorpayMap[emp.id]) return err("Employee is not linked to RazorpayX — link them from Data Health first");
      out.status = "apply";
      out.summary = `${inr(Math.round(amt))} · ${values.label} · ${values.period_month}`;
      return out;
    }

    if (mode === "one_time") {
      const amt = num(values.amount);
      if (!values.amount) return err("amount is required");
      if (!isFinite(amt) || amt <= 0) return err("amount must be a positive number");
      const type = (values.type || "bonus").toLowerCase();
      if (
        ![
          "bonus",
          "performance_incentive",
          "retention_bonus",
          "special_allowance",
          "ad_hoc",
          "one_time_correction",
        ].includes(type)
      )
        return err(`type "${values.type}" is not valid`);
      if (values.paid_on && !isDate(values.paid_on)) return err("paid_on must be YYYY-MM-DD");
      out.status = "apply";
      out.summary = `${inr(amt)} · ${type} · paid ${values.paid_on || "today"}`;
      return out;
    }

    // statutory
    for (const f of ["pf", "esi", "pt"]) if (!isYnValid(values[f])) return err(`${f} must be yes, no or blank`);
    if (!values.reason) return err("reason is mandatory for a statutory enrollment change");
    if (values.effective_from && !isDate(values.effective_from))
      return err("effective_from must be YYYY-MM-DD");
    const cur: Record<string, boolean | null | undefined> = {
      pf: emp.pf_enabled,
      esi: emp.esi_enabled,
      pt: emp.pt_enabled,
    };
    const unknown = (["pf", "esi", "pt"] as const).filter(
      (f) => yn(values[f]) === null && (cur[f] ?? null) === null,
    );
    if (unknown.length)
      return err(
        `Current ${unknown.join(", ").toUpperCase()} enrollment is unknown — set it explicitly to yes or no`,
      );
    out.status = "apply";
    out.summary = (["pf", "esi", "pt"] as const)
      .map((f) => {
        const v = yn(values[f]);
        return `${f.toUpperCase()}: ${v === null ? "unchanged" : v ? "Enrolled" : "Exempt"}`;
      })
      .join(" · ");
    return out;
  });
}

export async function fetchRazorpayMap(employeeIds: string[]): Promise<Record<string, string>> {
  if (!employeeIds.length) return {};
  const { data, error } = await (supabase as any)
    .from("hr_razorpay_employee_map")
    .select("hr_employee_id, razorpay_employee_id");
  if (error) throw error;
  const map: Record<string, string> = {};
  (data || []).forEach((r: any) => {
    if (r.hr_employee_id && r.razorpay_employee_id) map[r.hr_employee_id] = String(r.razorpay_employee_id);
  });
  return map;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Applies ONE validated row. Mirrors exactly the single-entry paths used by
 * ReviseSalaryDialog so bulk and single can never diverge.
 */
export async function applyCompensationRow(
  mode: BulkMode,
  row: ParsedRow,
  ctx: { approvedBy: string; userId?: string | null; razorpayMap: Record<string, string> },
): Promise<{ scheduled?: boolean; expectedTotal?: number }> {
  const emp = row.employee!;
  const v = row.values;

  if (mode === "recurring") {
    const total = num(v.new_total_ctc);
    const basic = v.new_basic ? num(v.new_basic) : null;
    const eff = v.effective_from ? v.effective_from.trim() : ymd(new Date());
    const { data, error } = await (supabase as any).rpc("apply_salary_revision", {
      p_employee_id: emp.id,
      p_new_basic: basic,
      p_new_total: total,
      p_revision_type: (v.revision_type || "increment").toLowerCase(),
      p_reason: v.reason || null,
      p_effective_from: eff,
      p_approved_by: ctx.approvedBy,
    });
    if (error) throw error;
    return { scheduled: data?.status === "SCHEDULED", expectedTotal: total };
  }

  if (mode === "addition" || mode === "deduction") {
    const amt = Math.round(num(v.amount));
    const period = `${v.period_month}-01`;
    const table = mode === "addition" ? "hr_payroll_input_additions" : "hr_payroll_input_deductions";
    const payload: any = {
      hr_employee_id: emp.id,
      razorpay_employee_id: ctx.razorpayMap[emp.id],
      period_month: period,
      label: v.label.trim().slice(0, 80),
      amount: amt,
      created_by: ctx.userId ?? null,
    };
    if (mode === "addition") {
      payload.addition_type = additionTypeCode((v.addition_kind || "bonus").toLowerCase());
      payload.taxable = yn(v.taxable) ?? true;
    }
    const { data: input, error: inputErr } = await (supabase as any)
      .from(table)
      .insert(payload)
      .select("id")
      .single();
    if (inputErr) throw inputErr;

    const { error } = await (supabase as any).from("hr_salary_revisions").insert({
      employee_id: emp.id,
      revision_type: mode === "addition" ? "payroll_addition" : "payroll_deduction",
      one_time_amount: amt,
      payout_month: period,
      effective_from: period,
      revision_reason: v.label.trim() || null,
      notes: v.notes || null,
      approved_by: ctx.approvedBy,
      status: "APPLIED",
      payroll_input_id: input?.id ?? null,
      payroll_input_kind: mode,
    });
    if (error) throw error;
    return {};
  }

  if (mode === "one_time") {
    const amt = num(v.amount);
    const paidOn = v.paid_on ? v.paid_on.trim() : ymd(new Date());
    const period = `${paidOn.slice(0, 7)}-01`;
    const { error } = await (supabase as any).from("hr_salary_revisions").insert({
      employee_id: emp.id,
      revision_type: (v.type || "bonus").toLowerCase(),
      one_time_amount: amt,
      payout_month: period,
      effective_from: paidOn,
      payout_paid_on: paidOn,
      payout_channel: "outside_payroll",
      revision_reason: v.reason || null,
      pay_head_label: v.reason?.trim() || null,
      notes: v.notes || null,
      approved_by: ctx.approvedBy,
      status: "APPLIED",
    });
    if (error) throw error;
    return {};
  }

  // statutory
  const finalPf = yn(v.pf) ?? (emp.pf_enabled as boolean);
  const finalEsi = yn(v.esi) ?? (emp.esi_enabled as boolean);
  const finalPt = yn(v.pt) ?? (emp.pt_enabled as boolean);
  const eff = v.effective_from ? v.effective_from.trim() : ymd(new Date());
  const { data, error } = await (supabase as any).rpc("apply_statutory_revision", {
    p_employee_id: emp.id,
    p_pf_enabled: finalPf,
    p_esi_enabled: finalEsi,
    p_pt_enabled: finalPt,
    p_effective_from: eff,
    p_reason: v.reason,
    p_approved_by: ctx.approvedBy,
  });
  if (error) throw error;
  return { scheduled: data?.status === "SCHEDULED" };
}

export function buildFailureCsv(mode: BulkMode, rows: { row: ParsedRow; error: string }[]): string {
  const cols = [...ID_COLS, ...MODE_COLUMNS[mode], "error"];
  const lines = [cols.join(",")];
  rows.forEach(({ row, error }) => {
    lines.push(
      [
        esc(row.badge_id),
        esc(row.employee_name),
        ...MODE_COLUMNS[mode].map((c) => esc(row.values[c] ?? "")),
        esc(error),
      ].join(","),
    );
  });
  return "\ufeff" + lines.join("\n") + "\n";
}
