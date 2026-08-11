# Calendar View: per-day check-in / check-out details

Make every date tile in Attendance → Calendar View explain itself: hover for a quick summary, click for the full day breakdown of that employee.

## What you'll get

**Hover on any date tile** — an instant tooltip showing:
- Date and status (Present / Absent / Half day / Leave / Week off / Holiday / Incomplete / No punch)
- First in and last out (IST, e.g. `09:12 → 18:41`)
- Worked hours, late by / early out by minutes
- Number of punch sessions, and a "held by watchdog" marker when applicable
- For days with no record: a plain "No punch recorded" / "Weekly off" / "Holiday" line instead of an empty box

**Click on any date tile** — a day-detail dialog for that employee and date:
- Header: employee name, badge ID, date, status chip
- Summary row: first in, last out, worked, break, late, early out, LOP contribution for the day
- Session list: each in/out pair with its duration (`09:12 – 13:30 = 4h 18m`)
- Kept vs suppressed punches, with the reason each punch was suppressed
- Flags: night span, shift deviation, watchdog hold
- Regularization history for that day, when present
- Footer links: "Open full day detail" (existing day page) and "Raise regularization"

Tiles become keyboard-focusable so the same detail opens with Enter/Space.

## Data correctness (important)

The calendar today reads the legacy `hr_attendance` table. That is the stale source we already retired on the Hours & Overtime page — it disagrees with the v4 attendance engine, which is why some tiles show a status that does not match the rest of HRMS.

As part of this change the calendar tiles, the per-employee P/A/L chips and the top month stats will read the v4 engine truth (`hr_attendance_day_range`), the same source the Overview, Summary and profile calendars already use. So the numbers on this page will line up with everywhere else.

Consequence to be aware of: the existing "Bulk Mark Attendance" dialog writes into the legacy table, so its entries will no longer show up on these tiles. It stays on the page for now; routing bulk marking through the regularization/engine path is a separate follow-up.

## Technical notes

- `src/pages/horilla/AttendanceCalendarPage.tsx`
  - Replace the `hr_attendance` month query with `useAttendanceDayRange(visibleEmployeeIds, monthStart, monthEnd)` from `src/hooks/hrms/useAttendanceDay.ts` (the sanctioned single reader; a CI guard blocks querying `hr_attendance_daily` directly).
  - Map the engine statuses (`present`, `half_day`, `absent`, `on_leave`, `week_off`, `holiday`, `incomplete`, `in_progress`, `no_punch`, `no_data`) to tile styles and extend the legend accordingly.
  - Recompute the per-employee chips and the five month KPI cards from the same rows.
- New `src/components/hrms/attendance/DayTileTooltip.tsx` — Radix `Tooltip` content built from the already-loaded `AttendanceDay` row (no extra fetch on hover).
- New `src/components/hrms/attendance/AttendanceDayDialog.tsx` — `ResponsiveDialog` that lazily calls `rpc("hr_attendance_day_detail", { p_employee_id, p_date })` only when opened, and renders sessions / kept / suppressed punches / flags / LOP, reusing the field layout of `AttendanceDayDetailPage`.
- Times are formatted in IST wall-clock; night-span days show the out time with a `+1d` marker.
- Mobile: hover is unavailable, so tapping a tile opens the dialog directly.
