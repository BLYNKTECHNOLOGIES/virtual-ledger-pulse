
# Small Sales Integration: Terminal to ERP

## Overview

This feature introduces a parallel sales pipeline for low-value orders (default: INR 200-4,000). Unlike normal (big) sales which sync individually with per-client tracking, small sales are clubbed by asset and synced as bulk entries with a fixed "Small Sales" customer -- eliminating client creation overhead while maintaining full accounting integrity.

## Architecture

```text
+---------------------------+       +----------------------------+
|  Terminal: Automation Tab  |       |  ERP: Sales Page           |
|                            |       |                            |
|  [Small Sales Config]      |       |  [Small Sales Sync Button] |
|  - Enable/Disable Toggle   |       |       |                    |
|  - Min/Max Amount Fields   |       |       v                    |
|  - Preview Impact          |       |  Fetch orders from         |
|  - Manual Reclassify       |       |  binance_order_history     |
|                            |       |  where total_price in      |
+---------------------------+       |  [min_amount, max_amount]  |
                                     |       |                    |
                                     |       v                    |
                                     |  Club by asset_code        |
                                     |  Insert into               |
                                     |  small_sales_sync          |
                                     |       |                    |
                                     |       v                    |
                                     |  Approval Dialog           |
                                     |  (select payment method)   |
                                     |       |                    |
                                     |       v                    |
                                     |  Create sales_order        |
                                     |  (SM00001 format)          |
                                     |  + wallet deduction        |
                                     |  + fee deduction           |
                                     +----------------------------+
```

## Database Changes (1 migration)

### Table 1: `small_sales_config`
Stores the admin-configurable classification thresholds.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| is_enabled | BOOLEAN | Default true |
| min_amount | NUMERIC(20,4) | Default 200 |
| max_amount | NUMERIC(20,4) | Default 4000 |
| currency | TEXT | Default 'INR' |
| updated_by | TEXT | |
| updated_at | TIMESTAMPTZ | |

Single-row config table (upsert pattern).

### Table 2: `small_sales_sync`
The clubbed sync records -- one row per asset per sync execution.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| sync_batch_id | TEXT | Groups records from same sync run |
| asset_code | TEXT | e.g., 'USDT', 'BTC' |
| order_count | INT | Number of orders clubbed |
| total_quantity | NUMERIC(20,9) | Sum of amounts |
| total_amount | NUMERIC(20,4) | Sum of total_price (INR) |
| avg_price | NUMERIC(20,4) | total_amount / total_quantity |
| total_fee | NUMERIC(20,9) | Sum of commissions |
| wallet_id | UUID | From terminal wallet link |
| wallet_name | TEXT | |
| sync_status | TEXT | 'pending_approval', 'approved', 'rejected' |
| sales_order_id | UUID | FK after approval |
| order_numbers | TEXT[] | Array of included Binance order numbers |
| time_window_start | TIMESTAMPTZ | |
| time_window_end | TIMESTAMPTZ | |
| synced_by | TEXT | |
| synced_at | TIMESTAMPTZ | |
| reviewed_by | TEXT | |
| reviewed_at | TIMESTAMPTZ | |
| rejection_reason | TEXT | |

### Table 3: `small_sales_sync_log`
Tracks each sync execution for audit and last-sync-time tracking.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| sync_batch_id | TEXT | |
| sync_started_at | TIMESTAMPTZ | |
| sync_completed_at | TIMESTAMPTZ | |
| time_window_start | TIMESTAMPTZ | |
| time_window_end | TIMESTAMPTZ | |
| total_orders_processed | INT | |
| entries_created | INT | |
| synced_by | TEXT | |

### Table 4: `small_sales_order_map`
Preserves individual order-level traceability for audit.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| small_sales_sync_id | UUID | FK to small_sales_sync |
| binance_order_number | TEXT | Individual order |
| order_data | JSONB | Snapshot of order details |
| created_at | TIMESTAMPTZ | |

### Schema Change: `sales_orders`
- Add column `sale_type TEXT DEFAULT 'regular'` -- values: 'regular', 'small_sale'

This enables filtering Big vs Small sales in all dashboards and reports.

### Sequence for SM order numbers
A database sequence `small_sales_order_seq` to generate SM00001, SM00002, etc.

## Sync Logic (Frontend Hook)

### `src/hooks/useSmallSalesSync.ts`

