# Reversal Fix + Three Gaps (single phase, stop at manifest)

Confirmed against the live database before planning: `fin_intercompany_v` has no reversal filter, and exactly three legs in it are reversed (₹2,49,998 + ₹2,50,000 + ₹20,00,000 = ₹24,99,998), all Shubham TRANSFER_OUT. Both the leg and its counter-leg carry `is_reversed = true`; no row in the view has `reverses_transaction_id IS NOT NULL`, so the reversal entries themselves never enter the view — the effect is a pure overstatement, exactly as reported.

Scope lock A1-A8 continues to apply. Only `fin_*` objects and Balance Sheet feature files are touched. This work stops at the change manifest.

## 1. Fix `fin_intercompany_v`

Add to the `legs` CTE, applied symmetrically to both sides of each pair:

```text
AND COALESCE(x.is_reversed, false) = false
AND x.reverses_transaction_id IS NULL
AND COALESCE(r.is_reversed, false) = false
AND r.reverses_transaction_id IS NULL
```

Because the filter names both `x` and `r`, a reversed pair drops entirely — no orphan side survives. Nothing else in the view definition changes.

## 2. New disclosure view `fin_intercompany_excluded_reversals_v`

Same pairing logic as `fin_intercompany_v`, but selecting only the legs the filter removes. Grouped per entity pair: from entity, to entity, leg count, rupee value, plus reason (`REVERSED_LEG` or `REVERSAL_ENTRY`). Surfaced in the integrity panel as an informational disclosure with count and value, so the removal is visible rather than silent.

## 3. Permanent regression check in `fin_entity_integrity`

New check `intercompany_reversal_leak`: counts rows in `fin_intercompany_v` whose `leg_id` or `counter_leg_id` joins a `bank_transactions` row with `is_reversed = true` or `reverses_transaction_id IS NOT NULL`. Zero = PASS. Any hit = CRITICAL, which fails the generation gate and forces the DRAFT watermark.

## 4. Re-run and report positions

After the migration, report `fin_intercompany_position_v` for all four entities — receivable, payable and net — alongside the pre-fix figures and the delta. Expected: Shubham receivable falls to about ₹1,63,33,604, Vertex payable down ₹22,49,998, Blynk payable down ₹2,50,000, ASEC unchanged.

## 5. Equality gate

Re-assert group receivable = group payable (and the net across all entities = 0) after the fix, reported as a figure, not a claim.

## G1. Exercise the export path end to end

Drive the real UI with Playwright: open Financials → Reports → Balance Sheet, select ASEC, generate PDF and then Excel. Then show:

- the `fin_balance_sheet_generation_log` row(s) written, including non-null checksum, format, entity, as-of date and gate status;
- screenshot evidence that the DRAFT — FAILED VERIFICATION watermark rendered, given the failing balance check;
- the actual generated file sizes/first page.

If the log insert or checksum is broken, fix it in the same pass and re-run until a real row exists.

## G2. Share capital as a distinct line

For `PRIVATE_LIMITED` entities (ASEC, Blynk), `fin_entity_balance_sheet()` emits an explicit `Share capital` line under Shareholders' funds with `amount = NULL`, confidence `review`, and a `NOT AVAILABLE — not captured in ERP` flag. It is no longer folded into opening funds; opening funds keeps only what it actually is. The dialog and both exports render NULL-amount lines as `NOT AVAILABLE` rather than `0.00` or a blank.

## G3. H2 round-trip test, executed and reported

For each anchored bank account: take `erp_balance_baseline.baseline_balance` at 21-Apr-2026, roll backwards over the 01-Apr → 21-Apr window to derive the 01-Apr opening, then roll forwards over the same window. Assert the result equals the baseline exactly (numeric, zero tolerance). Report a per-account table: account, baseline, derived opening, rolled-forward value, difference, PASS/FAIL. Any non-zero paisa difference is treated as a sign error and fixed before the manifest.

## Deliverable

One change manifest covering: files touched, database objects created or altered, confirmation that nothing outside the `fin_*` / balance-sheet namespace changed, corrected position table, equality-gate figure, generation-log row, and the H2 per-account results. Work stops there.
