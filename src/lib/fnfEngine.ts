import { supabase } from "@/integrations/supabase/client";

/**
 * Single F&F settlement engine.
 *
 * Payroll doctrine: RazorpayX is the payroll authority.
 *  • Pending (final-month) salary  → mirrored RazorpayX payslip record for the LWD month.
 *                                     Never computed locally. Missing ⇒ "awaiting RazorpayX".
 *  • Leave encashment / gratuity   → NOT payable per company policy.
 *  • Loans / penalties / deposits  → HRMS-owned; security deposits refund in full,
 *                                     error-recovery deposits only when marked recovered.
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

export type FnFDetails = {
  loans: any[];
  penalties: any[];
  deposits: any[];
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

/** Pulls live loans, penalties, deposits and the RazorpayX final-month payslip. */
export async function computeFnFDraft(empId: string, lwdIso: string | null): Promise<FnFDraft> {
  const periodMonth = lwdIso ? `${lwdIso.slice(0, 7)}-01` : null;

  const [{ data: loans }, { data: penalties }, { data: empDeposits }, payslipRes] = await Promise.all([
    (supabase as any)
      .from("hr_loans")
      .select("id, loan_type, advance_type, amount, emi_amount, outstanding_balance, status")
      .eq("employee_id", empId)
      .in("status", ["approved", "active", "paused"]),
    (supabase as any)
      .from("hr_penalties")
      .select("id, penalty_month, penalty_type, penalty_reason, penalty_amount")
      .eq("employee_id", empId)
      .eq("is_applied", false),
    (supabase as any)
      .from("hr_employee_deposits")
      .select("id, collected_amount, current_balance, deposit_type, is_recovered, is_paused, recovery_reason, incident_reference")
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
  ]);

  const activeLoans = (loans || []).filter((l: any) => Number(l.outstanding_balance || 0) > 0);
  const loanRecovery = activeLoans.reduce((sum: number, l: any) => sum + Number(l.outstanding_balance || 0), 0);

  const openPenalties = penalties || [];
  const penaltyTotal = openPenalties.reduce((sum: number, p: any) => sum + Number(p.penalty_amount || 0), 0);

  const all = empDeposits || [];
  const refundable = all.filter((d: any) => {
    const t = d.deposit_type || "security";
    if (d.is_paused) return false;
    return t === "security" ? true : d.is_recovered === true;
  });
  const writtenOff = all.filter((d: any) => !refundable.some((r: any) => r.id === d.id));
  const depositRefund = refundable.reduce((sum: number, d: any) => sum + Number(d.collected_amount || 0), 0);

  const slip: any = (payslipRes as any)?.data || null;
  const apiNet = Number(slip?.net_pay || 0);
  const regNet = Number(slip?.reg_net_pay || 0);
  const pendingSalary = apiNet > 0 ? apiNet : regNet > 0 ? regNet : 0;
  const source: "razorpay" | "register_csv" | undefined =
    apiNet > 0 ? "razorpay" : regNet > 0 ? "register_csv" : undefined;

  const calcNote =
    writtenOff.length > 0
      ? `${writtenOff.length} deposit${writtenOff.length > 1 ? "s are" : " is"} not refundable (paused, or error recovery not yet marked recovered) and ${writtenOff.length > 1 ? "are" : "is"} written off in this settlement.`
      : "";

  return {
    form: {
      ...emptyFnFForm(),
      last_working_day: lwdIso || "",
      pending_salary: pendingSalary,
      loan_recovery: loanRecovery,
      deposit_refund: depositRefund,
      penalty_deductions: penaltyTotal,
    },
    details: { loans: activeLoans, penalties: openPenalties, deposits: refundable, writtenOff },
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
      deposit_refund_scope: "security_and_recovered_error_recovery",
      source_ids: {
        loan_ids: details.loans.map((l: any) => l.id),
        penalty_ids: details.penalties.map((p: any) => p.id),
        deposit_ids: details.deposits.map((d: any) => d.id),
      },
      written_off_deposits: details.writtenOff.map((d: any) => ({
        id: d.id,
        deposit_type: d.deposit_type,
        collected_amount: Number(d.collected_amount || 0),
        reason: d.is_paused ? "paused" : "error recovery not marked recovered",
      })),
      components: {
        loans: details.loans.map((l: any) => ({ id: l.id, type: l.loan_type, outstanding: Number(l.outstanding_balance || 0) })),
        penalties: details.penalties.map((p: any) => ({ id: p.id, month: p.penalty_month, type: p.penalty_type, amount: Number(p.penalty_amount || 0) })),
        deposits: details.deposits.map((d: any) => ({ id: d.id, type: d.deposit_type, collected: Number(d.collected_amount || 0) })),
      },
    },
  };
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
  return { id: data.id, existed: false };
}
