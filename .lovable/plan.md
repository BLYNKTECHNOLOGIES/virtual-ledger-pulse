

## Goal

Make every wallet/asset ledger row carry a correct, immutable per-asset closing balance, expose reversal pairs cleanly so the UI can hide noise on a "simplified statement" view, and close remaining gaps that could fail in production.

## Part 1 — Per-asset closing balance (immutable, retroactive-proof)

**Findings**
- The `BEFORE INSERT` trigger `set_wallet_transaction_balances` already auto-fills `balance_before` / `balance_after` per `(wallet_id, asset_code)` from `wallet_asset_balances`, so all 7,694 historical rows have non-zero values and every new row is auto-stamped — even when callers pass `0`.
- Hash chain covers `balance_before` / `balance_after` (verified earlier), so once written they cannot be silently changed.
- `ManualWalletAdjustmentDialog` exists and posts paired entries through the normal INSERT path (already hash-chained).

**Action**
- Add a per-`(wallet_id, asset_code)` running-balance audit RPC `verify_wallet_asset_running_balance(p_wallet_id, p_asset_code)` that walks rows in `sequence_no` order and asserts `row.balance_after == row.balance_before + signed_amount` and `row.balance_before == previous_row.balance_after`. Returns first break (if any) — guarantees no historical drift.
- Wire this verifier into the **Ledger Integrity** tab as a second button: "Verify Per-Asset Closing Balances", showing one line per `(wallet, asset)` pair with intact / break-at-row.

## Part 2 — Reversal pair identification + simplified-view UI

**Findings**
- Reversal rows already store `reverses_transaction_id` (the original) and originals get `is_reversed = true`.
- Description prefix is standardized: `"Reversal of <uuid> — <reason>"`.
- No badge / link / hide-toggle exists anywhere in the transaction list UIs today.

**Action**
- **Badges in `StockTransactionsTab.tsx` and `WalletManagementTab.tsx`:**
  - Original (when `is_reversed = true`): amber pill `"Reversed →"` linking to the reversal row id.
  - Reversal (when `reverses_transaction_id IS NOT NULL`): grey pill `"Reverses ←"` linking back to the original.
  - Hovering shows the reason (parsed from description after `"— "`).
- **"Simplified view" toggle** at the top of both tabs: a `Switch` labeled *"Hide reversal noise"*. When ON:
  - Hide rows where `is_reversed = true` (originals that were undone).
  - Hide rows where `reverses_transaction_id IS NOT NULL` (the reversals themselves).
  - Net effect: only "live, effective" entries remain. Closing balance shown in the rightmost column still uses the stored `balance_after` of the *last visible row per asset*, so the simplified view stays internally consistent.
- Persist the toggle in `useTerminalUserPrefs`-style local prefs so each user's choice survives reloads.
- Default = **OFF** (full audit view) so auditors see everything by default.

## Part 3 — Remaining gap closure

**G1. Stale trigger event spec.** `update_wallet_balance_trigger` is still declared as `AFTER INSERT OR DELETE OR UPDATE` even though the function body now early-returns on non-INSERT. Recreate it as `AFTER INSERT` only so the schema reads honestly.

**G2. Reference-table FKs.** Audit foreign keys pointing at `wallet_transactions.id` / referencing tables that own `reference_id` chains. Any `ON DELETE CASCADE` that could touch ledger rows from a parent delete must be `NO ACTION`. Specifically check `purchase_orders`, `sales_orders`, `product_conversions`, `wallet_transfers`. Convert any cascades found.

**G3. Bank-side parity flag.** Add a one-paragraph note + TODO marker in `LedgerIntegrityTab` stating that `bank_transactions` is **not** yet immutable. Tracked for v2; explicit in UI so users don't assume parity.

**G4. App-side inserts that pass `balance_before/after = 0`.** Today these are corrected by the BEFORE INSERT trigger, but the literal zeros in the call sites (`useWalletStock.tsx`, `SalesEntryWrapper`, sales/purchase wrappers, `ManualWalletAdjustmentDialog`) make the code misleading. Replace them with `undefined` (let the trigger fill) and add a code-level comment pointing at the trigger so future readers don't think the app is computing balances.

**G5. Reversal description machine-tag.** Augment the reversal description from `"Reversal of <uuid> — <reason>"` to also embed `[REV:<short_uuid>]` so the UI badge and any CSV export can parse the link without re-querying.

**G6. Adjustment-bucket exclusion enforcement.** `ManualWalletAdjustmentDialog` correctly routes the contra entry into the *Balance Adjustment Wallet*. Verify (and add a regression test in `LedgerIntegrityTab`'s diagnostics) that this wallet's name is exactly `"Balance Adjustment Wallet"` and that aggregations everywhere already exclude it (per existing memory). If any aggregation query is missed, list it in the Integrity tab as a warning.

**G7. Edge-case: reversal of a row whose `wallet_asset_balances` was wiped.** If the asset row is missing in `wallet_asset_balances`, the new `reverse_wallet_transaction` reads `0` as `v_current_bal`, producing a misleading `balance_before`. Add a guard: if no row exists, raise `EXCEPTION 'Cannot reverse: no live balance row for wallet %, asset %'` rather than silently writing zeros.

## Part 4 — Verification & rollout

1. **Migration C** — DB: trigger event-spec fix (G1), FK cascade conversions (G2), reversal description tag (G5), guard in `reverse_wallet_transaction` (G7), new RPC `verify_wallet_asset_running_balance` (Part 1).
2. **App changes** — badges + simplified-view toggle in `StockTransactionsTab.tsx` & `WalletManagementTab.tsx` (Part 2); diagnostic sections in `LedgerIntegrityTab.tsx` (Parts 1 & G3 & G6); cleanup of literal zeros in 5 insert call sites (G4).
3. **Smoke test plan** — toggle simplified view, run new running-balance verifier, post a manual adjustment, reverse a manual adjustment, confirm badges link correctly and simplified view hides both the original and the reversal.

## Out of scope (explicitly deferred)

- Extending hash-chain immutability to `bank_transactions` (separate v2 effort).
- External-chain anchoring (publishing `head_row_hash` to a public chain).
- Changing the visible audit default — user preference, not a system decision.

