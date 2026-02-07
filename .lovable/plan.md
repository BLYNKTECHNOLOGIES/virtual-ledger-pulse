

# Daily Gross Profit Snapshot with History Chart

## Overview
Mirrors the existing Total Asset Value daily snapshot system: an edge function runs at 12:00 AM each day, calculates that day's gross profit, saves it, and a new history section on the P&L page displays the trend with a Day/Month toggle and AreaChart.

## What Gets Saved (per day)
- **snapshot_date** -- the date
- **gross_profit** -- that single day's gross profit (NPM x Sales Qty)
- **total_sales_qty** -- units sold that day
- **avg_sales_rate** -- average selling rate that day
- **effective_purchase_rate** -- purchase rate adjusted for USDT fees
- _(No total_sales_value column)_

## Changes

### 1. Database Migration: `daily_gross_profit_history` table

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Default gen_random_uuid() |
| snapshot_date | DATE, UNIQUE | The day this profit represents |
| gross_profit | NUMERIC | Gross profit for that day |
| total_sales_qty | NUMERIC | Units sold |
| avg_sales_rate | NUMERIC | Avg selling rate |
| effective_purchase_rate | NUMERIC | Adjusted purchase rate |
| created_at | TIMESTAMPTZ | Default now() |

RLS enabled with a SELECT policy for authenticated users.

### 2. New Edge Function: `snapshot-daily-profit`

File: `supabase/functions/snapshot-daily-profit/index.ts`

Same pattern as `snapshot-asset-value`. Logic:
1. Get today's date string
2. Query completed sales orders where `order_date = today` -- get quantity, price_per_unit
3. Query completed purchase orders where `order_date = today` -- get items with quantity, unit_price
4. Query USDT fee debits (PLATFORM_FEE, TRANSFER_FEE, etc.) for today
5. Calculate: avg sales rate, total purchase value/qty, effective purchase rate (purchase INR / (purchase qty - USDT fees)), NPM, gross profit
6. Upsert into `daily_gross_profit_history` on conflict `snapshot_date`

Config: Add `[functions.snapshot-daily-profit] verify_jwt = false` to `supabase/config.toml`.

### 3. Cron Job (SQL via insert tool)
Schedule `snapshot-daily-profit` at `0 0 * * *` (midnight daily) using `pg_cron` + `pg_net`, same pattern as the asset value snapshot cron.

### 4. New Component: `GrossProfitHistoryTab.tsx`

File: `src/components/financials/GrossProfitHistoryTab.tsx`

Follows the exact same structure as `AssetValueHistoryTab.tsx`:
- **3 summary cards**: Latest Day's Gross Profit (green/red based on positive/negative), Change vs Previous Day (%), Total Snapshots
- **Day/Month toggle** buttons in the chart header
- **AreaChart** (Recharts) -- Day view shows each daily data point; Month view sums gross profit per month
- Green color theme (to distinguish from the indigo asset value chart)

### 5. Integration into P&L Page

File: `src/pages/ProfitLoss.tsx`

Add the `GrossProfitHistoryTab` component at the bottom of the page, below the existing "Expense & Income Breakdown" card, as a new section.

