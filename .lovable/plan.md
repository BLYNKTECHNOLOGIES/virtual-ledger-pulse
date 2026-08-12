# F&F becomes the single settlement engine for a leaver

## What is wrong today (verified)

- **Penalties never appear.** The autofill reads `hr_penalties.deduction_amount`, but the table's column is `penalty_amount` (no such column exists) — the sum silently resolves to zero. Abhishek Ranjan Singh has an unapplied penalty and the dialog shows 0.
- **Loan recovery is read but nothing is scheduled or closed.** `hr_loans` outstanding is summed for display only; the loan stays open and the monthly EMI scheduler keeps pushing installments even after the last working day.
- **Deposit refund is a flat sum of `collected_amount` on unsettled security deposits.** It ignores whether the deposit is paused/already settled, and error-recovery deposits are dropped even when they have been marked recovered.
- **Nothing from the F&F reaches payroll.** The settlement is stored, but no addition/deduction is pushed to the employee's final RazorpayX run — while `hr-schedule-deposits` continues pushing normal monthly deposit and loan installments for the same person.

## What changes

### 1. Autofill pulls real balances

When an employee is picked, every recovery/refund line is fetched from its own system of record and shown with its source and a short "why this number" line:

- **Loan recovery** — full remaining outstanding balance across all active loans/advances (per your decision). Any still-scheduled EMI rows for that person are cancelled so the amount can never be recovered twice.
- **Penalty deductions** — sum of unapplied penalties (`penalty_amount`), listed month-by-month in a small breakdown so a 15,000 total is traceable to its rows.
- **Security deposit refund** — collected amount of unsettled, non-paused security deposits.
- **Error-recovery deposits** — refunded only when marked recovered; otherwise shown as an explicit "written off (not recovered)" line with the reason, never silently dropped.
- **Final-month salary** — unchanged: mirrored RazorpayX payslip only, "awaiting RazorpayX" when the month has not been run.

Each line becomes clickable/expandable so HR can see the underlying deposits, loans and penalties that produced it.

### 2. F&F is the only scheduler for a leaver

- From the last-working-day **month onward**, the monthly recovery scheduler skips that employee entirely — no deposit installment, no loan EMI is pushed.
- Instead, approving the F&F pushes **two consolidated lines** onto that employee's final RazorpayX payroll month:
  - one **addition**: "F&F settlement — dues" (deposit refunds + bonus + any recovered error-recovery refund),
  - one **deduction**: "F&F settlement — recoveries" (loan outstanding + penalties + notice pay + other deductions).
- Both use the existing push-with-read-back contract: the push is only recorded as done when RazorpayX echoes the amounts back on the live run. If the read-back fails, the F&F stays approved-but-unpushed with the failure reason visible and a retry button — no fabricated success.

### 3. Closing the books on approval/paid

Once the push verifies and the settlement is marked paid:

- included loans move to `closed` with zero outstanding,
- included penalties are marked applied,
- included deposits are marked settled with a note pointing at the F&F,
- every one of those ids is recorded in the settlement's `breakdown` so the figure stays auditable years later.

Nothing is written back before the push verifies, so a failed push leaves all source records untouched.

### 4. Payroll cockpit visibility

The cockpit's monthly coverage check learns about leavers: an employee with an LWD in the current period shows as "handled by F&F" (with its status) rather than being flagged for a missing deposit/EMI installment.

## Technical notes

- `src/pages/horilla/FnFSettlementPage.tsx`: fix the penalty column, add per-line detail queries, expandable breakdowns, write component ids into `breakdown`.
- `supabase/functions/hr-schedule-deposits/index.ts`: skip any employee whose `hr_employees.last_working_day` falls in or before the period being processed (single roster lookup, applied to both the deposit and loan loops).
- New edge function (or a new action in the existing recovery function) `hr-push-fnf`: builds the two consolidated lines, calls `razorpay-payroll-proxy` `payroll_add_addition` / `payroll_add_deduction` in rupees, verifies via read-back, then runs a SECURITY DEFINER RPC `hr_close_fnf_sources(p_settlement_id)` that closes loans/penalties/deposits in one transaction.
- Schema: add `razorpay_push_status`, `razorpay_pushed_at`, `push_failure_reason` to `hr_fnf_settlements`; no other structural change (`breakdown` jsonb already exists). Existing state machine (`draft → calculated → approved → paid`) is untouched.
- Verification before reporting done: seed a leaver with an active loan, an unapplied penalty and a security deposit, run the autofill and confirm each figure matches a direct DB query; run the scheduler for that period and confirm the leaver is skipped; approve the F&F and confirm both lines are visible on the RazorpayX read-back and that the source records closed.
