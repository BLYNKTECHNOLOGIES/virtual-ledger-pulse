

# Fix Remaining HRMS Issues — 4 Items

## Issue Analysis

### 1. BUG-V6-07: Duplicate Leave Clash Triggers
**Root cause**: Two triggers compute clashes on `hr_leave_requests`:
- `trg_compute_leave_clashes` → inline computation (correct, works on INSERT because it uses `NEW` directly)
- `trg_update_leave_clashes` → calls `compute_leave_clashes(NEW.id)` which queries by ID — but on INSERT, the row doesn't exist yet, so it returns 0 and **overwrites** the correct value

**Fix**: Drop `trg_update_leave_clashes`. The inline `trg_compute_leave_clashes` handles everything correctly.

### 2. CLASH-V6-01: Leave Trigger Execution Order
**Root cause**: Postgres fires same-type BEFORE UPDATE triggers alphabetically:
1. `trg_leave_balance_on_status_change` — deducts balance using `NEW.total_days` (may be wrong from frontend)
2. `trg_validate_leave_balance` — corrects `NEW.total_days` server-side via `fn_calculate_working_days`

Balance deduction happens BEFORE validation corrects the value → wrong amount deducted.

**Fix**: Rename `trg_leave_balance_on_status_change` to `trg_z_leave_balance_on_status_change` so it fires AFTER validation alphabetically.

### 3. CRON-V6-03: CompOff Expiry Cleanup
**Root cause**: `set_compoff_expiry` trigger sets `expires_at = credit_date + 30 days` on `hr_compoff_credits`. But nothing ever acts on expired credits — the corresponding leave allocations remain usable forever.

**Fix**: Create a function `fn_expire_compoff_allocations()` that:
- Finds `hr_compoff_credits` where `expires_at < now()` and `status = 'approved'`
- Sets matching `hr_leave_allocations` (type='CO') `available_days = 0`
- Updates credit status to `'expired'`
- Register a daily cron job at 2 AM

### 4. DEAD CODE: `hr_employee_salary_structures` & `hr_hour_accounts`
**`hr_employee_salary_structures`**: Has full CRUD UI in `EmployeeSalaryStructure.tsx`. Payroll ignores it (reads from templates). This is a design choice — individual salary adjustments are managed here but payroll uses template-based computation. **No change needed** — both serve different purposes (template = standard, structure = individual override). The UI works and is useful for HR to track per-employee customizations.

**`hr_hour_accounts`**: Has a page (`HourAccountsPage.tsx`) with filtering and display. Table is empty because no process populates it. **No change needed** — this is an operational gap (HR hasn't started using it), not a code bug. The UI is ready.

---

## Implementation Plan

### Migration 1: Fix Leave Triggers (BUG-V6-07 + CLASH-V6-01)
Single SQL migration:
```sql
-- Drop duplicate clash trigger
DROP TRIGGER IF EXISTS trg_update_leave_clashes ON hr_leave_requests;

-- Rename balance trigger to fire after validation
ALTER TRIGGER trg_leave_balance_on_status_change 
  ON hr_leave_requests RENAME TO trg_z_leave_balance_on_status_change;
```

### Migration 2: CompOff Expiry System (CRON-V6-03)
SQL migration that:
1. Creates `fn_expire_compoff_allocations()` — finds expired credits, zeros out CO allocations, marks credits as expired
2. Registers `pg_cron` schedule: daily at 2 AM UTC

### Dead Code
No changes. Both tables have UI coverage and serve their intended purposes. The "dead" label from the report was inaccurate — they're operational gaps, not code bugs.

---

## Summary
- 2 SQL migrations (no UI changes)
- Fixes 3 real bugs: duplicate trigger, wrong trigger order, missing expiry automation
- Dead code items confirmed as working-as-designed

