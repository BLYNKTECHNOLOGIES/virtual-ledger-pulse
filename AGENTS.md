# Project architecture decisions

- Tables fit; client tables stack labelled cells via client-mobile.css on phones. Narrow settlements stack; only wide grids set minimums.
- Settlement links use sales_view + Sales orderId; fetch missing linked orders to reach older sales.

- Read subdirectory AGENTS.md before edits (ATS, workforce, Terminal, quiz, edge functions).

- BrandLogo/brandLogos use the surface theme for contrast; ERP/HRMS use ThemeContext, Terminal its own.

- F&F stages inputs only; cockpit Inputs Push owns RazorpayX writes/read-back, separating review from execution.
- All login removals share hr_erp_access_revocations + completeErpRevocation (ERP/Auth/Terminal read-back/retries); preserve HR/ledger tombstones. LWD/biometrics are independent of F&F; RazorpayX dismissal needs paid F&F and final salary for the later LWD/F&F month (no payout API).
- hr_lop_days_window uses manual_status first, else corrected punch outcomes; approved corrections never imply full days, because half days/absence remain possible.
- Watchdog resolutions (manual or automatic) are refused on period-locked days, because a locked period never recomputes and a 'resolved' entry would hide an unapplied result.
- The comp-off payout step rewrites the month's settlement and credit marks on every run, even when the result is zero, because stale rows otherwise contradict the staged lines.
- The verification pack flags watchdog days closed automatically (no HR resolver) as needs-review, because an auto-paired punch-out may be a break punch.
- A day inside approved leave keeps the status the device or HR gives it, and leave is refunded only for the worked part (hr_reconcile_worked_leave_days, re-evaluated on every run), because device punches and HR day marks are the attendance source of truth.
- Leave accrual (run_leave_accrual) skips anyone whose last working day is before the accrual month's end, because a mid-month leaver earns no leave for the leaving month.
- hr_attendance_daily is attendance truth (device then HR override); hr_attendance is a trigger-kept mirror whose HR edits route into the calendar, keeping payroll/screens consistent.
- Attendance screens use resolveDayStatus/hr_attendance_day_range; employee cards use hr_attendance_month_summary (self-only for non-HR), keeping figures identical.
- RazorpayX additions use exact hr_razorpay_component_catalog names, mirroring Settings → Salary Component Library; proxy maps or rejects, custom wording goes in remarks, because non-library names fail.
- A mid-month CTC revision is held from RazorpayX until that month's cockpit Step 7 (payroll run complete) is done, then pushed automatically, because RazorpayX must pay the old CTC for the month being processed.
- Reports use hr_payslips_v; employer cost = gross + employer contributions; leave is day totals; availability is evidence-backed attendance; owner exclusions cover metrics, drill-downs and exports.
- Salary-register importer sums two headers for one figure only if they resolve to different columns (aliases can double a deduction).
- Tests use `bun run test` and import "vitest", never bun:test, for one unified runner.

- Leave days: total_days, apply check, approval recompute and consumption all use hr_leave_working_days (offs/holidays excluded), never fn_calculate_leave_days, so every count matches.
- Paid leave (CL/CO/SL) is applied/approved only within balance earned by its last day minus pending (hr_leave_available, hr_leave_take_from); CO only from same-month credits; never spills into other types; LOP stamps Absent — unearned or encashed credit must not pay leave.
- Approved leave: employee cancels only before day 1 (IST); HR not in locked periods; cancel/reject refunds net of worked-day restores, drops worked-day rows, unstamps evidence-free days — a withdrawn leave must not stay paid or refund twice.
- User Management rights live in public.um_* SQL functions (um_my_access feeds the screen); every UI gate reads them, because screen and server must agree.
- Auth owns sign-in times/logs; ERP-shell heartbeat is self-only for consistent presence. Legacy role_functions are immutable with retained role UUIDs after deletion, preserving history without blocking role removal.
- Binance account access comes only from public.binance_accounts_for_user (screen + edge functions), so they cannot drift.

- Designation authority is positions: triggers sync title/grade/department to employed people, open onboarding, ERP logins and RACI; leavers preserve exit history. hierarchy_level is company grade, reports_to_position_id is JD structure, managers are separate. Edit departments/designations only in HRMS Organization; RazorpayX imports never create them, keeping titles consistent.
- Joining previews and dispatch share `_shared/joiningBatch.ts` through an HRMS re-export, preventing browser/server scheduling drift.
- The sample-prejoining link is browser-only; joining choices reuse the shared calendar, and date changes invalidate signed offer/confirmation, keeping sample evidence out of real records.
