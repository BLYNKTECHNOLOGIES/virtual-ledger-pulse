import { supabase } from "@/integrations/supabase/client";

/**
 * Single F&F settlement engine.
 *
 * Payroll doctrine: RazorpayX is the payroll authority.
 *  • Pending (final-month) salary  → mirrored RazorpayX payslip record for the LWD month.
 *                                     Never computed locally. Missing ⇒ "awaiting RazorpayX".
 *  • Leave encashment / gratuity   → NOT payable per company policy.
 *  • Loans / penalties / deposits  → HRMS-owned.
 *
 * Two rules learned the hard way:
 *  1. Penalties are stored in DAYS (hr_penalties.penalty_type = 'days'). They must be
 *     converted to money with the same one-day rate payroll uses — never summed as rupees.
 *  2. No deposit is ever silently "written off". Every deposit / error recovery the
 *     employee holds becomes an editable decision line (refund / withhold + reason).
 *     Security deposits default to a full refund; error recoveries default to withheld.
 *
 * Used by both the F&F Settlement page and the exit checklist so a settlement is
 * always produced by the same logic, whichever surface created it.
 */

export type FnFForm = {
  last_working_day: string;
  pending_salary: number;
  leave_encashment_days: number;
  leave_encashment_amount: number;
  bonus_amount: number;
  gratuity_amount: number;
  notice_pay_recovery: number;
  loan_recovery: number;
  deposit_refund: number;
  penalty_deductions: number;
  other_deductions: number;
  other_deductions_notes: string;
  notes: string;
};

/** One editable line per deposit / error recovery the employee holds. */
export type DepositDecision = {
  deposit_id: string;
  deposit_type: "security" | "error_recovery";
  held: number;
  refund: number;
  reason: string;
  label: string;
  is_paused: boolean;
  incident_reference?: string | null;
};

export type PenaltyLine = {
  id: string;
  penalty_month: string | null;
  penalty_type: string | null;
  penalty_reason?: string | null;
  /** Raw stored value (days when penalty_type = 'days', else rupees). */
  penalty_amount: number;
  days: number;
  day_rate: number;
  amount: number;
  note: string;
};

export type FnFDetails = {
  loans: any[];
  penalties: PenaltyLine[];
  deposits: DepositDecision[];
  /** Kept for backwards compatibility with legacy settlements; always empty now. */
  writtenOff: any[];
};

export type FnFFinalMonth = {
  state: "idle" | "loading" | "razorpay" | "awaiting";
  periodMonth?: string;
  source?: "razorpay" | "register_csv";
};

export type FnFDraft = {
  form: FnFForm;
  details: FnFDetails;
  finalMonth: FnFFinalMonth;
  calcNote: string;
};

export const emptyFnFForm = (): FnFForm => ({
  last_working_day: "",
  pending_salary: 0,
  leave_encashment_days: 0,
  leave_encashment_amount: 0,
  bonus_amount: 0,
  gratuity_amount: 0,
  notice_pay_recovery: 0,
  loan_recovery: 0,
  deposit_refund: 0,
  penalty_deductions: 0,
  other_deductions: 0,
  other_deductions_notes: "",
  notes: "",
});

export function fnfNetPayable(form: FnFForm): number {
  return (
    form.pending_salary + form.bonus_amount + form.deposit_refund
    - form.loan_recovery - form.penalty_deductions - form.notice_pay_recovery - form.other_deductions
  );
}

export const depositLabel = (d: { deposit_type?: string | null; incident_reference?: string | null }) =>
  (d.deposit_type || "security") === "error_recovery"
    ? `Error recovery${d.incident_reference ? ` (${d.incident_reference})` : ""}`
    : "Security deposit";

export const sumRefunds = (rows: DepositDecision[]) =>
  Math.round(rows.reduce((s, r) => s + Number(r.refund || 0), 0) * 100) / 100;

/** A line needs a written reason whenever the company keeps part of the money. */
export const decisionNeedsReason = (r: DepositDecision) =>
  Math.round((Number(r.held || 0) - Number(r.refund || 0)) * 100) / 100 > 0 && !String(r.reason || "").trim();

export const missingDecisionReasons = (rows: DepositDecision[]) => rows.filter(decisionNeedsReason);

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Working days in the penalty month for this employee (falls back to 26). */
async function workingDaysFor(empId: string, monthStr: string): Promise<number> {
  const start = `${monthStr}-01`;
  const d = new Date(`${start}T00:00:00Z`);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  try {
    const { data, error } = await (supabase as any).rpc("fn_calculate_working_days", {
      p_employee_id: empId,
      p_start: start,
      p_end: end,
    });
    const n = Number(data);
    if (!error && n > 0) return n;
  } catch { /* fall through */ }
  return 26;
}

