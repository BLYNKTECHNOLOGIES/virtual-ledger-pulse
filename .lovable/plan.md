

## Action Required Widget - ERP Reconciliation for Binance Asset Movements

### Overview
A new dashboard widget that surfaces unreconciled deposits and withdrawals detected from Binance APIs, forcing each movement through ERP accounting classification (Purchase/Sales/Wallet Transfer) before it is considered operationally settled.

### Data Architecture

**New DB Table: `erp_action_queue`**

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Internal ID |
| movement_id | text (unique) | Links to `asset_movement_history.id` - prevents duplicates |
| movement_type | text | `deposit` or `withdrawal` |
| asset | text | Coin type (USDT, BTC, etc.) |
| amount | numeric | Quantity |
| tx_id | text | Binance transaction hash/reference |
| network | text | Blockchain network |
| wallet_id | uuid | Mapped ERP wallet from `terminal_wallet_links` |
| movement_time | bigint | Timestamp from Binance |
| status | text | `PENDING`, `PROCESSED`, `REJECTED` |
| action_type | text | `PURCHASE`, `SALE`, `WALLET_TRANSFER` (set on processing) |
| erp_reference_id | text | Purchase order / Sales order / Transaction ID created |
| processed_by | uuid | User who actioned it |
| processed_at | timestamptz | When actioned |
| reject_reason | text | If rejected, reason stored |
| raw_data | jsonb | Full movement data for audit |
| created_at | timestamptz | Auto |

RLS: Full access for authenticated users (internal ERP tool).

**New DB Migration:**
- Create `erp_action_queue` table
- Add unique constraint on `movement_id` to prevent duplicate entries
- Index on `status` for fast pending lookups

### Sync Logic

**Where**: Inside the existing `asset_movement_history` sync flow (already runs via `binance-assets` edge function action `syncAssetMovements`).

**New Edge Function Action** (`checkNewMovements`):
1. Query `asset_movement_history` for deposits and withdrawals where status indicates completion (status `1`/`6` for deposits, `6` for withdrawals)
2. LEFT JOIN against `erp_action_queue` on `movement_id`
3. Any movements not yet in the queue get inserted with status `PENDING`
4. This runs automatically when the dashboard widget mounts (with a 5-minute stale check, same pattern as asset movement sync)

### Widget Component: `ActionRequiredWidget`

**Location**: `src/components/dashboard/ActionRequiredWidget.tsx`

**Placement**: Added to the ERP Dashboard (`src/pages/Dashboard.tsx`) as a prominent card in the widgets area.

**UI Structure**:
- Card header showing "Action Required" with count badges: Pending Deposits (count) | Pending Withdrawals (count)
- Compact table rows, sorted newest first, each showing:
  - Asset/Coin icon + name
  - Quantity (formatted to appropriate decimals)
  - Wallet name (from `terminal_wallet_links` mapping)
  - Date/Time
  - TX Hash (truncated with tooltip)
  - Status badge ("Action Pending")
  - Two buttons: **Entry** (primary) | **Reject** (ghost/destructive)

### Action Flows

**1. Reject Flow**
- Click Reject on any row
- Small confirmation dialog with optional reason text
- Sets `status = 'REJECTED'` and stores `reject_reason`
- Row disappears from widget but remains in DB for audit
- Logs via `logActionWithCurrentUser`

**2. Entry Flow - Action Selection Dialog**
- Click Entry on any row
- Opens a dialog with two choices:
  - For **Deposits**: "Wallet Transfer" or "Purchase Entry"
  - For **Withdrawals**: "Wallet Transfer" or "Sales Entry"

**3. Deposit -> Purchase Entry**
- Opens the existing `ManualPurchaseEntryDialog` with prefilled props:
  - `quantity` = deposit amount
  - `product_id` = matched product by asset code (or leave for user selection)
  - `credit_wallet_id` = mapped wallet from `terminal_wallet_links`
  - `is_off_market` = true (Market rate)
- All other fields (price, supplier, bank, TDS) remain editable
- On successful save, updates `erp_action_queue` row: `status = 'PROCESSED'`, `action_type = 'PURCHASE'`, `erp_reference_id` = purchase order number

**4. Deposit -> Wallet Transfer**
- Opens `ManualWalletAdjustmentDialog` in transfer mode with prefills:
  - Transaction Type = Transfer Between Wallets
  - From Wallet = "Binance Blynk" (mapped wallet)
  - Amount = deposit quantity
  - Asset = deposit asset type
  - User only selects destination wallet
- On save, updates queue status to PROCESSED with action_type = 'WALLET_TRANSFER'

**5. Withdrawal -> Sales Entry**
- Opens the existing `SalesEntryDialog` with prefilled props:
  - `product_id` = matched by asset code
  - `quantity` = withdrawal amount
  - `wallet_id` = mapped wallet
  - `is_off_market` = true
- All commercial fields remain editable
- On save, marks queue as PROCESSED with action_type = 'SALE'

**6. Withdrawal -> Wallet Transfer**
- Same as deposit transfer but From Wallet = mapped Binance wallet, To Wallet = user-selectable
- On save, marks as PROCESSED with action_type = 'WALLET_TRANSFER'

### Implementation Steps

1. **Database migration** - Create `erp_action_queue` table with indexes and RLS policies

2. **Edge function update** - Add `checkNewMovements` action to `binance-assets` edge function that populates the queue from `asset_movement_history`

3. **ActionRequiredWidget component** - New widget with:
   - Hook to fetch pending items from `erp_action_queue`
   - Auto-trigger sync check on mount
   - Compact table UI with Entry/Reject buttons
   - Count badges for deposits vs withdrawals

4. **ActionSelectionDialog** - Small dialog showing "Wallet Transfer" vs "Purchase Entry" (or "Sales Entry") options

5. **Prefill wrapper components** - Thin wrappers that open `ManualPurchaseEntryDialog`, `SalesEntryDialog`, or `ManualWalletAdjustmentDialog` with prefilled values and an `onSuccess` callback to mark the queue item as processed

6. **Modify existing dialogs** - Add optional `defaultValues` / `prefill` props to:
   - `ManualPurchaseEntryDialog` (quantity, product, wallet)
   - `SalesEntryDialog` (quantity, product, wallet)
   - `ManualWalletAdjustmentDialog` (from wallet, amount, asset, transfer mode)

7. **Dashboard integration** - Add `ActionRequiredWidget` to `Dashboard.tsx` in the widgets grid

8. **Audit logging** - All actions (Entry processed, Reject) logged via existing `logActionWithCurrentUser` system

### Technical Notes

- The widget respects the `terminal_wallet_links` mapping to resolve which ERP wallet corresponds to the Binance API. Currently defaults to "Binance Blynk" but scales to multi-wallet.
- Duplicate prevention via unique `movement_id` constraint ensures the same Binance transaction cannot create multiple queue entries.
- No data fabrication - movement classification (deposit/withdrawal) comes directly from Binance API. The action type (Purchase/Sale/Transfer) is always user-selected.
- Partially saved or cancelled entries keep status as PENDING.

