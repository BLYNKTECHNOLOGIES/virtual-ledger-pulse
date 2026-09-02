# Joiner LOP: what the July case proved, and the fix

## What the live data says

I pulled the real RazorpayX payroll envelope for the one mid-month joiner we have (Satyam Shukla, RazorpayX id 55, joined 13-Jul-2026).

```text
RazorpayX salary for July      9,194   (full month, "isProRated": false)
Deduction we pushed            6,667   remark "LOP - 12 days"
Resulting July gross           2,527
```

Three findings, all confirmed against live rows:

**1. RazorpayX does NOT prorate the joining month.** Its payroll record carries the full monthly salary with `isProRated: false`. The only thing that reduced his July pay was our own pushed deduction. So there is no double-deduction risk, and pre-joining days *must* be handled on our side — your Model B is the mechanism actually in use, and it is the correct one for this setup. My earlier Model A recommendation was based on the assumption that RazorpayX prorates; the data disproves that assumption.

**2. We push rupees, never days.** Confirmed: the envelope is `payroll:add-deduction` carrying `deduction-amount` plus a remark. `lop_days` is stored locally for audit only. Your understanding is exactly right.

**3. The July deduction used the wrong salary base — he was underpaid.**

```text
Base actually used   15,000/month   (onboarding CTC 1,80,000 / 12)
Base RazorpayX pays   9,194/month   (structure + hr_employees.total_salary 1,10,328 / 12)
Deduction charged    15,000 x 12/27 = 6,667
Correct deduction     9,194 x 12/27 = 4,086
Shortfall in his July pay        ~2,581
```

The deduction was computed off a stale onboarding CTC that is ~63% higher than the salary RazorpayX actually pays him. This is the root cause of the joiner discrepancy — not the LOP-day count, which was right (12 pre-joining days).

Side observation for later: his attendance shows him present 1-12 July, before his recorded joining date of 13 July. Device data and the onboarding date disagree. That did not affect the July money, but it needs a separate look.

## What to change

### 1. Deduction base must equal the salary RazorpayX pays

In `supabase/functions/_shared/salaryBase.ts`, make the resolution order authoritative rather than best-available:

1. RazorpayX-mirrored monthly salary (`hr_employees.total_salary / 12`, or the mirrored structure total).
2. Local salary structure total, only when it matches source 1.
3. Onboarding CTC — demoted to a last resort, and only when nothing above exists.

Add a hard guard: when the resolved base differs from the RazorpayX-mirrored salary by more than a small tolerance, the employee is returned as `skipped` with an explicit "salary base disagrees with RazorpayX" reason instead of silently deducting off the wrong number. A wrong deduction is worse than no deduction.

### 2. Confirm Model B and make the rate internally consistent

Keep booking pre-joining and post-relieving days as LOP days (that is what makes RazorpayX's unprorated salary come out right), and compute every LOP rupee as:

```text
amount = RazorpayX monthly salary  x  LOP days / FULL-MONTH working days
```

Both sides full-month. Today the code takes the full-month base and divides by the *employment-window* working days, which inflates a real absence for a joiner by roughly 2.6x. That is the day-rate fix you approved; it is a one-line consistency correction in `generate-lop-deductions`.

### 3. Separate the two kinds of LOP in the label

Keep them in one deduction amount (RazorpayX takes one figure), but split the remark so a payslip reads honestly, e.g. `LOP - 12 days (pre-joining proration) + 2 days absence`. Local `lop_days` continues to store the total for audit. No schema change, no workflow change.

### 4. Re-verify July, do not silently rewrite it

The July row is already pushed. Per the existing rule, pushed rows are never overwritten. It will be recomputed and surfaced as `stale_pushed` with the ~2,581 delta shown, so you can decide whether to issue it as an arrear in the next cycle. I will not push anything to RazorpayX without your say-so.

## Verification before I report done

- Recompute July and August in dry-run and confirm Satyam's July deduction now resolves to 4,086 off a 9,194 base, and that the August cohort's 155.5 LOP days and amounts are unchanged for everyone who is not a joiner or leaver.
- Confirm the salary-base guard actually fires by checking how many of the 42 active employees have an onboarding CTC that disagrees with their RazorpayX salary.
- Deploy the edge function, invoke it authenticated, and read the response and logs.
- Append a dated IST entry to `docs/STATE_LOG.md`.

## Out of scope for this change

- The attendance-vs-joining-date contradiction (present on 1-12 July, joined 13 July) — flagged, handled separately.
- The four open policy questions (half-day threshold, late-count semantics, incomplete-day regularization, whether Steps 7/9 hard-block close).
