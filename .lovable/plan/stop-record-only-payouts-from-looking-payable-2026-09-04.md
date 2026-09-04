# Stop record-only payouts from looking payable

## What is actually happening

Those 20 one-time rows on the August payroll-inputs page are **already marked as paid outside payroll** in the database. Every one of them carries channel `outside_payroll` plus a real paid-on date (13 corrections totalling ₹53,118 and 7 bonuses totalling ₹6,983 for August 2026). Only two rows in the whole table are genuine payroll items: Kunal's ₹1,500 payroll addition (Aug) and a ₹5,000 bonus (Jul).

So the data is right. Three surfaces simply ignore the "paid outside payroll" flag and keep presenting these as money still owed:

1. **Payroll Inputs → One-time payouts card** — lists every one-time revision for the month, shows each as "Not pushed", and rolls all of them into the footer total. The Salary Revisions page already renders the same rows correctly as "Recorded · paid outside payroll".
2. **Cockpit "Compensation" step summary** — counts them as "not yet pushed to RazorpayX" and adds their rupees into the one-time total, so the step never looks clean.
3. **The push helper itself** — has no guard: if anyone ever pushes one of these from Salary Revisions, RazorpayX would pay it a second time. This is the real financial risk, not a display bug.

## The fix

**Treat "paid outside payroll" as a first-class settlement state everywhere, not just on one page.**

1. One-time payouts card
   - Split the list into two groups: *Landing on this RazorpayX run* and *Already paid outside payroll (record only)*.
   - Record-only rows get a green "Paid outside payroll · <date>" status instead of "Not pushed", show the paid-on date, and are excluded from the "not pushed" warning.
   - Footer shows two totals: payable on this run, and recorded-only (informational).
   - Card sub-heading explains the distinction so nobody re-pays by habit.

2. Cockpit compensation step
   - Exclude `payout_channel = 'outside_payroll'` rows from the unsynced count and from the payable one-time total; report them separately as "₹X already paid outside payroll (recorded)". The step then goes clean once the genuinely payable items are pushed.

3. Hard double-payment guard
   - The push helper refuses any revision flagged `outside_payroll` with a clear message ("already paid outside payroll on <date> — pushing would pay it twice"), and the Salary Revisions UI keeps hiding the push action for those rows. Guard sits in the shared helper so every entry point is covered.

4. Reporting consistency
   - The projected salary register already separates off-payroll payouts; no change needed there. Employee compensation history keeps showing them (they *were* paid), labelled as paid outside payroll.

No data changes, no arithmetic changes, no change to how correct payouts are pushed.

## Open question

Should record-only payouts stay visible on the Payroll Inputs page at all (collapsed, for audit), or be hidden behind a "show recorded-only" toggle so the page shows only what is actually payable? Default in this plan: visible but clearly separated and collapsed by default.

## Technical notes

- `public.hr_cockpit_month_state` — CTE `s3_rows`/`s3`: add `payout_channel` and exclude `outside_payroll` from `rev_unsynced` and `one_time_total`; add `one_time_recorded_total`.
- `src/components/hr/payroll/OtherPayrollInputsCard.tsx` — select `payout_channel, payout_paid_on`, partition list, two totals, new status badge.
- `src/pages/hr/MonthlyPayrollCockpitPage.tsx` — `salary_revisions` summary wording for the new field.
- `src/lib/oneTimePayoutPush.ts` — early return when `payout_channel = 'outside_payroll'`.
- Verification: SQL re-run of `hr_cockpit_month_state('2026-08-01')` before/after, plus build/typecheck.
