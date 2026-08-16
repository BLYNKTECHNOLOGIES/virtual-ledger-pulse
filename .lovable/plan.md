# HR sets the leave type; balances cascade automatically at payroll

Two changes, both in the leave flow.

## 1. Employees no longer choose a leave type

- The ESS "Request Leave" dialog drops the leave-type selector entirely. The employee gives
  dates / half-day, reason and contact number only. The balance hint is replaced with a note:
  "HR will assign the leave type when approving."
- The reporting manager sees the request untyped and only recommends approve / reject, exactly
  as today.
- HR's final approval opens a small dialog with a required **Leave type** picker plus the live
  balance for the chosen type. The request is approved with that type recorded, and the audit
  trail keeps who set it.
- The current hard block "Insufficient leave balance — cannot approve" is removed: HR can approve
  a short-balance request, because the cascade below settles it.
- Every leave request still waiting for a decision has its employee-chosen type cleared, so HR
  sets it fresh. Already approved / rejected requests keep their type untouched.

## 2. Approved leave consumes balances in a fixed order

When an approved leave has more days than the assigned type's balance, the shortfall is settled
automatically instead of going straight to loss of pay:

```text
assigned type balance  ->  Comp-Off balance  ->  Casual Leave balance  ->  loss of pay
```

- Comp-off is used before casual leave because comp-off expires at month end.
- Comp-off days used this way are marked as taken, so the monthly comp-off encashment pool and the
  existing comp-off LOP offset cannot count the same day twice.
- Only what none of the balances can cover becomes loss of pay in the payroll run.
- Each approved request stores the split it consumed (days per leave type, plus unpaid days), so
  the payroll LOP figure and the employee's balances always agree and are auditable.
- Paid / unpaid day counts on the request are set from the same split — the LOP engine keeps
  reading a single source of truth.

Visible effects: the employee profile leave card and HR leave pages show the actual consumption
("2 days Sick, 1 day Comp-Off, 0.5 day loss of pay"), and the payroll cockpit's LOP step picks up
only the genuinely unpaid remainder.

## Technical notes

- `hr_leave_requests.leave_type_id` becomes nullable; pending rows (`requested`,
  `manager_approved`) have it cleared. A validation trigger requires it to be present the moment
  status becomes `approved`.
- New table `hr_leave_request_consumption` (request, employee, leave_type, days, source =
  `assigned` / `compoff_fallback` / `casual_fallback` / `unpaid`) with standard GRANTs and RLS via
  `public.hr_is_hr_staff`.
- The existing approval trigger that deducts `hr_leave_allocations` is replaced by a
  security-definer `hr_settle_leave_request(request_id)` implementing the cascade, writing the
  consumption rows, updating allocations, marking `hr_compoff_credits` consumed, and setting
  `paid_days` / `unpaid_days`. Rejection or reversal restores everything from the consumption rows.
- `hr_lop_days_window` counts unpaid leave from `unpaid_days` / consumption rows rather than the
  leave type's `is_paid` flag alone, so cascaded coverage cancels LOP for those days.
- `generate-lop-deductions` and the comp-off encashment step read the same comp-off consumption,
  keeping the ordering LOP -> encashment intact.
- Files touched: new migration; `src/components/profile/RequestLeaveDialog.tsx`;
  `src/pages/horilla/LeaveRequestsPage.tsx` (HR approve dialog);
  `src/components/profile/TeamLeaveApprovals.tsx` (untyped display);
  leave display in `src/components/hrms/LeaveTab.tsx` and `src/components/profile/MyRequestsHub.tsx`.
