

# P0 + P1 Bug Fixes — Single Migration

## Scope (7 items)

| # | Bug | What | Type |
|---|-----|------|------|
| 1 | BUG-01 | Add UNIQUE on `hr_attendance_daily(employee_id, attendance_date)` | Schema |
| 2 | BUG-02 | Set `is_night_shift = true` for "Night Shift" | Data fix |
| 3 | BUG-03 | Fix `fn_leave_balance_on_status_change` — reverse balance on `rejected` too | Logic |
| 4 | BUG-05 | Add `is_percentage BOOLEAN DEFAULT true` to `hr_employee_salary_structures` | Schema |
| 5 | BUG-06 | Delete ESIC rows for employees with `total_salary > 21000` | Data fix |
| 6 | BUG-07 | Populate `basic_salary = total_salary * 0.5` for all employees where NULL | Data fix |
| 7 | GAP-02 | Drop empty `hr_employee_salary` table | Schema |

## What changes and why

**BUG-01**: No unique constraint on `(employee_id, attendance_date)` — biometric syncs can create duplicate daily records, doubling payroll working-day counts. Fix: add unique constraint.

**BUG-02**: "Night Shift" (01:00–09:00) has `is_night_shift = false`. Cross-midnight attendance logic won't handle date boundaries correctly. Fix: set flag to true.

**BUG-03**: `fn_leave_balance_on_status_change` only reverses balance on `cancelled`. If an approved leave is changed to `rejected`, balance is never restored — employee permanently loses those days. Fix: add `rejected` to the reversal condition.

**BUG-05**: `hr_employee_salary_structures.amount` stores values like 12 (PFC) and 4 (ESIC) — these are percentages, not rupee amounts. No column distinguishes them. Fix: add `is_percentage` column (default true since current data is all percentages). Payroll computation already resolves amounts from templates; this column ensures the structure table is self-documenting.

**BUG-06**: ESIC rows exist for employees earning above ₹21,000 (Abhishek ₹50,000, PRIYA ₹33,500, Sushil ₹23,500). Indian ESI law only applies ≤ ₹21,000. Fix: delete those 6 rows.

**BUG-07**: All 26 employees have `basic_salary = NULL`. EPF calculations and the salary revision trigger depend on this field. All current templates use 50% basic. Fix: populate `basic_salary = total_salary * 0.5` where NULL and total_salary > 0.

**GAP-02**: `hr_employee_salary` has 0 rows and duplicates `hr_employee_salary_structures`. Approved for removal.

## Implementation

Single SQL migration file containing all 7 fixes. No UI or frontend changes required — all fixes are database-level.

## What is NOT included (P2+ deferred)
- BUG-04 (dead status values in clash function)
- GAP-01 (CHECK constraints on 8 status fields)
- GAP-06 (punch dedup unique constraint)
- LEAVE-01/02/05 (LOP config, CO flag, half-day enforcement)
- PAYROLL-01/02/03/04 (state machine, payslip columns, working days, duplicate prevention)
- All FEAT items
- All DATA items (DATA-01 through DATA-08)

