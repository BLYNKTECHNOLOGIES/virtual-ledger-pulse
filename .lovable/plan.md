
# HRMS Bug Fixes & Feature Implementation Status

## ✅ P0 + P1 — Completed (Migration 1)

| # | Bug | What | Status |
|---|-----|------|--------|
| 1 | BUG-01 | UNIQUE on `hr_attendance_daily(employee_id, attendance_date)` | ✅ Done |
| 2 | BUG-02 | Night Shift `is_night_shift = true` | ✅ Done |
| 3 | BUG-03 | Leave balance reversal on `rejected` | ✅ Done |
| 4 | BUG-05 | `is_percentage` column on salary structures | ✅ Done |
| 5 | BUG-06 | Delete invalid ESIC rows (salary > 21000) | ✅ Done |
| 6 | BUG-07 | Populate `basic_salary = total_salary * 0.5` | ✅ Done |
| 7 | GAP-02 | Drop empty `hr_employee_salary` table | ✅ Done |

## ✅ P2 — Bug & Constraint Fixes (Migration 2)

| # | Item | What | Status |
|---|------|------|--------|
| 1 | BUG-04 | Cleaned dead status values in `update_leave_clashes_on_change` | ✅ Done |
| 2 | GAP-01 | Status validation triggers on 8 tables | ✅ Done |
| 3 | GAP-06 | Punch dedup unique constraint `(employee_id, punch_time)` | ✅ Done |
| 4 | LEAVE-01 | LOP: `max_days_per_year=0`, `carry_forward=false` | ✅ Done |
| 5 | LEAVE-02 | CO: `is_compensatory_leave=true` | ✅ Done |
| 6 | LEAVE-05 | Half-day `total_days=0.5` enforcement trigger | ✅ Done |
| 7 | PAYROLL-04 | Partial unique index on payroll run period | ✅ Done |

## ✅ P3 — Logic & Features (Migration 3)

| # | Item | What | Status |
|---|------|------|--------|
| 1 | FEAT-05 | `apply_salary_template()` function + `salary_template_id` column | ✅ Done |
| 2 | FEAT-04 | `fn_calculate_monthly_penalties()` auto-calculation | ✅ Done |
| 3 | GAP-05 | Salary revision type from `app.revision_type` session var | ✅ Done |
| 4 | PAYROLL-01 | Payroll status state machine trigger | ✅ Done |
| 5 | PAYROLL-03 | `fn_calculate_working_days()` function | ✅ Done |

## ✅ P4a — Quick Fixes + Features (Migration 4 + UI)

| # | Item | What | Status |
|---|------|------|--------|
| 1 | BUG-04b | Cleaned dead 'pending' from `compute_leave_clashes` trigger | ✅ Done |
| 2 | GAP-03 | `hr_hour_accounts` TEXT columns → GENERATED from seconds | ✅ Done |
| 3 | LEAVE-03 | Cross-year leave spanning (split deduction across year allocations) | ✅ Done |
| 4 | LEAVE-04 | Minimum notice period (3 days max backdating) | ✅ Done |
| 5 | FEAT-03 | Payslip PDF enhanced (company branding, employee details, attendance, TDS, LOP) | ✅ Done |

## Skipped (by decision)
- PAYROLL-02 (payslip penalty/loan columns)
- All DATA items (DATA-01 through DATA-08) — team handles via UI

## Remaining P4
- FEAT-01 (attendance regularization)
- FEAT-02 (resignation workflow)
- FEAT-06 (onboarding checklist)
- GAP-04 (grace period precedence documentation)
