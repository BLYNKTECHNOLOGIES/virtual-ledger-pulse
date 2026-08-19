# Repair Comp-Off Balances and Monthly Enforcement

## Confirmed root causes
- The bulk leave allocator used `max_days_per_year || 12`; Compensatory Off is correctly configured as `0`, so every bulk run incorrectly assigned 12 CO days.
- Genuine attendance credits were then added to those manual allocations, producing balances such as 14, 10, 8, and 6 despite only 1–2 valid worked weekly-offs in the ledger.
- The Leave Allocations page computes CO as all-time allocated minus all-time used, so settled prior-month credits can remain visible.
- Automatic crediting currently checks employee weekly-offs only; it does not grant the same credit for an active company holiday.

## Changes
1. Make the database ledger authoritative for CO allocations. Reject manual/direct CO allocations and rebuild the current allocation row from unsettled credits plus approved CO consumption.
2. Generalize attendance crediting to award exactly one day per employee/date when attendance is qualifying (`present`, `late`, or `half_day`) and the date is either that employee’s weekly-off or an active company holiday. Preserve the unique employee/date guard.
3. Keep month close authoritative: settle prior-month credits, zero expired monthly availability, and expose only the current month’s ledger-backed CO balance.
4. Backfill every employee’s CO allocation from the live ledger, removing phantom bulk/manual days while preserving approved leave usage.
5. Update Leave Allocations UI and CSV/cards to use `available_days` for CO rather than cumulative historical arithmetic; exclude CO from manual and bulk allocation controls and correct the “all leaves carry forward” wording.
6. Verify with database reconciliation: no employee balance exceeds valid unsettled worked off-days minus approved usage; prior-month open credits are zero; current-month rows tie exactly to the ledger. Append the completed repair to the state log.

## Technical details
- Database functions/triggers will enforce the rule server-side so another UI or direct Data API write cannot recreate the discrepancy.
- Backfill is deterministic from `hr_compoff_credits`, `hr_leave_request_consumption`, and approved CO leave requests; no estimated credits will be invented.
- Existing payroll offset/encashment continues to consume `hr_compoff_month_pool`, with no carry-forward into a later month.
