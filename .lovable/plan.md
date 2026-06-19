# Per-Account Wallet Segregation for ERP Auto-Entries

## Goal
Today every auto-synced order, deposit, withdrawal and transfer is forced onto the **BINANCE BLYNK** wallet, because the sync code picks one active `terminal_wallet_links` row with **no account filter**. We will make every entry resolve its wallet from the Binance account it actually came from:

- **ASEC Binance** account (`00..001`) → **BINANCE ASEC** wallet
- **Blynk Binance** account (`00..002`) → **BINANCE BLYNK** wallet

## Root Cause (verified)
- `binance-assets` edge fn (`syncAssetMovements`, `checkNewMovements`) reads the first `status='active' AND platform_source='terminal'` link and stamps that `wallet_id` on **all** `erp_action_queue` rows — ignoring each movement's `exchange_account_id`.
- `useTerminalPurchaseSync` / `useTerminalSalesSync` do the same when copying completed orders.
- `erp_action_queue` has **no `exchange_account_id` column** (so the account is lost the moment a movement is queued).
- `asset_movement_history` IDs (`dep-`, `wd-`, `tr-`, `pay-`) are **not account-prefixed** → two accounts can collide and overwrite each other.
- `WalletTransferWrapper` even hardcodes a `"Binance Blynk"` fallback name.

---

## Part 1 — Schema (single migration)
1. **`terminal_wallet_links.exchange_account_id`** — new nullable `uuid` FK → `terminal_exchange_accounts(id)`. This becomes the canonical account→wallet map.
2. **`erp_action_queue.exchange_account_id`** — new nullable `uuid` FK → `terminal_exchange_accounts(id)`, so queued movements keep their account.
3. Seed/Update wallet links:
   - ASEC account `00..001` → `BINANCE ASEC` wallet (`06830c8f…`)
   - Blynk account `00..002` → `BINANCE BLYNK` wallet (`6d9114f1…`)
   (Keep one as default for fallback safety.)

## Part 2 — Edge function `binance-assets`
- **Account-prefix movement IDs** going forward: `dep-{acct}-{id}`, `wd-…`, `tr-…`, `pay-…` to remove cross-account collisions (old rows handled in Part 5 backfill).
- Build an **account→wallet lookup** from `terminal_wallet_links` filtered by `exchange_account_id`.
- In `syncAssetMovements` and `checkNewMovements`: stamp each `erp_action_queue` row with both the movement's `exchange_account_id` **and** the matching `wallet_id` (carry `exchange_account_id` forward from `asset_movement_history`).
- If an account has **no** wallet link: queue the item but leave `wallet_id` null and surface a clear "wallet not mapped for this account" state instead of silently using Blynk.

## Part 3 — Order sync hooks
- `useTerminalPurchaseSync` / `useTerminalSalesSync`: resolve `wallet_id` from `terminal_wallet_links` filtered by the order's `exchange_account_id` (already present on `terminal_purchase_sync` / `terminal_sales_sync` / `binance_order_history`).
- `small_buys_sync` / `small_sales_sync`: resolve wallet by `exchange_account_id` at approval (these tables already carry `exchange_account_id`).

## Part 4 — Approval dialogs (frontend)
- `ActionSelectionDialog`, `WalletTransferWrapper`, `PurchaseEntryWrapper`, `SalesEntryWrapper`, terminal & small approval dialogs: default the Binance wallet from the account-correct `item.wallet_id`.
- **Lock the Binance-side wallet** (read-only, shown with its `AccountBadge`) per your choice — operator cannot change it; only the counter-wallet in a transfer remains selectable.
- Remove the hardcoded `"Binance Blynk"` fallback; show the actual mapped wallet, or a visible warning if unmapped.

## Part 5 — Historical re-mapping (careful, not a blind relabel)
You chose to correct history. Because all legacy rows are stamped account `00..001` + BINANCE BLYNK, we will:
1. **Investigate first**: classify existing `asset_movement_history` / `erp_action_queue` / order-sync / `wallet_transactions` rows by their true source account using raw Binance payload signals (credential/account markers in `raw_data`, order numbers, tx ids).
2. For rows whose true account differs from their current wallet, perform a **reverse + rebook** against `wallet_transactions` / `wallet_asset_balances` (never edit balances directly — respect ledger-truth and WAC rules) so balances stay consistent.
3. Run as an auditable backfill migration/script with a dry-run summary you approve before it writes.
4. Items that cannot be confidently classified are listed for manual review rather than guessed.

> Note: this is the highest-risk step. I'll produce the classification report and dry-run counts for your sign-off before applying any balance-moving changes.

## Part 6 — Account↔account transfer auto-detection
- Detect a withdrawal from one Binance account paired with a deposit into the other (match asset + amount within a time window, opposite accounts) and present it as a **single wallet-to-wallet transfer** between the two ERP wallets, preventing double counting.
- If auto-detection is not confident, fall back to the normal manual flow (each leg as its own queue item) — per your instruction.

---

## Anomalies explicitly handled
1. Movement with missing `exchange_account_id` (legacy) → fallback wallet + flag.
2. Account with no wallet link → queued but unmapped, visible warning (no silent Blynk default).
3. Cross-account duplicate Binance IDs → account-prefixed IDs.
4. `erp_action_queue` losing the account → new column carries it.
5. Manual override risk → Binance-side wallet locked to mapping.
6. Inter-account transfers double-counted → auto-detect + manual fallback.
7. Historical balance integrity → reverse+rebook, not relabel; dry-run first.
8. Combined ("Both") terminal view → unaffected, since syncs run per account and stamp the real account id.
9. P2P / Binance Pay dedup → preserved, now per-account.

## Technical notes
- Tables touched: `terminal_wallet_links` (+col), `erp_action_queue` (+col), and a data backfill over `asset_movement_history`, `wallet_transactions`, `wallet_asset_balances`, order-sync tables.
- Code touched: `supabase/functions/binance-assets/index.ts`, `src/hooks/useTerminalPurchaseSync.ts`, `src/hooks/useTerminalSalesSync.ts`, `src/hooks/useErpEntryFeed.ts`, `src/components/dashboard/erp-actions/*` (ActionSelection, WalletTransfer, PurchaseEntry, SalesEntry wrappers), small buys/sales approval dialogs.
- No Binance API scope issues: all data already originates from existing Binance endpoints; we only change wallet routing of already-synced data.
