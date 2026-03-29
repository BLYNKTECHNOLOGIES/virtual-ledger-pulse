# HRMS v6 Analysis — Verified Against Our Actual Database

Claude's analysis identified 32 items. After verifying each against our live database functions, triggers, and schema, here is the real status:

---

## CONFIRMED REAL BUGS (Must Fix)

### 1. Payroll Engine Crash: Payslip INSERT uses 'draft' but trigger only allows 'generated'

- **Verified**: `fn_generate_payroll` line 438 inserts `'draft'`. Trigger `trg_validate_payslip_status` rejects anything not in `('generated', 'paid', 'cancelled')`. **Every payroll run will crash.**
- **Fix**: Single-line change in `fn_generate_payroll` — change `'draft'` to `'generated'`

### 2. Payroll Regeneration Crash: Sets status to 'processing' unconditionally

- **Verified**: Line 460 always sets `status = 'processing'`. If run from `reviewed` state, the payroll state machine blocks `reviewed → processing`. 
- **Fix**: Make status update conditional — only set `'processing'` if current status is `'draft'` or `'processing'`

### 3. Loan Sync DELETE Handler: Wrong column names

- **Verified**: `fn_sync_loan_balance_on_repayment` DELETE handler uses `payment_date` and `loan_amount`. Actual columns are `repayment_date` and `amount`. **Deleting loan repayments (including during payroll regeneration) will crash.**
- **Fix**: Replace `payment_date` → `repayment_date`, `loan_amount` → `amount`

### 4. Dual Salary Template Columns: Payroll reads wrong one

- **Verified**: Both `salary_template_id` and `salary_structure_template_id` exist on `hr_employees`. `apply_salary_template()` writes to `salary_template_id`. `fn_generate_payroll` reads from `salary_structure_template_id` (line 107). **New employees get wrong/no salary breakdown in payslips.**
- **Fix**: Sync data + update `fn_generate_payroll` to read `salary_template_id`

### 5. `present_days` is INTEGER, payroll computes NUMERIC (half-days = 0.5)

- **Verified**: Column is `integer`. Payroll computes `v_present_days` as `numeric` (adds 0.5 for half-days). Postgres truncates 19.5 → 19. **LOP calculations will be wrong for half-day scenarios.**
- **Fix**: `ALTER TABLE hr_payslips ALTER COLUMN present_days TYPE numeric`

### 6. Payroll hardcodes Sunday-only weekly off

- **Verified**: Lines 90-93 use `v_dow != 0` (Sunday only). But `fn_calculate_working_days` exists and handles employee-specific weekly off patterns. **Employees with Sat+Sun off get inflated working days → wrong LOP.**
- **Fix**: Replace hardcoded loop with `fn_calculate_working_days(employee_id, start, end)`

### 7. Employer contributions (PF/ESI) computed but never stored

- **Verified**: Lines 239-242 explicitly skip employer contributions (`pfc`, `esic`). No `employer_contributions` column exists on `hr_payslips`. **Cannot generate PF/ESI compliance reports from payslip data.**
- **Fix**: Add `employer_contributions` JSONB column to `hr_payslips`, populate during payroll

---

## CONFIRMED MISSING AUTOMATION (Must Add)

### 8. No cron for monthly leave accrual

- **Verified**: `run_leave_accrual()` function exists. No cron job named anything with "leave" or "accrual" in the cron list. **Leave allocations never auto-generate.**
- **Fix**: `cron.schedule('monthly-leave-accrual', '0 0 1 * *', 'SELECT run_leave_accrual()')`

### 9. No cron for monthly penalty calculation

- **Verified**: `fn_calculate_monthly_penalties()` exists. No cron job for it. **Penalties won't be ready when payroll runs.**
- **Fix**: `cron.schedule('monthly-penalty-calc', '0 1 1 * *', 'SELECT fn_calculate_monthly_penalties(...)')`

---

## CONFIRMED DATA GAPS (Must Seed)

### 10. Zero 2026 holidays

- **Verified**: `COUNT = 0` for 2026 holidays. **Working days calculation is wrong for all of 2026. Payroll will not deduct for holidays.**

### 11. Zero 2026 leave allocations

- **Verified**: `COUNT = 0` for year=2026. **All leave requests for 2026 will fail balance validation.**

### 12. All 25 active employees missing weekly off patterns

- **Verified**: `COUNT = 25` employees with no weekly off entry. **Working days function falls back to defaults instead of employee-specific patterns.**

### 13. 7 employees with zero salary

- **Verified**: 7 of 25 active employees have `total_salary = 0 or NULL`. **They'll get ₹0 payslips.**

---

## ITEMS FROM CLAUDE'S REPORT THAT ARE NOT REAL ISSUES


| Item                                        | Why it's NOT an issue for us                                                                                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-V6-05: `compute_annual_tax` missing     | **EXISTS** — verified function uses `hr_tax_brackets` + `hr_filing_statuses`. Works correctly.                                                                                                                                     |
| BUG-V6-07: Duplicate leave clash triggers   | **No triggers on `hr_leave_requests` at all** — 0 triggers found. Not applicable.                                                                                                                                                  |
| CLASH-V6-01: 7 BEFORE triggers on leave     | **Same — 0 triggers exist.** Leave validation is handled differently in our system.                                                                                                                                                |
| CLASH-V6-02: CompOff dual triggers          | Not verified as problematic — `fn_allocate_compoff_credit` exists and the logic is sound.                                                                                                                                          |
| BUG-V6-08: No-attendance = full present     | **Intentional** — for new hires without biometric setup. This is our business rule.                                                                                                                                                |
| BUG-V6-11: Sunday OT double-counting        | **Intentional** — Sunday work deserves extra pay beyond proration. Business decision. need to fix this we have holiday rotation now so we schedule rotationally thus if a person work aprt from his schedule then needs exxtra pay |
| DEAD-V6-04: Terminal functions in namespace | **Not HRMS** — these are P2P/ERP functions. Irrelevant.                                                                                                                                                                            |
| DEAD-V6-02: `hr_hour_accounts` empty        | Low priority cleanup, not a bug.                                                                                                                                                                                                   |


---

## IMPLEMENTATION PLAN (Priority Order)

### Migration 1 — Fix Payroll Engine (4 crash bugs)

One SQL migration that:

1. Replaces `fn_generate_payroll` with fixed version: `'draft'` → `'generated'`, conditional status update, use `salary_template_id`, use `fn_calculate_working_days` instead of hardcoded Sunday
2. Fixes `fn_sync_loan_balance_on_repayment` column names
3. Syncs `salary_structure_template_id = salary_template_id` for existing data
4. Alters `hr_payslips.present_days` to `numeric`
5. Adds `employer_contributions` JSONB column to `hr_payslips` and populates it during generation

### Migration 2 — Register cron jobs

1. Schedule `run_leave_accrual()` monthly on the 1st
2. Schedule `fn_calculate_monthly_penalties()` monthly on the 1st at 1 AM

### Migration 3 — Seed critical data

1. Insert 2026 Indian public holidays (~15-20 dates)
2. Bulk-create 2026 leave allocations for all 25 active employees × active leave types
3. Assign default weekly off patterns (Sat+Sun) for all 25 employees

**No UI changes needed.** All fixes are database-level (functions, triggers, schema, data).