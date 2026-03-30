
## Fix Plan: Manual Purchase Entry is still broken due to live DB schema drift

### Root cause I found
This is not a frontend-only issue. The current live purchase RPCs are out of sync with the actual database schema, so they throw 400s before the order can be created.

#### Single-payment path is broken in `create_manual_purchase_complete_v2`
The live function still inserts into columns that do not exist anymore:
- `stock_transactions.warehouse_id` — column does not exist
- `purchase_order_payment_splits.payment_date` — column does not exist
- `purchase_order_payment_splits.status` — column does not exist
- `purchase_order_payment_splits.notes` — column does not exist

#### Split-payment path is also broken in `create_manual_purchase_with_split_payments`
It still inserts into:
- `purchase_orders.order_status` — column does not exist

### Why the previous fix did not solve it
The last work fixed P&L data, but the currently deployed manual purchase functions are still stale. The frontend is calling:
- `create_manual_purchase_complete_v2_rpc`
- `create_manual_purchase_with_split_payments_rpc`

Those wrappers still route into old function bodies that no longer match current tables.

## Implementation plan

### 1) Rebuild both manual purchase core functions against the current schema
Create one corrective migration that fully recreates:

- `public.create_manual_purchase_complete_v2`
- `public.create_manual_purchase_with_split_payments`

using the current live table structure only.

#### Single-payment function
Update it to:
- insert `purchase_orders` without `order_status`
- insert `purchase_order_items` with valid columns only
- insert `bank_transactions` with current schema
- insert `stock_transactions` with current schema:
  - `product_id`
  - `transaction_type`
  - `quantity`
  - `unit_price`
  - `total_amount`
  - `reference_number`
  - `supplier_customer_name`
  - `transaction_date`
  - `reason`
  - `created_by`
- insert `wallet_transactions` with current schema
- insert `purchase_order_payment_splits` using only:
  - `purchase_order_id`
  - `bank_account_id`
  - `amount`
  - `created_by`

### 2) Fix split-payment logic properly, not just enough to stop the error
While recreating `create_manual_purchase_with_split_payments`, also correct the deeper ledger inconsistency:

Current split-payment logic:
- creates wallet transactions when wallet exists
- skips stock transaction in that case

Proper behavior should mirror single-payment flow:
- always create purchase order item
- always create stock transaction for inventory audit trail
- create wallet transaction when wallet credit is applicable
- create one `purchase_order_payment_splits` row per bank split
- no use of removed `order_status`

This avoids “it saves but ledgers drift later” problems.

### 3) Restore WAC / wallet position sync in the purchase path
The current live `create_manual_purchase_complete_v2` does not contain the intended `wallet_asset_positions` update logic.

Re-add WAC sync so every purchase updates:
- `wallet_asset_positions.qty_on_hand`
- `wallet_asset_positions.cost_pool_usdt`
- `wallet_asset_positions.avg_cost_usdt`

Use the same safety-clamp pattern already used elsewhere:
- reset corrupted negative/extreme cost values
- recompute weighted average from incoming purchase cost
- keep this only for wallet-backed asset purchases

Also add the same WAC sync to the split-payment function so both purchase modes behave identically.

### 4) Rebuild all wrappers with named-argument routing
Recreate these wrappers so all call sites stay compatible:

- `create_manual_purchase_complete_rpc`
- `create_manual_purchase_complete_v2_rpc`
- `create_manual_purchase_with_split_payments_rpc`

Requirements:
- use named args only
- keep the current frontend payload shape working
- pass `p_deduction_bank_account_id := NULL` where needed for compatibility
- avoid overload ambiguity regressions

### 5) Add server-side permission parity
Right now split-payment RPC checks permission, but single-payment RPC does not.

Make both RPC entrypoints enforce the same permission check:
- `purchase_manage`

This closes a backend security gap and keeps manual entry authorization consistent.

### 6) Preserve data integrity rules
The corrective migration should:
- not disable triggers
- not bypass balance checks
- not weaken idempotency protections
- preserve existing bank balance validation
- preserve PAN/TDS validation
- preserve duplicate order-number protection

## Verification checklist after implementation
I will verify all four entry paths, because they share the same broken function family:

1. Purchase page → Manual Entry → single bank account
2. Purchase page → Manual Entry → split payment
3. Terminal purchase approval → single payment
4. Small buys approval → single payment

For each, confirm:
- no 400 error
- purchase order created once
- bank transaction created once
- stock transaction created once
- wallet transaction created once
- payment split rows correct
- `created_by` populated
- `wallet_asset_positions` updated correctly
- no duplicate ledger entries on retry

## Expected result
This will be a root-cause fix, not a patch:
- manual purchase creation starts working again
- both single and split payment paths are aligned with the current DB schema
- inventory and wallet ledgers remain consistent
- future realized P&L calculations stop drifting from purchase history again because purchase WAC is synced at source

### Technical note
The failure is caused by stale function bodies, not by the React form. The frontend payload already matches the active RPC signatures closely enough; the live SQL implementations are what must be rebuilt.
