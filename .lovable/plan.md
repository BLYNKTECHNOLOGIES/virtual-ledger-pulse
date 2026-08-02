# Loans & Advances — make every recovery visible and correct

Goal: a loan or advance, once approved, is deducted every month automatically, appears in the Deductions page as "Loan EMI / Advance recovery", and its outstanding balance stays true.

## What is wrong today (verified)

1. **Recoveries never appear on the Deductions page.** The Payroll Inputs page lists only rows from the staged-deductions table. The daily recovery job pushes loan EMI and deposit installments straight to RazorpayX without writing a staged row, so the deductions screen shows nothing for them even though the money is deducted.
2. **The Loans page has no schedule visibility.** Nothing on the page shows the month-by-month EMI plan, which months are already pushed, which failed and why. The detail drawer only lists repayments after the fact.
3. **No manual controls.** There is no "run recovery now", no foreclosure / early closure, no way to edit or cancel a wrong loan, no way to record a repayment made in cash. Only `pending` rows have any action at all.
4. **Loan creation is loose.** EMI × tenure is never checked against the amount, disbursement date is stamped at creation even though the loan is still pending approval, and outstanding balance is written at insert while the balance trigger only counts paid repayments.
5. **Advances vs loans are not distinguished in payroll.** Both go out under the same deduction naming, so a one-month salary advance recovery and a 12-month loan EMI look the same in the register.

## What will change

### Deductions page reflects recoveries
- The Deductions tab gains a read-only **"Automatic recoveries"** section for the selected month, listing every loan EMI, security-deposit and error-recovery installment scheduled or already pushed for that period, with employee, type, installment number, amount, status (Scheduled / Pushed / Failed) and failure reason.
- Rows are labelled clearly: **Loan EMI**, **Salary advance recovery**, **Security deposit**, **Error recovery**.
- Each pushed row shows the RazorpayX input id so it can be matched in the register.
- A month total is shown next to the manual staged-deduction total, so the cockpit view is the full picture of what leaves the salary.

### Loans page
- **Schedule panel** in the loan detail drawer: full installment plan with period, amount, status, pushed date, failure reason.
- **Validation on create**: EMI must be > 0 and ≤ amount; EMI × tenure must cover the amount (warns and offers to auto-fill EMI = amount / tenure); start EMI date cannot be in a closed past month.
- **Approval** already moves pending → approved → active and builds the schedule; the page will additionally show a confirmation summary ("12 installments of ₹6,944 from Sep 2026") before approving.
- **Actions on active loans**: Run recovery now (fires the scheduler for that loan only), Record manual repayment (cash/bank, outside payroll), Foreclose / close (writes off or settles the remaining balance with a reason), Pause / resume recovery, Cancel a wrongly created loan that has no pushed installment.
- **Disbursement date** is stamped on approval, not on creation.
- Outstanding balance always comes from the trigger (amount minus paid), never written by the UI.

### Employee profile
`My Loans` shows the upcoming installment and its period alongside repayment history, so an employee sees what will be deducted next month.

## Technical notes

- Extend `hr-schedule-deposits` so that after a successful RazorpayX push it also upserts a mirror row into `hr_payroll_input_deductions` (label `Loan EMI` / `Salary advance recovery` / `Security deposit` / `Error recovery`, `status='pushed'`, `source='auto_recovery'`, carrying the RazorpayX input id). This is the single change that makes the deductions page truthful — no second push, just a record of the one that happened.
- Guard against double-pushing: the mirror upsert keys on (employee, period, code) and the scheduler continues to move `scheduled → pushed` only after the read-back confirms.
- Add `source` / `origin` handling in `src/pages/hr/PayrollInputsPage.tsx` so auto-recovery rows render read-only (no edit, no re-push, no delete) and are excluded from the manual bulk-push selection.
- Loan actions call the existing RPCs (`hr_rebuild_loan_schedule`, `hr_apply_loan_repayment`) plus a new `hr_close_loan(p_loan_id, p_mode, p_reason)` for foreclosure/write-off; "Run recovery now" invokes `hr-schedule-deposits` with `{ onlyKind: 'loan', onlyId }`, which the function already supports.
- Amounts stay in rupees end-to-end (RazorpayX rupee rule); pushes keep the existing read-back verification.
- Verification before reporting done: approve the existing pending loan (or a test loan), confirm the schedule rows generate, run the scheduler for the current period, confirm the deduction lands in RazorpayX read-back, appears in the Deductions page as an auto-recovery row, and that the loan outstanding balance drops by exactly the EMI.
