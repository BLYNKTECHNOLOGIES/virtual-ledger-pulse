

# Fix Attendance Processing Logic — Shift-Aware, Deterministic

## Problem Summary
The `processAttendance` function in `biometric-webhook/index.ts` has five critical flaws:
1. Uses calendar-date boundaries instead of shift windows — breaks overnight shifts
2. Uses pairwise IN/OUT logic creating multiple activity rows per employee per day
3. Hardcodes 09:30/18:30 shift times for late/early calculations
4. No shift-aware punch assignment
5. No logging of ignored/skipped punches

## Architecture (No DB Changes)

```text
Raw Punch → biometric-webhook
              │
              ├─ Store in hr_attendance_punches (unchanged)
              │
              └─ processAttendance() ← THIS GETS REWRITTEN
                    │
                    ├─ 1. Look up employee by badge_id
                    ├─ 2. Look up employee's shift via hr_employee_work_info → hr_shifts
                    ├─ 3. Compute shift window for punch date (handles overnight)
                    ├─ 4. Query ALL punches within that shift window
                    ├─ 5. First punch = check-in, Last punch = check-out
                    ├─ 6. UPSERT single hr_attendance_activity row (not insert new)
                    ├─ 7. UPSERT hr_attendance row with shift-aware late/early calc
                    ├─ 8. UPSERT hr_attendance_daily summary
                    └─ 9. Log ignored intermediate punches
```

## Implementation Plan

### Step 1: Rewrite `processAttendance()` in `biometric-webhook/index.ts`

Replace the entire function with shift-aware logic:

**a) Shift Window Calculation**
- Fetch employee's `shift_id` from `hr_employee_work_info`
- Fetch shift's `start_time`, `end_time`, `is_night_shift`, `grace_period_minutes` from `hr_shifts`
- For overnight shifts (end < start): window = `{date}T{start}` → `{date+1}T{end}`
- For day shifts: window = `{date}T{start}` → `{date}T{end}`
- Attendance date = shift start date (not punch calendar date)

**b) Punch Collection & Reduction**
- Query `hr_attendance_punches` WHERE `employee_id = badge_id` AND `punch_time BETWEEN shift_window_start AND shift_window_end`
- Sort chronologically
- `first_punch` = check-in, `last_punch` = check-out (if > 1 punch)
- All intermediate punches are ignored

**c) Single Activity Record**
- UPSERT into `hr_attendance_activity` on `(employee_id, activity_date)` — one row per employee per shift-date
- Set `clock_in = first_punch`, `clock_out = last_punch` (or NULL if only 1 punch)

**d) Attendance Record**
- UPSERT into `hr_attendance` with shift-aware calculations:
  - `late_minutes` = difference from actual shift start + grace period (not hardcoded 09:30)
  - `early_leave_minutes` = difference from actual shift end
  - `attendance_status`: absent (0 punches), half_day (<50% shift duration), late (past grace), present

**e) Daily Summary**
- UPSERT into `hr_attendance_daily` using shift times, not hardcoded 09:30/18:30

### Step 2: Update `AttendanceActivityPage.tsx` consolidation logic

The UI consolidation in `useMemo` already does first-in/last-out grouping. Minor fix needed:
- For night shift employees, when querying activities, also fetch `activity_date = previous day` to capture overnight shift start
- The query already fetches by both `activity_date` and `clock_in` date range — this handles it

### Step 3: Update `LiveAttendanceDashboard.tsx`

- No changes needed — it already reads from `hr_attendance_activity` and shows first-in/last-out correctly

### Step 4: Redeploy edge function

Deploy the updated `biometric-webhook` edge function.

## Key Design Decisions
- **No database schema changes** — all tables remain as-is
- **Attendance date = shift start date** — overnight shift punches at 2am are assigned to the previous day's shift
- **Fallback for employees without shift assignment** — use default 09:00-18:00 window
- **Single activity row per employee per shift-date** — UPSERT replaces INSERT, eliminating duplicate rows
- **Deterministic** — same punches always produce same output regardless of processing order

## Files Changed
1. `supabase/functions/biometric-webhook/index.ts` — rewrite `processAttendance()` (~120 lines)
2. No other files require changes

