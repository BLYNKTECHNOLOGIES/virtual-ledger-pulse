# Payroll Cockpit — Deep Logic Audit (bugs only, no new features)

Audited: `hr_lop_days` / `hr_compute_lop_days` / `hr_lop_days_window` / `hr_attendance_month_summary` / `fn_calculate_leave_days` / `hr_cockpit_month_state` / `hr_close_payroll_month` / `hr_cockpit_ack_step` (live DB definitions), plus `generate-lop-deductions`, `compute-shadow-payroll`, `hr-send-payslip-emails`, `razorpay-payroll-proxy`, and the cockpit/step UI pages.

Findings are ordered by blast radius. Everything below is verified against the live database or the live function source unless marked "unconfirmed".

---

## P0 — LOP engine is currently throwing at runtime (verified)

The live `hr_lop_days` reads the weekly-off pattern with **jsonb** operators:

```sql
SELECT ARRAY(SELECT jsonb_array_elements_text(p.weekly_offs)::int) ...
WHERE jsonb_typeof(p.weekly_offs) = 'array' AND jsonb_array_length(p.weekly_offs) > 0
```

but `hr_weekly_off_patterns.weekly_offs` is an **integer[]** column. Reproduced against the real column:
`ERROR 42883: function jsonb_typeof(integer[]) does not exist`.

Consequence: every call to `hr_lop_days` raises — and `hr_compute_lop_days` (wrapper) and `hr_attendance_month_summary` (calls it in its `safeguards` CTE) fail with it. Those three feed **auto-LOP generation, shadow payroll, the projected salary register, the RazorpayX LOP push and the attendance month summary**. All of those callers only `console.error` the RPC failure and continue, so the visible symptom is "no LOP / zero LOP / empty summary", not an error.

The sibling `hr_lop_days_window` (created minutes later, 25-Aug) already uses the correct `integer[]` form — so the jsonb version is stale code that survived the column type change.

Fix: rewrite the two weekly-off lookups in `hr_lop_days` to plain `integer[]` (mirroring `hr_lop_days_window`), then re-run LOP for August and compare against `hr_lop_days_window`.

## P1 — Mid-month joiners/leavers get LOP for days before they joined

In `hr_attendance_month_summary`, `wd_elapsed` counts working days from the **1st of the month** to today, with no clipping to joining date / last working day, while the displayed `working_days` column *is* clipped (`LEAST(working_days, wd_elapsed)`). The LOP expression uses the unclipped `wd_elapsed`.

Joiner on the 15th of a 26-working-day month with perfect attendance: displayed working days 12, LOP = 26 − 12 = **14 days**. `generate-lop-deductions` then divides by the *clipped* 12 → a deduction of more than one month's pay. Same failure mirrored for exits.

Fix: clip the elapsed window to `[joining_date, COALESCE(last_working_day, termination_date, month_end)]` and use the same clipped value in both the displayed column and the LOP expression.

## P1 — Re-staging LOP after an attendance correction breaks

`generate-lop-deductions` upserts with `onConflict: "razorpay_employee_id,period_month,label"`, but the real guard is a partial unique index on `(hr_employee_id, period_month) WHERE source='auto_lop'`, and the label embeds the day count (`"LOP — 2 days"`). When attendance changes 2 → 3 days the label changes, the declared conflict target no longer matches, and the batch fails on the partial index / primary key instead of updating.

Fix: upsert on the partial-index key (or update by `id` when the auto row already exists) and keep the day count out of the conflict key.

## P1 — Pushed LOP is frozen; the gate cannot see it went stale

`generate-lop-deductions` short-circuits any row with `pushed_at` ("left untouched") and discards the freshly computed value. Step 4's live status and `usePayrollStepGate` only ask "was it pushed and read-back verified", never "does it still match attendance". A regularization approved after the push leaves a wrong deduction live on RazorpayX with step 4 green.

Fix: recompute even for pushed rows and surface a `stale` state (recomputed ≠ pushed) that flips step 4 back to incomplete.

## P1 — Step 4 misses manually staged LOP, and is never green when LOP is genuinely zero

Step 4 counts `hr_payroll_input_deductions` rows with `label ILIKE '%lop%'`. The manual LOP form defaults the label to **"Loss of Pay"**, which does not contain "lop" — so manual LOP rows are invisible to step 4 (verified: the one such row in the table matches 0). Separately, `lop_rows > 0` is required for "complete", so a month with legitimately zero LOP can never go green on its own.