/** Pulls live loans, penalties, deposits and the RazorpayX final-month payslip. */
export async function computeFnFDraft(empId: string, lwdIso: string | null): Promise<FnFDraft> {
  const periodMonth = lwdIso ? `${lwdIso.slice(0, 7)}-01` : null;

  const [{ data: loans }, { data: penalties }, { data: empDeposits }, payslipRes, empRes] = await Promise.all([
    (supabase as any)
      .from("hr_loans")
      .select("id, loan_type, advance_type, amount, emi_amount, outstanding_balance, status")
      .eq("employee_id", empId)
      .in("status", ["approved", "active", "paused"]),
    (supabase as any)
      .from("hr_penalties")
      .select("id, penalty_month, penalty_type, penalty_reason, penalty_amount, penalty_days")
      .eq("employee_id", empId)
      .eq("is_applied", false),
    (supabase as any)
      .from("hr_employee_deposits")
      .select("id, collected_amount, current_balance, deposit_type, is_recovered, is_paused, recovery_reason, incident_reference, fnf_state, fnf_settlement_id")
      .eq("employee_id", empId)
      .eq("is_settled", false),
    periodMonth
      ? (supabase as any)
          .from("hr_razorpay_payslip_records")
          .select("net_pay, reg_net_pay, period_month")
          .eq("hr_employee_id", empId)
          .eq("period_month", periodMonth)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    (supabase as any).from("hr_employees").select("total_salary").eq("id", empId).maybeSingle(),
  ]);

  const activeLoans = (loans || []).filter((l: any) => Number(l.outstanding_balance || 0) > 0);
  const loanRecovery = activeLoans.reduce((sum: number, l: any) => sum + Number(l.outstanding_balance || 0), 0);

  // ── Penalties: days → money at the payroll one-day rate ───────────────────
  // hr_employees.total_salary mirrors the RazorpayX ANNUAL CTC (payroll authority).
  const monthlyBase = round2(Number((empRes as any)?.data?.total_salary || 0) / 12);
  const penaltyRows: PenaltyLine[] = [];
  for (const p of penalties || []) {
    const stored = Number(p.penalty_amount || 0);
    const storedDays = Number((p as any).penalty_days || 0);
    // Day-based when penalty_type = 'days' (legacy rows keep the day count in
    // penalty_amount and leave penalty_days at 0) or when penalty_days is set.
    const typeIsDays = String(p.penalty_type || "").toLowerCase() === "days";
    const days = storedDays > 0 ? storedDays : typeIsDays ? stored : 0;
    if (days <= 0) {
      penaltyRows.push({
        ...p, penalty_amount: stored, days: 0, day_rate: 0, amount: round2(stored),
        note: "recorded in rupees",
      });
      continue;
    }
    const month = String(p.penalty_month || periodMonth || "").slice(0, 7);
    const wd = month ? await workingDaysFor(empId, month) : 26;
    const dayRate = monthlyBase > 0 && wd > 0 ? round2(monthlyBase / wd) : 0;
    const priced = round2(days * dayRate);
    // Rupees are only trusted when the row itself carries a separate day count.
    const rupeesRecorded = storedDays > 0 && stored > 0;
    penaltyRows.push({
      ...p,
      penalty_amount: stored,
      days,
      day_rate: dayRate,
      amount: rupeesRecorded ? round2(stored) : priced,
      note: rupeesRecorded
        ? `${days} day(s), amount recorded in rupees`
        : dayRate > 0
          ? `${days} day × ₹${dayRate.toLocaleString("en-IN")}/day (${wd} working days)`
          : "no salary on record — enter the amount manually",
    });
  }

  const penaltyTotal = round2(penaltyRows.reduce((s, p) => s + p.amount, 0));

  // ── Deposits: one editable decision per held record, nothing written off ──
  const decisions: DepositDecision[] = (empDeposits || []).map((d: any) => {
    const held = round2(Number(d.collected_amount || 0));
    const type = (d.deposit_type || "security") as "security" | "error_recovery";
    const isRecovery = type === "error_recovery";
    return {
      deposit_id: d.id,
      deposit_type: type,
      held,
      // Security deposit → refunded in full. Error recovery → kept, unless already
      // recovered from the counterparty.
      refund: isRecovery ? (d.is_recovered === true ? held : 0) : held,
      reason: isRecovery && d.is_recovered !== true
        ? (d.recovery_reason ? `Loss not recovered from counterparty — ${d.recovery_reason}` : "Loss not recovered from counterparty")
        : "",
      label: depositLabel(d),
      is_paused: !!d.is_paused,
      incident_reference: d.incident_reference,
    };
  });

  const slip: any = (payslipRes as any)?.data || null;
  const apiNet = Number(slip?.net_pay || 0);
  const regNet = Number(slip?.reg_net_pay || 0);
  const pendingSalary = apiNet > 0 ? apiNet : regNet > 0 ? regNet : 0;
  const source: "razorpay" | "register_csv" | undefined =
    apiNet > 0 ? "razorpay" : regNet > 0 ? "register_csv" : undefined;

  const withheldCount = decisions.filter((d) => d.held - d.refund > 0).length;
  const calcNote = [
    withheldCount > 0
      ? `${withheldCount} deposit line${withheldCount > 1 ? "s are" : " is"} not being paid back in full — a written reason is mandatory on each.`
      : "",
    monthlyBase <= 0 && penaltyRows.some((p) => p.days > 0)
      ? "No RazorpayX salary on record for this employee — penalty days could not be priced; enter the penalty amount manually."
      : "",
  ].filter(Boolean).join(" ");

  return {
    form: {
      ...emptyFnFForm(),
      last_working_day: lwdIso || "",
      pending_salary: pendingSalary,
      loan_recovery: loanRecovery,
      deposit_refund: sumRefunds(decisions),
      penalty_deductions: penaltyTotal,
    },
    details: { loans: activeLoans, penalties: penaltyRows, deposits: decisions, writtenOff: [] },
    finalMonth: pendingSalary > 0
      ? { state: "razorpay", periodMonth: periodMonth || undefined, source }
      : { state: "awaiting", periodMonth: periodMonth || undefined },
    calcNote,
  };
}

