# July 2026 Payroll — Step-by-Step Run Plan

Doctrine reminder: **RazorpayX computes payroll. HRMS feeds inputs and mirrors outputs.** Nothing HRMS calculates is a payout figure — it is a cross-check.

## Where July stands right now (read from the cockpit)

| # | Step | Status |
|---|------|--------|
| 1 | Lock attendance period | Complete (locked 2026-08-01) |
| 2 | Watchdog: zero stale sessions | Complete (0 open) |
| 3 | LOP push to RazorpayX | Not done (0 LOP rows) |
| 4 | Inputs push (additions/deductions/deposits) | Not done (0 rows) |
| 5 | Run payroll on RazorpayX dashboard | Not done |
| 6 | Import payslips + register CSV | Partial — 37 payslip rows imported, **0 register CSV rows** |
| 7 | Shadow compare | Complete (ran 2026-08-01) |
| 8 | Drift review | 40 open alerts |
| 9 | Close month | Blocked until 3–8 clear |

Open drift is mostly **master-data** drift, not money drift: 23 designation, 9 department, 4 date-of-joining, 4 active-state (critical), 3 dismissal-state, 1 bank account (critical), 1 name, 1 email, 1 annual CTC.

## The run, in order

**Phase A — Freeze the inputs (do first)**
1. `/hrms/attendance/period-locks` — confirm July is locked; if any regularization arrived after the lock, unlock, apply, re-lock.
2. `/hrms/attendance/stale-sessions` — must stay at zero open.
3. `/hrms/payroll/statutory-settings` — confirm PF/ESI/PT enrollment per employee is what you want for July (PT is now off by default; turn on only where applicable). Any change here changes net pay.

**Phase B — Resolve the critical drift before pushing anything**
4. `/hrms/data-health` — work the 4 `active_state` and 1 `bank_account` critical alerts first. Active-state drift means someone is active on one side and not the other; paying that person is the highest-risk error in the run. Bank-account drift means a payout could land in the wrong account.
5. Designation/department/DOJ/name/email drift is cosmetic for payout — resolve or explicitly acknowledge, but it does not block a correct run.

**Phase C — Push July inputs to RazorpayX**
6. `/hrms/payroll/inputs` — enter/approve July additions (OT, incentives) and deductions (KPI loss, penalties, deposits, loan EMIs). Currently zero rows, so either July genuinely has none, or nothing was staged.
7. LOP push — from the period-lock page, push July LOP days. Currently zero LOP rows for July; if July truly had no unpaid absence that is fine, but confirm against the attendance calendar before accepting zero.
8. Every push goes through push-with-verification: push → refetch from RazorpayX → confirm the value came back. Do not accept an unverified push.

**Phase D — Execute on RazorpayX**
9. Run the payroll on the RazorpayX dashboard (the API does not expose run status, so HRMS cannot do this for you).
10. Return to `/hrms/payroll/cockpit` and acknowledge step 5 with the run date/reference.

**Phase E — Mirror the outputs back**
11. `/hrms/payroll/salary-register-import` — upload the July Salary Register CSV. This is the **only** source of PF/ESI/PT/TDS component splits and employer contributions; without it the payslips you already imported have no statutory breakdown (that is why register_rows = 0).
12. `/hrms/payroll/payslips` — verify each employee's gross/net matches the register.

**Phase F — Compare and close**
13. `/hrms/payroll/shadow-calculator` — re-run July shadow after the register import, so the comparison is against real Razorpay numbers rather than an empty register.
14. `/hrms/data-health` — review new money drift (±₹5 auto-tolerated, TDS excluded). Resolve or annotate each.
15. `/hrms/payroll/cockpit` — acknowledge each step, then **Close month**. Close is refused while any prior step is incomplete; the button reports the remaining blockers.

## Technical notes

- Cockpit state is computed live by `hr_cockpit_month_state('2026-07-01')`; acknowledgements go through `hr_cockpit_ack_step` and close through `hr_close_payroll_month`.
- Payslip records live in `hr_razorpay_payslip_records`; register import fills the statutory split columns for the same period rows.
- Drift alerts are `hr_drift_alerts` (unresolved = `resolved_at is null`), keyed by `field` + severity.
- Salary structures are a read-cache — any structure change must go out through the RazorpayX proxy and be refetched, never edited locally.

## How we work through it

Go phase by phase and paste what you see at each step — screenshots, errors, or numbers that look wrong. I will fix bugs, add missing affordances, or correct engine logic as they surface, and we will not advance a phase until its output is verified.
