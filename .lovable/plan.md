# Mid-month CTC changes: how they are handled, and the gap to close

## How RazorpayX behaves (platform constraint)

RazorpayX CTC is a **month-level** attribute. There is no mid-month effective date and no retro-effective CTC. So in your example (₹1,00,000 → ₹2,00,000 effective 15 Aug):

- If the new CTC is pushed **before** August payroll is executed, RazorpayX pays the **whole of August at ₹2,00,000/yr rate** — the first 14 days are overpaid.
- If it is pushed **after** August was executed, RazorpayX paid the whole month at the old rate — the 15–31 Aug portion is underpaid and owed as arrears in September.

This is Out of RazorpayX API Scope; the only correction primitive is a one-time payroll **deduction** (recovery) or **addition** (arrears) in the right month.

## What already exists

The exact correction math is already built and correct:

- `hr_training_ctc_adjustment(revision_id)` computes the signed adjustment: `(G2 − G1) × paid_days_before / calendar_days`, LOP-aware, clipped to the employment window, and automatically flips to **arrears in month M+1** when the month was already processed (a payslip exists).
- `hr_stage_training_ctc_adjustment(revision_id)` stages that amount idempotently into `hr_payroll_input_deductions` / `hr_payroll_input_additions`, so it flows through the normal Step 5 push.

**The gap:** that staging is only called from the daily cron `hr-promote-scheduled-salary-revisions`, and only when `revision_reason = 'training_completion'`. So today:

- A scheduled training-completion revision → correction is staged automatically. Handled.
- **Any other mid-month CTC revision** (increment, promotion, correction, demotion — whether applied immediately or scheduled) → **no correction is staged**. RazorpayX pays the full month at the new CTC and the 1st-to-14th overpayment is silently absorbed. This is the real bug in your scenario.
- Nothing in the Revise Salary dialog or the Salary Revisions page tells the operator that a mid-month date will cause a full-month payment.

## What to change

1. **Generalise the staging to every CTC revision.** Call the staging routine for all applied CTC revisions with an effective date after the 1st, not just `training_completion`. Rename the pair to neutral names (`hr_ctc_transition_adjustment` / `hr_stage_ctc_transition_adjustment`) keeping the old names as wrappers so the cron and existing callers keep working.
2. **Stage at the same moment the CTC becomes live**, for both paths:
   - scheduled revisions → in the promotion cron (already the hook point, drop the reason filter),
   - immediate revisions → after a successful `push_employee_salary` from the Salary Revisions page, so nothing is staged for a CTC that never reached RazorpayX.
3. **Show it before it happens.** In the Revise Salary dialog, when the chosen effective date is not the 1st, show a preview line: "RazorpayX will pay all of August at the new CTC. A recovery deduction of ₹X will be staged into August payroll inputs (14 days at the old rate)." Uses the existing calculator in dry-run form, so the number shown is the number staged.
4. **Show it after it happens.** On the Salary Revisions page, a mid-month revision row gets an "Adjustment staged: −₹X in Aug 2026" / "Arrears +₹X in Sep 2026" chip linking to Payroll Inputs, so Step 5 review sees where the line came from.
5. **Idempotency and reversal.** Staging already keys on `(hr_employee_id, period_month, source_revision_id)` so re-runs cannot duplicate. Cancelling or deleting a revision must remove its un-pushed staged adjustment; if the adjustment was already pushed, leave it and flag it, consistent with existing pushed-row handling.

## Technical notes

- Migration: neutral-named copies of `hr_training_ctc_adjustment` / `hr_stage_training_ctc_adjustment` (logic unchanged — it never referenced `revision_reason`), old names delegating; label text becomes `CTC change adjustment (eff <date>)`; `source` becomes `ctc_transition_adjustment` with `training_ctc_adjustment` still accepted for history. Cleanup of un-pushed staged rows on revision cancel/delete.
- `supabase/functions/hr-promote-scheduled-salary-revisions/index.ts`: stage for every promoted revision whose `effective_from` is not the 1st.
- `src/pages/horilla/SalaryRevisionsPage.tsx`: after a verified CTC push, invoke staging; render the adjustment chip.
- `src/components/hrms/ReviseSalaryDialog.tsx`: dry-run preview when the effective date is not the 1st (read-only RPC, `authenticated` already has EXECUTE on the calculator).
- Verification: recompute for a real mid-month August/September revision via elevated SQL, confirm the staged row appears exactly once in payroll inputs, confirm the arrears branch when a payslip already exists, then log the change in `docs/STATE_LOG.md` with IST timestamps.
