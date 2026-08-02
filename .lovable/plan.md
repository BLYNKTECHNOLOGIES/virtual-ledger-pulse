# July 2026 Payroll — Full Processing Runbook

This is the complete step-by-step runbook for closing July 2026 payroll through the Monthly Payroll Cockpit. It is written against the live state of the system as read today.

Doctrine reminder that governs every step: **RazorpayX is the paying authority; HRMS is the feeder and the auditor.** HRMS pushes inputs in, the run happens on the RazorpayX dashboard, and HRMS then imports what actually happened and compares.

## Where July stands right now

Read from `hr_cockpit_month_state('2026-07-01')`:

| # | Step | Live state |
|---|------|-----------|
| 1 | Lock attendance period | Complete — 1 locked range covering July, locked 1 Aug |
| 2 | Watchdog: zero stale sessions | Complete — 0 open |
| 3 | LOP push to RazorpayX | 0 LOP rows staged |
| 4 | Inputs push (additions/deductions) | 0 rows staged |
| 5 | Run payroll on RazorpayX | Pending |
| 6 | Import payslips + register CSV | 37 payslips present, **0 register rows** |
| 7 | Shadow compare | A run exists (`66c1bfae`, computed, 35 lines) |
| 8 | Drift review | 40 unexplained alerts |
| 9 | Close month | Pending |

Supporting numbers: 37 active employees, 1,026 July attendance-daily rows across 38 employees, 0 pending leave requests, 0 pending regularizations, 0 July penalties.

**One thing to resolve before we start.** 37 July payslips are already sitting in the system tagged `razorpay_import`, and a shadow run has already been computed with 35 lines — even though July has not been run on RazorpayX. Those are almost certainly carried-over/placeholder rows, and the shadow run only covers 35 of 37 people. Step 0 below deals with this before anything else, because a stale payslip set will silently poison the drift comparison at step 8.

## Step 0 — Clear the pre-run artefacts

Before touching inputs: confirm the 37 existing July payslips are placeholders (not a real RazorpayX export), identify the 2 employees missing from the 35-line shadow run, and clear/replace both sets so the post-run import is the only source of July actuals.

## Step 1 — Attendance lock (already green)

Page: **HRMS → Attendance → Period Locks**. July is locked. Verify the locked range actually spans 1–31 July and not a partial window, then acknowledge step 1 in the Cockpit.

## Step 2 — Stale sessions watchdog (already green)

Page: **HRMS → Attendance → Stale Sessions**. Zero open. Auto-passes; acknowledge.

## Step 3 — LOP push

Page: **HRMS → Payroll → Payroll Inputs**, Deductions tab, LOP focus.

- Generate LOP from locked July attendance: unapproved absences minus approved leave minus comp-off, applying weekly-off and holiday exclusions.
- Review the LOP list employee by employee. Currently 0 rows are staged — with 1,026 attendance rows and 0 recorded absences, either July genuinely has no LOP or the absent-marker did not run for July. We confirm which before pushing.
- Push staged LOP rows to RazorpayX (payroll-write gate must be open).

## Step 4 — Other inputs

Same page, Additions and Deductions tabs. Stage and push, in this order:

1. Additions — incentives, arrears, reimbursements, one-off bonuses.
2. Deductions — penalties (none for July yet), loan/advance EMIs from `hr_loans`, deposit instalments from the deposit schedule.
3. Training-period swaps and any Do-Not-Pay marks for the month.
4. New joiners and exits — F&F cases handled through the F&F page, not as ad-hoc deductions.

Each row is pushed individually and logged; the push is blocked when the payroll-write gate is locked.

## Step 5 — Run on RazorpayX

Open the RazorpayX payroll run for July, verify the input counts match what HRMS pushed, execute the run, then come back and acknowledge step 5. RazorpayX exposes no API for run status, so this acknowledgement is manual by design — the cockpit will never auto-tick it.

## Step 6 — Import actuals

Two imports, both required:

1. **Payslip import** — HRMS → Payroll → Payslip History Import. Discover, then import July payslips.
2. **Salary Register CSV** — HRMS → Payroll → Import Salary Register. You have the 42-column July register. This is the only trustworthy source of the PF / ESI / PT statutory breakdown, and register rows are currently 0, so this step is mandatory before drift review means anything.

Match rate is shown before import commits; unmatched rows point at gaps in `hr_razorpay_employee_map` and get resolved there.

## Step 7 — Shadow compare

Page: **HRMS → Payroll → Shadow Calculator**. Re-run for July after the imports so the shadow computes against the real register, not the stale artefacts. The engine applies the CTC-inclusive doctrine (employer statutory carved out of the CTC pool via fixed-point iteration) and per-employee statutory enrollment from `hr_employee_statutory_profiles` — including the PF/ESIC switches set from the registration reports.

Expect the run to cover all 37 active employees; anything short of that is a mapping gap to fix, not a result to accept.

## Step 8 — Drift review

Page: **HRMS → Data Health**. 40 unexplained alerts stand today. The open set across all months breaks down as: designation 23, department 9, active state 4, date of joining 4, dismissal state 3, email 1, bank account 1, full name 1.

Note that most of these are **master-data** drift, not money drift. They still block the close, so each is either corrected on the authoritative side or explicitly resolved with a note. Money drift within ±₹5 and TDS rounding is auto-tolerated and will not appear.

## Step 9 — Close month

Once steps 1–8 are acknowledged, `hr_close_payroll_month` runs. If it refuses, it returns the exact blocker list and we clear them one at a time.

## Technical notes

- Cockpit state comes from `hr_cockpit_month_state(_month)`; acknowledgements from `hr_cockpit_ack_step`; closing from `hr_close_payroll_month` — all keyed on `2026-07-01`.
- Payroll input rows live in `hr_payroll_input_additions` / `hr_payroll_input_deductions`, keyed by `period_month`.
- Statutory intent is `hr_employee_statutory_profiles` (effective-dated); RazorpayX actuals are only knowable from the imported register, since Opfin's `people:view` returns 13 keys and none are statutory.
- Drift lives in `hr_drift_alerts` with `auto_status` / `dedup_key` de-duplication.

## How we work through it

I will walk you through the steps in order. At each step I will tell you exactly what to click, what numbers to expect, and what a wrong number means. You report back what you see — errors, mismatched counts, missing buttons — and I fix the underlying cause (root cause, not a patch) before we move on.
