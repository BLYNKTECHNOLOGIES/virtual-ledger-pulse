/**
 * Single source of truth for "can this F&F settlement still be edited?".
 *
 * A settlement stops being editable the moment its money has actually entered
 * the monthly payroll run (pushed to RazorpayX) or the settlement has been
 * paid/cancelled. Editing after that would silently desync HRMS from the
 * amount already paid out, so both the Full & Final page and the payroll
 * cockpit Step 3 panel use this same rule.
 */
export type FnFEditLock = { locked: boolean; reason: string };

const PUSHED_STATES = ["pushed", "pushing", "partially_pushed"];

export function fnfEditLock(settlement: any): FnFEditLock {
  const status = String(settlement?.status || "").toLowerCase();
  const push = String(settlement?.razorpay_push_status || "").toLowerCase();

  if (PUSHED_STATES.includes(push)) {
    return {
      locked: true,
      reason:
        "Already pushed into the monthly payroll run in RazorpayX — remove the F&F lines there before editing.",
    };
  }
  if (status === "paid") {
    return { locked: true, reason: "This settlement is already paid and cannot be edited." };
  }
  if (status === "cancelled") {
    return { locked: true, reason: "This settlement is cancelled." };
  }
  return { locked: false, reason: "" };
}

/** Query keys that must refresh everywhere when an F&F settlement changes. */
export const FNF_REFRESH_KEYS: string[] = [
  "hr_fnf_settlements",
  "hr_separated_employees",
  "hr_separated_employees_cockpit",
  "hr_cockpit_month_state",
  "fnf_payroll_inputs",
  "fnf_settlement_detail",
  "hr_employee_deposits",
  "resignation-fnf",
  "resignation-checklist",
  "resignation-employees",
  "hr_payroll_input_additions",
  "hr_payroll_input_deductions",
];

export function invalidateFnFEverywhere(qc: { invalidateQueries: (o: any) => void }) {
  for (const key of FNF_REFRESH_KEYS) qc.invalidateQueries({ queryKey: [key] });
}
