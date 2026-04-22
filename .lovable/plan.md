

## Audit Result: Significant Gaps Found

The hash-chain plumbing itself (sequence_no, prev_hash, row_hash, INSERT trigger, mutation-block trigger, reversal RPC, anchors, verifier) is **correctly implemented and currently intact** (0 tamper-log entries, all hashes verified). However, several **real-world code paths will start failing or silently corrupt the chain** the moment they run. These must be closed before they trigger in production.

---

## Gap 1 — Legacy DB functions still try to DELETE/UPDATE `wallet_transactions`

These SECURITY DEFINER functions still execute raw `DELETE FROM wallet_transactions` and will now hit the block-trigger and **error out**, breaking the parent workflow:

| Function | What it does |
|---|---|
| `delete_wallet_transaction_with_reversal` | Old "delete + reversal" RPC — superseded but still exists |
| `cleanup_wallet_transactions_on_sales_order_delete` | Trigger fired when a sales order is deleted |
| `delete_sales_order_with_reversal` | Sales-order delete RPC |
| `delete_purchase_order_with_reversal` | Purchase-order delete RPC |
| `handle_sales_order_wallet_change` | Re-routes a sale to a different wallet by deleting + re-inserting |
| `handle_sales_order_quantity_change` | Adjusts quantity by deleting + re-inserting |
| `reconcile_purchase_order_edit` / `reconcile_sales_order_edit` | Edit reconciliation (likely deletes old rows) |
| `approve_product_conversion` | May rewrite ledger rows on re-approval |

**Fix**: rewrite each to call `reverse_wallet_transaction(...)` for the original rows and then INSERT the new corrected rows. Drop or stub `delete_wallet_transaction_with_reversal` (call sites already migrated to the new RPC). Replace `cleanup_wallet_transactions_on_sales_order_delete` with a reversal-loop variant.

---

## Gap 2 — Foreign-key cascade can silently bypass triggers

`wallet_transactions.wallet_id → wallets(id) ON DELETE CASCADE`.
Deleting a wallet row will cascade-delete its ledger rows. The block trigger does fire on cascaded deletes per row, so it would actually error today — but that means **deleting a wallet now hard-fails**. We need to:
- Change the FK to `ON DELETE NO ACTION` (or `RESTRICT`).
- In the wallets module, replace any "delete wallet" affordance with "archive/deactivate".

---

## Gap 3 — Manual Balance Adjustment for **wallets** is missing

The plan covered `wallet_transactions` but `ManualBalanceAdjustmentDialog.tsx` only adjusts **bank** balances (writes to `bank_transactions`). There is no equivalent dialog for wallets, so the only way users currently adjust wallet ledger drift is by inserting raw rows or reversing existing ones — both unsafe. Add a `ManualWalletAdjustmentDialog` that posts a paired contra entry against the existing **Balance Adjustment Wallet** bucket (already excluded from aggregations per the `adjustment-bucket-exclusion` memory). Both legs go through the normal INSERT path → both get hashed.

---

## Gap 4 — `bank_transactions` is NOT immutable

The same audit-trail concerns the user raised apply equally to bank ledger rows. Today `bank_transactions` rows can be UPDATEd / DELETEd freely (and several DB functions do exactly that). A future v2 should extend the same hash-chain pattern to `bank_transactions`. Out of scope for this fix-pass, but flag it explicitly so it isn't forgotten.

---

## Gap 5 — Reversal logic edge cases

a. **`balance_before` / `balance_after` hard-coded to 0** in the reversal INSERT (migration line 208). This makes reversal rows non-self-describing — auditors can't read the running balance from the row itself. Fix: read the wallet's current `wallet_asset_balances.balance` for the same `asset_code` inside `reverse_wallet_transaction` and set `balance_before = current`, `balance_after = current + reversal_amount`.

b. **`update_wallet_balance` trigger still listens on `AFTER INSERT OR DELETE OR UPDATE`.** With DELETE/UPDATE blocked, the DELETE/UPDATE branches are now dead code. Simplify to `AFTER INSERT` only and remove the dead branches so future readers don't get confused into thinking delete-driven balance reversal still works.

c. **Reversal of a reversal is correctly blocked** (`v_orig.reverses_transaction_id IS NOT NULL` check + partial unique index). Verified ✓.

d. **Idempotency** is correct (returns existing reversal id) ✓.

---

## Gap 6 — RLS is still wide open

