# Company-Wise Balance Sheet — Revised Plan (v2)

Structure accepted and unchanged: views-first, confidence tags on every line, drill-down traceability, integrity panel, no forced balance. The six corrections and the export additions are folded in below, together with what is already deployed and what has to change.

## Current state (already deployed, to be revised — not rebuilt)

Deployed: `fin_account_classification`, `fin_bank_entity_map_v`, `fin_entity_master_v`, `fin_entity_txn_v`, `fin_entity_receivable_v`, `fin_entity_payable_v`, `fin_unattributed_pool_v`, plus `fin_entity_balance_sheet()`, `fin_entity_line_detail()`, `fin_entity_integrity()`, `fin_entity_bank_position()`, and a Balance Sheet dialog with PDF/Excel export in Financials → Reports.

Verified against the live database just now:
- `subsidiaries.firm_composition` exists: ASEC and Blynk are `PRIVATE_LIMITED`; M/s Shubham Singh and M/s Vertex Shift IT Solutions are `SOLE_PROPRIETORSHIP`.
- `wallets` has no `subsidiary_id`. 11 wallets exist, all active.
- `price_snapshots` exists (`asset_code`, `usdt_price`, `source`, `fetched_at`).
- `purchase_orders.effective_usdt_rate` exists.
- `erp_balance_baseline`: 40 rows, a single `baseline_at` of 2026-04-21.
- `bank_transactions` carries `prev_hash` / `row_hash` / `sequence_no`; 28 rows have a null `prev_hash`.
- None of the `fin_*` views were created with `security_invoker` — correction 7 is valid and applies to all of them.

## 1. Inter-company positions (blocking)

New view `fin_intercompany_v`: pair `bank_transactions` on `related_transaction_id`, resolve each leg to its entity through `bank_accounts.subsidiary_id`, keep only pairs where source entity differs from destination entity (394 legs match today). Each row carries source entity, destination entity, direction, amount, transfer date, and both transaction ids.

Companion `fin_intercompany_position_v` nets it per entity pair into a receivable and a payable leg. Exact figures are computed from the view; no approximations are hard-coded.

Statement impact: every entity gains "Inter-company receivable" (asset) and "Inter-company payable" (liability), both labelled **Inter-company current account — classification pending**, with a standing note that whether these are loans, capital, or drawings is the Chartered Accountant's decision and the software does not choose. The existing `transfer_inter` equity line is retired in favour of these two balance-sheet lines.

Verification gate: group total inter-company receivable must equal group total inter-company payable. The dialog and the export both print the check and the residual when it is non-zero.

## 2. Baseline is an anchor, not an opening position

`erp_balance_baseline` is re-labelled throughout as a **reconciliation anchor as at 21-Apr-2026**, 21 days into FY 2026-27.

New function `fin_entity_opening_position(entity, fy_start)` rolls **backwards** from the anchor across every transaction between the target date and 21-Apr-2026. Both figures are shown side by side: "Anchored balance (21-Apr-2026)" and "Rolled-back opening (01-Apr-2026)", each with its own basis tag.

New view `fin_unanchored_accounts_v`: bank accounts with neither a baseline row nor an `OPENING_BALANCE` transaction. These are listed by account name with balances in the integrity panel, marked **UNANCHORED**, and their contribution is shown on a separate statement line from anchored balances so the two are never blended.

## 3. Transfer integrity checks

Three new checks in the integrity panel:
- **Transfer flow gap** — total `TRANSFER_OUT` against total `TRANSFER_IN`, with the difference shown gross and a candidate list of unpaired legs sized near the gap. Never netted away.
- **Unpairable transfers** — rows with a null `related_transaction_id`, split by direction, quantified and listed with account, date, amount and description.
- **Hash chain continuity** — per bank account ordered by `sequence_no`, confirm each row's `prev_hash` equals the previous row's `row_hash`. Any break is reported as CRITICAL with the account and sequence number, and it fails the generation gate.

## 4. No silent exclusions

Every excluded bucket is disclosed rather than dropped: `Manual Baseline Reset`, `ADJUSTMENT`, and any other excluded category, each with row count and rupee value, per entity.

