# Fix mid-month joiner LOP — reverse August, then change the rule

## What went wrong

Six people joined during August and were set up in RazorpayX with their real joining date:

| Badge | Name | LOP pushed | Of which pre-joining |
|---|---|---|---|
| 12 | Urvashi Sharma | 5,161 | 16 days |
| 13 | Harmeet Singh Khalsa | 7,742 | 16 days |
| 16 | Khurram Khwaja | 5,484 | 16 days + 1 day absence |
| 19 | Neelanchal Dubey | 6,452 | 16 days |
| 21 | Abhishek Dev | 5,484 | 16 days + 1 day absence |
| 25 | Ishank Chouhan | 5,161 | 16 days |

All six were pushed to RazorpayX on 05-09-2026 at 19:49 IST. Our engine adds "pre-joining
days" as loss of pay because it assumed RazorpayX pays a full month in the joining month.
Your finding is that RazorpayX already starts pay from the joining date, so those days were
deducted twice and these six are underpaid by roughly 35,484 in total.

None of these six has any other August addition or deduction staged, so their August
modifications in RazorpayX can be cleared without touching anything else.

## Step 0 — prove it before touching money

Read the live August payroll record for two of these employees from RazorpayX and confirm
the salary line is already reduced to the served part of the month. Only if that confirms
your reading do the reversal below proceed. If RazorpayX in fact pays the full month, I stop
and report instead of removing correct deductions.

The same check is run separately for a person who left mid-month (exit month), because
joining and leaving may not behave the same way. Until that is proven, exit-month behaviour
is left exactly as it is today.

## Step 1 — reverse August in RazorpayX

For each of the six, clear their August payroll modifications in RazorpayX (the same
per-employee reset used for the Shivendra deposit correction — RazorpayX has no
single-deduction delete, which is an API limitation), then read the record back and confirm
the August deduction total is zero and the salary is unchanged.

Khurram and Abhishek each have 1 genuine absence day inside that same amount. After the
reset, their real absence LOP (1 day, calendar-day rate) is re-staged and re-pushed, and
verified by read-back. The other four end with no August LOP at all.

Local rows are updated to match: the six auto-LOP rows are removed/rewritten so HRMS and
RazorpayX agree, with the reversal recorded in the push log.

## Step 2 — reopen the cockpit steps

August steps 5 (loss of pay) and 6 (additions/deductions) go back to not-done so you can
re-run and re-confirm them. Steps 1-4 stay as they are. Nothing else about the month is
touched, and the month is not closed.

## Step 3 — change the rule permanently

In the LOP engine, days before joining (and, only if Step 0 proves it, days after
relieving) stop being charged as loss of pay. They are reported instead as "not employed"
days, shown in the preview and the CSV so the arithmetic is still visible, but they
contribute nothing to the deduction. Loss of pay is then only genuine absence after the
person joined — which is how the attendance engine already clips the window.

Guard rail: if a joiner's RazorpayX salary for the joining month comes back as a full
unprorated month, the row is surfaced as "needs review" rather than silently deducting
again. Wrong deduction is worse than no deduction.

Also updated so the two never drift: `docs/attendance/LOP_POLICY.md`, the Model B note in
project memory, and a dated IST entry in `docs/STATE_LOG.md`.

## Technical notes

- `supabase/functions/generate-lop-deductions/index.ts`: `gapDays` (from
  `hr_employment_gap_working_days`) is removed from `chargeDays`; it stays in the row payload
  as `not_employed_days` for display/CSV, and the label/remark no longer mentions proration.
- Reversal via `razorpay-payroll-proxy` → `payroll:reset-modifications` per employee, then
  `payroll:view-payroll` read-back; logged through the existing verified-push path.
- Cockpit reopen: update `hr_payroll_cockpit_state` rows for `2026-08-01`, steps 5 and 6.
- UI touch points that render the proration column: `AutoLopDialog.tsx` and
  `src/lib/hrms/payrollVerificationPack.ts` (label change only, no maths in the UI).

## Verification before I report done

Read-back of all six RazorpayX August records showing zero LOP (except the two 1-day
absences), a dry-run of the August and September LOP engine showing joiners with only real
absence days, unchanged figures for everyone who is neither a joiner nor a leaver, and the
STATE_LOG entry appended in IST.
