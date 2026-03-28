

# P2 + P3 Implementation Plan

## Summary
13 items across schema fixes, data corrections, logic improvements, and new functions. Skipping PAYROLL-02 (payslip columns) per your decision.

---

## P2 — Bug & Constraint Fixes (7 items)

### BUG-04: Clean dead status values in `update_leave_clashes_on_change`
**Current:** `IF NEW.status IN ('requested', 'pending', 'approved', 'Approved', 'Requested')`
**Fix:** Change to `IF NEW.status IN ('requested', 'approved')` — the others are dead code that will never match the CHECK constraint.

### GAP-01: Add CHECK constraints on 8 status fields
Add validation triggers (not CHECK constraints, per Supabase best practice) on:
- `hr_payroll_runs.status` → draft/processing/generated/reviewed/completed/cancelled
- `hr_payslips.status` → generated/paid/cancelled
- `hr_loans.status` → pending/approved/rejected/active/closed
- `hr_attendance.attendance_status` → present/absent/half_day/late/on_leave
- `hr_objectives.status` → draft/in_progress/completed
- `hr_helpdesk_tickets.status` → open/in_progress/resolved/closed
- `hr_assets.status` → available/assigned/maintenance/retired
- `hr_offer_letters.status` → draft/sent/accepted/rejected/expired

### GAP-06: Punch dedup unique constraint
`ALTER TABLE hr_attendance_punches ADD CONSTRAINT uq_punch_emp_time UNIQUE (employee_id, punch_time);`

### LEAVE-01: Fix LOP configuration
- Set `max_days_per_year = 0` (unlimited) and `carry_forward = false` for LOP leave type.

### LEAVE-02: Fix CO compensatory flag
- Set `is_compensatory_leave = true` for Compensatory Off (code: CO).

### LEAVE-05: Half-day total_days enforcement
Add a BEFORE INSERT OR UPDATE trigger on `hr_leave_requests`: if `is_half_day = true`, force `total_days = 0.5`.

### PAYROLL-04: Duplicate payroll run prevention
Add partial unique index: `CREATE UNIQUE INDEX uq_payroll_run_period ON hr_payroll_runs (pay_period_start, pay_period_end) WHERE status != 'cancelled';`

---

## P3 — Logic & Features (6 items)

### FEAT-05: Salary template → structure sync function
Create `apply_salary_template(p_employee_id UUID, p_template_id UUID)` that:
1. Reads employee's `total_salary` and computes `basic_salary = total_salary * 0.5`
2. Deletes existing `hr_employee_salary_structures` for that employee
3. For each template item: computes the actual amount based on `calculation_type` (percentage/fixed/formula)
4. Inserts new structure rows with correct `is_percentage` flag
5. Updates `hr_employees.basic_salary` and `salary_template_id`

### FEAT-04: Monthly penalty auto-calculation
Create a DB function `fn_calculate_monthly_penalties(p_year INT, p_month INT)` that:
1. Counts late_come records per employee for the month from `hr_late_come_early_out`
2. Matches count against `hr_penalty_rules` thresholds
3. Inserts penalty records into `hr_penalties`
This can be called manually or via cron.

### GAP-05: Salary revision type improvement
Change the trigger to accept a session variable `current_setting('app.revision_type', true)` — if set by the application, use it; otherwise default to `'correction'`. This lets the UI pass `'increment'`, `'promotion'`, etc.

### PAYROLL-01: Payroll status state machine
Add a validation trigger on `hr_payroll_runs` that enforces valid transitions:
- draft → processing
- processing → generated
- generated → reviewed
- reviewed → completed
- any → cancelled (except completed)

### PAYROLL-03: Working days calculation function
Create `fn_calculate_working_days(p_employee_id UUID, p_start DATE, p_end DATE)` that:
1. Counts calendar days in range
2. Subtracts holidays from `hr_holidays`
3. Subtracts weekly offs from `hr_employee_weekly_off_assignments`
4. Returns working days count
Note: depends on holiday and weekly off data being populated (your team handles via UI).

---

## Implementation

**Migration 1 (P2):** Single SQL migration with all 7 P2 fixes — schema constraints, data updates, trigger additions.

**Migration 2 (P3):** Single SQL migration with all 6 P3 functions and triggers.

**No UI changes required** — all fixes are database-level. The `apply_salary_template` function can be called from existing Salary Structure UI later.

## What is NOT included
- PAYROLL-02 (payslip penalty/loan columns) — skipped per your decision
- All DATA items — team handles via UI
- P4 features (attendance regularization, resignation workflow, payslip PDF, onboarding checklist)

