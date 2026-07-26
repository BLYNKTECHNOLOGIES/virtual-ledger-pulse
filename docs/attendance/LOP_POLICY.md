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
| approved paid leave / weekly-off / holiday | 0 |
| **day with an OPEN watchdog session** | **0 (held harmless)** |

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
