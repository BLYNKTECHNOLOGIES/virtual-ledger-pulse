/**
 * RazorpayX "Bulk Additions/Deductions/Loss of Pay" sheet — manual-upload
 * fallback while the payroll API refuses additions. Built from exactly the
 * unpushed Step 6 lines; any money the verification pack shows as "Not staged"
 * blocks the download so nothing is silently missed.
 */
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { buildVerificationPack } from "@/lib/hrms/payrollVerificationPack";

/** Exact Component Library names (case-sensitive), created by the owner 2026-10-06. */
const LIB_ADDITIONS = [
  "Comp-off Encashment", "Salary Arrears", "F&F Settlement Dues", "Leave Encashment", "Salary Advance Payout",
  "Security Deposit Refund", "Recovery Refund", "Performance Bonus", "Performance Linked Incentive", "Overtime",
  "Joining Bonus", "Retention Bonus", "Referral Bonus", "Festival Bonus", "Employee of the Month Award",
  "Night Shift Allowance", "Special Allowance Ad Hoc", "Correction", "Reimbursement", "Travel Reimbursement",
  "Mobile Internet Reimbursement", "ESIC Reimbursement", "Legal Fees Reimbursement", "Employee Engagement",
] as const;
const LIB_DEDUCTIONS = [
  "Loss of Pay", "Loan Repayment", "Advance Salary Recovery", "Security Deposit", "Wrong Payment Recovery",
  "F&F Recovery", "Salary Arrears Recovery", "Notice Period Recovery", "Asset Damage Recovery", "KPI Loss",
  "Penalty", "Canteen Deduction", "Correction Recovery",
] as const;
export const LOP_COMPONENT = "Loss of Pay | Deduction";
export const RZP_BULK_COMPONENTS = [
  ...LIB_ADDITIONS.map((n) => `${n} | Addition`),
  ...LIB_DEDUCTIONS.map((n) => `${n} | Deduction`),
];

const ADD_NAMES = new Set<string>(LIB_ADDITIONS);
const DED_NAMES = new Set<string>(LIB_DEDUCTIONS);
export const DEDUCTION_COMPONENT_NAMES = [...DED_NAMES];

const n2 = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

function defaultAdditionName(r: any): string | null {
  if (r.razorpay_label && ADD_NAMES.has(r.razorpay_label)) return r.razorpay_label;
  const s = String(r.source ?? "").toLowerCase();
  const l = String(r.label ?? "").toLowerCase();
  if (s === "auto_compoff" || /comp[- ]?off/.test(l)) return "Comp-off Encashment";
  if (s === "fnf_settlement" || /f&f|full and final|fnf/.test(l)) return "F&F Settlement Dues";
  if (/leave encash/.test(l)) return "Leave Encashment";
  if (s === "training_ctc_adjustment" || s === "ctc_transition_adjustment" || /training|part[- ]month|arrear/.test(l)) return "Salary Arrears";
  if (/esic/.test(l) && /reimburs/.test(l)) return "ESIC Reimbursement";
  if (/legal/.test(l)) return "Legal Fees Reimbursement";
  if (/travel|conveyance/.test(l)) return "Travel Reimbursement";
  if (/mobile|internet/.test(l)) return "Mobile Internet Reimbursement";
  if (/reimburs/.test(l)) return "Reimbursement";
  if (/deposit/.test(l)) return "Security Deposit Refund";
  if (/refund/.test(l)) return "Recovery Refund";
  if (/loan|advance/.test(l)) return "Salary Advance Payout";
  if (/incentive|pli/.test(l)) return "Performance Linked Incentive";
  if (/overtime/.test(l)) return "Overtime";
  if (/correction/.test(l)) return "Correction";
  if (/bonus/.test(l)) return "Performance Bonus";
  return null;
}

function defaultDeductionName(r: any): string | null {
  if (r.razorpay_label && DED_NAMES.has(r.razorpay_label)) return r.razorpay_label;
  const l = String(r.label ?? "").toLowerCase();
  const k = String(r.recovery_kind ?? "").toLowerCase();
  const s = String(r.source ?? "").toLowerCase();
  if (/\blop\b|loss of pay|loss-of-pay|absent/.test(l) || s === "auto_lop") return "Loss of Pay";
  if (/notice/.test(l)) return "Notice Period Recovery";
  if (/f&f|fnf|full and final/.test(l) || s === "fnf_settlement") return "F&F Recovery";
  if (/advance/.test(l) || k === "advance") return "Advance Salary Recovery";
  if (/deposit/.test(l) || k === "deposit") return "Security Deposit";
  if (/wrong|error/.test(l) || k === "error") return "Wrong Payment Recovery";
  if (/loan|emi/.test(l) || k === "loan") return "Loan Repayment";
  if (/asset|damage/.test(l)) return "Asset Damage Recovery";
  if (/kpi/.test(l)) return "KPI Loss";
  if (/penalt|late|fine/.test(l) || s.includes("penalt")) return "Penalty";
  if (/canteen|meal/.test(l)) return "Canteen Deduction";
  if (/arrear|training|ctc/.test(l) || s === "ctc_transition_adjustment") return "Salary Arrears Recovery";
  if (/correction|recover/.test(l)) return "Correction Recovery";
  return null;
}

