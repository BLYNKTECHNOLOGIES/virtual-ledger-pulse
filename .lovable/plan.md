# Fix attendance calendar date gaps

## Root cause
The calendar is rendering the database truth correctly: Virendra has attendance rows for 27 and 29 August, but no row at all for 28 August. The daily absent-marker only processes one calculated date per run, so any missed or failed scheduled run leaves a permanent hole; its existing healer only converts existing `no_data` rows and cannot create a missing row.

## Changes
- Make the absent-marker reconcile a rolling window of recently closed attendance dates on every run, not only one date, so a transient cron or network failure self-heals on the next run.
- Preserve holidays, approved leave, employee-specific weekly offs, existing punches, and meaningful/manual attendance statuses while filling only genuinely missing or `no_data` workdays.
- Repair Virendra’s missing 28 August row and scan the same recent period for equivalent gaps across active employees.
- Add regression tests around skipped-run recovery, Sundays/weekly offs, holidays, leave, and existing attendance.
- Deploy the function and verify through database rows, audit entries, function invocation/logs, and the rendered calendar where authentication permits.

## Technical details
- Keep `hr_attendance_daily` as canonical truth and mirror absent rows into legacy `hr_attendance` for downstream compatibility.
- Use IST attendance-window dates and only reconcile fully closed days.
- Keep processing idempotent via upserts and never overwrite meaningful statuses with `absent`.
