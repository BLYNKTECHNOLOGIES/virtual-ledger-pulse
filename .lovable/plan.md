

## What's already done ✅

- Schema, triggers (`trg_bank_tx_stamp_and_chain`, `trg_bank_tx_block_mutation`), tamper log, `reverse_bank_transaction` RPC, all 3 verifier RPCs.
- Backfill complete: 3,796 / 3,796 rows have `sequence_no`, `balance_before/after`, `row_hash`.
- `reverse_payment_gateway_settlement` (DB) refactored to RPC.
- `TransferHistory.tsx` and `ExpensesIncomesTab.tsx` reverse flows + `ReversalBadge`.
- `DirectoryTab.tsx` reverse flow.
- `LedgerIntegrityTab.tsx` Bank Ledger Verification card.

## What's still broken or missing ❌

**Critical (will throw at runtime under the live mutation-block trigger):** 6 server-side RPCs still execute `DELETE FROM bank_transactions`. Every one is wired into active UI flows (Sales delete, Purchase delete, Sales/Purchase edit, contra-entry delete, payment-method change). The moment a user triggers any of these, Postgres raises `bank_transactions is append-only…` and the whole transaction rolls back.

| RPC | UI caller(s) |
|---|---|
| `delete_sales_order_with_reversal(p_order_id)` | `Sales.tsx`, `SmallSalesApprovalDialog.tsx` |
| `delete_purchase_order_with_reversal(order_id)` | `CompletedPurchaseOrders.tsx` |
| `reconcile_sales_order_edit(...)` | `EditSalesOrderDialog.tsx` |
| `reconcile_purchase_order_edit(...)` | `EditPurchaseOrderDialog.tsx` |
| `handle_sales_order_payment_method_change(...)` | `EditSalesOrderDialog.tsx` (3 sites) |
| `delete_contra_entry(p_transfer_out_id)` | (legacy fallback) |

**UI gaps (Part 7 incomplete):**
- `ExpensesIncomesTab.tsx` declares `hideReversalNoise` but never uses it to filter and never renders a toggle.
- `DirectoryTab.tsx` has no `ReversalBadge` and no hide-reversal toggle.

## Plan — execute in 2 phases

### Phase 1 — Refactor the 6 hard-delete RPCs (DB migration)

For each function, replace every `DELETE FROM bank_transactions WHERE …` block with the equivalent reverse-by-RPC pattern:

```sql
-- Pattern (repeated per matched row)
FOR v_row IN
  SELECT id FROM bank_transactions
  WHERE reference_number = <key>
    AND transaction_type = <type>
    AND NOT is_reversed
    AND reverses_transaction_id IS NULL
LOOP
  PERFORM reverse_bank_transaction(
    v_row.id,
    '<context-specific reason, e.g. "Sales order deleted: " || p_order_number>',
    auth.uid()
  );
END LOOP;
```

Per-RPC notes:
- **`delete_sales_order_with_reversal`** — reason: `'Sales order deleted'`. Reverse all matching rows (gateway INCOME + direct INCOME).
- **`delete_purchase_order_with_reversal`** — reason: `'Purchase order deleted'`. Reverse EXPENSE rows.
- **`reconcile_sales_order_edit`** / **`reconcile_purchase_order_edit`** — when bank/amount/splits change, reverse the existing `bank_transactions` rows for the order, then `INSERT` the new ones (the existing INSERT path already triggers stamp/chain). Reason: `'Edited via reconcile'`.
- **`handle_sales_order_payment_method_change`** — reverse the old-method rows, INSERT new ones. Reason: `'Payment method changed'`.
- **`delete_contra_entry`** — reverse both legs via `reverse_bank_transaction` (mirrors the already-refactored `TransferHistory.tsx` flow).

Idempotency is already handled inside `reverse_bank_transaction` via `reversal_guards` — safe to retry.

No app-code changes for Phase 1 — RPC signatures and return shapes stay identical, so `Sales.tsx`, `EditSalesOrderDialog.tsx`, `EditPurchaseOrderDialog.tsx`, `CompletedPurchaseOrders.tsx`, `SmallSalesApprovalDialog.tsx` keep working unchanged.

### Phase 2 — Finish UI parity (Part 7)

1. **`ExpensesIncomesTab.tsx`** — render the same Switch + Label pattern used in `WalletManagementTab.tsx`; apply `.filter(t => hideReversalNoise ? !t.is_reversed && !t.reverses_transaction_id : true)` to `recentTransactions`.
2. **`DirectoryTab.tsx`** — wire `useTerminalUserPrefs` for `bankLedger.hideReversalNoise`, add the toggle near the existing filter bar, add `ReversalBadge` to each row, and apply the same filter on the displayed list.

### Verification (after Phase 1)

- Re-run `verify_bank_chain()` and `verify_all_bank_running_balances()` — both should still report intact (chain is append-only; a reversal extends it cleanly).
- Smoke-delete a test sales order, a test purchase order, and edit one of each — confirm two reversal rows are posted (instead of the original being erased) and the badge appears.
- Confirm `bank_accounts.balance` cache stays correct via `enforce_bank_balance_from_ledger`.

## Out of scope (unchanged from original plan)

External hash anchoring, reconstruction of pre-immutability orphan deletes, and any change to `pending_settlements`.