export type BulkRow = { empId: string; badge: string; email: string; name: string; component: string; days: number | null; amount: number | null; sourceIds: { table: "add" | "ded"; id: string }[] };
export type BulkBlock = { name: string; what: string; reason: string };
export type BulkSheet = {
  period: string;
  rows: BulkRow[];
  blocked: BulkBlock[];
  alreadyPushed: { name: string; what: string; amount: number }[];
  totals: { additions: number; deductions: number; lopDeduction: number };
};

export async function buildBulkSheet(period: string): Promise<BulkSheet> {
  const [adds, deds, emps, map, pack] = await Promise.all([
    fetchAllPaginated<any>(() => (supabase as any).from("hr_payroll_input_additions").select("*").eq("period_month", period).order("id")),
    fetchAllPaginated<any>(() => (supabase as any).from("hr_payroll_input_deductions").select("*").eq("period_month", period).order("id")),
    fetchAllPaginated<any>(() => (supabase as any).from("hr_employees").select("id,badge_id,first_name,last_name,email").order("id")),
    fetchAllPaginated<any>(() => (supabase as any).from("hr_razorpay_employee_map").select("hr_employee_id,razorpay_employee_id,last_pull_snapshot").order("hr_employee_id")),
    buildVerificationPack(period),
  ]);
  const emp = new Map(emps.map((e: any) => [e.id, e]));
  const rzp = new Map(map.map((m: any) => [m.hr_employee_id, m.razorpay_employee_id]));
  // RazorpayX matches bulk rows by the email IT holds, not HRMS's — use the last pulled RazorpayX email.
  const rzpEmail = new Map(map.map((m: any) => [m.hr_employee_id, String(m.last_pull_snapshot?.email ?? "").trim()]));
  const nm = (id: string) => { const e: any = emp.get(id); return e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() : id; };

  const blocked: BulkBlock[] = [];
  const alreadyPushed: BulkSheet["alreadyPushed"] = [];
  const grouped = new Map<string, BulkRow>();

  const add = (r: any, table: "add" | "ded", component: string | null) => {
    const what = r.label ?? "";
    if (r.pushed_at) { alreadyPushed.push({ name: nm(r.hr_employee_id), what, amount: n2(r.amount) }); return; }
    const rid = r.razorpay_employee_id ?? rzp.get(r.hr_employee_id);
    if (!rid) return blocked.push({ name: nm(r.hr_employee_id), what, reason: "Not linked to a RazorpayX employee ID" });
    if (!component) return blocked.push({ name: nm(r.hr_employee_id), what, reason: "No allowed RazorpayX name — pick one in Step 6" });
    if (!(n2(r.amount) > 0)) return blocked.push({ name: nm(r.hr_employee_id), what, reason: "Calculated deduction amount is zero or below" });
    const email = rzpEmail.get(r.hr_employee_id) ?? "";
    if (!email) return blocked.push({ name: nm(r.hr_employee_id), what, reason: "RazorpayX email unknown — pull this employee from RazorpayX first" });
    const key = `${r.hr_employee_id}|${component}`;
    const g = grouped.get(key) ?? { empId: r.hr_employee_id, badge: String(rid), email, name: nm(r.hr_employee_id), component, days: null, amount: 0, sourceIds: [] };
    g.amount = n2((g.amount ?? 0) + n2(r.amount));
    g.sourceIds.push({ table, id: r.id });
    grouped.set(key, g);
  };

  for (const r of adds) { const c = defaultAdditionName(r); add(r, "add", c ? `${c} | Addition` : null); }
  for (const r of deds) {
    // The owner requires LOP as its already-calculated rupee deduction, not as
    // days. RazorpayX's exact allowed deduction label for this is Gross pay deduction.
    if (String(r.source) === "auto_lop") add(r, "ded", LOP_COMPONENT);
    else { const c = defaultDeductionName(r); add(r, "ded", c ? `${c} | Deduction` : null); }
  }

  // RazorpayX's add-deduction API stores its amount in the same single "Gross pay
  // deduction" slot that a bulk-sheet "Gross pay deduction" row REPLACES on upload.
  // So for anyone getting a Gross pay deduction row here, earlier API-pushed
  // deductions (loan EMIs pushed directly, or deduction lines pushed via the API)
  // would be wiped — re-include them as their own named rows. (Sushil's ₹6,944,
  // Sep 2026, was lost this way.) Rows without sourceIds are never re-marked.
  const lopEmps = new Set([...grouped.values()].filter((g) => g.component === LOP_COMPONENT).map((g) => g.empId));
  let reinjected = 0;
  if (lopEmps.size) {
    const { data: loanRows } = await (supabase as any).from("hr_loan_repayments")
      .select("id,amount,installment_no,razorpay_pushed_at,hr_loans!inner(employee_id,loan_type)")
      .eq("period_month", period).not("razorpay_pushed_at", "is", null).in("status", ["pushed", "paid"]);
    const apiLines: { empId: string; amount: number; component: string; what: string }[] = [];
    const loanIdsInDeds = new Set(deds.filter((d: any) => d.recovery_kind === "loan").map((d: any) => d.recovery_ref_id));
    for (const l of loanRows ?? []) {
      if (loanIdsInDeds.has(l.id)) continue;
      const adv = /advance/i.test(String(l.hr_loans?.loan_type ?? ""));
      apiLines.push({ empId: l.hr_loans.employee_id, amount: n2(l.amount), component: adv ? "Advance Salary | Deduction" : "Loan Repayment | Deduction", what: `Loan instalment ${l.installment_no}` });
    }
    for (const d of deds) if (d.pushed_at && d.push_channel !== "bulk_sheet" && String(d.source) !== "auto_lop") {
      const c = defaultDeductionName(d) ?? "Recovery";
      apiLines.push({ empId: d.hr_employee_id, amount: n2(d.amount), component: `${c} | Deduction`, what: d.label ?? "" });
    }
    for (const a of apiLines) {
      if (!lopEmps.has(a.empId) || !(a.amount > 0)) continue;
      const rid = rzp.get(a.empId); const email = rzpEmail.get(a.empId) ?? "";
      if (!rid || !email) { blocked.push({ name: nm(a.empId), what: a.what, reason: "Already API-pushed but would be wiped by this sheet's Gross pay deduction — RazorpayX link/email missing" }); continue; }
      const key = `${a.empId}|${a.component}`;
      const g = grouped.get(key) ?? { empId: a.empId, badge: String(rid), email, name: nm(a.empId), component: a.component, days: null, amount: 0, sourceIds: [] };
      g.amount = n2((g.amount ?? 0) + a.amount);
      grouped.set(key, g);
      reinjected = n2(reinjected + a.amount);
      const i = alreadyPushed.findIndex((p) => p.name === nm(a.empId) && p.amount === a.amount);
      if (i >= 0) alreadyPushed.splice(i, 1);
    }
  }

  // Anything the verification pack says is due but not yet staged must be staged first.
  const moneySheet = pack.sheets[1];
  for (const row of moneySheet.rows as any[][]) {
    if (row[11] === "Not staged" && row[1]) {
      const what = String(row[4]);
      const isDraftFnf = /F&F settlement \(draft\)/i.test(what);
      blocked.push({
        name: String(row[1]),
        what,
        reason: isDraftFnf
          ? `Draft and not approved (₹${row[5]}) — submit and confirm the F&F first; approval stages it in Step 6`
          : `Not staged in Step 6 yet (₹${row[5]}) — stage it so it can go in the sheet`,
      });
    }
  }

  const rows = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name) || a.component.localeCompare(b.component));
  const totals = {
    additions: n2(rows.filter((r) => r.component.endsWith("| Addition")).reduce((s, r) => s + (r.amount ?? 0), 0)),
    deductions: n2(rows.filter((r) => r.component.endsWith("| Deduction")).reduce((s, r) => s + (r.amount ?? 0), 0)),
    lopDeduction: n2(rows.filter((r) => r.component === LOP_COMPONENT).reduce((s, r) => s + (r.amount ?? 0), 0)),
  };

  // Cross-check: every staged, unpushed money line counted in the pack is in the sheet.
  const packUnpushed = n2(adds.concat(deds).filter((r: any) => !r.pushed_at).reduce((s: number, r: any) => s + n2(r.amount), 0));
  const blockedAmt = -reinjected; // re-included API-pushed lines are on the sheet but not "unpushed"
  if (!blocked.length && Math.abs(packUnpushed - blockedAmt - (totals.additions + totals.deductions)) > 0.01)
    blocked.push({ name: "—", what: "Totals check", reason: `Sheet totals ₹${n2(totals.additions + totals.deductions)} differ from unpushed Step 6 lines ₹${packUnpushed}` });

  return { period, rows, blocked, alreadyPushed, totals };
}

