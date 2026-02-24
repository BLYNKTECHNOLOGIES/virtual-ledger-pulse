

## Updated: Small Buys Approval Dialog -- Split Payment + Client Label

Two refinements to the previously approved Small Buys plan:

### 1. Split Payment Support in SmallBuysApprovalDialog

The Small Buys approval dialog will include the same split payment functionality that exists in `TerminalPurchaseApprovalDialog`:

- A "Split Payment" checkbox toggle next to the bank account selector
- When enabled, shows a payment distribution panel with:
  - Multiple bank account + amount rows
  - Add/remove split rows
  - Net Payable / Allocated / Remaining status bar with validation
  - Auto-fill first split amount
  - Duplicate bank account check
- When split payment is active, the approval will call `create_manual_purchase_with_split_payments` RPC (same as terminal purchase)
- When single payment, uses the standard single bank account flow

### 2. Client Handling with "Small Buys" Label

Instead of "no client created," the Small Buys approval will create/link a client labeled **"Small Buys"** -- mirroring how Small Sales uses the "Small Sales" client label:

- `client_name` / `supplier_name` will be set to `"Small Buys"`
- This keeps purchase records traceable and consistent with the Small Sales pattern

### Technical Details

**New file: `src/components/purchase/SmallBuysApprovalDialog.tsx`**

This component will combine:
- The summary display from `SmallSalesApprovalDialog` (asset, orders clubbed, qty, avg price, amount, fee, wallet, time window)
- USDT equivalent section for non-USDT assets
- TDS option (none / 1% / 20%) with PAN field
- Bank account selector with split payment toggle and distribution panel (from `TerminalPurchaseApprovalDialog`)
- Settlement date field
- On approval:
  - Generates SB-prefixed order number (SB00001, SB00002...)
  - Sets `supplier_name = "Small Buys"`
  - If split payment: calls `create_manual_purchase_with_split_payments` RPC with `p_payment_splits`
  - If single payment: calls `create_manual_purchase` RPC
  - Processes wallet addition for inventory
  - Updates `small_buys_sync` record status to `approved`
- Reject flow with optional reason (same as Small Sales)

**Data queries needed in dialog:**
- `bank_accounts` (status = ACTIVE) -- for split payment bank selectors
- `products` -- to match asset to product ID
- Live CoinUSDT rate for non-USDT assets

**No additional database changes** beyond the previously planned 4 tables + sequence. The split payment records are handled by the existing `purchase_order_splits` table used by the RPC.

All other aspects of the previously approved plan remain unchanged.
