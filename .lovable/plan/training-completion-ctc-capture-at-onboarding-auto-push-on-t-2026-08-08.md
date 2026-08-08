# Training-Completion CTC — capture at onboarding, auto-push on the date, recover in the cockpit

Goal: enter the training end date and the post-training CTC once, in the onboarding form. Everything else happens on its own — the revision shows up as SCHEDULED, RazorpayX gets the new CTC automatically on that exact date, and the payroll cockpit shows the resulting one-time recovery in its own dedicated block.

Math is already specified and signed off in `docs/hrms/TRAINING_CTC_TRANSITION.md`; this plan implements it.

## 1. Onboarding form (Stage 2 — Salary Configuration)

Add two fields next to Annual CTC:

- **Training completion date** (`T`) — must be after date of joining.
- **Post-training annual CTC** (`C2`) — must differ from the training CTC (`C1`).

Both optional; if either is blank nothing is scheduled. Under the fields, a live helper line states plainly what will happen, e.g.:

> On 20 Sep 2026 the CTC changes from ₹1,20,000 to ₹1,80,000. RazorpayX will pay September fully at the new CTC, so a one-time recovery of about ₹X will be staged in the September payroll for HR approval.

The 15th rule is used only to name the payroll month the recovery lands in (completion on/before the 15th → the same month is normally still open, so it is a *deduction* in that month; after the 15th, or if the month is already processed, it becomes an *addition/arrears* line in the following month). It never delays the CTC push itself — the push always happens on `T`.

## 2. Salary Revisions page

On onboarding finalization, a `SCHEDULED` revision row is created with `effective_from = T`, reason `training_completion`, from `C1` to `C2`. It is visible in Salary Revision History from day one, badged "Scheduled — training completion", and deletable while un-pushed (existing delete flow already handles rollback).

## 3. Automatic push on the date

The existing daily cron `hr-promote-scheduled-salary-revisions` already promotes due SCHEDULED rows and pushes the CTC to RazorpayX. It gains one extra responsibility: after a successful promotion of a `training_completion` revision, compute the adjustment and stage it. No manual step, nothing pushed from the cockpit.

Computation (from the spec, employment-window clamped, divisor = calendar days of the month):

```text
A_net = (G2 − G1) × ( paid days before T ) / N
paid days before T = (T − max(joining, month start))  −  LOP days before T
```

- `A_net > 0` → row in `hr_payroll_input_deductions` (`source = 'training_ctc_adjustment'`).
- `A_net < 0` (lower post-training CTC) → row in `hr_payroll_input_additions` with `|A_net|`.
- `|A_net| < ₹10` → no line.
- Sundays, weekly-offs, holidays are paid days and are recovered like any other day; LOP comes only from `hr_lop_days`, which already returns 0 for them and holds days with an open watchdog session harmless.
- Idempotency key `(employee_id, period_month, revision_id)` — cron retries can never double-recover.
- Rows are staged **unpushed**, awaiting HR approval. Recoveries are never auto-pushed to RazorpayX.

## 4. Payroll cockpit — its own block

In the deduction step (`/hrms/payroll-inputs`, deduction tab), a new card **Training CTC Adjustments** sits beside Auto Recoveries, listing for the period:

| Employee | Old CTC | New CTC | Effective | Paid days before | LOP before | Recovery | Status |

Each row expands to show the full derivation (`G1`, `G2`, `T`, `d_old`, `L_before`, divisor `N`, result), plus both figures the doctrine requires: the CTC-level recovery and the estimated net-pay impact. Actions: approve & push, edit amount with a mandatory note, or dismiss with a reason. Net-pay floor guard — if the recovery would drive net pay below zero, it is split and the remainder carried to the next month automatically, flagged on the row.

## 5. Keeping shadow payroll and reporting honest

- `compute-shadow-payroll` mirrors the same adjustment so shadow equals RazorpayX.
- The Net Variance Bridge gets a dedicated **Training CTC adjustment** bucket so it never lands in the unexplained residual.

## Technical notes

- New columns on `public.hr_employee_onboarding`: `training_completion_date date`, `post_training_ctc numeric`.
- Revision rows use existing `revision_type = 'increment'` (or `'demotion'` when `C2 < C1`) with `revision_reason = 'training_completion'`; no enum change needed.
- Deductions land in `hr_payroll_input_deductions` using the existing `source` column; additions in `hr_payroll_input_additions`.
- New DB function `hr_training_ctc_adjustment(employee_id, period_month, revision_id)` returning the amount plus its derivation as JSON — one calculator consumed by the cron, the cockpit card, and shadow payroll. LOP always via `hr_lop_days`; no client-side tally.
- Divisor is calendar days `N` per the spec. Before go-live, confirm RazorpayX's actual LOP divisor against one past Salary Register row; if it differs, the function takes the divisor from a single config value rather than being changed in three places.
