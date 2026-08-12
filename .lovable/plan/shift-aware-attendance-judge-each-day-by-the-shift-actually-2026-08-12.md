# Shift-Aware Attendance: judge each day by the shift actually worked

Today every calculation (late, early-out, early-in, overtime) is measured against the employee's *assigned* shift only. `hr_v4_resolve_shift(employee, date)` returns the roster shift and `hr_v4_shift_metrics` computes late/early/OT from that shift's start and end times. So a Morning-Shift employee who works the Evening Shift on a given day is scored as ~8h late and gets a large phantom overtime figure.

The fix: detect the shift the employee actually worked on that day from the punches, and use that shift for all day-level calculations.

## Detection rule

For each attendance day with a first punch:

1. Start from the assigned shift (schedule → work info fallback).
2. Compute how far the first-in is from the assigned shift's start.
3. Only if that deviation is a *clear mismatch* (outside the assigned shift's grace + a tolerance band, using the existing `hr_attendance_engine_settings.shift_match_tolerance_hours`, currently 3h) do we look for a better shift.
4. Among all active shifts, pick the one whose start time is nearest to the actual first-in (day-boundary aware, so a 01:00 Night Shift start correctly matches a 00:50 punch).
5. Switch only if that candidate is materially closer than the assigned shift and lands inside the tolerance band; otherwise keep the assigned shift so ordinary lateness still counts as lateness.
6. No punches, or no candidate inside tolerance → assigned shift, unchanged behaviour.

Because the trigger is a *clear* mismatch, a 30–90 minute late arrival on the Morning Shift is still Late; a 17:05 arrival is judged as Evening Shift.

## What gets recalculated against the detected shift

- Late come (grace taken from the *detected* shift, e.g. 90 min for Evening vs 80 for Morning)
- Early out (against the detected shift's end, overnight-aware)
- Early in / late out reporting values
- Overtime (minutes past the detected shift's end, still clamped to the daily OT ceiling and still suppressed on watchdog-repaired days)
- Half-day / present threshold is net-work-minutes based and is unaffected — no change needed
- `hr_late_come_early_out` register rows are rebuilt with the detected shift id, so the Late/Early page and penalty generation follow the same truth
- `hr_attendance.shift_id` mirror is stamped with the detected shift, so payroll/report readers stay consistent

## Dependent flows also aligned

- **Legacy trigger `auto_track_late_early`** currently recomputes late/early from the assigned shift on any `hr_attendance` write and would overwrite engine values — it will use the same detection helper.
- **Stale-session resolution "Mark shift end"** (`hr_resolve_stale_session`) closes the day at the assigned shift's end. It will close at the *detected* shift's end so an evening-shift day is not truncated to 17:00.
- **Watchdog / long-shift and OT suppression** logic stays intact.
- **Attendance calendar, day dialog, day tooltip, insights, stale-sessions page** will show the shift the day was judged against, with a small "worked <Shift>" indicator when it differs from the assigned shift.

## Technical notes

- New SQL function `hr_v4_detect_shift(p_employee_id, p_date, p_first_in)` returning the shift id plus a reason (`assigned`, `detected_mismatch`); implemented on `hr_shifts` where `is_active = true`.
- `hr_v4_recompute_range` calls it in place of the bare `hr_v4_resolve_shift` for the metrics/mirror/register passes; it writes `detected_shift_id` as before and adds `assigned_shift_id` and `shift_source` into the day's `flags` jsonb, so HR can see why a day was judged differently. No new columns are required.
- `hr_v4_resolve_shift` remains as the "assigned shift" resolver and keeps its current signature (other callers unaffected).
- One-time backfill: run `hr_v4_recompute_range` over unlocked days from the v4 cutover (2026-07-17) to today so historical off-shift days are re-scored; period-locked and payroll-locked windows are skipped by the existing guard.
- Verification: query days where detected ≠ assigned before/after, confirm late/early/OT collapse to sane values, and re-check a known evening-on-morning case.
- Append a line to `docs/STATE_LOG.md`.
