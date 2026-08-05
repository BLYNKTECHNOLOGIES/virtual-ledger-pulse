# Attendance Summary — turn raw counts into decision-grade insight

Goal: replace the five raw-count tiles and the two generic charts with metrics an HR head can act on. Every number stays derived from existing attendance data — no estimates, no suggestions, no synthetic figures. The employee table at the bottom stays exactly as it is.

## What the data currently shows (verified)

- For August 2026 the page reports 144 working days / 80 verified present / 55.6% attendance. The maintained `hr_attendance` table holds only 110 employee-day rows for August (37, 9, 36, 28 across Aug 1–4) while the punch-derived daily rollup has a full ~37 rows per day. So the 55.6% is largely a **maintenance-coverage gap**, not real absence. Today the page presents it as if it were absence — that is the single biggest reason the numbers feel untrustworthy.
- July, by contrast, has 1,031 maintained rows for 39 employees — near-complete.
- Rich per-day signal already exists and is unused here: `hr_attendance_daily` (first_in, last_out, net_work_minutes, late_by_minutes, early_departure, punch_count, session_count, status), plus leave requests, weekly-off patterns, holidays and department mapping.

## New page structure

### 1. Period integrity strip (top, above the KPIs)
A single honest line for the selected month: elapsed working days vs total working days in the month, employee-days maintained vs expected, and a coverage percentage. If coverage is below 100%, an amber note names the exact dates and employee count that are unmaintained, and every rate below is labelled "on maintained days" so a low rate is never mistaken for absenteeism.

### 2. KPI tiles — rates with comparison, not totals
Five tiles, each carrying a delta against the same elapsed window of the previous month:

- **Attendance rate (MTD)** — attended ÷ elapsed working days, with ± points vs last month.
- **Loss-of-pay exposure** — LOP days and what share of total payable days that is (the number that actually costs money), plus how many employees carry any LOP.
- **On-time rate** — share of worked days with zero late minutes; sub-line shows average minutes late *when* late (far more actionable than a total minutes figure).
- **Average net hours per worked day** — from `net_work_minutes`, with the share of days that fell short of the scheduled shift length.
- **Employees needing review** — count of people breaching either threshold (≥10% of days lost, or late on ≥30% of worked days), listed by name underneath.

### 3. Daily attendance trend (replaces nothing, adds context)
A combined chart over the selected month: attendance rate per day (line) plus late arrivals per day (bars). This exposes patterns a monthly total hides — Monday dips, post-holiday absence spikes, a specific day where the device stopped reporting.

### 4. Punctuality distribution (replaces "Top Late Employees by minutes")
Buckets of worked days by lateness: on time, 1–15 min, 16–30 min, 31–60 min, 60+ min. This answers the real question — is lateness a widespread drift of a few minutes (a grace-period/shift-timing decision) or a handful of severe cases (an individual-performance decision). Alongside it, a **chronic vs occasional** split: employees late on ≥50% of their worked days versus those with isolated instances, each with names and their own late-day counts.

### 5. Day-of-week pattern
Absence rate and late rate per weekday across the selected month. Directly supports staffing and shift-design decisions.

### 6. Department comparison (using existing department mapping)
Per department: headcount, attendance rate, on-time rate, LOP days, average net hours. Sorted by attendance rate so outlier teams surface immediately.

### 7. Exception register (data-integrity watchlist)
Compact list of things that need a human, each with the employee name and day count: no biometric signal for the month, days with punches but no maintained attendance row, single-punch days (missing punch-out), and days whose net hours are implausibly long or short. These are facts from the data, flagged, not judged.

### 8. Day distribution
Kept, but converted from a pie into a horizontal stacked bar (present / paid leave / LOP / half-day), which reads accurately at a glance and shows exact day counts on hover.

The employee table below remains untouched.

## Technical notes

- Extend the page's data layer to also fetch `hr_attendance_daily` for the selected month (and the equivalent elapsed window of the previous month for deltas) via `fetchAllPaginated`, joined client-side to the employees already loaded; department comes from `hr_employee_work_info` → `departments`.
- The existing `hr_attendance_month_summary` RPC continues to be the authority for working days, LOP, paid leave and the table — no change to payroll-facing logic.
- Scheduled shift length for the short-day/long-day checks comes from `hr_shifts.duration_hours` via `hr_employee_shift_schedule`; where no shift is mapped, the employee is excluded from that metric and counted in the exception register rather than assigned a default.
- All new aggregation is presentation-layer; no migrations, no changes to LOP or payroll computation.
