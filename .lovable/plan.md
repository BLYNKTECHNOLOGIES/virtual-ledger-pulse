

# Phase 29: Complete Removal of Conversion P&L

## What's Being Removed

The Conversion P&L system tracks realized gains/losses from crypto price movements during conversions. The underlying WAC data is corrupted, making all P&L figures unreliable. Complete removal requested.

## Components to Remove

### 1. Frontend — P&L Page (`src/pages/ProfitLoss.tsx`)
- Remove `conversionPnlUsdt` and `conversionPnlInr` from `PeriodMetrics` interface
- Remove the `realized_pnl_events` query (lines 253-258)
- Remove the Conversion P&L calculation (lines 339-341)
- Remove `conversionPnlInr` from `netProfit` formula — net profit becomes: `grossProfit - totalExpenses + totalIncome`
- Remove the Conversion P&L card (lines 678-703)
- Update Net Profit subtitle from "Gross + Conv. P&L - Expenses + Income" to "Gross Profit - Expenses + Income"

### 2. Frontend — Realized P&L Tab (`src/components/stock/InterProductConversionTab.tsx`)
- Remove the "Realized P&L" tab trigger and `TabsContent`
- Remove the `RealizedPnlReport` import and `Activity` icon import

### 3. Frontend — Delete Files
- Delete `src/components/stock/conversion/RealizedPnlReport.tsx`
- Delete `src/hooks/useRealizedPnl.ts`

### 4. Hook Cleanup (`src/hooks/useProductConversions.ts`)
- Remove the `queryClient.invalidateQueries({ queryKey: ['realized_pnl_events'] })` line from `useApproveConversion`

### 5. Database Migration
- Drop `realized_pnl_events` table entirely
- Drop `conversion_journal_entries` table (only used for P&L journal tracking, never queried by frontend)
- Remove P&L-related inserts from `approve_product_conversion` function:
  - Remove the `INSERT INTO realized_pnl_events` statement
  - Remove the `INSERT INTO conversion_journal_entries` statements (all 3 line types: USDT_IN, COGS, REALIZED_PNL, and FEE)
  - Remove `v_cost_out`, `v_realized_pnl`, `v_fee_usdt_equiv` variable declarations and calculations
  - Keep `cost_out_usdt` and `realized_pnl_usdt` columns on `erp_product_conversions` as nullable (historical data stays, just no longer populated)
- Update the `erp_product_conversions` UPDATE at end of approval to set `cost_out_usdt = NULL, realized_pnl_usdt = NULL` instead of calculated values

### Safety
- The `approve_product_conversion` function's core logic (wallet transactions, balance updates, WAC updates, status change) is untouched
- Only P&L tracking logic is removed from the function
- Existing approved conversions retain their data in `erp_product_conversions` columns

## Summary

| Action | Target |
|--------|--------|
| Delete 2 frontend files | `RealizedPnlReport.tsx`, `useRealizedPnl.ts` |
| Edit 3 frontend files | `ProfitLoss.tsx`, `InterProductConversionTab.tsx`, `useProductConversions.ts` |
| Drop 2 tables | `realized_pnl_events`, `conversion_journal_entries` |
| Recreate 1 function | `approve_product_conversion` (P&L logic stripped) |

**1 migration, 5 frontend changes.**

