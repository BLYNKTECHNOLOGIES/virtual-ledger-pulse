# Salary Revisions: five compensation actions + filters

## What changes

The **Revise Salary** dialog goes from three tabs to five:

1. **CTC change** — unchanged (increment / promotion / correction / demotion, scheduled or immediate, pushed + verified on RazorpayX).
2. **Addition** — a one-off earning staged onto a chosen payroll month. It is *not* paid immediately; it lands in that month's payroll inputs and is pushed to RazorpayX from the Payroll Cockpit like every other addition.
3. **Deduction** — same, on the deduction side. Lands in that month's payroll inputs (Cockpit Step 5) and is pushed from there.
4. **One-time payout** — pure record-keeping. Paid outside payroll on a date the operator picks. Nothing is pushed to RazorpayX; the entry is marked paid on that date and appears in history and in the employee's compensation history.
5. **Statutory toggle** — unchanged.

### No backdating for Addition / Deduction

The payroll-month picker for these two only allows the **current month onwards** (a closed/locked month is also excluded). Past months are disabled in the picker and re-validated on save, so a backdated addition or deduction cannot be created from any path.

### Cockpit integration

Additions and deductions created here write into the same tables the Payroll Inputs page and Cockpit Step 5 already read (`hr_payroll_input_additions` / `hr_payroll_input_deductions`). They therefore show up as normal staged rows with the usual push / read-back verification lifecycle — no separate queue, no duplicate push path. The employee must be RazorpayX-mapped; if not, the dialog says so and blocks (same rule as Payroll Inputs).

### One-time payout behaviour change

Today a one-time payout is auto-pushed to RazorpayX as a payroll addition. That push is removed for this mode: the record is saved as paid on the selected date with the payout reason, and the row shows a neutral "Recorded (paid outside payroll)" badge instead of Queued/Rejected. Existing already-pushed rows keep their current badges — nothing historical is rewritten. (If a payout *should* ride on payroll, the operator uses **Addition** instead — that is exactly the distinction between options 2 and 4.)

## Filters on the Salary Revisions page

A category filter row is added next to the existing status tabs and search:
`All · CTC change · Addition · Deduction · One-time payout · Statutory`
Filters combine with the existing status tabs (Applied / Scheduled / Cancelled) and the name search. The list shows a per-category count.

## Technical notes

**Migration**

- Extend `hr_salary_revisions_type_check` with `payroll_addition` and `payroll_deduction`.
- Add to `hr_salary_revisions`: `payout_paid_on date` (one-time payout, actual payment date), `payout_channel text` (e.g. `outside_payroll`), `payroll_input_id uuid` (link to the staged addition/deduction row), `payroll_input_kind text`.
- Trigger/CHECK guard rejecting `payroll_addition` / `payroll_deduction` rows whose `payout_month` is earlier than the current month, so backdating is blocked server-side too.

**Files**

- `src/components/hrms/ReviseSalaryDialog.tsx` — 5-way mode switch (wraps to two rows on mobile), addition/deduction branch that inserts into the payroll input tables + mirror row in `hr_salary_revisions`, one-time payout branch with a paid-on date picker and no RazorpayX push.
- `src/lib/oneTimePayoutPush.ts` — untouched; simply not called for the new record-only payout mode (still used by the retry button on legacy queued rows).
- `src/pages/horilla/SalaryRevisionsPage.tsx` — category filter, badges/labels for the two new kinds, "Recorded" badge for record-only payouts, no Push button on those rows.
- `src/components/hrms/CompensationHistory.tsx` — labels/icons for addition, deduction and record-only payout; deductions render as negative amounts and are excluded from the "Total Bonuses Paid" tile.
- `src/lib/hrms/additionType.ts` — reused for the RazorpayX addition-type code; no change expected.

Deduction rows in the payroll input tables are stored as positive magnitudes (existing convention) and displayed with a minus sign.