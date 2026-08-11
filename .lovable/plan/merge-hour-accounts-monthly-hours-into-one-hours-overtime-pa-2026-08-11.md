# Merge "Hour Accounts" + "Monthly Hours" into one Hours & Overtime page

## Why they disagree today

The two pages are not just similar — they read different sources, which is why August shows 1630:45 worked on one page and 1744.2 on the other:

- Hour Accounts reads `hr_hour_accounts`, refreshed from `hr_attendance_daily` (the v4 engine truth), only for active employees, with required hours from the shift + working-day calendar.
- Monthly Hours reads the `hr_monthly_hours_summary` view, which is built off the legacy `hr_attendance` table (330 August rows vs 382 in the daily engine table) and is not scoped to active employees — that is where the "Unknown" employee rows in the chart come from.

So the merge is not only a UI job: both surfaces must be re-pointed at a single truth (`hr_attendance_daily` + `hr_hour_accounts`).

## One page, one truth

New page at `/hrms/attendance/hours` — "Hours & Overtime". The old routes `/hrms/attendance/hour-accounts` and `/hrms/attendance/monthly-hours` redirect to it, and the sidebar keeps a single entry.

### Data

One new database view, `hr_monthly_hours_unified`, one row per active employee per month, combining:

- Worked hours, net worked hours, days present / absent / half-day / leave / holiday-worked — from `hr_attendance_daily`
- Late count, total late minutes, early-out count, early minutes — from `hr_attendance_daily`
- Required hours, pending (deficit) hours, overtime — from `hr_hour_accounts` (kept as the calendar-aware calculation already in place)
- Employee name, badge ID, department, shift

The legacy `hr_monthly_hours_summary` view stays in place untouched for anything else that reads it, but the merged page will no longer use it.

### Layout

```text
Hours & Overtime                    [Month ▾] [Year ▾] [Refresh] [Export CSV]
────────────────────────────────────────────────────────────────────────────
Worked / Required   Utilisation %   Overtime (payable)   Deficit   Late  Absent
  1630:45 / 1980:00     82.4%           00:00             349:15    88     67
────────────────────────────────────────────────────────────────────────────
Insight strip: 5 employees below 70% utilisation · top OT: X (12.5h) ·
               3 employees with zero punches this month
────────────────────────────────────────────────────────────────────────────
[Search employee]   [All / Deficit / Overtime / On track / No data]  [Chart ▾]
────────────────────────────────────────────────────────────────────────────
Table: Employee · Badge · Present · Absent · Worked · Required · Utilisation
       (meter bar) · Overtime · Deficit · Late (n / min) · Early (n / min) · Status
```

- KPI strip is one dense row of meters, no paragraph sub-labels (matching the attendance-summary style already adopted).
- Chart is collapsible and shows worked vs required vs overtime for the filtered set, sorted by deficit — not an unsorted 20-employee dump, and never "Unknown" rows.
- Table columns are sortable; status chip is Deficit / Overtime / On track / No data.
- Clicking a row opens a drill-down dialog with that employee's day-by-day rows for the month (date, in, out, hours, late/early minutes, status) so HR can see what drives the number.
- Mobile keeps the stacked card layout with the same fields.
- Export CSV of the filtered table for payroll/audit hand-off.

### Business-relevant fields added by the merge

Utilisation % (worked ÷ required), payable overtime hours, deficit hours, days with no punch, and a per-employee drill-down — the pieces payroll actually needs, which neither page had on its own.

## Technical notes

- Migration: create `hr_monthly_hours_unified` (security invoker view over `hr_attendance_daily`, `hr_hour_accounts`, `hr_employees`, work info/shift), plus grants to `authenticated`.
- New `src/pages/horilla/HoursOverviewPage.tsx`; delete `HourAccountsPage.tsx` and `MonthlyHoursSummaryPage.tsx`.
- `App.tsx`: new lazy route + two `<Navigate replace>` redirects for the old paths.
- `HorillaSidebar.tsx`: replace the two links with one "Hours & Overtime".
- Refresh button keeps calling `refresh_hour_accounts(p_year, p_month)` and invalidates the unified query.
- Employee search uses the shared `EmployeePicker`/search pattern already standardised across HRMS.
- Append a dated line to `docs/STATE_LOG.md` recording the merge and the source-of-truth switch.
