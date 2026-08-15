# Company-wise Balance Sheets in Financials → Reports

## What the data actually shows (verified before planning)

I inspected the live database rather than assuming. Findings:

**The four entities exist as real records** in `subsidiaries`, with these legal names:

| Short name | Legal name in system | Composition | GST / PAN |
|---|---|---|---|
| ASEC | ASEC CORPORATION PRIVATE LIMITED | Private Limited | not captured |
| Blynk | BLYNK VIRTUAL TECHNOLOGIES PRIVATE LIMITED | Private Limited | placeholder "D" |
| Shubham | M/s Shubham Singh | Sole Proprietorship | 23QILPS6862M1Z2 / QILPS6862M |
| Vertex | M/s VERTEX SHIFT IT SOLUTIONS | Sole Proprietorship | placeholder "D" |

**Entity attribution exists in exactly one place: the bank account.** `bank_accounts.subsidiary_id` is the only company link in the whole schema (plus `tds_payment_allocations.subsidiary_id`). 29 of 30 bank accounts are mapped; 1 is not.

Everything else inherits the company only by following a bank account:
- `bank_transactions` → bank account → entity (11,998 rows; 19 rows land on the unmapped account)
- `purchase_orders` → `bank_account_id` and `purchase_order_payment_splits` (623 POs have no bank account at all)
- `sales_orders` have **no** bank column; they attach only through `sales_order_payment_splits.bank_account_id` and `pending_settlements.bank_account_id`

**Crypto inventory cannot be split by company.** `wallets`, `wallet_asset_balances` and `wallet_transactions` carry no entity field. USDT/other-asset stock is currently a single pooled asset across all four firms.

**There is no equity, capital, loan, depreciation or fixed-asset ledger.** CapEx (IT hardware, furniture, land & building, long-term installations) is booked as expense categories in `bank_transactions`, not capitalised. There are no opening capital balances; the earliest bank transaction is 2026-02-04 and reconciliation baselines were set on 2026-04-21.

**Consequence, stated plainly:** the system today can produce a rigorous, fully traceable **entity-wise Statement of Financial Position limited to bank-ledger-supported balances**, plus clearly quarantined unattributable pools. It cannot produce a Schedule III / statutory-format balance sheet that balances to Assets = Liabilities + Equity, because equity, capital introduced, drawings, loans and fixed assets were never captured. I will not invent them or plug the gap with a balancing entry.

## What gets built

No new tab. The existing **Financials → Reports → Balance Sheet** card becomes functional: pick company + as-of date, view, download.

### Phase 1 — Entity ledger foundation (read-only views)
A set of SQL views (no changes to source records):
- `fin_entity_bank_position_v` — per entity, per bank account: opening baseline, movement to the as-of date, closing balance, lien, drift vs cached balance.
- `fin_entity_txn_v` — every bank transaction tagged with its entity and its accounting classification derived from the existing `category` string (CapEx / statutory dues / payroll / finance cost / trade settlement / adjustment / unclassified).
- `fin_entity_receivable_v` — pending settlements not yet credited, attributed by settlement bank account.
- `fin_entity_payable_v` — purchase orders with unpaid balance, attributed by payment-split bank account.
- `fin_unattributed_pool_v` — everything that could not be tied to an entity: the unmapped bank account, 623 bankless POs, sales with no payment split, and the entire crypto wallet inventory.

Adjustment buckets and the Manual Baseline Reset category stay excluded from aggregation, per existing ERP doctrine.

### Phase 2 — Balance sheet composition + data-quality gate
For a chosen company and as-of date, produce line items each carrying a **confidence tag**:
- `source` — direct sum of ledger rows
- `derived` — deterministic computation from source rows
- `reconciled` — matches an independent baseline/snapshot
- `classified` — placed by category mapping (reviewable)
- `unresolved` — known figure, unknown classification
- `review` — contradictory or missing data

Alongside the statement, a **Data Integrity panel** lists concrete blockers found for that entity: unmapped bank accounts, unreconciled drift between cached and ledger balance, transactions in the "Unidentified" sub-ledger, POs/sales without bank attribution, CapEx expensed rather than capitalised, missing GST/PAN on the entity master, and the absence of opening capital.

The Assets vs Liabilities+Equity check is displayed as an explicit **out-of-balance amount with its causes named**. It is never forced to zero and never absorbed into "Other Assets".

### Phase 3 — Traceability
Every line item is clickable and opens the underlying rows (transaction date, bank, counterparty, amount, category, reference) with a CSV drop of exactly those rows, so "why is this number here" is always answerable.

### Phase 4 — Exports
- **PDF**: entity legal name, composition, GST/PAN where present, reporting period, currency (INR), statement, confidence legend, and an unavoidable "Unaudited — management report generated from ERP records; unresolved items listed" block plus the integrity findings. No claim of statutory or audited status.
- **XLSX**: statement sheet, line-item detail sheet, and the full traceable transaction sheet per entity.

Amounts are computed in the database in `numeric` and formatted for display only, so no floating-point drift.

Access is gated behind the existing financial-view permission; bank account numbers are masked in exports.

## Technical notes
- Views only; no writes to `bank_transactions`, `wallet_transactions` or order tables. Classification mapping lives in a small reference table so it can be corrected without touching source data.
- Reuses `erp_balance_baseline` as opening position and `erp_balance_snapshot_lines` for the reconciliation check.
- PDF via the existing `jspdf` pipeline used elsewhere in the app; XLSX via `exceljs`, already a dependency.

## Open decision for you
Phase 1–4 give an honest entity-wise position report. Turning it into a true Schedule III balance sheet additionally requires data that does not exist yet: opening capital per firm, partner/director current accounts, loans, a fixed-asset register with depreciation, and a rule for splitting the pooled crypto inventory between the four firms. I can scope that as a Phase 5 once you confirm how those should be sourced.