/** Builds the insert/update payload (auditable breakdown included). */
export function buildFnFPayload(
  empId: string,
  form: FnFForm,
  details: FnFDetails,
  calcNote: string,
  finalMonth: FnFFinalMonth,
) {
  const { gratuity_amount, notice_pay_recovery, ...rest } = form;
  const decisions = details.deposits || [];
  return {
    employee_id: empId,
    ...rest,
    net_payable: fnfNetPayable(form),
    breakdown: {
      notice_pay_recovery,
      calc_note: calcNote,
      policy: "no_leave_encashment_no_gratuity",
      pending_salary_source: finalMonth.source || "manual",
      razorpay_period_month: finalMonth.periodMonth || null,
      deposit_refund_scope: "per_deposit_decision",
      // The authoritative per-deposit outcome — read back by hr_close_fnf_sources
      // and hr_apply_fnf_deposit_reservations.
      deposit_decisions: decisions.map((d) => ({
        deposit_id: d.deposit_id,
        deposit_type: d.deposit_type,
        held: round2(Number(d.held || 0)),
        refund: round2(Number(d.refund || 0)),
        withheld: round2(Number(d.held || 0) - Number(d.refund || 0)),
        reason: String(d.reason || "").trim() || null,
        label: d.label,
      })),
      source_ids: {
        loan_ids: details.loans.map((l: any) => l.id),
        penalty_ids: details.penalties.map((p: any) => p.id),
        deposit_ids: decisions.map((d) => d.deposit_id),
      },
      written_off_deposits: [],
      components: {
        loans: details.loans.map((l: any) => ({ id: l.id, type: l.loan_type, outstanding: Number(l.outstanding_balance || 0) })),
        penalties: details.penalties.map((p: any) => ({
          id: p.id, month: p.penalty_month, type: p.penalty_type,
          days: Number(p.days || 0), day_rate: Number(p.day_rate || 0),
          amount: Number(p.amount || 0), note: p.note,
        })),
        deposits: decisions.map((d) => ({ id: d.deposit_id, type: d.deposit_type, collected: d.held, refund: d.refund })),
      },
    },
  };
}

/** Reserves (or releases) the deposits this settlement governs. Safe to re-run. */
export async function syncFnFDepositReservations(settlementId: string) {
  const { error } = await (supabase as any).rpc("hr_apply_fnf_deposit_reservations", {
    p_settlement_id: settlementId,
  });
  if (error) throw error;
}

/**
 * Creates the single draft F&F settlement for an employee.
 * Returns the existing settlement id when one already exists (one per employee).
 */
export async function createFnFDraft(empId: string, lwdIso: string | null): Promise<{ id: string; existed: boolean }> {
  const { data: existing } = await (supabase as any)
    .from("hr_fnf_settlements")
    .select("id")
    .eq("employee_id", empId)
    .neq("status", "cancelled")
    .maybeSingle();
  if (existing?.id) return { id: existing.id, existed: true };

  const draft = await computeFnFDraft(empId, lwdIso);
  const payload = buildFnFPayload(empId, draft.form, draft.details, draft.calcNote, draft.finalMonth);

  const { data, error } = await (supabase as any)
    .from("hr_fnf_settlements")
    .insert({ ...payload, status: "draft" })
    .select("id")
    .single();

  if (error) {
    if ((error as any).code === "23505") {
      const { data: dupe } = await (supabase as any)
        .from("hr_fnf_settlements")
        .select("id")
        .eq("employee_id", empId)
        .neq("status", "cancelled")
        .maybeSingle();
      if (dupe?.id) return { id: dupe.id, existed: true };
    }
    throw error;
  }
  await syncFnFDepositReservations(data.id);
  return { id: data.id, existed: false };
}
