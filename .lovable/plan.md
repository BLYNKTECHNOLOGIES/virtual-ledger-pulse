

## Universal Effective USDT Valuation System

### Current State Assessment

**What already exists:**
- `purchase_orders` and `sales_orders` have `market_rate_usdt`, `effective_usdt_qty`, `effective_usdt_rate` columns — populated at entry time across all 6 entry paths (Terminal Purchase/Sales Approval, Small Buys/Sales Approval, Manual Purchase Entry, Manual Sales Entry)
- `erp_product_conversions` has `market_rate_snapshot`, `fx_rate_to_usdt`, `execution_rate_usdt`, `gross_usd_value`, `net_usdt_change` — already well-covered
- `fetchCoinMarketRate()` serves as the single price source, fetching from Binance via edge function
- `useAverageCost` and `ProfitLoss.tsx` already consume effective_usdt fields

**What is missing (gaps to fill):**
1. **No price snapshot audit table** — prices fetched on-the-fly with no permanent record
2. **`wallet_transactions` has no USDT valuation columns** — transfers, adjustments, fee deductions have no USDT layer
3. **`wallet_fee_deductions` has `fee_usdt_amount`** but no `market_rate_usdt` snapshot or timestamp
4. **No immutability enforcement** — effective values can be overwritten via UPDATE
5. **No fallback blocking** — if `fetchCoinMarketRate` returns 0, entries proceed with rate=1 (silent fallback)
6. **No batch-level valuation table** for small order approvals

---

### Implementation Plan (6 Phases)

#### Phase 1: Price Snapshot Table (Foundation)

Create `price_snapshots` table to record every price fetch used in a transaction:

```text
price_snapshots
├── id (uuid PK)
├── asset_code (text, NOT NULL)
├── usdt_price (numeric, NOT NULL)  -- asset price in USDT
├── source (text)                    -- 'Binance', 'CoinGecko', 'Manual'
├── fetched_at (timestamptz)
├── entry_type (text)                -- 'purchase_approval', 'sales_entry', 'transfer', 'conversion', 'batch_approval'
├── reference_id (uuid, nullable)    -- FK to the order/transaction that used this price
├── reference_type (text)            -- 'purchase_order', 'sales_order', 'wallet_transaction', 'conversion'
├── requested_by (uuid, nullable)    -- user who triggered the fetch
```

Modify `fetchCoinMarketRate()` to return a richer object `{ price, source, timestamp }` and create a helper `persistPriceSnapshot()` that inserts into this table after every successful fetch.

#### Phase 2: Add USDT Valuation Columns to `wallet_transactions`

Add columns to `wallet_transactions`:

```text
+ market_rate_usdt (numeric, nullable)
+ effective_usdt_qty (numeric, nullable)
+ effective_usdt_rate (numeric, nullable)
+ price_snapshot_id (uuid, nullable FK → price_snapshots)
```

Update all wallet transaction insertion points:
- `WalletTransferWrapper.tsx` — internal transfers
- `SalesOrderDialog.tsx` — fee deduction wallet transactions
- Manual adjustment RPCs
- Purchase approval deposit reconciliation

Each insertion computes `effective_usdt_qty = amount × market_rate_usdt` and stores alongside.

#### Phase 3: Standardize Price Fetch with Blocking Fallback

Refactor `fetchCoinMarketRate` into a new utility `fetchAndLockMarketRate()`:

```typescript
interface LockedMarketRate {
  price: number;         // asset price in USDT
  source: string;        // 'Binance', 'CoinGecko'
  timestamp: Date;
  snapshotId?: string;   // UUID after persistence
}
```

**Rules enforced:**
- If price returns 0 or null → throw error (block entry) unless user explicitly provides manual override
- Manual override sets `calculation_mode = 'MANUAL_OVERRIDE'` with audit flag
- All 6 entry dialogs updated to use this function instead of raw `fetchCoinMarketRate`

#### Phase 4: Immutability Enforcement (Database Trigger)

Create a trigger `protect_effective_usdt_values` on both `purchase_orders` and `sales_orders`:

