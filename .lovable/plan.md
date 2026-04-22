

## What you're asking

1. **Stock → Transactions tab** and **BAMS → Account Summary → Transactions tab** must show the **stamped ledger values** (the columns we just made immutable: `balance_after`, `amount`, `transaction_date`, `created_at`), not numbers re-derived in the UI or in a window function.
2. Because the ledger is now append-only, **closing balance against any past row must never change** when new rows are added later.

## What I found

### A. BAMS → Account Summary → "Transactions" tab — ❌ recomputes closing balance

`AccountSummary.tsx` (line 225) calls `get_transactions_with_closing_balance(...)`. That RPC does **not** read the stamped `bank_transactions.balance_after`. It does:

```sql
ba.balance  -- current cached account balance
- SUM(±amount) OVER (PARTITION BY bank_account_id ORDER BY date DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
```

Two problems with that:
- It's a **UI-side derivation** that ignores the immutable column we worked to stamp.
- It anchors on `bank_accounts.balance` (current cache) and walks backwards. If anything ever drifts the cache (or filtering hides a row), every historical closing balance shifts. That's exactly the retrospective change you want eliminated.

Also: the same screen's per-account `total_income` / `total_expense` (lines 128-134) are recomputed in JS from `bank_transactions.amount`, with `INCOME` and `CREDIT` summed together. With the new reversal pattern, every reversal posts a counter-row, so naive sums will **double-count** unless reversed rows are excluded.

### B. Stock → Transactions tab — ⚠️ partly stamped, partly UI-derived

`StockTransactionsTab.tsx` correctly uses `wallet_transactions.balance_after` for the wallet-side closing balance (lines 666-678, 753). Good — that's the stamped immutable value.

But:
- It re-derives `unit_price` and `total_amount` in JS from `sales_orders.price_per_unit × quantity` (lines 150-153, 304-345). The ledger stores `amount` as the asset quantity; the displayed currency total is computed at render time from the *current* sales-order price. If a sales order is later edited (or if your `reconcile_sales_order_edit` updates `price_per_unit`), every historical row in this tab silently changes its "Total" value. That breaks "no retrospective change."
- "Closing Bal." for `purchase`/`stock_transactions` rows is looked up by `reference_number` against the wallet-tx map. When a reference matches multiple wallet legs (split, fees), the lookup picks an arbitrary one. Should be matched by `(reference_id, leg)` or sourced from a per-row stamp.
- Reversal rows on `wallet_transactions` are filtered only when `hideReversalNoise` is on. The default is OFF — fine — but the totals in the page header (if any) and the "Eff. USDT Qty" should also exclude reversed rows in any aggregate.

### C. Closing balance permanence — ⚠️ guaranteed by trigger only for the row, not for the displayed view

The DB trigger guarantees `bank_transactions.balance_after` for row N never changes. But every screen that **recomputes** balances (the RPC above, `TransactionSummary.tsx`, the Account Details "computed_balance" alias of `ba.balance`, etc.) can still wobble if:
- A row is reversed (counter-row added) and the UI sums both the original and the reversal.
- The cached `bank_accounts.balance` ever drifts from `SUM(ledger)` — then the BAMS RPC's "current − sum_after" walk shifts every row.

So the immutability is real at the data layer; the views need to honor it.

## Plan

### Phase 1 — BAMS Account Summary uses the stamped ledger (CRITICAL)

**1a. Rewrite `get_transactions_with_closing_balance` (DB migration).**

Replace the window-function derivation with a direct read of the stamped column:

```sql
SELECT bt.id, bt.transaction_date, bt.created_at, bt.bank_account_id,
       ba.account_name, ba.bank_name, bt.transaction_type, bt.amount,
       bt.description, bt.category, bt.reference_number, bt.related_account_name,
       bt.balance_after AS closing_balance,           -- ← stamped, immutable
       bt.balance_before,                              -- expose for debugging / "running" UI
       bt.sequence_no,                                 -- canonical ordering
       bt.is_reversed,
       bt.reverses_transaction_id,
       v_total_count
FROM public.bank_transactions bt
JOIN public.bank_accounts ba ON ba.id = bt.bank_account_id
WHERE …same filters…
ORDER BY bt.bank_account_id, bt.sequence_no DESC       -- canonical, never re-orders on edits
LIMIT … OFFSET …;
```

Notes:
- Order by `(bank_account_id, sequence_no DESC)` so pagination is deterministic and matches chain order. When `p_bank_account_id IS NULL` (mixed-account view), order by `created_at DESC, sequence_no DESC` — the stamped balance is per-account, so display it as "Closing balance for that account at that point", which is what `balance_after` already is.
- Drop the `ba.balance - SUM(...)` walk entirely.

**1b. Fix per-account totals on the same screen.**

