# Management Balance Sheet — P1 to P5

Verified against the live database before planning:

- `fin_transfer_unpaired_v` tests only `t.related_transaction_id`, with no reverse-link test. Confirmed by reading the view definition.
- Re-running its predicate returns **325 legs, ₹9,52,77,420.91**, of which **324 have another `bank_transactions` row pointing at them**. One leg is genuinely orphaned. This matches your figures exactly.
- `fin_entity_txn_v` classifies `TRANSFER_INTRA` / `TRANSFER_UNLINKED` from the same one-directional link, so the same defect flows into the balance sheet.
- `fin_intercompany_v` joins `r.id = x.related_transaction_id` and is unaffected by the fix direction; it must be preserved as-is.

## P1 — Shared pairing resolver

New view `fin_transfer_pair_v`: for each transfer leg, resolve the counterparty as
`related_transaction_id` target **or** the row whose `related_transaction_id` equals this leg's id
(forward link preferred when both exist). Emits `pair_key` (least/greatest of the two ids),
`counter_txn_id`, `counter_bank_account_id`, `counter_subsidiary_id`, and
`pair_kind ∈ MUTUAL | ONE_WAY_OUTBOUND | ONE_WAY_INBOUND | ORPHAN`. `pair_key` guarantees a mutual
pair is counted once.

- `fin_transfer_unpaired_v` rebuilt on it — only `ORPHAN` legs. Acceptance test run after the
  migration: exactly 1 row, ₹1,00,000, M/s VERTEX SHIFT IT SOLUTIONS.
- `fin_entity_txn_v` transfer classification rebuilt on the resolved counterparty: same entity →
  `TRANSFER_INTRA`, different entity → `TRANSFER_INTER_ENTITY`, counterparty on an unmapped bank
  account → new `TRANSFER_UNMAPPED_COUNTERPARTY` bucket (disclosed separately), no counterparty →
  `TRANSFER_UNLINKED`.
- `fin_intercompany_v` left untouched; its before/after totals are diffed and reported in the
  manifest to prove they did not move.

## P2 — Crypto inventory derived from orders

New view `fin_crypto_inventory_v` plus `fin_crypto_excluded_orders_v`.

Quantity rule, in order: `qty = COALESCE(effective_usdt_qty, quantity)`; exclude any order whose
implied rate `total_amount / NULLIF(effective_usdt_qty,0) < 70` (rule-based, no hardcoded order
numbers, applied to purchases and sales alike); deduct `wallet_fee_deductions` from the closing
quantity.

Valuation: weighted-average cost `SUM(total_amount)/SUM(qty)` over the clean purchase rows; the
rate used is printed on the statement.

Entity split: pro-rata on each entity's live share of attributable purchase value. The
unattributed share stays in the unattributed pool and is never spread. Line label:
"Crypto inventory (allocated on purchase share — not a per-company attribution)", confidence
`derived`. Where a wallet is mapped in `fin_wallet_entity_map`, the mapped holding wins for that
entity and the basis used is stated on the line.

Confidence indicator: "Derived inventory vs wallet holdings: X%" shown on the face of the
statement; above 15% the line's confidence drops to `review`. Every excluded order (number, date,
counterparty, recorded quantity, implied rate) is listed in the integrity panel and in the exports.

## P3 — Management view mode

`fin_entity_balance_sheet` gains a `p_mode` argument (`MANAGEMENT` default, `VERIFICATION`).

- **Mode A (default)**: header reads "MANAGEMENT ESTIMATE — INDICATIVE ONLY…" with the full
  limitations wording. No red failure banner. Integrity findings move to a compact
  "Limitations and known gaps" block at the foot, keeping every count and rupee value. Confidence
  tags stay on every line.
- **Mode B**: today's behaviour, byte-for-byte unchanged, including the DRAFT watermark.

Toggle on the dialog; both modes write `mode` into `fin_balance_sheet_generation_log`.

## P4 — Residual as a named line

In Mode A the balance difference appears at the foot of equity as
"Unreconciled — opening position not evidenced in the ERP", with the note about no pre-04-Feb-2026
data and no capital ledger. It is the same number as `balance_check` — asserted by an equality test,
never plugged, absorbed or spread.

## P5 — Presentation fixes

a. Watermark clipping — draw rotated about the page centre with measured text width instead of the
current origin, so nothing is cut off.
b. GSTIN/PAN shorter than 15/10 characters, blank or null print `NOT AVAILABLE` (kills the "D"
placeholder) in the dialog, PDF and XLSX.
c. Audit every `affected_count` in `fin_entity_integrity`; the transfer-imbalance finding must
report its true finding count, not a row count.
d. "16 wallets are unmapped" corrected — count distinct wallets, not `wallet_asset_balances` rows,
everywhere the label appears.

## Delivery

After the migrations and UI work, all four statements are generated in Mode A and the PDFs handed
over. Reported per entity: total assets, total liabilities, total equity, crypto inventory, and the
unreconciled line. Change manifest per A8 accompanies it.

## Technical notes

- All database work is views plus function changes; no writes to `bank_transactions`,
  `purchase_orders`, `sales_orders` or wallet tables.
- Amounts stay `numeric` in SQL; formatting is display-only.
- Files touched: new migration(s); `src/components/financials/BalanceSheetDialog.tsx`;
  `src/lib/exportBalanceSheet.ts`.
- PDFs are produced by driving the existing export path headlessly, so what you receive is exactly
  what the app produces.
