# Reports & Analytics — correct the data wiring and finish the page

## What is wrong today (verified against the live database)

The page is reading the wrong tables, so most of it is either zero or silently blank.

| Widget | Today it reads | Reality in the database | Result on screen |
|---|---|---|---|
| Payroll Runs / Total Payroll Cost / Avg per Run / Payroll Cost Trend | `hr_payroll_runs` | **0 rows** — payroll truth is RazorpayX-mirrored payslips (`hr_payslips_v`, 97 rows) | Always 0 / ₹0.0L / empty chart |
| Attendance Trend (Weekly) | `hr_attendance.status` | that column **does not exist** (it is `attendance_status`); the v4 engine writes to `hr_attendance_daily` (1,164 rows) | Bars always empty/zero |
| Employee Growth (New Hires) | `hr_employees.created_at` | all 41 records created 16 Jul – 1 Aug 2026 (the import date, not hiring) | The "39 new hires in July" spike is an import artifact |
| Headcount Trend | cumulative `created_at`, never decrements | joining/exit dates live in `hr_employee_work_info.joining_date` (41/41 filled) and `hr_employees.resignation_date` / `last_working_day` | Flat, meaningless line |
| Department-wise Leave Days | groups by `l.employee_id` | that column is never fetched in the query | Everything would fall into "Unassigned" |
| Leave by Type / Leave Requests | `hr_leave_requests` | genuinely **0 rows** | Correctly empty — not a bug |
| Date filter | only applies to leaves, payroll, attendance | — | Headcount and growth charts ignore the date range |
| Export menu | CSS hover-only dropdown | — | Unusable on touch/keyboard; exports have no employee names |

## What will be built

**1. Payroll on the real source**
Repoint all payroll KPIs and the trend chart to `hr_payslips_v` grouped by `period_month`, using gross, net, deductions, TDS and headcount per month. KPIs become: months processed, total payroll cost, average monthly cost. Respects the date filter via `period_month`.

**2. Attendance on the v4 engine**
Read `hr_attendance_daily` (`attendance_date`, `status`, `is_late`) instead of the legacy table, and chart present / late / absent per week. Add a small "Attendance Health" strip: average attendance %, late instances, absent days for the selected range.

**3. Honest headcount and hiring**
- New Hires = count of `hr_employee_work_info.joining_date` per month, inside the date range.
- Headcount Trend = running count of joiners minus exits (`resignation_date` / `last_working_day`), so the line reflects the actual roster (41 total, 36 active today).
- Both respect the date filter; the KPI row shows Total / Active / Exited.

**4. Leave section fixed for when data exists**
Fetch `employee_id` on leave requests so department-wise leave days group correctly; keep "No data available" honest while the table is empty, with a caption saying no leave requests exist in the selected range.

**5. Missing pieces to complete the page**
- Department-wise headcount chart (from work info + departments).
- Statutory cost summary for the range (PF, ESI, PT, TDS from `hr_payslips_v`).
- Attrition card: exits in range and attrition rate.

**6. Export made usable**
Replace the hover-only menu with a proper dropdown (click/keyboard/touch) and enrich exports with employee name, badge ID, department, and the actual figures behind each chart; add a "Payroll (monthly)" and "Attendance (daily)" export.

**7. Data-source transparency**
Each card gets a one-line footnote naming its source (for example "Source: RazorpayX payslip mirror") so numbers can be traced, consistent with the payroll doctrine that RazorpayX is primary.

## Technical notes

- All edits are confined to `src/pages/horilla/ReportsPage.tsx` (plus small extracted chart components if the file gets long). No schema changes, no migrations.
- Queries keep using `fetchAllPaginated` and push date filtering server-side where the column allows (`period_month`, `attendance_date`, `joining_date`).
- No fabricated or estimated values: when a source table is empty, the widget shows "No data available" with the reason, never a placeholder number.
- Verification after the build: run the page in a headless browser against the live data and compare each KPI to a direct SQL aggregate (97 payslips, 1,164 daily attendance rows, 41/36 employees) before reporting done.
