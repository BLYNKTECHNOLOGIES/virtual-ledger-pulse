# Attendance Summary — August LOP / Sunday Clarification

## What the user asked

1. For August 2026, the report shows **Working Days = 3** as of 4 Aug. Is Sunday excluded from those 3 days?
2. Meenu Raja shows **LOP = 2**. Is Sunday absenteeism being counted as LOP?

## Verified current state

- Employee `Meenu Raja` (`badge_id=52`, `id=f6f2966d-de27-4a5e-85b0-3c49186f0055`).
- `hr_attendance_month_summary(..., '2026-08-01')` returns for her:
  - `working_days = 3`
  - `present_days = 1`
  - `lop_days = 2`
  - Formula: `LOP = elapsed working days 3 (of 25 in month) − (Attendance Summary present 1 + half-day credit 0.0 + paid leave 0) = 2.0`
- The 3 elapsed working days are **1 Aug (Sat), 3 Aug (Mon), 4 Aug (Tue)**. **Sunday 2 Aug is excluded** by the weekly-off logic and is **not** counted as a working day.
- Sunday absence therefore contributes **zero** LOP.

## Root cause of the displayed LOP

Meenu Raja was present only on **1 Aug**. The 2 LOP days are **3 Aug** and **4 Aug**.

However, the current time in IST is **04:32 on 4 Aug**, and the v4 engine's `day_cutoff_ist` is **05:00:00**. Before 05:00 IST, the attendance day has not "closed" — the engine should still be treating 4 Aug as "not yet elapsed". The current `hr_attendance_month_summary` function uses `v_today = (now() AT TIME ZONE 'Asia/Kolkata')::date` directly, so it counts 4 Aug as elapsed even though the day cutoff has not passed.

This is why the report shows **LOP = 2** instead of **LOP = 1** (only 3 Aug absent).

## Proposed fix

Update `public.hr_attendance_month_summary` so that `v_elapsed_end` respects `hr_attendance_engine_settings.day_cutoff_ist`:

```text
- Read day_cutoff_ist from hr_attendance_engine_settings.
- Compute current IST timestamp.
- If current IST time is BEFORE day_cutoff_ist, treat "today" as yesterday for elapsed-working-day purposes.
- Otherwise treat today as elapsed.
```

This aligns the summary's elapsed window with the v4 attendance engine's day boundary and prevents the current day from being prematurely counted as LOP before the cutoff.

## Acceptance criteria

1. Re-running `hr_attendance_month_summary` for Meenu Raja before 05:00 IST on 4 Aug returns `working_days = 2`, `lop_days = 1`.
2. After 05:00 IST on 4 Aug, it returns `working_days = 3`, `lop_days = 2` (assuming no attendance is recorded).
3. Sunday 2 Aug continues to be excluded from working days and LOP in both cases.
4. No regression for other employees or months.

## Scope

- One SQL migration updating `public.hr_attendance_month_summary`.
- No UI changes required; the summary page already consumes this RPC.
