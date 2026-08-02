# Auto-calculate Loss of Pay from attendance

Today LOP deduction rows have to be typed in one employee at a time on the Payroll Inputs page, even though the system already derives LOP days from attendance (the shadow payroll engine uses the shared `hr_compute_lop_days` calculation). This adds a one-click generator so the LOP rows for the whole month are produced from attendance, reviewed, and staged for RazorpayX.

## What you will get

1. **"Auto-calculate LOP from attendance"** button on the Payroll Inputs → Deductions tab (and on the cockpit's LOP step).
2. A **preview table** before anything is saved, one row per active RazorpayX-mapped employee:
   - Name · badge
   - Working days, present, paid leave, unpaid leave
   - LOP days
   - Monthly base used and the computed LOP amount
   - Status: New / Unchanged / Amount changed / Already pushed (locked) / Skipped with reason
3. **Stage all** (or tick specific rows) writes the deduction rows for the period. Existing auto-generated rows for that month are refreshed; rows already pushed to RazorpayX or created manually are never overwritten.
4. Employees with zero LOP days are not staged (and any stale auto LOP row for them is removed if it hasn't been pushed).
5. Re-running is safe — it recalculates and updates, it does not duplicate.

## Calculation (same rules the shadow payroll already uses)

- LOP days = working days − (present + paid leave + incomplete days held harmless), from `hr_compute_lop_days`. Weekly offs, holidays and approved regularizations are already honoured there.
- LOP amount = monthly regular base × (LOP days ÷ working days), rounded to the rupee.
- Monthly base resolution order: salary structure assignment → RazorpayX-mirrored structure → imported Salary Register for the period → onboarding CTC → most recent imported payslip. If none resolves, the employee is listed as skipped ("no salary base"), never guessed.
- Employees with leave-configuration errors are surfaced as skipped with the reason, not silently zeroed.

## Technical notes

- **Migration**: add `source text not null default 'manual'` and `lop_days numeric` to `hr_payroll_input_deductions` so auto rows are identifiable and idempotent (unique partial index on `(hr_employee_id, period_month)` where `source = 'auto_lop'`).
- **New edge function** `generate-lop-deductions` with `{ period, dry_run, employee_ids? }`. It calls `hr_compute_lop_days` in one batch and reuses the exact salary-base resolution ladder from `compute-shadow-payroll` (extracted into `supabase/functions/_shared/salaryBase.ts` and imported by both, so the two can never drift). Returns the preview rows; on `dry_run: false` it upserts/removes auto rows and skips any row with `pushed_at` set.
- **UI**: `AutoLopDialog` component used by `PayrollInputsPage`; the existing push / bulk-push flow is unchanged, so staged auto rows go to RazorpayX through the same verified envelope path.
- Cockpit step 3 detail line will show "N employees with LOP · M rows staged" so the step reflects the generated state.
