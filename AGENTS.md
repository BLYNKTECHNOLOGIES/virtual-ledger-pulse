# Project architecture decisions

- Tables wrap to available width; only wide grids set minimum widths.

- Subdirectories may have their own AGENTS.md (e.g. src/components/ats/, src/components/horilla/workforce/, hrms/quiz/); read it before editing there.

- Frontend brand images resolve through BrandLogo and brandLogos; ERP/HRMS toggles use ThemeContext and Terminal passes its independent theme explicitly, because logo contrast must update with the actual surface rather than unsynchronized DOM theme mutations.

- F&F approval stages payroll inputs only; RazorpayX writes and read-back verification belong to the cockpit Inputs Push step, so separation review and payroll execution remain distinct.
- All login removals share hr_erp_access_revocations + completeErpRevocation (ERP/Auth/Terminal read-back/retries); preserve HR/ledger tombstones. LWD/biometrics are independent of F&F; RazorpayX dismissal needs paid F&F and final salary for the later LWD/F&F month (no payout API).
- Loss-of-pay day counting (hr_lop_days_window) uses each day's corrected outcome — HR's explicit day mark (manual_status) first, else the status recomputed from corrected punch times — never a blanket 'approved correction = full day', because a correction can legitimately result in a half day or absence.
- Watchdog resolutions (manual or automatic) are refused on period-locked days, because a locked period never recomputes and a 'resolved' entry would hide an unapplied result.
- The comp-off payout step rewrites the month's settlement and credit marks on every run, even when the result is zero, because stale rows otherwise contradict the staged lines.
- The verification pack flags watchdog days closed automatically (no HR resolver) as needs-review, because an auto-paired punch-out may be a break punch.
- A day inside approved leave keeps the status the device or HR gives it, and leave is refunded only for the worked part (hr_reconcile_worked_leave_days, re-evaluated on every run), because device punches and HR day marks are the attendance source of truth.
- Leave accrual (run_leave_accrual) skips anyone whose last working day is before the accrual month's end, because a mid-month leaver earns no leave for the leaving month.
- The attendance calendar's day table (hr_attendance_daily, device-written then HR-overridable) is the only attendance truth; the older hr_attendance list is a trigger-kept mirror, and HR marks written to it are routed into the calendar as HR day marks, because every screen and payroll must show the same day.
- Every attendance screen (HR calendar, employee calendar, summaries) resolves days via resolveDayStatus over hr_attendance_day_range and the employee summary cards use hr_attendance_month_summary (self-only for non-HR), because HR and employee must see identical figures.
- RazorpayX additions are pushed only under exact names from hr_razorpay_component_catalog, which mirrors the Component names in RazorpayX Settings → Salary Component Library (proxy maps or rejects; our wording goes in remarks), because RazorpayX rejects addition names that are not library components.
- A mid-month CTC revision is held from RazorpayX until that month's cockpit Step 7 (payroll run complete) is done, then pushed automatically, because RazorpayX must pay the old CTC for the month being processed.
- Reports & Analytics treats `hr_payslips_v` as payroll truth, employer payroll cost as gross plus employer contributions, approved leave as day totals rather than request counts, and canonical evidence-backed attendance only as workforce availability; owner exclusions must apply to every metric, drill-down and export.
- The salary-register importer sums two header names for one figure only if they resolve to different columns, because an alias ("Loan Repayment" for "Loan Emi") can resolve both to one column and double the deduction.
- Unit tests run with `bun run test` (vitest, vitest.config.ts); test files import from "vitest", never bun:test, so one command runs every test.

- Leave days: total_days, apply check, approval recompute and consumption all use hr_leave_working_days (offs/holidays excluded), never fn_calculate_leave_days, so every count matches.
- Paid leave (CL/CO/SL) is applied/approved only within balance earned by its last day minus pending (hr_leave_available, hr_leave_take_from); CO only from same-month credits; never spills into other types; LOP stamps Absent — unearned or encashed credit must not pay leave.
- Approved leave: employee cancels only before day 1 (IST); HR not in locked periods; cancel/reject refunds net of worked-day restores, drops worked-day rows, unstamps evidence-free days — a withdrawn leave must not stay paid or refund twice.
- User Management rights live in public.um_* SQL functions (um_my_access feeds the screen); every UI gate reads them, because screen and server must agree.
- Auth owns sign-in times/logs; ERP-shell heartbeat is self-only for consistent presence. Legacy role_functions are immutable with retained role UUIDs after deletion, preserving history without blocking role removal.