```sql
-- Once effective_usdt_qty and effective_usdt_rate are set (non-null),
-- prevent any UPDATE from changing them
-- Corrections must use adjustment entries
CREATE TRIGGER protect_effective_usdt_immutability
BEFORE UPDATE ON purchase_orders
FOR EACH ROW
WHEN (OLD.effective_usdt_qty IS NOT NULL)
EXECUTE FUNCTION prevent_effective_usdt_modification();
```

The function allows updates to other columns but raises an exception if `effective_usdt_qty` or `effective_usdt_rate` values change.

#### Phase 5: Batch Valuation Table

Create `batch_usdt_valuations` for small order approvals:

```text
batch_usdt_valuations
├── id (uuid PK)
├── batch_id (text, NOT NULL)       -- e.g., 'SB-20260401-001'
├── batch_type (text)               -- 'small_buys', 'small_sales'
├── asset_code (text)
├── total_inr_value (numeric)
├── total_asset_qty (numeric)
├── market_rate_usdt (numeric)
├── aggregated_usdt_qty (numeric)
├── effective_usdt_rate (numeric)   -- total_inr / aggregated_usdt_qty
├── strategy (text DEFAULT 'AGGREGATE')  -- 'AGGREGATE' or 'INDIVIDUAL'
├── order_id (uuid, FK → purchase_orders/sales_orders)
├── price_snapshot_id (uuid, FK → price_snapshots)
├── created_at (timestamptz)
├── created_by (uuid)
```

Update `SmallBuysApprovalDialog` and `SmallSalesApprovalDialog` to insert into this table alongside order creation.

#### Phase 6: Downstream Consumption Audit

Verify all ERP modules read from `effective_usdt_qty` / `effective_usdt_rate`:
- `ProfitLoss.tsx` — already uses them ✓
- `useAverageCost.tsx` — already uses them ✓
- `PlatformFeesSummary.tsx` — needs update to use USDT-normalized fee values
- `StockTransactionsTab.tsx` — needs to display USDT valuation from wallet_transactions
- Holdings/Dashboard panels — ensure valuation uses effective fields not raw quantity

---

### Files to Create/Modify

| File | Action |
|------|--------|
| New migration | Create `price_snapshots` table |
| New migration | Add USDT columns to `wallet_transactions` |
| New migration | Create `batch_usdt_valuations` table |
| New migration | Create `protect_effective_usdt_immutability` trigger on purchase_orders + sales_orders |
| `src/hooks/useCoinMarketRate.tsx` | Refactor to return `LockedMarketRate`, add `persistPriceSnapshot()` |
| `src/lib/effectiveUsdtEngine.ts` | New — centralized compute + persist logic for effective USDT values |
| `src/components/purchase/TerminalPurchaseApprovalDialog.tsx` | Use new engine |
| `src/components/purchase/ManualPurchaseEntryDialog.tsx` | Use new engine |
| `src/components/purchase/SmallBuysApprovalDialog.tsx` | Use new engine + batch table |
| `src/components/sales/TerminalSalesApprovalDialog.tsx` | Use new engine |
| `src/components/sales/SalesEntryDialog.tsx` | Use new engine |
| `src/components/sales/SmallSalesApprovalDialog.tsx` | Use new engine + batch table |
| `src/components/dashboard/erp-actions/WalletTransferWrapper.tsx` | Add USDT valuation to wallet_transactions inserts |
| `src/components/financials/PlatformFeesSummary.tsx` | Read USDT-normalized values |
| Backfill migration | Populate `effective_usdt_qty/rate` on historical `wallet_transactions` where possible |

### Edge Cases Handled
- **Partial fills**: Each fill gets its own price snapshot; effective values computed per-fill
- **Fee deductions**: Fee USDT amount derived from same locked market rate as parent order
- **Reversals/cancellations**: Create counter-entry with same effective rate (no re-fetch)
- **Slippage**: Actual execution rate stored separately from market snapshot; variance calculable
- **Multi-leg trades** (INR→BTC→ETH via conversions): Each leg has independent USDT snapshot

