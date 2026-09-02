# LOP Policy — Single Source of Truth

**Function:** `public.hr_lop_days(employee_ids uuid[], period_month date)`

Returns `(employee_id, lop_days numeric)` for the given roster and month. This
is the ONLY LOP calculator that payroll (shadow + real) is allowed to consume.

## Rules

| Day shape | LOP contribution |
|-----------|------------------|
| present / present_half_absent second half handled by half-day | 0 |
| half_day (any origin) | 0.5 |
| absent (with no approved leave, no weekly-off, no holiday) | 1.0 |
| approved unpaid leave (`hr_leave_types.is_paid = false`) | 1.0 |
| approved paid leave actually covered by a balance / weekly-off / holiday | 0 |
| **approved paid-type leave NOT covered by any balance** (cascade shortfall, `hr_leave_requests.unpaid_days`) | **1.0 per uncovered working day** |
| **day worked during approved leave** (`hr_leave_worked_days`) | **0 — counted as attendance only, never as leave** |
| **day already fully credited as attended** | **overlapping approved leave adds nothing (no double credit); half-days still allow half work + half leave** |
| **approved regularisation** | **credited once, through the day's final marked status — an approved regularisation does not additionally excuse the day** |
| **day with an OPEN watchdog session** | **0 (held harmless)** |
| **policy late occurrences** | **1 LOP day per `late_count_for_lop` distinct late DATES** (only if threshold > 0; currently 0 = disabled) |
| **policy half-day occurrences** | **disabled by owner decision (2026-09-02): `half_day_count_for_lop = 0`, so a half-day costs 0.5 day and nothing more** |

## Policy-driven LOP

The active default `hr_attendance_policies` row drives two optional extra LOP
rules:

- `late_count_for_lop`: number of late-come occurrences that add 1 LOP day.
  Counted as distinct late **dates** (two late punches in a day = 1).
  Set to `0` to disable late-based LOP deductions entirely. **Currently 0.**
- `half_day_count_for_lop`: extra LOP days on top of the base 0.5-per-half-day
  deduction. **Currently 0 — owner decision, no extra half-day penalty.**


## Fairness gate

`hr_stale_session_held(employee_id, date)` returns TRUE when a stale session
row exists in `status='open'` for that (employee, date) pair. `hr_lop_days`
consults this gate BEFORE emitting any 0.5 / 1.0 contribution: nobody is
docked for a day the v4 engine hasn't finished thinking about.

Resolving the session on the Watchdog (`/hrms/attendance/watchdog`) closes the
gate and the day re-enters the LOP calculation on the next payroll pass.

## Deprecations

- `hr_compute_lop_days(...)` is now a thin backward-compatible wrapper around
  `hr_lop_days` — do NOT add new call sites; migrate them.
- Any client-side LOP tally is a bug. If you see one, replace it with an RPC
  call to `hr_lop_days`.
