# Leave applications only within earned balance; everything else is Loss of Pay

## Goal
An employee can never "apply for leave" and believe it is paid when it is not. Paid leave (Casual, Comp-Off, Sick) can be applied only when the full balance for the chosen days already exists. Otherwise the employee must apply as **Loss of Pay**, and those days show as **Absent** on both the employee's and HR's calendars from the moment they are applied.

## What changes for the employee
1. The leave form gets a **Leave type** choice: Casual, Comp-Off, Sick, Loss of Pay (only types the employee is eligible for).
2. Next to each paid type the form shows the live balance, e.g. "Casual: 1 day available".
3. Days are counted the same way payroll counts them (weekly offs and holidays excluded, half days supported).
4. If the chosen type does not have enough balance for the whole period, submission is blocked with a clear message:
   "You have 1 casual leave day available but selected 3 working days. Apply for 1 day as Casual and 2 days as Loss of Pay, or change your dates."
5. Balance counted is only what is earned by the leave's last day (no borrowing future credits), minus leave already pending or approved, so two requests cannot spend the same day.
6. Loss of Pay requests never need balance; the form states plainly "These days will be unpaid and shown as Absent."

## What changes for HR
1. Approval keeps the employee's chosen type; HR can only switch it to another type that has enough balance, or to Loss of Pay. The old automatic "Casual → Comp-Off → LOP" spill at approval is removed for paid types, so a paid request is never silently turned partly unpaid.
2. If balance disappears between applying and approval (e.g. another leave approved first), approval is refused with the same clear message; HR rejects it or converts it to LOP.
3. HR-created leave on someone's behalf follows the same rules.

## Calendar (HR and employee, identical)
- Approved paid leave: shows **Leave (type)**.
- Approved or pending Loss of Pay: shows **Absent (LOP)**, never "Leave".
- If the device or HR shows the person worked that day, the worked status still wins (existing rule kept).
- Monthly summary boxes count LOP days as absent/unpaid, never as leave.

## Workflows updated to stay consistent
- **Balance deduction**: approval deducts exactly the chosen type; LOP deducts nothing.
- **Loss of Pay payroll step (Step 5)**: LOP requests are counted as unpaid days directly; the old "casual overdrawn becomes LOP" path stays only as a safety net and should find nothing new.
- **Comp-off payout**: comp-off days spent on applied comp-off leave are no longer paid out; days not spent remain payable as today.
- **Leave reports, ledger history, dashboards, payslip attendance and verification pack**: show LOP requests as unpaid, separate from paid leave.
- **Existing pending requests**: re-checked once. Any pending paid request without full balance is flagged to HR (not auto-changed), listing the shortfall, so HR decides convert-to-LOP or reject.
- **Already approved / paid months**: untouched (no retro edits to closed payroll).

## Out of scope / unchanged
- How balances are earned (monthly accrual, comp-off from worked rest days).
- Fixed-pay contract staff: attendance still doesn't affect pay.

## Technical details
- Database: one function `hr_leave_available(employee, type, as_of_date)` (earned up to leave end, minus approved and pending consumption) and `hr_leave_working_days` (existing total_days logic). A BEFORE INSERT/UPDATE trigger on `hr_leave_requests` enforces balance for paid types on submit and on approval, raising a readable error with available vs requested days. Validation trigger, not CHECK.
- Add a Loss of Pay leave type (if not present in `hr_leave_types`, verified first) flagged unpaid; `hr_leave_request_consumption` gets no rows for it.
- Remove paid-type cascade in approval path (`hr_leave_take_from` callers); keep single-type consumption.
- Calendar: `resolveDayStatus` and `hr_attendance_day_range` / `hr_attendance_month_summary` map LOP leave to absent; stamping into `hr_attendance_daily` writes absent for LOP days unless punches/HR mark exist.
- `generate-lop-deductions` reads LOP requests as unpaid days; `generate-compoff-encashment` excludes comp-off consumed by applied comp-off leave.
- UI: `RequestLeaveDialog` (type picker, live balance, preview of working days, inline error), `LeaveApprovalPanel` / `TeamLeaveApprovals` / `LeaveRequestsPage` (type locked to balance-valid options, convert-to-LOP action), calendar legends.
- One-time read-only sweep of pending requests producing an HR flag list; no data changed without HR action.
- Record the rule in AGENTS.md and update the "HR-assigned leave type + cascade" memory, which this replaces.
- Verify: DB tests for exact/partial/zero balance, half days, overlapping pending requests, approval-time race; Playwright check of the form error and both calendars showing Absent for LOP.