Fix: match on `source='auto_lop' OR label ~* '(lop|loss of pay)'`, and treat "zero LOP rows and zero computed LOP days" as complete.

## P1 — Month close can be certified without the condition being true

`hr_close_payroll_month` raises a blocker only when a step is **both** un-acked **and** live-incomplete; `hr_cockpit_ack_step` performs no validation at all. Acking steps 7/8/9 as done/skipped closes a month with open drift, no register import and zero payslip emails. Step 7 also computes `emails_sent` but never uses it in its status, and step 8 is satisfied by *any* shadow run — including one tagged `approximate`/`unusable`.

Fix: keep the manual-ack override (it is needed for step 6) but block close on hard-safety steps unless live state agrees, record the override reason, include `emails_sent` in step 7, and require a non-`unusable` shadow run for step 8.

## P2 — LOP arithmetic edge cases inside `hr_lop_days`

- **Half-day double penalty.** A half day already contributes 0.5 present, so the missing 0.5 is LOP; the policy term then adds `FLOOR(half_days / threshold)` again on top.
- **Late-come not de-duplicated.** Multiple `hr_late_come_early_out` rows on the same date each count towards the late-LOP threshold.
- **Cross-month leave over-credits paid days.** `paid_days` is a whole-request figure but is applied per month via `LEAST(days_in_month, paid_days)`, so a part-paid leave spanning two months can be credited its paid quota twice. (No such request exists today — 0 of 7 approved leaves cross a month — so this is latent.)
- **Worked-on-leave relies on `hr_leave_worked_days`.** Only 2 rows exist and it is populated by a nightly job; if a day is missed, the day counts as *both* present and paid leave and silently erases a real LOP day.
- **Held-harmless is open-ended.** An "incomplete" day with an approved regularization is treated as fully paid regardless of the regularization decision.
- **`weekly_off_source` label lies.** The `EXISTS` check omits the `effective_from <= month_end` filter used by the actual lookup, so a future-dated assignment reports `per_employee` while the default pattern is used.
- **Recurring holidays.** `make_date(year, month, day)` on a 29-Feb recurring holiday errors in a non-leap year.

## P2 — Leave-day arithmetic double-subtracts

`fn_calculate_leave_days` subtracts holidays and weekly offs independently, so a holiday falling on a Sunday is subtracted twice and the leave is under-charged. It also ignores recurring holidays and has no half-day handling.

## P2 — Shadow payroll dashboard totals double-count

`ShadowPayrollPage` computes `monthly_gross + additions_total − lop_amount`, but the engine already folds additions into `monthly_gross` (`earningsTotal = grossEarnings + addPositive`) and already applied the LOP factor to it. The header total is inflated by the additions and skewed by the LOP a second time. Per-line `net_pay` is correct — display only, but it is the number HR reads before closing.

## P2 — ESI threshold vs base

Eligibility is tested on `regularGross > 21000` while the contribution base can include additions. An employee at ₹20,500 + ₹5,000 bonus is charged ESI on ₹25,500 instead of exiting the scheme for the contribution period.

## P3 — Data hygiene / smaller gaps

- A junk deduction row exists with `period_month = 2999-01-01` (`Loss of Pay`, employee 71, staged 02-Aug) — it pollutes any all-period aggregation.
- Standalone Salary Register import trusts the filename-derived month with no cross-check against the CSV contents (the guard only fires in the embedded cockpit flow).
- `hr-send-payslip-emails` honours `force_resend` with no second-actor or audit gate; not reachable from the UI today.
- Step 9 filters drift alerts by `first_seen/last_seen` inside the month, so drift discovered in the following month never blocks the close.
- `cron.job` contains a duplicated `cleanup-old-balance-snapshots` entry and at least one job with a scheduler secret inline in the command text.

---

## Open questions

1. **Half-day policy** — should `half_day_count_for_lop` be an *additional* penalty on top of the 0.5 already lost, or is the 0.5 the whole intent? (Affects whether the double-penalty above is a bug or policy.)
2. **Late-come threshold** — count distinct dates, or every logged late event?
3. **Held-harmless regularizations** — should an approved regularization always pay the day, or only when the decision was "regularize as present"?
4. **Close-month override** — may I make steps 7 and 9 hard blockers (no ack override, reason required), or must every step stay overridable?

## Delivery

This pass is the audit. On approval I will fix in this order: P0 → P1 → P2, each with a before/after recomputation for July and August (per-employee LOP days and amounts) so nothing changes silently, and a `docs/STATE_LOG.md` entry per slice. No workflow, UI flow or feature changes.
