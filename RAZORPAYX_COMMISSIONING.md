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
- [ ] Ledger sign-off recorded in `hrms_payroll_ledger_signoffs` for both cycles.

## 5. Access Revocation (definition of "live")
- [ ] Revoke `hrms_razorpay_dashboard` from all HR ops users.
- [ ] Retain `hrms_payroll_execute` on payroll manager(s) only (separate from `hrms_razorpay_sync`).
- [ ] Rotate RazorpayX API keys post-cutover; store new keys in Supabase secrets.

## 6. Ongoing Safeguards (already in code, verify enabled)
- [ ] `dispatch-report-emails` catch-up + self-alert active.
- [ ] Envelope-change cascade revocation covers identity/salary/attendance/payroll/payout/recon.
- [ ] Phase 10 reconciliation is **read-only** against `bank_transactions` and ERP ledger.

Production-ready = every box above ticked, sign-off row in `hrms_payroll_ledger_signoffs` for two consecutive months, and access revocation applied.
