# Self-audit of the payroll cockpit remediation — what is actually done, what is not

Re-verified against the live database and source at 18:0x IST, 02 Sep 2026.

## Confirmed fixed (verified live)

- `hr_lop_days` now delegates to `hr_lop_days_window` — no jsonb-on-`integer[]` crash, employment-window clipping applies (finding 1, 2).
- `hr_compute_lop_days` is a thin wrapper over `hr_lop_days`, and `hr_attendance_month_summary` reads canonical values from `hr_lop_days` while keeping legacy late/early/OT for comparison — one LOP engine, three callers (finding 3).
- Recurring 29-Feb holiday guard is in the windowed engine (part of finding 15).

## Not yet done (the plan is only ~3 of 15 findings deep)

| # | Issue | Live evidence today |
|---|---|---|
| 5 | Auto-LOP upsert still keys on the mutable label | `generate-lop-deductions` line 227: `onConflict: "razorpay_employee_id,period_month,label"` |
| 6 | Pushed LOP rows still frozen after later attendance changes | same file, lines 159-191 skip on `pushed_at` with no staleness flag |
| 7 | Step 4 still matches `label LIKE '%lop%'`; a genuine zero-LOP month can never go green | live `hr_cockpit_month_state` CTE `s4` |
| 8 | `skipped` still clears any close blocker | live `hr_close_payroll_month` loop |
| 11 | Step 9 still scopes drift by `first_seen_at`/`last_seen_at` | live CTE `s9` |
| 13 | Step 5 recovery vocabulary still counts `failed` (never stored) and never excludes skipped recoveries | live CTE `s5r` |
| 9, 10 | Step 7 does not require emails sent; step 8 accepts any shadow run | live CTEs `s7`, `s8` |
| 12 | Shadow page re-adds additions and re-subtracts LOP over `monthly_gross` | `ShadowPayrollPage.tsx` lines 191, 410 |
| 14 | ₹1,00,000 annual/monthly guess | `_shared/salaryBase.ts` lines 69, 83 |
| 4, 15 | `hr_attendance` vs `hr_attendance_daily` split brain; rounding, blackout scope, half-day double credit, 40-day window, comp-off pool, ESI/TDS/PT | unchanged |

## Proposed next slices (logic only, no UI or workflow change)

1. **Auto-LOP identity + staleness** — switch the upsert to the stable partial index `(hr_employee_id, period_month) WHERE source='auto_lop'`, stop sending an explicit `id`, keep the label purely cosmetic. Add a computed "pushed row disagrees with current attendance" flag returned by the function and surfaced in step 4's existing detail payload (no new UI element).
2. **Cockpit SQL correctness** — step 4 matches `source='auto_lop'` instead of the label and treats a verified zero-LOP month as complete; step 5 uses the statuses the table actually holds and ignores skipped recoveries; step 9 scopes drift to the payroll month it belongs to; steps 7 and 8 require emails sent and a usable (`completed`) shadow run.
3. **Close gating** — `skipped` no longer clears a step whose live state is incomplete (pending your Q4 answer; until answered I will leave close behaviour untouched).
4. **Shadow totals + salary base** — remove the double count on the shadow page, exclude/flag employees with no imported RazorpayX payslip from the comparison, and replace the ₹1,00,000 heuristic with an explicit unit on the resolved source.
5. **P3 pass** — round once per line, cap half-day-on-leave double credit, widen the worked-on-leave lookback, base comp-off offset on actual consumption.

Each slice is verified before I report it: elevated SQL read-back for the database changes, redeploy plus a live invocation and log check for `generate-lop-deductions`, and an IST entry appended to `docs/STATE_LOG.md`.

## Still blocked on your answers

1. Half-day threshold — extra LOP day on top of the 0.5, or is the 0.5 the whole penalty?
2. Late coming — count distinct late dates, or every late event?
3. Incomplete days — does any approved regularization make the day paid, or only an explicit "regularize as present"?
4. Close blockers — may steps 7 and 9 become hard blockers that `skipped` cannot clear, or must every step stay overridable by HR?

Slices 1, 2 (except the policy-touching parts), 4 and 5 can proceed without these; slice 3 and the half-day/late/incomplete rules cannot.
