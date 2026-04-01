

## Audit: Universal Effective USDT Valuation System — Gap Analysis

### What IS implemented and working

| Requirement | Status | Details |
|---|---|---|
| `price_snapshots` table | DONE | Created with asset_code, usdt_price, source, fetched_at, entry_type, reference_id, reference_type, requested_by |
| `batch_usdt_valuations` table | DONE | Created with all required fields including strategy column |
| `wallet_transactions` USDT columns | DONE | market_rate_usdt, effective_usdt_qty, effective_usdt_rate, price_snapshot_id added |
| `wallet_fee_deductions` USDT columns | DONE | market_rate_usdt_snapshot, price_fetched_at added |
| Immutability triggers | DONE | `protect_po_effective_usdt` and `protect_so_effective_usdt` on purchase_orders/sales_orders |
| `effectiveUsdtEngine.ts` | DONE | fetchAndLockMarketRate, computeEffectiveUsdt, linkSnapshotToReference, persistBatchValuation |
| Blocking fallback | DONE | Throws error if price=0 and no manual override |
| Terminal Purchase Approval | DONE | Uses fetchAndLockMarketRate |
| Terminal Sales Approval | DONE | Uses fetchAndLockMarketRate |
| Manual Purchase Entry | DONE | Uses fetchAndLockMarketRate |
| Manual Sales Entry (SalesEntryDialog) | DONE | Uses fetchAndLockMarketRate |
| Small Buys Approval | DONE | Uses fetchAndLockMarketRate + persistBatchValuation |
| Small Sales Approval | DONE | Uses fetchAndLockMarketRate + persistBatchValuation |
| Wallet Transfers | DONE | Uses fetchAndLockMarketRate, stores USDT columns on wallet_transactions |
| P&L (ProfitLoss.tsx) | DONE | Uses effective_usdt_qty/rate from orders |
| useAverageCost | DONE | Uses effective_usdt_qty from purchase_orders |

---

### Gaps Found (6 items)

#### Gap 1: Missing UPDATE RLS policy on `price_snapshots`
`linkSnapshotToReference()` calls `.update()` on `price_snapshots` but only SELECT and INSERT policies exist. This silently fails — snapshot-to-order linkage is broken.

**Fix:** Add UPDATE policy for authenticated users on `price_snapshots`.

#### Gap 2: `wallet_fee_deductions` inserts do NOT populate new USDT snapshot columns
Both `TerminalSalesApprovalDialog` (line 486-501) and `SalesOrderDialog` (line 272-287) insert into `wallet_fee_deductions` but never set `market_rate_usdt_snapshot` or `price_fetched_at`. The columns exist in the DB but are always NULL.

**Fix:** Pass the locked market rate and timestamp into fee deduction inserts in both dialogs.

#### Gap 3: `SalesOrderDialog.tsx` still uses raw logic instead of `effectiveUsdtEngine`
`SalesOrderDialog` (the ERP manual sales dialog) does NOT import or use `fetchAndLockMarketRate`. It computes fee values using `orderData.usdtRate` but doesn't persist a price snapshot or link to one.

**Fix:** Integrate `fetchAndLockMarketRate` into `SalesOrderDialog` for fee deduction USDT valuation and snapshot persistence.

#### Gap 4: `PlatformFeesSummary.tsx` does NOT use stored USDT layer
It falls back to live `useUSDTRate()` for INR conversion instead of reading the stored `market_rate_usdt_snapshot` from `wallet_fee_deductions`. This contradicts the "no recalculation" rule — fees should use the rate locked at entry time.

**Fix:** Prioritize `market_rate_usdt_snapshot` in the `getFeeINR()` fallback chain.

#### Gap 5: `StockTransactionsTab.tsx` does NOT display USDT valuation
The stock transactions view shows raw amounts but has no USDT valuation columns. Since `wallet_transactions` now has `effective_usdt_qty` and `market_rate_usdt`, these should be displayed.

**Fix:** Add USDT valuation columns to the StockTransactionsTab table display.

#### Gap 6: No backfill of historical `wallet_transactions`
The plan called for a backfill migration to populate `effective_usdt_qty/rate` on historical wallet_transactions. This was never executed. Old records have NULL USDT values.

**Fix:** Run a backfill UPDATE on wallet_transactions where effective_usdt_qty IS NULL, computing from amount and a best-estimate market rate (1.0 for USDT assets, or from the related order's market_rate_usdt).

---

### Implementation Steps

1. **Migration: Add UPDATE RLS policy on `price_snapshots`** and backfill historical `wallet_transactions`
2. **SalesOrderDialog.tsx** — Import and use `fetchAndLockMarketRate`, populate `market_rate_usdt_snapshot` + `price_fetched_at` on fee deduction insert
3. **TerminalSalesApprovalDialog.tsx** — Add `market_rate_usdt_snapshot` and `price_fetched_at` to fee deduction insert (market rate is already fetched as `marketRateUsdt`)
4. **PlatformFeesSummary.tsx** — Update `getFeeINR()` to prioritize `market_rate_usdt_snapshot` over live rate
5. **StockTransactionsTab.tsx** — Display `market_rate_usdt` and `effective_usdt_qty` columns from wallet_transactions query

### Files to modify
| File | Change |
|---|---|
| New migration | UPDATE policy on price_snapshots; backfill wallet_transactions |
| `src/components/sales/SalesOrderDialog.tsx` | Use effectiveUsdtEngine for fee deductions |
| `src/components/sales/TerminalSalesApprovalDialog.tsx` | Populate market_rate_usdt_snapshot on fee insert |
| `src/components/financials/PlatformFeesSummary.tsx` | Prioritize stored snapshot rate in getFeeINR |
| `src/components/stock/StockTransactionsTab.tsx` | Show USDT valuation columns |

