# Weekly-off patterns: a proper library plus an "all days working" pattern

Today the system has exactly one pattern — "Standard - Sunday Off" — assigned to all 52 employees, and every calculation (LOP, leave days, comp-off, absence marking, payroll) treats declared holidays as non-working for everyone, with no way to opt an employee out.

This adds a real library of patterns, lets HR move an employee between them, and introduces a pattern where **every calendar day is a working day** — no weekly off, no holiday relief, no accruing leave, no comp-off.

## What HR will get

- A Weekly Off page with a preloaded set of patterns: Sunday off (default for all new joiners), Saturday + Sunday off, 2nd/4th Saturday + Sunday off, single-day-off variants (Monday through Saturday) for shift staff, and **All Days Working**.
- Ability to change an employee's pattern with an effective-from date; history is kept, only one pattern is current.
- Clear labelling of the All Days Working pattern everywhere it appears, so nobody assigns it by accident: a warning on assignment explaining that the employee loses weekly offs, holiday relief, leave accrual and comp-off.

## How "All Days Working" behaves

- Every day of the month counts as a working day, including Sundays and declared holidays.
- Absent on any day (including a holiday) = loss of pay. Present on a holiday = normal paid day, nothing extra, no comp-off.
- No monthly casual-leave credit and no automatic accrual of any leave type; no comp-off credits are ever generated.
- Leave they take is either explicitly approved paid leave from a balance they already hold, or unpaid/LOP.
- LOP per day = monthly pay ÷ calendar days in the month, matching the calendar-day rule already used across payroll.

## Dependencies that must move together

Everything below currently derives working days from the pattern's off-days list and unconditionally subtracts holidays. Each needs to respect the new "counts holidays as working" behaviour:

- Loss-of-pay engine (month and part-month windows) and the employment-gap/joiner-leaver day counter.
- Leave day counting when a leave request spans weekends/holidays.
- Automatic absent marking and the guard that converts "absent on a weekly off" into no-data.
- Comp-off auto-credit on weekly-off/holiday work.
- Leave accrual runs (monthly casual leave and any other plan).
- Monthly payroll cockpit: paid days, LOP days, verification pack sheets and exports, and the amounts pushed to RazorpayX.
- Attendance calendar and employee self-service views, so an all-working employee does not see greyed-out Sundays or holidays.
- Payslip paid-days line (currently month days minus verified LOP days).

## Technical notes

- Add to `hr_weekly_off_patterns`: `counts_holidays_as_working boolean default false`, `excludes_leave_accrual boolean default false`, `excludes_compoff boolean default false`, plus a `code` for stable identification. Seed the new patterns; the existing Sunday pattern keeps all flags false and stays the auto-assign default in `hr_auto_assign_default_weekly_off`.
- Introduce one resolver, `hr_employee_day_policy(employee_id, date)` (or a set-returning `hr_employee_working_calendar(employee_ids, from, to)`), returning off-days, holiday treatment and benefit flags, and make every consumer use it instead of re-reading the pattern:
  - `hr_lop_days_window`, `hr_lop_days`, `hr_compute_lop_days`, `hr_employment_gap_working_days` — the `hols` CTE must not zero out days for employees whose pattern counts holidays as working.
  - `fn_calculate_working_days`, `fn_calculate_leave_days`, `fn_employee_weekly_off_dows`.
  - `hr_block_absent_on_weekly_off`, `hr_heal_no_data_absences`, `hr_attendance_day_range`, `auto-absent-marking` edge function.
  - `hr_grant_sunday_work_credit` — return early when the pattern excludes comp-off.
  - Leave accrual job/plan application — skip employees whose pattern excludes accrual; record the skip reason in the accrual log.
- `razorpay-payroll-proxy` already loads patterns and assignments; extend that load with the new flags so the pushed LOP/paid-day figures agree with the cockpit. Divisor stays calendar days in month.
- Frontend: `WeeklyOffPage.tsx` (pattern editor with the flags + assignment warning), `ShiftScheduleManager.tsx`, `AttendanceCalendarPage.tsx`, `EmployeeAttendanceCalendar.tsx`, `LeaveRequestsPage.tsx`, `RequestLeaveDialog.tsx`, and the payroll verification pack (add a "weekly-off pattern" column so any figure can be traced to the pattern that produced it).
- No changes to already-closed payroll periods: pattern changes apply from their effective-from date forward, and locked months are not recomputed.

## Verification before reporting done

- Run the LOP engine for a test employee on each pattern across a month containing a Sunday and a declared holiday, and confirm working days, LOP days and paid days match by hand.
- Confirm an all-working employee gets no comp-off credit for holiday/Sunday work and no monthly casual-leave credit, while a Sunday-off employee still gets both.
- Re-run the cockpit for the current month for all employees and confirm no figure changes for anyone still on Sunday off (regression guard).
- Append a dated IST line to `docs/STATE_LOG.md`.