Current policies:
```
authenticated_all_wallet_transactions  ALL  using=true  with_check=true
service_all_wallet_transactions        ALL  using=true  with_check=true
```

Phase 5 of the original plan (tighten RLS) was not executed. Replace with:
- `INSERT` allowed for authenticated.
- `SELECT` allowed for authenticated.
- `UPDATE` / `DELETE` denied to everyone (defense in depth on top of the trigger).

Restrict `ledger_anchors` and `ledger_tamper_log` SELECT to admin/auditor roles (currently any authenticated user can read them).

---

## Gap 7 — `verify_wallet_chain` rebuild flaw

The chain re-walk assigns `v_prev_hash := r.row_hash` **after** comparing — but if a row's stored `row_hash` is wrong (tampered), the next iteration trusts the bad hash, so subsequent "expected_hash" values are computed against tampered input. This causes only the *first* break to be reported — which is what we want — but the function should also short-circuit and stop walking once a break is found, otherwise it continues silently producing meaningless expected hashes. Minor: make the loop `EXIT WHEN v_break_id IS NOT NULL` and use the recomputed (correct) hash as `v_prev_hash` until the break, then stop.

---

## Gap 8 — No backfill of `is_reversed` for historical reversal pairs

Pre-existing ledger entries that were "reversed" in the old system (using opposite-sign rows or via the legacy `delete_wallet_transaction_with_reversal`) do not have `reverses_transaction_id` set, so the new UI badges won't show "Reversed by →" on historical originals. Optional: add a one-shot backfill that links pairs by `description LIKE '%reversal%'` + matching `reference_id` + opposite amount. Mark as "best-effort historical link, post-2026-04-22 are authoritative".

---

## Gap 9 — App-side call sites that still bypass the new RPC

`SalesEntryWrapper.tsx` (and similar entry/approval flows) directly `.from('wallet_transactions').insert(...)` — that's fine and goes through the hash chain. But any flow that previously **edited** a sales/purchase order will now invoke one of the broken DB functions in Gap 1. Until Gap 1 is fixed, every edit/delete on a completed order will throw `wallet_transactions is append-only` to the user.

---

## Gap 10 — `LedgerIntegrityTab` is publicly mounted

The tab was added to `StockManagement` without a role gate. The plan said "Super Admin / Auditor only". Wrap the route/tab with a permission check (`role_level <= 10`).

---

## Implementation Plan (next default-mode pass)

**Migration A — Fix legacy mutation paths**
1. Rewrite `cleanup_wallet_transactions_on_sales_order_delete`, `delete_sales_order_with_reversal`, `delete_purchase_order_with_reversal`, `handle_sales_order_wallet_change`, `handle_sales_order_quantity_change`, `reconcile_purchase_order_edit`, `reconcile_sales_order_edit` to use `reverse_wallet_transaction` instead of raw DELETE.
2. Drop `delete_wallet_transaction_with_reversal` (no callers left).
3. Change `wallet_transactions.wallet_id` FK to `ON DELETE NO ACTION`.
4. Simplify `update_wallet_balance` trigger to AFTER INSERT only.

**Migration B — Reversal data quality + RLS hardening**
5. Update `reverse_wallet_transaction` to populate real `balance_before` / `balance_after` from `wallet_asset_balances`.
6. Tighten `wallet_transactions` RLS: SELECT/INSERT for authenticated, UPDATE/DELETE denied.
7. Restrict `ledger_anchors` + `ledger_tamper_log` SELECT to roles with `role_level <= 10` (Auditor and above) via `has_role` / existing role helper.
8. Patch `verify_wallet_chain` to EXIT on first break.
9. Best-effort backfill of `reverses_transaction_id` for historical pairs.

**App changes**
10. Build `ManualWalletAdjustmentDialog.tsx` (mirror of bank dialog) posting paired entries through normal INSERT — both legs hash-chained, contra leg lands in "Balance Adjustment Wallet".
11. Wrap `LedgerIntegrityTab` mount in `StockManagement.tsx` with role-level guard.
12. UI badges in transaction lists: show "Reversed →" / "Reverses ←" using the existing `reverses_transaction_id` / `is_reversed` columns (cosmetic but meets plan Phase 3).

**Out of scope (call out, defer to v2)**
- Extending hash-chain to `bank_transactions` (Gap 4).
- External-chain anchoring (e.g. publishing `head_row_hash` to a public blockchain).

