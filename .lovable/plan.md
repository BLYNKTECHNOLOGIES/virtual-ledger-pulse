# Automatic CL / SL crediting on the 10th, configurable from Leave Accrual Plans

## The policy being encoded

- **Casual Leave** — 1 day credited on the 10th of every month, from the first 10th after joining (probation included), full day with no pro-rating, no maximum, accumulates indefinitely.
- **Sick Leave** — 6 days credited on the first 10th after probation ends, then 6 more on each yearly anniversary of that first credit (per employee, not calendar year). Unused sick leave carries forward and adds up.
- Existing manually-created balances are left untouched; automatic crediting starts from the next 10th onwards.

## What changes in the Leave Accrual Plans page

The plan form gains three settings so both rules are visible and editable, not hard-coded:

- **Credit on day** — day of month the credit lands (10 for both plans).
- **Starts from** — "Joining date" (Casual) or "Probation completion" (Sick).
- **Renewal cycle** — "Calendar period" or "Anniversary of the employee's first credit" (Sick uses the latter).

The card for each plan states the rule in plain words, e.g. "1 day on the 10th of every month, from joining" and "6 days on the 10th after probation, renewed every 12 months". Existing plan fields (leave type, amount, period, cap, who it applies to, active toggle, effective from) keep working exactly as today, and the "Run Accrual Now" button stays.

Two plans are seeded to match the policy above and can be edited or deactivated from the page like any other plan.

## Engine correctness — issues found in the audit and how they are fixed

The accrual engine exists but has never credited anything (no plans configured). A close read of it found real defects that would surface the moment plans go live:

1. **New joiners are skipped forever.** The "already ran this period" check counts log rows for the whole plan, not per employee. Anyone who joins after a month's run never receives that month's credit, and a partially failed run cannot be re-run. Fixed by making the check per employee per period.
2. **No credit-day control.** The engine credits whenever it is called; the cron currently fires on the 1st. Fixed by honouring the plan's credit day and moving the schedule.
3. **No anniversary cycle.** "Yearly" means calendar year only, so post-probation sick leave cannot renew on an employee's own date. Fixed with the anniversary cycle, whose due date is derived from that employee's own last credit for the plan.
4. **Balances split at the year boundary.** Balances are stored per calendar year, so on 1 January an accumulating Casual Leave balance would appear to reset to the new year's credits. Fixed by carrying the remaining balance into the new year's bucket on the first credit of the year.
5. **Silent cap at 999 days.** Plans with no cap clamp at 999. Left as an explicit "no maximum" instead of a hidden number.
6. **Concurrent runs could double-credit.** A manual "Run Accrual Now" during the scheduled run can credit twice. Fixed with a lock so only one run proceeds.
7. **Leave-type caps contradict the policy.** Casual Leave is configured at 3 days/year and Sick Leave at 2 days/year with a 2-day carry-forward limit, which the new rules exceed. These are updated to match (Casual 12/year reference, unlimited carry-forward; Sick 6 per cycle, carry-forward unlimited).

Probation protection is kept: sick leave is never credited to an employee still on probation, and the existing block on manual sick-leave allocation during probation is unchanged.

## Schedule

One daily run at 10:00 IST. Casual Leave credits only on the 10th; Sick Leave credits on the day an employee's probation-plus or anniversary date comes due, which can be any date. The daily run is a no-op on every other day because each employee/period is credited at most once. The existing 1st-of-month job is removed so the two cannot both fire.

## Verification before this is called done

- Dry run of the engine against the live roster: confirm one Casual day per active employee and zero sick days for anyone still on probation.
- Re-run the same day and confirm no duplicate credits.
- Simulate a mid-month joiner and confirm they are credited on the next 10th, not skipped.
- Simulate a year rollover and confirm the accumulated Casual balance survives.
- Confirm the two seeded plans render and save correctly from the Leave Accrual Plans page.
- Append the change to `docs/STATE_LOG.md`.

## Technical notes

- `hr_leave_accrual_plans` gains `accrual_day int default 10`, `start_trigger text` (`joining` | `probation_end`), `cycle_basis text` (`calendar` | `anniversary`), with check constraints; `max_accrual` null now means genuinely unlimited.
- `run_leave_accrual(p_accrual_date)` rewritten: per-employee idempotency keyed on `hr_leave_accrual_log` (plan, employee, period), credit-day gate, `start_trigger` gate (joining date / `hr_probation_end_date`), anniversary due-date derived as `max(accrual_date) + 12 months` from that employee's log rows for the plan, full-amount credit (pro-rating removed for `joining` plans), `pg_advisory_xact_lock` single-flight, and a carry-forward step that seeds the new calendar-year allocation row from the prior year's remaining `available_days`.
- Cron: drop `monthly-leave-accrual` (`0 0 1 * *`), add `daily-leave-accrual` at `30 4 * * *` (10:00 IST) calling `run_leave_accrual()`.
- Leave type updates: CL `max_days_per_year = 12`, SL `max_days_per_year = 6`, `max_carry_forward_days = null` on both.
- Frontend: `src/pages/horilla/LeaveAccrualPlansPage.tsx` only — three new form controls, plain-language rule summary on each card, and the existing run/edit/delete flows unchanged.
