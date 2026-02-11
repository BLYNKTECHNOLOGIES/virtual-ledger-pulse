

# ERP-Terminal Sales Integration

## Overview
Mirror the existing Purchase integration (`terminal_purchase_sync` + `TerminalPurchaseApprovalDialog` + `TerminalSyncTab`) for SELL orders, creating a complete Terminal-to-ERP sales pipeline with client mapping, counterparty data capture, and approval workflow.

## Binance API Feasibility Check
All required data fields are available from the existing `binance_order_history` table (already synced via the order history sync):
- Order Number, Asset, Amount, Total Price, Unit Price, Commission, Verified Name, Nickname, Create Time, Pay Method, Trade Type, Order Status

**Limitation flagged**: Binance P2P API does not expose buyer's UPI ID, bank reference, or contact number. These must be captured manually via Terminal UI (as already done for PAN in purchases).

---

## Implementation Steps

### 1. Database: `terminal_sales_sync` Table
Create a new table mirroring `terminal_purchase_sync` but for SELL orders:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | Row ID |
| `binance_order_number` | text UNIQUE NOT NULL | Duplicate guard |
| `sync_status` | text | `synced_pending_approval`, `client_mapping_pending`, `approved`, `rejected`, `duplicate_blocked` |
| `order_data` | jsonb | Snapshot of trade data (amount, price, qty, fee, wallet, pay_method) |
| `client_id` | uuid FK -> clients | Mapped ERP client |
| `counterparty_name` | text | Verified name from Binance |
| `contact_number` | text | Manually captured via Terminal |
| `state` | text | Manually captured via Terminal |
| `sales_order_id` | uuid FK -> sales_orders | Created after approval |
| `rejection_reason` | text | If rejected |
| `synced_by` | text | User who triggered sync |
| `synced_at` | timestamptz | Sync timestamp |
| `reviewed_by` | text | Approver |
| `reviewed_at` | timestamptz | Approval timestamp |

Add `source` and `terminal_sync_id` columns to `sales_orders` table (mirroring what exists on `purchase_orders`).

### 2. Database: `counterparty_contact_records` Table
New table for storing contact number and state per counterparty (client-wise, not order-wise):

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | Row ID |
| `counterparty_nickname` | text UNIQUE | Binance nickname (key) |
| `contact_number` | text | Phone number |
| `state` | text | Indian state |
| `collected_by` | text | User who captured it |
| `created_at` / `updated_at` | timestamptz | Timestamps |

This table serves both BUY and SELL counterparties.

### 3. Sync Logic: `useTerminalSalesSync.ts`
New hook mirroring `useTerminalPurchaseSync.ts`:
- Query `binance_order_history` where `trade_type = 'SELL'` and `order_status = 'COMPLETED'`
- Check duplicates against `terminal_sales_sync.binance_order_number`
- Auto-map verified names to ERP clients (exact match via `clients.name`)
- Pull contact/state from `counterparty_contact_records` if available
- Fetch active terminal wallet link for inventory reference
- Insert new records with status `synced_pending_approval` or `client_mapping_pending`
- Called after order history sync completes (alongside purchase sync)

### 4. Terminal UI: Counterparty Contact Capture Component
New `CounterpartyContactInput.tsx` component (similar to `CounterpartyPanInput.tsx`):
- Input fields for Contact Number and State (dropdown from `INDIAN_STATES_AND_UTS`)
- Upserts to `counterparty_contact_records` keyed by `counterparty_nickname`
- Auto-populates if previously captured
- Syncs to ERP `clients` table if a matching client exists
- Placed in the Terminal Order Workspace counterparty profile panel, alongside the existing PAN input
- Available for both BUY and SELL orders

### 5. ERP Sales Page: Terminal Sync Tab
New `TerminalSalesSyncTab.tsx` component (mirrors `TerminalSyncTab.tsx` for purchases):
- Table showing all `terminal_sales_sync` records with status filter
- Columns: Order #, Buyer Name, Amount, Qty, Price, Fee, Contact, Status, Synced At, Actions
- Approve / Reject buttons for pending records
- Manual "Sync Now" button
- Pending count badge on tab header
- Add as a third tab in the Sales page: "Pending Orders | Completed Orders | Terminal Sync"

### 6. Sales Approval Dialog: `TerminalSalesApprovalDialog.tsx`
New dialog mirroring `TerminalPurchaseApprovalDialog.tsx`:

**Read-only (locked) fields from Terminal data:**
- Order Number, Asset/Product, Quantity, Price Per Unit, Total Amount, Commission/Fee, Wallet, Verified Buyer Name, Payment Method, Order Date

**Editable fields for ERP governance:**
- Bank Account / Settlement Ledger (dropdown)
- Payment Method (from `sales_payment_methods`)
- Contact Number (editable if missing)
- State (editable if missing)
- Remarks

**On Approve:**
1. Insert into `sales_orders` with all prefilled data, `source = 'terminal'`, `payment_status = 'COMPLETED'`
2. Process wallet deduction via existing `process_sales_order_wallet_deduction` RPC
3. Process platform fee deduction if applicable
4. Update `terminal_sales_sync` record: set `sync_status = 'approved'`, link `sales_order_id`
5. Handle client onboarding (same logic as `SalesEntryDialog` -- check existing client, create onboarding approval if new)
6. Update client contact/state from captured data

**Client Mapping Logic:**
- Exact match on verified name -> auto-link
- No match -> show "Create Client" button (uses a new `createBuyerClient` utility)
- Prevent duplicate creation by checking `counterparty_contact_records` + `clients` table

### 7. Utility: `createBuyerClient` in `clientIdGenerator.ts`
Add a `createBuyerClient` function mirroring `createSellerClient`:
- Checks for existing client by name
- Creates with `client_type: 'BUYER'`
- Sets phone and state if provided

### 8. Integration Points

**Order History Sync (`useBinanceOrderSync.tsx`):**
- After existing `syncCompletedBuyOrders()` call, add `syncCompletedSellOrders()` call

**Sales Page (`Sales.tsx`):**
- Add "Terminal Sync" tab with pending count badge
- Import and render `TerminalSalesSyncTab`

**Terminal Order Workspace:**
- Add `CounterpartyContactInput` alongside existing `CounterpartyPanInput` in the order detail panel

---

## Technical Details

### RLS Policies for New Tables
- `terminal_sales_sync`: Full access policies (matching `terminal_purchase_sync` pattern, since custom auth uses SECURITY DEFINER RPCs)
- `counterparty_contact_records`: Full access for authenticated operations

### Migration SQL Summary
```text
1. CREATE TABLE terminal_sales_sync (...)
2. CREATE TABLE counterparty_contact_records (...)
3. ALTER TABLE sales_orders ADD COLUMN source text, ADD COLUMN terminal_sync_id uuid
4. RLS policies for both new tables
5. Unique constraint on terminal_sales_sync(binance_order_number)
6. FK constraints to clients and sales_orders
```

### Files to Create
- `supabase/migrations/[timestamp]_terminal_sales_sync.sql`
- `src/hooks/useTerminalSalesSync.ts`
- `src/components/terminal/orders/CounterpartyContactInput.tsx`
- `src/components/sales/TerminalSalesSyncTab.tsx`
- `src/components/sales/TerminalSalesApprovalDialog.tsx`

### Files to Modify
- `src/hooks/useBinanceOrderSync.tsx` (add sell sync call)
- `src/pages/Sales.tsx` (add Terminal Sync tab)
- `src/utils/clientIdGenerator.ts` (add `createBuyerClient`)
- Terminal order workspace component (add contact input alongside PAN)

