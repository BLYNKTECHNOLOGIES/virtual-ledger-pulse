# Single Attendance Truth (V1)

**Rule:** every surface that shows a per-day attendance status, first/last
punch, worked minutes, late/early flag, or per-day LOP contribution reads
from **one** place — `public.hr_attendance_day_v` — via the hook
`useAttendanceDay` / `useAttendanceDayRange`
(`src/hooks/hrms/useAttendanceDay.ts`).

## Why

Three surfaces (employee calendar, HR overview, HR day detail) previously
derived status/LOP independently from raw tables. When derivations drift, an
employee can see their calendar show a green day while the payslip docks
them for it — the exact class of dispute that made the payroll-split
incidents so painful. One shared read layer makes disagreement impossible
by construction.

## Sources of truth

`hr_attendance_day_v` derives from:

- `hr_attendance_daily` — engine-computed day row (v4 attendance engine)
- `hr_stale_session_held(employee, date)` — Watchdog fairness gate
- The per-day LOP mirror of `hr_lop_days` (same SQL clauses)

Everything else is downstream.

## Guard

`scripts/check-attendance-single-source.sh` greps `src/**` for direct
references to `hr_attendance_daily` / `hr_lop_days` outside the sanctioned
reader (and the payroll month-scope calculator). CI fails on any new hit.

## How to add a new attendance surface

1. Call `useAttendanceDayRange(employeeIds, from, to)`.
2. Render its fields; never re-derive status locally.
3. If you need a new column, add it to the view — not to the caller.
