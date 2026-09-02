# Monthly Payroll Cockpit — Deep Logic Audit (verified against live DB, 02 Sep 2026, 17:5x IST)

Scope: the monthly payroll cockpit only — its 10 steps, their completion rules, and every function/edge function they depend on. Logic only; no UI, no new features. Every claim below was checked against the live database or the actual source, not assumed.

## Plain-language summary of bugs found

1. **The LOP calculator is currently broken and silently returns nothing.** The main function that counts loss-of-pay days reads the weekly-off setting in the wrong format, so it errors every single time it is called. Callers catch the error and carry on, so the screen shows "0 LOP" instead of "failed".
  Live proof: August 2026 has 199 absent days, 37 half-days and 285 no-data days recorded, yet **zero LOP deduction rows exist for August**. July (before the regression) has 9 rows. This is real money not being deducted.
2. &nbsp;
3. **The same employee can get three different LOP numbers**, because three different functions each calculate it their own way (one clips employment dates, one doesn't, one ignores held-harmless days and late-coming penalties entirely).
4. **Two attendance tables are being written in parallel and they disagree.** August: 1,287 rows in the new table vs 965 in the old one. The month summary reads the old one; LOP reads the new one.
5. **Re-generating LOP after an attendance correction can crash the whole batch.** The row is matched by a label that contains the day count ("LOP — 2 days"). If the count changes, the save collides with the existing row's ID and the entire run fails for everyone in it.
6. **Once LOP is pushed to RazorpayX it is frozen forever.** If attendance is corrected afterwards, nothing recomputes or flags it; the month still shows as "complete".
7. **Step 4 can miss LOP rows and can never complete a genuinely LOP-free month.** It matches deductions whose label contains "lop" — a manually added row labelled "Loss of Pay" is not matched (one such orphan row exists, dated 2999‑01‑01). And a month with legitimately zero LOP can never turn green.
8. **A month can be closed with real work outstanding.** Marking a step "skipped" removes it from the blocker list with no check at all, so the month can close with unpushed LOP, unsent payslips or open drift.
9. **Step 7 says "…then email payslips" but never checks that emails were sent.** It counts the emails and displays the number, but completion only looks at imported rows.
10. **Step 8 goes green on any shadow run, even a failed or unusable one.**
11. **Step 9 (drift) checks the wrong dates.** Drift alerts have no payroll month; they are re-touched every night, so an old unresolved drift blocks whatever month you are closing today and stops blocking the month it actually belongs to. Live: 94 alerts, newest touched today 17:30 IST.
12. **Shadow payroll's total on screen is inflated.** The page adds bonuses again and subtracts LOP again, although the stored figure already includes both. Employees with no imported RazorpayX payslip are counted as ₹0 on the RazorpayX side, making the comparison look worse than it is.
13. **Step 5 can get stuck permanently.** It checks recovery rows against status values that partly don't exist and never excludes legitimately "skipped" recoveries, so a skipped recovery keeps the step blocked forever.
14. **Salary base guesses annual vs monthly using a ₹1,00,000 threshold.** Any genuinely monthly figure above that is divided by 12, making each LOP day ~12× too expensive.
15. **Smaller issues:** LOP rounding is applied several times per line (₹1–2 noise); a recurring holiday saved on 29 Feb would crash the calculation in a non-leap year (none exists today); the "device outage" hold-harmless check looks at all employees instead of the queried one; a half-day worked on an approved leave day can be credited twice; the worked-on-leave reconciliation only looks back 40 days; comp-off consumption can be overstated, shrinking the comp-off offset; ESI eligibility uses a narrower figure than the contribution base (dormant — the setting is off); TDS is projected on CTC including employer PF/ESI; professional tax ignores bonus months; step 3's status check contains two values the table can never hold.

## Severity order


| #    | Finding                                                                                            | Severity | Verified how                                                                          |
| ---- | -------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| 1    | `hr_lop_days` reads `integer[]` with jsonb functions → errors on every call                        | P0       | live function body + `ERROR 42883` reproduction + zero Aug LOP rows                   |
| 2    | No joining/relieving clamp in `hr_lop_days` / `hr_attendance_month_summary`                        | P0       | live: `joining_date` absent from both bodies, present in `hr_lop_days_window`         |
| 3    | Three divergent LOP engines                                                                        | P0       | function bodies compared                                                              |
| 5    | Auto-LOP upsert conflict target vs mutable label + explicit `id`                                   | P1       | live: two unique indexes (`..._period_mon_key` on label, `..._auto_lop_uniq` partial) |
| 6    | Pushed LOP rows never revisited                                                                    | P1       | `generate-lop-deductions/index.ts` skip-on-`pushed_at`                                |
| 4    | `hr_attendance` vs `hr_attendance_daily` split brain                                               | P1       | live row counts Aug: 965 vs 1287                                                      |
| 8    | `skipped` bypasses all close blockers                                                              | P1       | live `hr_close_payroll_month` body                                                    |
| 7    | Step 4 `%lop%` label match + zero-LOP month                                                        | P1       | live `hr_cockpit_month_state` s4; orphan `Loss of Pay` row 2999‑01‑01                 |
| 11   | Step 9 drift date filter                                                                           | P1       | live s9 CTE + `hr_drift_alerts` has no `period_month`                                 |
| 9,10 | Step 7 ignores `emails_sent`; step 8 accepts any run                                               | P2       | live s7/s7c/s8                                                                        |
| 12   | Shadow page double counts additions/LOP                                                            | P2       | `ShadowPayrollPage.tsx` totals vs `monthly_gross` definition                          |
| 13   | Step 5 recovery status vocabulary                                                                  | P2       | live statuses: `scheduled/pushed/paid` only                                           |
| 14   | ₹1,00,000 annual/monthly heuristic                                                                 | P2       | `_shared/salaryBase.ts`                                                               |
| 15   | Rounding, Feb‑29, blackout scope, half-day double credit, 40-day window, comp-off pool, ESI/TDS/PT | P3       | source; ESI flag live = `false`                                                       |


## Proposed fix order (no functional/UI change, correctness only)

1. **P0 migration** — rewrite `hr_lop_days` to read `weekly_offs` as `integer[]` (mirror `hr_lop_days_window`), add joining/relieving clamping, and guard recurring Feb‑29. Then make `hr_compute_lop_days` and `hr_attendance_month_summary` delegate to one single implementation so all three paths return the same number.
2. **Backfill + verify** — re-run LOP for August 2026, compare per-employee days/amount against July as a control, and publish a before/after table.
3. **P1 edge function** — key the auto-LOP upsert on the stable `(hr_employee_id, period_month) WHERE source='auto_lop'` index, drop the day-count from the conflict key, and add a "pushed row is stale vs current attendance" flag surfaced on step 4.
4. **P1 cockpit SQL** — step 4 match on `source='auto_lop'` (not the label) and treat a verified zero-LOP month as complete; step 9 scope drift by the month it belongs to rather than `last_seen_at`; block `skipped` from clearing steps whose live state is incomplete (subject to Q4 below).
5. **P2** — step 7 requires emails sent, step 8 requires a usable run, fix `ShadowPayrollPage` totals arithmetic and the missing-RazorpayX comparison, fix the recovery status list.
6. **P3** — rounding once per line, blackout scoped to the employee, half-day/leave double credit cap, comp-off pool actual-consumption, salary-base unit flag instead of the ₹1,00,000 guess.
7. Log each verified change in `docs/STATE_LOG.md` with IST timestamps.

Every step is verified after applying: DB query for the SQL changes, function redeploy + log check for the edge functions.

## Questions I need answered before touching the policy-dependent parts

1. **Half-day penalty** — when the policy threshold for half-days is hit, is that an *extra* LOP day on top of the 0.5 already lost, or is the 0.5 the whole penalty?
2. **Late coming** — should the threshold count distinct late *dates*, or every late event (two late punches in one day = 2)?
3. **Incomplete days** — should an approved regularization always make the day paid, or only when the decision explicitly says "regularize as present"?
4. **Close blockers** — may steps 7 (payslips/emails) and 9 (drift) become hard blockers that cannot be skipped, or must every step stay overridable by HR?