# Company-Wise Balance Sheet — Plan v3 (scope-locked)

Everything approved in v1 and v2 stands: views-first, confidence tags, drill-down traceability, integrity panel, no forced balance, inter-company positions, anchor-not-opening treatment of `erp_balance_baseline`, no silent exclusions, composition-branched equity, crypto valuation basis and the mandatory MCA note, generation log, DRAFT watermark. Only the items below change.

## A. Scope lock — confirmed

A1 confirmed. No existing backend object is modified, refactored, optimised or re-reviewed. Nothing outside objects prefixed `fin_` or created new by this task is touched — explicitly not `update_bank_account_balance`, `check_bank_balance_before_transaction`, `enforce_bank_balance_from_ledger`, `fn_bank_tx_stamp_and_chain`, `fn_bank_tx_block_mutation`, `update_wallet_balance`, `sync_usdt_stock_on_wallet_change`, `enforce_wallet_summary_balance_from_ledger`, `set_wallet_transaction_balances`, `fn_wallet_tx_hash_chain`, `is_manager`, `has_role`, and no `p2p_*`, `terminal_*`, `hr_*`, `binance_*`, `ad_*` or `erp_*` object.

A2 confirmed. UI changes are confined to the Balance Sheet feature: `src/components/financials/BalanceSheetDialog.tsx`, `src/lib/exportBalanceSheet.ts`, new files under `src/components/financials/balance-sheet/`, and the single already-wired button on the Balance Sheet card in `src/pages/Financials.tsx`. No shared component, layout, sidebar, theme or token edits. If a shared component genuinely must change, I stop and ask first.

A3 confirmed. No trigger on any existing table is added, dropped, altered or re-scoped.

A4 confirmed, and it reverses the v2 wallet column — see B1.

A5 confirmed. Existing RLS policies are left alone. New policies only on tables this task creates.

A6 confirmed. No bulk rewrite of shared types, hooks or utilities. If `src/integrations/supabase/types.ts` regenerates, the diff must contain only additions for new objects, and I show it before applying.

A7 confirmed. Zero writes to existing data. This module reads existing tables and writes only to tables it creates.

A8 confirmed. Each phase ends with a change manifest: files touched, database objects created or altered, and an explicit statement that nothing outside the `fin_*` / balance-sheet namespace changed. If the manifest cannot be that clean, I stop and explain instead of proceeding.

One disclosure against A1/A3/A7, for the record: three `fin_*` functions and six `fin_*` views already exist from the earlier turn (`fin_bank_entity_map_v`, `fin_entity_master_v`, `fin_entity_txn_v`, `fin_entity_receivable_v`, `fin_entity_payable_v`, `fin_unattributed_pool_v`, `fin_entity_balance_sheet`, `fin_entity_line_detail`, `fin_entity_integrity`, `fin_entity_bank_position`) plus the reference table `fin_account_classification`. All are inside this task's namespace, so revising them is in scope. Nothing else was created.

## B1. Wallet mapping — reversed, no column on `wallets`

Accepted. `sync_usdt_on_wallet_update` is unscoped `AFTER INSERT OR DELETE OR UPDATE ON wallets`, so any update — including a subsidiary assignment — would reach the USDT stock system, and `update_wallets_updated_at` would bump a timestamp downstream logic may key on. The column is dropped from the plan.

New table instead, with `wallets` never written to:

```text
fin_wallet_entity_map
  id                      uuid pk
  wallet_id               uuid not null unique -> wallets(id)
  subsidiary_id           uuid null           -> subsidiaries(id)
  previous_subsidiary_id  uuid null
  assigned_by             uuid null
  assigned_at             timestamptz
  notes                   text
  created_at, updated_at  timestamptz
```

Plus `fin_wallet_entity_assignment_log` (wallet, old value, new value, user, timestamp) written on every change. RLS and GRANTs on both new tables only. The admin screen writes only here. All `fin_*` views resolve wallet to entity by LEFT JOIN onto this table; a wallet with no row, or a row with a null `subsidiary_id`, stays in the unattributed pool. No UPDATE against `wallets` exists anywhere in this feature — verified by inspection in the phase manifest.

## B2. Hash-chain check — genesis-aware

Accepted, and the earlier "28 null prev_hash" note was a raw count, not a finding. The check becomes:

