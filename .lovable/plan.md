

# HRMS V5 Fixes — Implementation Plan

## Overview
11 confirmed fixes across 3 priority tiers, implemented via a single database migration.

---

## P0 — Critical Runtime Fixes (3)

### 1. BUG-V5-01: Attendance Lock Column Fix
**Problem:** `fn_lock_attendance_for_completed_payroll` references `month` and `year` columns that don't exist on `hr_payroll_runs`. Will crash all attendance operations when a payroll run is locked.

**Fix:** Replace with date-range check using `pay_period_start` and `pay_period_end`:
```sql
AND pay_period_start <= v_date AND pay_period_end >= v_date
```

### 2. BUG-V5-02: Re-attach Late Tracking Trigger
**Problem:** `auto_track_late_early` function exists and correctly computes `NEW.late_minutes`/`NEW.early_leave_minutes`, but its trigger was removed during v4 dedup. The AFTER trigger (`sync_late_come_early_out`) has nothing to persist.

**Fix:** Create BEFORE trigger:
```sql
CREATE TRIGGER trg_auto_track_late_early
  BEFORE INSERT OR UPDATE ON hr_attendance
  FOR EACH ROW EXECUTE FUNCTION auto_track_late_early();
```
Alphabetical ordering ensures it fires before `trg_lock_attendance_for_payroll` and `trg_sync_late_come_early_out`.

### 3. BUG-V5-03: Leave Reset ON CONFLICT Fix
**Problem:** `execute_leave_reset` uses `ON CONFLICT (employee_id, leave_type_id, year)` but the unique constraint includes `quarter`. INSERT also omits `quarter`. Re-running creates duplicate allocations.

**Fix:** Add `quarter = 1` to INSERT, update ON CONFLICT to `(employee_id, leave_type_id, year, quarter)`.

---

## P1 — Salary & Logic Fixes (4)

### 4. BUG-V5-04: Fix `apply_salary_template` percentage_of
**Problem:** Templates use `'total_salary'` and `'basic_pay'` but function only recognizes `'basic'`, `'gross'`, `'total'`. BASIC gets computed as 25% instead of 50%.

**Fix:** Expand IF branches:
- `IN ('basic', 'basic_pay', 'basic_salary')` → use basic_salary
- `IN ('gross', 'total', 'total_salary', 'gross_salary')` → use total_salary

### 5. BUG-V5-05: Fix HRA Formula Evaluation
**Problem:** Formulas like `total_salary - basic_pay - epf_employee` exist in templates but `apply_salary_template` just stores `COALESCE(value, 0)` = 0.

**Fix:** Add formula evaluation within the function — build a vars map (total_salary, basic_pay, component codes) and evaluate the formula expression, matching the approach in `salaryComputation.ts`.

### 6. BUG-V5-10: Block INSERT on Locked Payroll
**Problem:** `trg_enforce_payslip_lock` fires on UPDATE/DELETE only (tgtype=27). INSERT is not blocked.

**Fix:** Drop and recreate trigger with INSERT:
```sql
BEFORE INSERT OR UPDATE OR DELETE ON hr_payslips
```

### 7. BUG-V5-08: Drop Orphaned Leave Function
**Problem:** `handle_leave_balance_on_status_change` exists with no trigger and uses wrong case values. `validate_leave_balance_on_approve` already doesn't exist.

**Fix:** `DROP FUNCTION IF EXISTS handle_leave_balance_on_status_change;`

---

## P2 — Safeguards & Cleanup (4)

### 8. BUG-V5-09: Loan/Deposit Sync on UPDATE/DELETE
**Problem:** Both sync triggers only fire on INSERT. Amount corrections or deletions leave balances stale.

**Fix:** Expand both triggers to INSERT OR UPDATE OR DELETE. Add OLD-row handling: on DELETE, reverse the balance change; on UPDATE, use NEW values.

### 9. GAP-V5-07: Loan State Machine
**Problem:** `fn_validate_loan_status` only checks allowed values, not transitions. Loans can jump `pending → closed`.

**Fix:** Add transition validation:
- `pending → approved | rejected`
- `approved → active | rejected`
- `active → closed`
- `rejected` and `closed` are terminal

### 10. GAP-V5-05: Alternating Weekly Offs
**Problem:** `fn_calculate_working_days` reads `is_alternating` and `alternate_week_offs` but ignores them. Alternating Saturdays counted as working days.

**Fix:** When `is_alternating = true`, check week number (odd/even from a reference date) to determine if alternate days apply for that specific week.

### 11. Cleanup: Duplicate Indexes + RLS
**Drop duplicate indexes:**
- Keep `hr_attendance_employee_id_attendance_date_key` (unique), drop any duplicate
- Keep `hr_attendance_daily_employee_id_attendance_date_key` (unique), drop `idx_daily_emp_date` (non-unique duplicate on same columns)

**Drop duplicate RLS policies (keep the `authenticated_all_*` pattern):**
- `hr_deposit_transactions`: drop "Allow all for authenticated users"
- `hr_employee_deposits`: drop "Allow all for authenticated users"
- `hr_onboarding_stages`: drop "Authenticated users can manage..." and "...can view..."
- `hr_onboarding_tasks`: same
- `hr_onboarding_task_employees`: same

---

## Technical Details

### Files Changed
| File | Action |
|------|--------|
| `supabase/migrations/xxx.sql` | Single migration with all 11 fixes |

### No Frontend Changes Required
All fixes are database-level (functions, triggers, indexes, policies). No React/TS code changes needed.

### Risk Assessment
- P0 fixes are safe — they fix broken references and restore removed functionality
- P1 salary fix: `apply_salary_template` change won't retroactively fix existing data. After fix, templates should be manually reapplied per employee via the UI
- P2 loan state machine: existing loans with unexpected status combos won't be blocked (trigger only validates future transitions)
- Cleanup: removing duplicate indexes/policies has zero functional impact