export function downloadBulkSheet(sheet: BulkSheet) {
  const [y, m] = sheet.period.slice(0, 7).split("-");
  const aoa: any[][] = [
    ["RazorpayX Payroll - Bulk Additions/Deductions/Loss of Pay", null, null, null, null, null, RZP_BULK_COMPONENTS[0]],
    ["Payroll Month", `01/${m}/${y}`, "ADD new rows if the same employee has multiple additions or a combination of addition, deduction, LOP.", "DELETE rows for employees with no additions, deductions, LOP.", null, null, RZP_BULK_COMPONENTS[1]],
    ["Employee ID", "Email ID of Employee", "Name of Employee", "Action/Component", "No. of days(fill only in case of Loss of pay)", "Amount (fill only in case of Addition/Deduction)", RZP_BULK_COMPONENTS[2]],
  ];
  const n = Math.max(sheet.rows.length, RZP_BULK_COMPONENTS.length - 3);
  for (let i = 0; i < n; i++) {
    const r = sheet.rows[i];
    const g = RZP_BULK_COMPONENTS[i + 3] ?? null;
    aoa.push(r ? [Number(r.badge) || r.badge, r.email, r.name, r.component, r.days, r.amount, g] : [null, null, null, null, null, null, g]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 26 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Worksheet");
  XLSX.writeFile(wb, `Bulk-Addition-Deduction-01-${m}-${y}.xlsx`);
}

/**
 * Record that these lines were uploaded through the RazorpayX bulk sheet, then
 * run every follow-up a normal Step 6 push runs: recovery ledgers
 * (deposit / error recovery / loan EMI), F&F push status, and the RazorpayX
 * run read-back that stamps "Verified on run".
 */
export async function markBulkUploaded(sheet: BulkSheet) {
  const now = new Date().toISOString();
  const ids = sheet.rows.flatMap((r) => r.sourceIds);
  const addIds = ids.filter((i) => i.table === "add").map((i) => i.id);
  const dedIds = ids.filter((i) => i.table === "ded").map((i) => i.id);
  const upd = { pushed_at: now, push_channel: "bulk_sheet", push_response: { channel: "bulk_sheet" } };
  if (addIds.length) { const { error } = await (supabase as any).from("hr_payroll_input_additions").update(upd).in("id", addIds).is("pushed_at", null); if (error) throw error; }
  if (dedIds.length) { const { error } = await (supabase as any).from("hr_payroll_input_deductions").update(upd).in("id", dedIds).is("pushed_at", null); if (error) throw error; }
  return addIds.length + dedIds.length;
}

/**
 * Follow-ups for every bulk-uploaded line of the month (idempotent — safe to
 * re-run). Mirrors PayrollInputsPage.pushGroup + hr-push-fnf side effects.
 */
export async function finalizeBulkUpload(period: string) {
  const issues: string[] = [];
  const { data: deds } = await (supabase as any).from("hr_payroll_input_deductions")
    .select("id,recovery_kind,recovery_ref_id").eq("period_month", period).eq("push_channel", "bulk_sheet");
  for (const r of deds ?? []) {
    if (!r.recovery_kind || !r.recovery_ref_id) continue;
    const { error } = r.recovery_kind === "loan"
      ? await (supabase as any).rpc("hr_apply_loan_push", { p_repayment_id: r.recovery_ref_id, p_razorpay_input_id: null })
      : await (supabase as any).rpc("hr_apply_deposit_collection", { p_schedule_id: r.recovery_ref_id, p_razorpay_input_id: null });
    if (error) issues.push(`Recovery ledger: ${error.message}`);
  }
  const { data: fnfAdds } = await (supabase as any).from("hr_payroll_input_additions")
    .select("hr_employee_id").eq("period_month", period).eq("push_channel", "bulk_sheet").eq("source", "fnf_settlement");
  const fnfEmps = [...new Set((fnfAdds ?? []).map((r: any) => r.hr_employee_id))];
  if (fnfEmps.length) {
    const { error } = await (supabase as any).from("hr_fnf_settlements")
      .update({ razorpay_push_status: "pushed", razorpay_pushed_at: new Date().toISOString(), push_failure_reason: null })
      .in("employee_id", fnfEmps).eq("payroll_month", period).in("status", ["approved", "finalized", "paid"]).neq("razorpay_push_status", "pushed");
    if (error) issues.push(`F&F status: ${error.message}`);
  }
  const { data: rb, error: rbErr } = await supabase.functions.invoke("razorpay-payroll-proxy", {
    body: { action: "bulk_sheet_readback", period_month: period.slice(0, 7) },
  });
  if (rbErr) issues.push(`Read-back: ${rbErr.message}`);
  const failed = ((rb as any)?.results ?? []).filter((r: any) => !r.ok);
  return { checked: (rb as any)?.checked ?? 0, verified: (rb as any)?.verified ?? 0, failed, issues };
}
