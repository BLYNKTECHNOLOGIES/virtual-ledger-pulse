# Project architecture decisions

- Ordinary tables wrap to available width; only wide grids set minimum widths (no horizontal scroll).

- Subdirectories may have their own AGENTS.md (e.g. src/components/ats/, src/components/horilla/workforce/); read it before editing there.

- Frontend brand images resolve through BrandLogo and brandLogos; ERP/HRMS toggles use ThemeContext and Terminal passes its independent theme explicitly, because logo contrast must update with the actual surface rather than unsynchronized DOM theme mutations.

- F&F approval stages payroll inputs only; RazorpayX writes and read-back verification belong to the cockpit Inputs Push step, so separation review and payroll execution remain distinct.
- HRMS revocations share durable server-only ERP/Auth/Terminal deletion with read-back and retries after unlinking; preserve HR records and immutable ledger tombstones. LWD cutoff and biometrics remain independent of F&F; RazorpayX dismissal requires paid F&F plus final-salary proof for the later LWD/F&F month, because no payout API exists.
- Loss-of-pay day counting (hr_lop_days_window) uses each day's corrected outcome — HR's explicit day mark (manual_status) first, else the status recomputed from corrected punch times — never a blanket 'approved correction = full day', because a correction can legitimately result in a half day or absence.
- Leave total_days is always recomputed in the database from the employee's working days (weekly offs and holidays excluded), because screens can't be trusted to count consistently.
- Watchdog resolutions (manual or automatic) are refused on period-locked days, because a locked period never recomputes and a 'resolved' entry would hide an unapplied result.
- Leave approval funds a leave only from balance accrued on or before the leave's last day (hr_leave_take_from), because later credits weren't yet earned.
- The comp-off payout step rewrites the month's settlement and credit marks on every run, even when the result is zero, because stale rows otherwise contradict the staged lines.
- The verification pack flags watchdog days closed automatically (no HR resolver) as needs-review, because an auto-paired punch-out may be a break punch.
- A day inside approved leave keeps the status the device or HR gives it, and leave is refunded only for the worked part (hr_reconcile_worked_leave_days, re-evaluated on every run), because device punches and HR day marks are the attendance source of truth.
- Leave accrual (run_leave_accrual) skips anyone whose last working day is before the accrual month's end, because a mid-month leaver earns no leave for the leaving month.
- The attendance calendar's day table (hr_attendance_daily, device-written then HR-overridable) is the only attendance truth; the older hr_attendance list is a trigger-kept mirror, and HR marks written to it are routed into the calendar as HR day marks, because every screen and payroll must show the same day.
- Every attendance screen (HR calendar, employee calendar, summaries) resolves days via resolveDayStatus over hr_attendance_day_range and the employee summary cards use hr_attendance_month_summary (self-only for non-HR), because HR and employee must see identical figures.
- Paid leave (CL/CO/SL) can be applied and approved only within the balance earned by the leave's last day minus other pending requests (trg_enforce_leave_balance_on_apply, hr_leave_available); approval never spills into other types, and Loss of Pay leave stamps the calendar Absent, because employees must not see unpaid days as leave.
- RazorpayX additions are pushed only under exact names from hr_razorpay_component_catalog, which mirrors the Component names in RazorpayX Settings → Salary Component Library (proxy maps or rejects; our wording goes in remarks), because RazorpayX rejects addition names that are not library components.
- A mid-month CTC revision is held from RazorpayX until that month's cockpit Step 7 (payroll run complete) is done, then pushed automatically, because RazorpayX must pay the old CTC for the month being processed.
- Reports & Analytics treats `hr_payslips_v` as payroll truth, employer payroll cost as gross plus employer contributions, approved leave as day totals rather than request counts, and canonical evidence-backed attendance only as workforce availability; owner exclusions must apply to every metric, drill-down and export.
- The salary-register importer sums two header names for one figure only if they resolve to different columns, because an alias ("Loan Repayment" for "Loan Emi") can resolve both to one column and double the deduction.
- Comp-off leave is funded only by same-calendar-month credits (hr_leave_available, CO branch), because older unsettled credits are encashed by payroll and must not also pay for leave.
- Unit tests run with `bun run test` (vitest, vitest.config.ts); test files import from "vitest", never bun:test, so one command runs every test.
- Leave day counts (apply-time balance check, approval recompute, consumption) all use hr_leave_working_days — the same count stored in total_days — never fn_calculate_leave_days, because a CL/CO leave spanning an off day must not be refused or charged in calendar days.
- An approved leave can be cancelled by the employee only before its first day (IST) and by HR only when none of its days is in a locked period; cancel/reject after approval refunds only what is still consumed (net of worked-day restores), deletes that request's worked-day rows and returns evidence-free stamped days to the engine's result, because a withdrawn leave must not stay paid or be refunded twice.
