

## Split Payment for Sales Orders

### Problem
Currently, sales orders support only a single payment method. Purchase orders already have split payment capability via `purchase_order_payment_splits` table and dedicated RPCs. The user wants identical functionality for sales — both in **Manual Sales Entry** (`SalesEntryDialog`) and **Terminal Sales Approval** (`TerminalSalesApprovalDialog`).

### Critical Architecture Consideration
The existing `create_sales_bank_transaction` trigger on `sales_orders` INSERT creates a **single** bank INCOME transaction using the `sales_payment_method_id`. For split payments, we must **bypass** this trigger (or modify it) and handle bank crediting manually per split — similar to how purchase splits work.

---

### Step 1: Database — Create `sales_order_payment_splits` Table + RPC

**Migration will include:**

1. **New table** `sales_order_payment_splits` (mirrors purchase pattern):
   - `id UUID PK`, `sales_order_id UUID FK → sales_orders(id) ON DELETE CASCADE`, `bank_account_id UUID FK → bank_accounts(id)`, `amount NUMERIC CHECK > 0`, `created_at`, `created_by`
   - RLS: authenticated read/insert

2. **Modify `create_sales_bank_transaction()` trigger**: Skip bank transaction creation when the sales order has `is_split_payment = true` (new boolean column on `sales_orders`). Split bank credits will be handled by the RPC/client code instead.

3. **Add `is_split_payment BOOLEAN DEFAULT false`** column to `sales_orders`.

4. **New RPC `create_manual_sales_with_split_payments`** (parallel to purchase version):
   - Accepts `p_payment_splits JSONB` array of `{bank_account_id, amount}`
   - Validates total splits = `total_amount`
   - Creates the sales order with `is_split_payment = true`, `sales_payment_method_id = NULL`
   - Creates INCOME bank transactions per split
   - Records each split in `sales_order_payment_splits`
   - Handles wallet deduction, fee processing, stock transactions (same as current manual sales)

---

### Step 2: Update Terminal Sales Approval Dialog

**File: `src/components/sales/TerminalSalesApprovalDialog.tsx`**

- Add `isMultiplePayments` state + `paymentSplits` array state (same pattern as `TerminalPurchaseApprovalDialog`)
- Add split payment checkbox next to Payment Method field
- When split is enabled: show bank account + amount rows with add/remove
- Show Payment Distribution summary card (Net Payable / Allocated / Remaining)
- In approval mutation:
  - If split: skip single `sales_payment_method_id`, set `is_split_payment = true`
  - Create bank INCOME transactions per split
  - Record splits in `sales_order_payment_splits`
- Fetch bank accounts query (reuse existing pattern)

---

### Step 3: Update Manual Sales Entry Dialog

**File: `src/components/sales/SalesEntryDialog.tsx`**

- Add split payment checkbox next to Payment Method selector
- When enabled: replace single payment method with bank account split rows
- Payment Distribution summary (total amount / allocated / remaining)
- In submit: call the new `create_manual_sales_with_split_payments` RPC when split is active, otherwise use existing flow
- Validation: total allocated must match total amount within ₹0.01 tolerance, no duplicate banks

---

### Step 4: Update Sales Order Details View

**File: `src/components/sales/SalesOrderDetailsDialog.tsx`** (or equivalent)

- Fetch `sales_order_payment_splits` for the order
- Display split payment breakdown (same UI as purchase order details)

---

### Bank Transaction Logic (Critical)

| Scenario | Bank Credit Logic |
|----------|------------------|
| Single payment (non-gateway, non-split) | Existing trigger handles INCOME entry |
| Single payment (gateway) | No bank credit (pending settlement) |
| Split payment | Trigger skipped (`is_split_payment = true`). RPC/client creates one INCOME entry per split bank account |

### Files to Create/Modify
- **Create**: 1 SQL migration (table + column + RPC + trigger update)
- **Modify**: `TerminalSalesApprovalDialog.tsx`, `SalesEntryDialog.tsx`, `SalesOrderDetailsDialog.tsx` (or equivalent details view)