```text
per bank_account_id, ordered by sequence_no:
  rn = row_number()
  rn = 1  AND prev_hash IS NULL                  -> expected genesis, PASS (counted, informational)
  rn > 1  AND prev_hash IS NULL                  -> CRITICAL (chain break)
  rn > 1  AND prev_hash <> lag(row_hash)         -> CRITICAL (chain break)
```

Genesis rows are reported separately as an informational count, never as a failure. Acceptance test: zero criticals on today's data. A result of 28 means the check is wrong and gets fixed before anything ships.

## B3. security_invoker — scoped, and described honestly

Accepted. RLS SELECT policies on `bank_transactions`, `bank_accounts`, `wallets`, `wallet_asset_balances` and `subsidiaries` are `USING (true)` for `authenticated`, so the flip changes no visible row for any authenticated user.

- Applied to `fin_*` views only.
- Gated: for each view, row count and key numeric column totals are captured before and after; if any figure moves, the change is reverted immediately and reported.
- It is not described as securing this module, in the plan, the UI or the export. The underlying tables are readable by every authenticated user. The real controls are the existing UI permission gate on Financials and RLS on the new `fin_*` tables.
- The SECURITY DEFINER review is limited to functions named `fin_*` and functions created by this task. `is_manager`, `has_role` and every other existing function are untouched.

## C. `transfer_inter` — safe to retire, confirmed in writing

Verified two ways just now.

Database: the only objects whose definitions reference `transfer_inter` / `TRANSFER_INTER_ENTITY` are `fin_entity_balance_sheet`, `fin_entity_line_detail`, `fin_entity_integrity` and the view `fin_entity_txn_v`. All four were created by this task.

Application: a repo-wide search finds exactly one non-migration reference — the `fin_entity_balance_sheet` RPC call in `src/components/financials/BalanceSheetDialog.tsx`, this task's own file. There is a generated entry in `src/integrations/supabase/types.ts`, which is a type declaration, not a consumer.

Conclusion: `transfer_inter` exists only inside the `fin_*` namespace and no other module, report or dashboard reads it. It is retired and replaced by the inter-company receivable and payable lines. `transfer_intra` and `transfer_unlinked` are equally contained; `transfer_unlinked` is kept, since correction 3 requires unpairable transfers to stay visible.

## Revised build order

**Phase 1 — Ledger views (no schema writes).** `fin_intercompany_v` and `fin_intercompany_position_v`; `fin_unanchored_accounts_v`; `fin_entity_opening_position()` rolling backwards from the 21-Apr-2026 anchor; genesis-aware hash-chain check; transfer flow-gap and unpairable-transfer checks; exclusion disclosures with counts and values, including the Balance Adjustment Account by name. Revise the existing `fin_*` views and functions in place. Manifest.

**Phase 2 — New tables only.** `fin_wallet_entity_map`, `fin_wallet_entity_assignment_log`, `balance_sheet_generation_log`, each with GRANTs and its own RLS. `security_invoker = true` on `fin_*` views with the before/after equality gate. Manifest.

**Phase 3 — Statement composition.** Inter-company receivable and payable lines with the group-level equality gate; anchored versus rolled-back opening shown side by side; unanchored balances split out; equity branched on `firm_composition`; crypto valuation basis applied through `fin_wallet_entity_map`. Manifest.

**Phase 4 — UI, inside the feature only.** Wallet-to-entity mapping screen, valuation basis selector, revised dialog sections, MCA note rendering. Manifest.

**Phase 5 — Exports.** DRAFT — FAILED VERIFICATION watermark with failing checks on page 1, checksum, and the generation-log write. Manifest.

## Acceptance tests

- Group inter-company receivable equals group inter-company payable, or the residual is displayed.
- Net positions reproduce direction and magnitude: Shubham net creditor about ₹1.83 crore, Blynk net debtor about ₹1.03 crore, Vertex net debtor about ₹82 lakh — computed, never hard-coded.
- Hash-chain check returns zero criticals and reports the genesis count separately.
- The transfer out-versus-in gap of about ₹1,00,000 is displayed gross, with candidates listed.
- All 10 unanchored accounts (about ₹22,29,090.38) are listed by name with balances.
- Manual Baseline Reset, ADJUSTMENT and the Balance Adjustment Account are each disclosed with count and value.
- Private limited and sole proprietorship statements render different equity sections.
- ASEC and Blynk always carry the MCA crypto note, including a NOT AVAILABLE head for item (c).
- A statement generated with a failing check carries the DRAFT watermark and writes a generation-log row.
- Zero UPDATE statements against `wallets`, and no change to any object outside the `fin_*` / balance-sheet namespace.
