# Verifiable LOP breakdown in the Auto-LOP step

Today the Auto-calculate LOP table shows only Working / Present / Paid leave / LOP days / Monthly base / LOP amount. The attendance engine already computes more than that (half-days, absent days, held-harmless days, unverified days), and the leave-type split (CL / SL / Comp-off / unpaid) exists in the leave tables but is never surfaced. The goal is to make every LOP figure auditable inside this step without changing how LOP is calculated.

## What will change

### 1. Wider, grouped LOP table
The preview table gains column groups so the arithmetic is readable left to right:

```text
Employee | Attendance: Working · Present · Half-day · Absent · Held/Unverified
         | Leave: Paid · CL · SL · Comp-off used · Other paid · Unpaid
         | Extra: Worked on off/holiday
         | LOP: Raw · Comp-off offset · Proration · Charged
         | Money: Monthly base · LOP amount | Status
```

Denser secondary values (held, unverified, proration) render as small sub-text or on hover so the row stays scannable. Late / early-out are deliberately excluded, as requested.

### 2. Per-employee expandable detail
Clicking a row expands an inline panel showing:
- the exact formula string the engine returned for that employee,
- the leave breakdown as a small table: leave type, paid/unpaid, days consumed this month,
- days worked on a weekly-off or holiday in the month (dates listed),
- comp-off pool: opening, earned, used to cancel LOP, remaining,
- employment window (joining/relieving) and the proration days charged.

### 3. Export
A "Export breakdown CSV" button next to Recalculate, exporting exactly the columns above for all rows — so the month can be verified offline and archived with the payroll pack.

## Data work required

The existing summary RPC already returns `half_days`, `absent_days`, `held_harmless_days` and `unverified_days` — these are simply not passed through. They will be added to the edge function's row payload.

New read-only helper RPC `hr_leave_month_breakdown(p_employee_ids uuid[], p_period_month date)` returning, per employee and per leave type: leave type name/code, `is_paid`, `is_compensatory_leave`, and days falling inside the month (clipped to the month, half-day aware, sourced from `hr_leave_request_consumption` joined to approved `hr_leave_requests`, minus days restored in `hr_leave_worked_days`). It also returns days worked on a weekly-off/holiday for the month. This is purely additive reporting — `hr_lop_days` and the LOP amount math are untouched.

## Guardrails

- No change to LOP calculation, staging, push behaviour, comp-off offsetting or proration.
- New RPC is `STABLE SECURITY DEFINER`, HR-gated with `public.hr_is_hr_staff(auth.uid())`, no writes.
- Leave totals shown are reconciliation figures; the deduction still comes from the canonical engine. If the breakdown does not reconcile with `paid_leave_days`, the row shows a small mismatch warning rather than silently adjusting anything.

## Technical notes

- `supabase/functions/generate-lop-deductions/index.ts`: pass through `half_days`, `absent_days`, `held_harmless_days`, `unverified_days`, and merge the new breakdown RPC into each preview row (dry-run path only; staging payload unchanged).
- `src/components/hr/payroll/AutoLopDialog.tsx`: extended `PreviewRow` type, grouped header, expandable row detail, CSV export.
- Migration: create `public.hr_leave_month_breakdown(...)` plus `GRANT EXECUTE` to `authenticated` and `service_role`.
