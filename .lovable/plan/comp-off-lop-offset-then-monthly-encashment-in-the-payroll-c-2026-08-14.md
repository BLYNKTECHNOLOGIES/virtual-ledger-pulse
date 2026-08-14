# Comp-Off: LOP offset then monthly encashment in the Payroll Cockpit

Comp-off (CO) becomes a strictly monthly currency: earned in a month, it is first used to cancel that month's loss of pay, and whatever is left is paid out in the same month's payroll. Nothing carries into the next month.

## The rule being implemented

For each employee, for the payroll month:

```text
CO available   = credits earned in month + unconsumed opening CO
CO used as leave = approved Comp-Off leave days taken in the month
CO free        = CO available - CO used as leave
LOP offset     = min(CO free, LOP days from attendance)
CO to encash   = CO free - LOP offset
Encashment amt = round(monthly gross / working days * CO to encash)
Month close    : all CO credits for the month marked consumed -> balance 0
```

Per-day value uses the same base and divisor the Auto-LOP engine already uses (monthly gross resolved from the salary base, divided by that employee's working days for the month), so one day offset and one day encashed are worth exactly the same rupee amount.

## What changes in the cockpit

- **Step 4 (LOP)** — the LOP preview gains a "CO offset" column. LOP days are reduced by available comp-off before the deduction amount is computed, and the deduction label states the offset (e.g. "LOP — 1 day (2 offset by comp-off)"). If comp-off fully covers LOP, no deduction row is staged.
- **Step 5 (Additions)** — a new **Comp-Off Encashment** block, modelled on the Auto-LOP card: compute preview (employee, CO earned, CO taken, CO used against LOP, CO encashed, per-day rate, amount, status new/changed/unchanged/pushed), then **Stage rows**, then push with the existing additions push flow. Rows already pushed to RazorpayX are never touched or recomputed.

## Consistency work across HRMS

- **Leave balances / allocations page** — CO cards show the monthly nature ("earned this month, settled in payroll; no carry forward") and read from the ledger, matching the read-only comp-off ledger already in place.
- **Employee profile (My Comp-Off)** — shows earned / taken / offset against LOP / encashed for the current month instead of an ever-growing balance.
- **Leave requests** — a comp-off leave request cannot exceed the current month's unconsumed CO; requests spanning into a month where the credit has been settled are blocked with a clear message.
- **Comp-Off page** — each credit row shows its settlement outcome (taken as leave / offset against LOP / encashed in <month> / pending).
- **Shadow payroll & CTC-inclusive costing** — encashment is added as an extra earning for the month in the shadow projection and the salary register projection, so net variance vs RazorpayX ties out.
- **Payslips** — the encashment appears as a named earning line, sourced from the pushed addition, not recomputed locally.
- **Attendance summary** — unchanged as the source of truth; the offset happens on top of its LOP output, never by editing attendance.

## Technical notes

- New table `hr_compoff_settlements` (employee, period_month, days_earned, days_taken, days_offset_lop, days_encashed, per_day_rate, amount, addition row id, settled_at) — one row per employee per month, the audit trail for the whole rule. Standard GRANTs + RLS for HR staff via `public.hr_is_hr_staff`.
- New edge function `generate-compoff-encashment` (dry-run preview + stage), mirroring `generate-lop-deductions`: same auth gate, same `resolveMonthlyGross` base resolution, same working-days divisor, `source = 'auto_compoff'` on `hr_payroll_input_additions`, idempotent upsert, stale un-pushed rows removed.
- `generate-lop-deductions` gains the offset step so both engines agree on the same CO pool; the two must be run in order (LOP first, then encashment), which the cockpit enforces by step ordering.
- Month close (step 10) marks the month's `hr_compoff_credits` as consumed and zeroes the CO allocation, so nothing carries forward. Existing 33 legacy credit days are settled by the first run of the month they belong to.
- No manual comp-off allocation is reintroduced — the ledger stays the only writer.
