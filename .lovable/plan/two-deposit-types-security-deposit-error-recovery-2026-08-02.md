# Two deposit types: Security Deposit & Error Recovery

Split Deposit Management into two clearly separated categories, mirror them in the employee profile, and make sure both are deducted from payroll every month automatically — no manual reminder needed.

## What changes for you

### 1. Deposit Management page — two tabs
- **Security Deposit** — the standard refundable joining/security hold.
- **Error Recovery** — money recovered from an employee after a wrong payment; refundable back to the employee once the funds are recovered from the counterparty.
- Each tab has its own list, its own summary tiles (target / collected / outstanding), and its own "Add" button that opens the same form pre-tagged to that category.
- Error Recovery entries carry extra context fields: incident date, reference (order / transaction no.), recovery reason, and an optional linked note.
- Error Recovery gets a **"Refund to employee"** action (used when the wrong payment is recovered externally) which reverses the collected amount through payroll as an addition and closes the record with a full audit trail.

### 2. Employee profile
The profile shows two separate blocks — "Security Deposit" and "Error Recovery" — each with its own progress, balance, deduction mode and recent ledger entries. Today it only shows one deposit and hides all others.

### 3. Automatic monthly payroll deduction (the real gap)
Right now a deposit created from the Deposit Management page **never gets a payroll installment scheduled** — only deposits auto-created by the onboarding/training-swap job do. So nothing is deducted, silently.

Fix:
- Saving or editing any deposit (either type) regenerates its month-by-month installment plan from the deduction mode (fixed per month / percentage of salary / one-time), the start month, and the remaining balance.
- The existing daily job then pushes each due installment to RazorpayX with the correct category code — `SECURITY_DEPOSIT_*` or `ERROR_RECOVERY_*` — so the two never mix in the payroll register.
- Paused, settled and fully-collected deposits are skipped; already-pushed months are never pushed twice.
- After a successful push the system writes a **collection** ledger entry, increases collected amount, decreases outstanding, and auto-marks the deposit complete when the target is reached — so the balances stay true without manual updates.
- A monthly-coverage check surfaces on the Payroll Cockpit: any open deposit with no pushed installment for the current period is flagged before the payroll is finalised.

### 4. Record keeping
- Every event (initiated, modified, paused, resumed, collection, refund, F&F settlement) stays in the deposit ledger with running balance, tagged with the deposit type and the payroll period it belongs to.
- F&F settlement handles both types: security deposit refunds in full, error recovery refunds only if marked recovered, otherwise it is written off with a reason.

## Technical notes

- Add `deposit_type text not null default 'security'` (check: `security` | `error_recovery`) plus error-recovery context columns (`incident_date`, `incident_reference`, `recovery_reason`, `is_recovered`, `recovered_at`) to `hr_employee_deposits`; propagate `deposit_type` to `hr_employee_deposit_schedule` and `hr_deposit_transactions`. A single typed table (rendered as two tables in the UI) keeps the existing ledger, schedule, F&F and profile logic working; two physically separate tables would fork every one of those code paths.
- Replace the partial `hr_schedule_security_deposit` path with a generic `hr_rebuild_deposit_schedule(p_deposit_id uuid)` that (re)builds pending installments for any deposit type and is called after insert/update from the UI (and still from the onboarding job).
- `hr-schedule-deposits` edge function: select by `status in ('scheduled','failed')` and `period_month <= current period` as today, but derive the RazorpayX code from `deposit_type` (`SECURITY_DEPOSIT_M{n}` / `ERROR_RECOVERY_M{n}`), and on success additionally insert the `collection` ledger row and update `collected_amount` / `current_balance` / `is_fully_collected` atomically via an RPC.
- Amounts stay in rupees end-to-end (RazorpayX/Opfin rupee rule); push uses the existing `razorpay-payroll-proxy` `payroll_add_deduction` action with its read-back verification.
- UI: `DepositManagementPage.tsx` gets a Tabs shell + type-aware form/summaries; `EmployeeProfilePage.tsx` `DepositInfoSection` switches from `maybeSingle()` to a list rendering both categories.
- Verification before reporting done: create one deposit of each type, confirm schedule rows are generated, run the scheduler for the current period, and confirm both deductions appear in RazorpayX read-back with the correct distinct codes and ledger balances.

---

# Loans & Advances — same gap, same fix

Verified in the database: `hr_loans` has only two triggers (`trg_validate_loan_status`, `trg_sync_loan_balance`) and no function anywhere generates `hr_loan_repayments` rows. So an approved loan today has an EMI amount and a start date but **no monthly schedule and no push to RazorpayX** — the EMI is only used inside the advisory shadow-payroll estimate. Nothing is actually deducted from the payroll.

## What changes

- Approving a loan (and editing amount / EMI / tenure / start date) builds its full repayment schedule in `hr_loan_repayments` — one row per month, last installment absorbing the rounding remainder so the sum equals the principal exactly.
- The daily scheduler (extended from `hr-schedule-deposits`, or a sibling job sharing the same code path) picks up every due, unpushed repayment for the current period and pushes it to RazorpayX as a deduction with code `LOAN_EMI_M{n}` and label "Loan EMI" / "Salary Advance recovery" depending on `loan_type` — with the same read-back verification used elsewhere.
- On a confirmed push the repayment row moves to `paid`, `trg_sync_loan_balance` reduces `outstanding_balance`, and the loan auto-closes (`status='closed'`) when the balance reaches zero.
- Loans that are `pending`, `rejected`, `on_hold` or `closed` are skipped; a month already pushed is never pushed twice.
- Monthly-coverage check on the Payroll Cockpit also covers loans: any active loan without a pushed EMI for the current period is flagged before payroll is finalised.
- F&F settlement recovers the full remaining outstanding balance as a final deduction and closes the loan.
- Loans page gains the schedule view (per-month status: scheduled / pushed / paid / failed) alongside the existing repayment history, plus a manual "Push this month" fallback and pause/resume for a loan.

## Technical notes

- Add `period_month date`, `status` (`scheduled|pushed|paid|failed`), `razorpay_input_id`, `razorpay_pushed_at`, `failure_reason`, `installment_no` to `hr_loan_repayments` (currently free-form manual rows) and a partial unique index on `(loan_id, period_month)` to make pushes idempotent.
- New `hr_rebuild_loan_schedule(p_loan_id uuid)` mirroring `hr_rebuild_deposit_schedule` from the deposit work above; called on approval and on edit.
- Push uses `razorpay-payroll-proxy` `payroll_add_deduction`, rupees only, with the echo-verify read-back — identical contract to the deposit push, so both live in one shared helper inside the edge function.
