# F&F Settlement — retire the legacy calculator, align with RazorpayX

## How it works today (verified in code and data)

`FnFSettlementPage` computes everything in the browser when an employee is picked:

- **Pending salary** = working days from the 1st of the last-working-day month to the LWD (Sundays skipped) x (Basic / 26). Attendance, LOP, approved leave, holidays and statutory deductions are all ignored.
- **Leave encashment** = encashable leave balance x (Basic / 26).
- **Gratuity** = (Basic x 15 / 26) x completed years, only at 5+ years.
- **Basic** comes from `hr_employees.basic_salary`, falling back to 40% of CTC. That column is empty for 19 of the 37 active employees, so most settlements silently run on a 40%-of-CTC guess instead of the RazorpayX-mirrored structure.
- **Loan recovery** = sum of active `hr_loans.outstanding_balance`.
- **Deposit refund** = all unsettled `hr_employee_deposits`, including `error_recovery` rows, which are penalty recoveries and should never be refunded.
- **Penalties** = unapplied `hr_penalties`.
- Net payable is stored in `hr_fnf_settlements`; nothing is source-tagged and nothing is pushed to or read back from RazorpayX.

So: this screen is still the legacy engine. It violates the payroll doctrine (local computation on a payout-facing surface), it does not use the v4 attendance/LOP engine, and it does not use the RazorpayX salary mirror.

## What changes

### 1. Final-month salary comes from RazorpayX
- Remove the local working-day x Basic/26 proration.
- Pending salary is pulled from the RazorpayX payroll record for the leaver's final month (executed payroll / payslip record already mirrored in HRMS), rendered with `<SourceTag source="razorpay" />`.
- If that month has not been run in RazorpayX yet, the field shows "Awaiting RazorpayX final payroll" with a dashboard link, and the settlement cannot be marked Paid — instead of quietly filling in a wrong number.
- LOP for the final month stays an HRMS input pushed to RazorpayX via the existing `hr_lop_days` path; F&F never re-derives it.

### 2. Leave encashment and gratuity removed
- Both fields are dropped from the create dialog, from the net-payable formula and from the F&F cards, per company policy (no encashment, no gratuity).
- Existing rows keep their stored values for history; the columns are left in place and simply not populated going forward. Legacy rows that carry non-zero encashment/gratuity get a small "legacy calculation" marker so old settlements are not mistaken for current policy.

### 3. Deposits: security only
- Deposit refund sums only unsettled deposits where `deposit_type = 'security'`.
- `error_recovery` rows are excluded entirely (they are recoveries, not refundable balances).

### 4. Honest sourcing everywhere else
- Loan recovery, penalties and deposits keep their HRMS sources (they are HRMS-owned) and are tagged accordingly.
- The blue "Basis: Basic ... / 26" helper line is removed — it described the retired formula.
- The `breakdown` JSON written on create records the actual sources used (RazorpayX period reference, deposit ids, loan ids) instead of formula strings.

### 5. Employee-facing card
- `MySeparationCard` drops the Leave Encashment and Bonus-from-encashment rows to match, and labels Pending Salary as the RazorpayX figure.

## Technical notes

- Files: `src/pages/horilla/FnFSettlementPage.tsx` (main rewrite of `autoFillFnF`, form, net calc, dialog), `src/components/profile/MySeparationCard.tsx`, plus a small helper for resolving the final-month RazorpayX figure.
- Source of the final-month figure: the mirrored RazorpayX payslip/payout record for `(employee, month of LWD)`; exact table and column set will be confirmed against `hr_razorpay_payslip_records` / `hr_razorpay_payout_records` before wiring, and if neither carries a usable net for the final month the field falls back to the "awaiting RazorpayX" state rather than a local estimate.
- No schema change is required; `hr_fnf_settlements` already has all needed columns and `breakdown` jsonb.
- Razorpay dismissal on Mark-Paid stays exactly as it is today.

## Out of scope

- Pushing the F&F payout itself into RazorpayX. Whether Opfin exposes a final-settlement API for our account is unverified; that would need its own envelope verification before anything is built.
