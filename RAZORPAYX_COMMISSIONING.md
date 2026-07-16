# RazorpayX Payroll — Commissioning Checklist

Single source of truth for "production ready". Steps are ordered; do not skip.

## 0. Owner Inputs Still Required
- [ ] RazorpayX Postman collection JSON (raw export) — attach to `docs/razorpayx/`.
- [ ] Sandbox vs Live decision for pilot cycle (confirm which account_id + workspace).
- [ ] Signed-off pilot cohort list (5–10 employees, all departments represented).

## 1. Reference Data (blocks everything downstream)
- [ ] Complete HR data for the 40 imported drafts (PAN, DOB, DOJ, bank, salary, PF/ESI flags).
- [ ] Activate drafts through Onboarding Wizard (preserves `additional_info`).
- [ ] Reconcile `hr_razorpay_employee_map` — every active employee has a `razorpay_employee_id`.

## 2. Envelope Verifications (each unlocks its domain)
Order matters — later envelopes read prior ones.
- [ ] **Identity envelope** verified → unlocks PAN/bank sync.
- [ ] **Salary envelope** verified → unlocks salary push + revision sync.
- [ ] **Attendance envelope** verified → unlocks LOP push.
- [ ] **Payroll-run envelope** verified → unlocks execute/finalize.
- [ ] **Payout envelope** verified → unlocks disbursement + variance capture.
- [ ] **Payslip/Tax-doc envelope** verified → unlocks ingestion.
- [ ] **Reconciliation envelope** verified → unlocks sign-off + ledger lock.

Any envelope re-verified after change **auto-revokes** its domain's bulk-unlock (all three domains, per B1 fix).

## 3. Pilot Dry-Run (sandbox or ring-fenced live)
- [ ] Push identity + salary for pilot cohort only.
- [ ] Push attendance + LOP for the last closed month.
- [ ] Execute payroll run in **dry-run** mode; diff against ERP-computed gross.
- [ ] Trigger disbursement to a test bank; verify variance = 0.
- [ ] Ingest payslips + tax docs; verify ledger match.

## 4. Parallel-Run Cycles (production cutover gate)
Two consecutive months, both must pass with variance ≤ ₹1/employee and 100% ledger match.
- [ ] **Cycle N (parallel):** RazorpayX run alongside legacy; both disbursed via legacy. Compare.
- [ ] **Cycle N+1 (parallel-primary):** RazorpayX run is primary disbursement; legacy shadow-only.
- [ ] Sign-off recorded by flipping `hr_razorpay_ledger_periods.status='signed_off'` (+ `signed_off_by`, `signed_off_at`) for both period rows. There is no separate signoffs table — the period row IS the sign-off ledger.

## 5. Access Revocation (definition of "live")
- [ ] Retain `hrms_razorpay_sync` on payroll manager(s) only. **Correction to earlier B3:** there is no distinct `hrms_payroll_execute` permission — `hrms_razorpay_sync` is the single gate for identity/salary/attendance/payroll-run/payout/recon/signoff actions (verified against `pg_enum` and every `razorpay-*-proxy` handler). Owner must decide before go-live: keep the single gate, or split out an `hrms_payroll_execute` enum value + code migration in a follow-up phase. As shipped, this checklist adopts the single gate.
- [ ] Rotate RazorpayX API keys post-cutover; store new keys in Supabase secrets.

## 6. Ongoing Safeguards (already in code, verify enabled)
- [ ] `dispatch-report-emails` catch-up + self-alert active.
- [ ] Envelope-change cascade revocation covers identity/salary/attendance/payroll/payout/recon.
- [ ] Phase 10 reconciliation is **read-only** against `bank_transactions` and the ERP ledger (`wallet_transactions`, `bank_ledger_*`). All writes land only in `hr_razorpay_ledger_matches`, `hr_razorpay_ledger_periods`, and `reconciliation_exception_state` — verified against the codebase; no earlier-cited `hrms_payroll_reconciliations` / `hrms_payroll_ledger_signoffs` tables exist.

Production-ready = every box above ticked, `hr_razorpay_ledger_periods.status='signed_off'` for two consecutive months, and access revocation applied.