The **Balance Adjustment Account** (bank_name `Internal`, `subsidiary_id` null) is named explicitly with its balance, not summarised as "1 unmapped account", and carries a required action: an admin must assign it to an entity or record an explicit decision to leave it group-level. Until then it is excluded and the exclusion is stated on the face of the statement.

## 5. Statement shape branches on legal composition

`PRIVATE_LIMITED` (ASEC, Blynk): equity headed **Shareholders' funds** — Share capital (NOT AVAILABLE, flagged) and Reserves and surplus.

`SOLE_PROPRIETORSHIP` (Shubham, Vertex): **Proprietor's Capital Account** rendered as a movement statement — opening capital (NOT AVAILABLE, flagged), plus profit for the period, less drawings, equals closing. No share capital and no reserves-and-surplus lines are rendered for these two.

## 6. Crypto

**6a — one justified schema write.** Add nullable `subsidiary_id uuid` (FK to `subsidiaries`) to `wallets`, plus `wallet_entity_assignment_log` (wallet, old value, new value, user, timestamp). An admin screen lists all 11 wallets with balances and an entity dropdown. No auto-assignment from wallet names; unassigned wallets stay in the unattributed pool.

**6b — valuation basis selector.** Weighted-average cost from `purchase_orders.effective_usdt_rate` (default), market rate at the reporting date from `price_snapshots`, or lower of cost and market. The chosen basis and the exact rate applied are printed on the face of every statement and stored in the generation log.

**6c — MCA Schedule III note, mandatory now.** For ASEC and Blynk, auto-generate the disclosure required by G.S.R. 207(E) dated 24-Mar-2021 (effective 01-Apr-2021), item (xi), Paragraph 5, Part II of Schedule III: (a) profit or loss on crypto transactions, (b) amount of currency held at the reporting date, (c) deposits or advances received for the purpose of trading or investing in crypto. (a) and (b) are derived at group level from `wallet_asset_balances` and realised trading margin, with the entity split disclosed as unresolved. (c) prints as NOT AVAILABLE rather than being omitted. Shipped in Phase 1, not deferred.

## 7. Exports and enforcement

- New table `balance_sheet_generation_log`: entity, as-at date, user, timestamp, crypto valuation basis, integrity-check result, file checksum (SHA-256 of the generated bytes, computed client-side before download). RLS on, plus GRANTs.
- Any statement generated while an integrity check is failing carries a **DRAFT — FAILED VERIFICATION** watermark, with the failing checks listed on page 1 of the PDF and on the first sheet of the Excel file. Failures are never suppressed to clean up the document.
- All `fin_*` views are recreated with `security_invoker = true` so RLS on the underlying tables is enforced for the querying user. Reporting functions keep SECURITY DEFINER only where a definer is required, and are re-reviewed against that.

## Build order

1. Views and functions: `fin_intercompany_v`, `fin_intercompany_position_v`, `fin_unanchored_accounts_v`, `fin_entity_opening_position()`; `security_invoker` on every `fin_*` view; integrity checks 3a–3c and the exclusion disclosures.
2. Schema writes: `wallets.subsidiary_id`, `wallet_entity_assignment_log`, `balance_sheet_generation_log`.
3. Balance sheet composition: inter-company lines, anchored vs rolled-back opening, unanchored split, composition-branched equity, crypto valuation basis.
4. UI: wallet entity mapping screen, valuation basis selector, revised dialog, MCA note.
5. Exports: watermark, failing-check page, checksum and generation log write.

## Acceptance tests

- Group inter-company receivable equals group inter-company payable; residual is zero or displayed.
- Net positions reproduce the direction and rough magnitude verified by the owner: Shubham a net creditor of about ₹1.83 crore, Blynk a net debtor of about ₹1.03 crore, Vertex a net debtor of about ₹82 lakh — computed exactly, not hard-coded.
- The transfer out-versus-in gap of about ₹1,00,000 is displayed, not netted.
- All 10 unanchored accounts (about ₹22,29,090.38) are listed by name with balances.
- Manual Baseline Reset, ADJUSTMENT, and the Balance Adjustment Account are each disclosed with count and value.
- Private limited and sole proprietorship statements render different equity sections.
- ASEC and Blynk statements always carry the MCA crypto note, including a NOT AVAILABLE head for item (c).
- A statement generated with a failing check carries the DRAFT watermark and a generation-log row.
