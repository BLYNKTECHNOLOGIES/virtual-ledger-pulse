# Loans & Advances — fix the payroll link (Amit Dangi case)

Three separate defects explain everything you saw. All three are confirmed against the live database and the scheduler code.

## 1. "Paid ₹4,000 / outstanding ₹13,000" before payroll ran

The loan installment for Amit is `status = paid`, `pushed_at = 2026-08-03 13:08`, `razorpay_input_id = NULL`.

The daily recovery job (`hr-schedule-deposits`) pushes the deduction to RazorpayX and then immediately calls `hr_apply_loan_repayment`, which stamps the installment as **paid** and drops the loan outstanding balance right away. Nothing waits for the payroll month to actually be processed.

Deposits already do this correctly — they have a two-stage life (`pushed` when it reaches RazorpayX, `collected` only once the payroll period is processed, via `hr_settle_deposit_installment`). Loans skipped that middle stage; `hr_rebuild_loan_schedule` even references a `pushed` status that nothing ever writes.

**Fix:** give loan installments the same two-stage life.
- New `hr_apply_loan_push(repayment_id, razorpay_input_id)` sets `status = 'pushed'` only, touches no balance, and settles immediately only if the period is already processed.
- `hr_apply_loan_repayment` becomes the settlement step (payroll processed, or a genuine manual/cash repayment) — that is the only place outstanding balance moves.
- The scheduler calls the push RPC, not the repayment RPC.
- Loan settlement is hooked into the same payroll-period-processed path deposits already use, so closing a month settles loan EMIs and deposit installments together.
- Repair the existing data: Amit's installment 1 goes back to `pushed`, outstanding returns to ₹17,000 until the August payroll is processed.

## 2. The July installment was never created

You set EMI start = 2026-07-01, but the first schedule row is 2026-08-01.

`hr_rebuild_loan_schedule` clamps the first period to `GREATEST(start month, current month)` — it silently refuses to ever schedule a past month. July 2026 is **not** locked or processed (verified), so that installment should exist. This is why Amit appears nowhere in the July cockpit and no ₹4,000 deduction was staged for July.

**Fix:** mirror the deposit logic exactly — start at the EMI start month and advance forward only past months that are *already processed/locked*. Unprocessed past months stay in the schedule and get picked up by the recovery run for that period. Amit's schedule gets rebuilt so installment 1 is July 2026.

## 3. Recoveries carry no RazorpayX handle

0 of 22 pushed deposit installments and 0 loan installments have a `razorpay_input_id` — the proxy's add-deduction response is not returning an id the scheduler can store, so nothing can be tied back to the RazorpayX register or independently verified.

**Fix:** after each successful push, read the employee's deductions back for that payroll month and match on label + amount to capture the real id (the same read-back verification pattern already used for payroll inputs). If the read-back does not find it, the installment is marked `failed` instead of quietly succeeding.

## What changes on screen

- Loan detail drawer statuses become: `scheduled` → `pushed` (sent to RazorpayX, not yet in a processed payroll) → `paid`. Outstanding only moves on `paid`.
- Recovered / outstanding figures reflect settled money only.
- Amit's schedule shows July as installment 1, and the Automatic Recoveries card for July shows the ₹4,000 Loan EMI line.
- The Recovery-schedule table shows the RazorpayX input id per pushed row.

## Verification before reporting done

- Rebuild Amit's schedule → July installment exists.
- Run the recovery job for that loan for July → row becomes `pushed` with a real RazorpayX input id, outstanding stays ₹17,000.
- July cockpit Automatic Recoveries shows the ₹4,000 Loan EMI for Amit, matching the RazorpayX read-back.
- Mark the period processed on a test basis → row flips to `paid`, outstanding drops to exactly ₹13,000, and only then.