In `AccountSummary.tsx` lines 115-134:
- Add `.eq('is_reversed', false)` and `.is('reverses_transaction_id', null)` to the per-account `bank_transactions` fetch, so reversed originals + their counter-rows cancel out (the original row's `is_reversed=true` excludes it; the reversal row's `reverses_transaction_id IS NOT NULL` excludes it). Net effect: only "live" entries count.
- Use `transaction_type IN ('INCOME','CREDIT')` consistently on both filter and exclusion paths (already there) but verify against the typed-category list.
- Replace `computed_balance: account.balance` with `computed_balance: <SUM(stamped balance_after of latest row per account)>` — or better, fetch the latest row per account: `SELECT DISTINCT ON (bank_account_id) bank_account_id, balance_after FROM bank_transactions ORDER BY bank_account_id, sequence_no DESC`. This makes the "computed" number provably equal to the ledger head.

**1c. Add a "Balance before" column in the Transactions table UI (optional but cheap).**

Adds confidence: showing both `balance_before` and `closing_balance` from the stamped row makes it obvious to auditors that no derivation is happening.

### Phase 2 — Stock Transactions: source values from the ledger row, not from order tables

**2a. Stop deriving `unit_price` / `total_amount` from current `sales_orders.price_per_unit`.**

Instead of `qty × so.price_per_unit`, read what was stamped on the wallet leg. `wallet_transactions` already carries `amount` (asset quantity), and the order's price at time of posting is captured on the source order record but should be **frozen at fulfilment time**. Two options:

- **Cleanest:** add `unit_price_at_post numeric` and `total_value_inr numeric` (or USDT) to `wallet_transactions`, populated by the same triggers that already stamp `balance_after`. Backfill from current splits/orders for historical rows. UI reads these stamped fields directly.
- **Lighter:** keep deriving, but derive from `sales_order_payment_splits` / `purchase_order_payment_splits` joined by `sales_order_id` (which are themselves the immutable payment record), and snap to whatever was first inserted (lock against later edits).

Recommend the first option for parity with the bank ledger work.

**2b. Fix the closing-balance lookup for purchase / stock_transactions rows.**

Replace `Map<reference_number, balance_after>` with `Map<wallet_transaction_id, balance_after>` keyed by the actual ledger row — for purchases, that's the `wallet_transactions.id` whose `reference_id = purchase_order_id`. When multiple legs exist, render one row per leg (matches the immutable ledger 1:1) instead of squashing.

**2c. Default `hideReversalNoise` behavior.**

Keep default OFF (full audit), but when ON, also exclude the reversal counter-rows (`reverses_transaction_id IS NOT NULL`), not just `is_reversed = true`. The current filter handles both via `||`; verify and add a comment.

### Phase 3 — Wallet ledger immutability parity check (defensive)

`wallet_transactions` already has `sequence_no`, `row_hash`, `balance_before/after`, `is_reversed`, `reverses_transaction_id` (confirmed via schema query). Confirm the same mutation-block trigger exists on it; if not, mirror the bank trigger so the stock side enjoys the same guarantee:

```sql
SELECT verify_wallet_chain();           -- if exists, run it
```

If it doesn't exist, add a migration that ports `block_bank_transaction_mutation` and the chain verifier to `wallet_transactions`. This is the underlying truth source for the Stock Transactions tab.

### Phase 4 — Verification

1. Open BAMS → Account Summary → Transactions for one account. Note "Closing Balance" of row #50.
2. Post a new manual income to that account. Refresh. Confirm row #50's closing balance is **byte-identical** (it now reads `balance_after`, not a backwards walk).
3. Reverse the new entry via the journal. Confirm row #50 still unchanged; the new row + its reversal show stamped balances that bracket the unchanged row.
4. Open Stock Transactions. For a wallet transfer 30 days old, snapshot `Closing Bal.` and `Total`. Run any sales-order edit on a different order. Confirm both values for the snapshotted row are unchanged.
5. Run `SELECT * FROM verify_bank_chain()` and (if added) `verify_wallet_chain()` — must be intact.

## Out of scope (carry-over from previous phases)

- External hash anchoring (regulator-grade tamper proof).
- Reconstruction of pre-immutability deletes.
- `pending_settlements` mutability — by design.

## Risks

- **Phase 1a** changes `closing_balance` semantics from "walked from current cache" to "stamped-at-write". Old rows whose `balance_after` was backfilled before the trigger went live should already be correct (you confirmed 3,796/3,796 backfilled), but eyeball one historical day before/after to be sure.
- **Phase 2a** is a small schema addition + backfill on `wallet_transactions`. Backfill must use the splits/orders snapshot at row's `created_at`, not current values, otherwise we re-introduce the drift we're trying to fix.