1. Read `small_sales_config` to get enabled state and amount range
2. Read `small_sales_sync_log` to find the last sync timestamp
3. Query `binance_order_history` for SELL + COMPLETED orders where:
   - `total_price` between min_amount and max_amount
   - `create_time` > last sync timestamp (epoch ms)
   - `create_time` <= now
4. Check against `small_sales_order_map` to prevent duplicate inclusion
5. Group remaining orders by `asset` code
6. For each asset group, insert one `small_sales_sync` row with aggregated data
7. Insert individual order mappings into `small_sales_order_map`
8. Log the sync execution in `small_sales_sync_log`

### Interaction with existing Big Sales sync
The existing `useTerminalSalesSync.ts` must be updated to EXCLUDE orders that fall within the small sales amount range (when small sales is enabled). This prevents the same order from appearing in both pipelines.

## Approval Workflow

### `src/components/sales/SmallSalesApprovalDialog.tsx`

Read-only display:
- Asset code with icon
- Total Quantity (sum)
- Average Price (calculated)
- Total Amount (INR)
- Wallet name
- Total Fee
- Order Count
- Time Window (start - end)

Editable fields:
- Payment Method dropdown (BAMS Sales Payment Methods)
- Settlement Date

On approve:
1. Generate order number via `nextval('small_sales_order_seq')` formatted as SM{padded}
2. Insert `sales_orders` with:
   - `order_number`: SM00001
   - `client_name`: "Small Sales"
   - `client_phone`: null
   - `client_state`: null
   - `sale_type`: 'small_sale'
   - `source`: 'terminal_small_sales'
   - `quantity`, `total_amount`, `price_per_unit`: from aggregated data
   - `fee_amount`: total fee
3. Call `process_sales_order_wallet_deduction` for inventory reduction
4. Update `small_sales_sync` record with `sales_order_id` and status 'approved'

## Terminal Automation Tab Addition

### `src/components/terminal/automation/SmallSalesConfig.tsx`

New sub-tab "Small Sales" in the existing Automation page with:

- **Enable/Disable Toggle**: Controls whether classification is active
- **Amount Range Fields**: Min Amount and Max Amount inputs with validation
- **Preview Impact**: Shows count of today's completed SELL orders that would be classified as small vs big based on current thresholds
- **Manual Override Table**: List of today's orders near the boundary with a "Reclassify" button to force an order into/out of small sales category

## ERP Sales Page Tab

### `src/components/sales/SmallSalesSyncTab.tsx`

New tab "Small Sales Sync" added to the Sales page tabs (alongside Pending, Completed, Terminal Sync).

Contents:
- "Sync Small Sales" button (triggers the sync hook)
- Last sync timestamp display
- Table of `small_sales_sync` records showing: Asset, Order Count, Total Qty, Total Amount, Avg Price, Fee, Status, Time Window
- Approve/Reject actions per row
- Expandable row detail showing individual order numbers from `small_sales_order_map`

## Dashboard and Reporting Impact

### P&L and Financials
- No code changes needed -- small sales entries go through the same `sales_orders` table and `process_sales_order_wallet_deduction` RPC, so they automatically appear in revenue, volume, and turnover calculations.

### Filtering
- Add a `sale_type` filter dropdown ("All", "Regular Sales", "Small Sales") to Sales page and relevant report pages using the new `sale_type` column.

## Files to Create
- `src/hooks/useSmallSalesSync.ts` -- sync logic
- `src/components/sales/SmallSalesSyncTab.tsx` -- ERP sync tab
- `src/components/sales/SmallSalesApprovalDialog.tsx` -- approval dialog
- `src/components/terminal/automation/SmallSalesConfig.tsx` -- config UI

## Files to Modify
- `src/hooks/useTerminalSalesSync.ts` -- exclude small sale orders from big sales pipeline
- `src/pages/terminal/TerminalAutomation.tsx` -- add Small Sales tab
- `src/pages/Sales.tsx` -- add Small Sales Sync tab, add sale_type filter
- 1 database migration for all new tables, columns, and sequence

## Safeguards
- Duplicate prevention via `small_sales_order_map` unique constraint on `binance_order_number`
- Time window tracking ensures no overlap between syncs
- Small and big sales pipelines are completely separate services with separate tables
- Manual reclassification stored as overrides without affecting the core threshold logic
- Sync failures are safe to retry -- duplicate check runs before every insert
