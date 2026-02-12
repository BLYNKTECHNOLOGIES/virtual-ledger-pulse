

# WAC-Based Asset Conversion Accounting System

## Current State Assessment

The existing `erp_product_conversions` system is a basic ledger that records BUY/SELL entries and posts wallet transactions on approval. However, it has **no cost tracking, no inventory position management, and no realized P&L calculation**. The P&L page currently mixes all asset types naively, producing incorrect rates.

## Recommendation vs. Your Spec

Your specification is well-structured. I have one suggestion:

**Simplification**: Rather than creating 4 new tables (`asset_conversion_entries`, `wallet_asset_positions`, `asset_conversion_journal`, `realized_pnl_events`), I recommend:

1. **Extend** the existing `erp_product_conversions` table with the missing fields (execution_rate_usdt, local_price, fx_rate, market_rate_snapshot, etc.) instead of creating a duplicate `asset_conversion_entries` table -- avoids data migration and preserves existing approved records.
2. **Create** `wallet_asset_positions` (WAC tracker) -- new table, essential.
3. **Create** `conversion_journal_entries` (immutable journal) -- new table, essential.
4. **Create** `realized_pnl_events` -- new table, essential.

This avoids duplicating the conversion workflow that already works (create/approve/reject with idempotency guards).

---

## Implementation Plan

### Phase 1: Database Schema

#### 1a. Extend `erp_product_conversions` with WAC-related columns

```
ADD COLUMNS:
- execution_rate_usdt NUMERIC(20,9)    -- price per unit in USDT
- quantity_gross NUMERIC(20,9)          -- before fee deduction
- quantity_net NUMERIC(20,9)            -- after fee deduction
- local_price NUMERIC(20,4)            -- optional local currency price
- local_currency TEXT DEFAULT 'INR'
- fx_rate_to_usdt NUMERIC(20,9)        -- local/USDT rate used
- market_rate_snapshot NUMERIC(20,9)    -- market rate at time of entry
- cost_out_usdt NUMERIC(20,9)          -- for SELL: qty * avg_cost at sale
- realized_pnl_usdt NUMERIC(20,9)      -- for SELL: net_usdt - cost_out
- source TEXT DEFAULT 'ERP'
```

Backfill existing approved records: `execution_rate_usdt = price_usd`, `quantity_gross = quantity`, `quantity_net = net_asset_change`.

#### 1b. Create `wallet_asset_positions` table

```
wallet_id       UUID NOT NULL
asset_code      TEXT NOT NULL
qty_on_hand     NUMERIC(20,9) DEFAULT 0
cost_pool_usdt  NUMERIC(20,9) DEFAULT 0
avg_cost_usdt   NUMERIC(20,9) DEFAULT 0
updated_at      TIMESTAMPTZ DEFAULT now()
UNIQUE(wallet_id, asset_code)
```

Seed from existing approved conversions to establish initial positions.

#### 1c. Create `conversion_journal_entries` table (immutable)

```
id              UUID PK
conversion_id   UUID NOT NULL (FK to erp_product_conversions)
line_type       TEXT NOT NULL  -- 'ASSET_IN', 'USDT_OUT', 'FEE', 'COGS', 'REALIZED_PNL'
asset_code      TEXT NOT NULL
qty_delta       NUMERIC(20,9)
usdt_delta      NUMERIC(20,9)
notes           TEXT
created_at      TIMESTAMPTZ DEFAULT now()
```

#### 1d. Create `realized_pnl_events` table

```
id              UUID PK
conversion_id   UUID NOT NULL
wallet_id       UUID NOT NULL
asset_code      TEXT NOT NULL
sell_qty        NUMERIC(20,9)
proceeds_usdt_gross NUMERIC(20,9)
proceeds_usdt_net   NUMERIC(20,9)
cost_out_usdt   NUMERIC(20,9)
realized_pnl_usdt NUMERIC(20,9)
avg_cost_at_sale NUMERIC(20,9)
created_at      TIMESTAMPTZ DEFAULT now()
```

### Phase 2: Rewrite `approve_product_conversion` RPC

The core logic change -- the approve function becomes WAC-aware:

**BUY flow:**
1. Validate USDT balance >= gross_usdt
2. Post wallet transactions (existing logic, kept)
3. Update `wallet_asset_positions`:
   - `qty_on_hand += net_qty`
   - `cost_pool_usdt += gross_usdt`
   - `avg_cost_usdt = cost_pool_usdt / qty_on_hand`
4. Write journal entries: USDT_OUT, ASSET_IN, FEE (if any)
5. Update conversion record with `quantity_net`, `execution_rate_usdt`

**SELL flow:**
1. Validate asset balance >= sell_qty
2. Read current `avg_cost_usdt` from positions
3. Calculate:
   - `cost_out_usdt = sell_qty * avg_cost_usdt`
   - `realized_pnl = net_usdt_proceeds - cost_out_usdt`
4. Post wallet transactions (existing logic, kept)
5. Update `wallet_asset_positions`:
   - `qty_on_hand -= sell_qty`
   - `cost_pool_usdt -= cost_out_usdt`
   - Recalculate `avg_cost_usdt` (or zero if qty = 0)
6. Write journal entries: ASSET_OUT, USDT_IN, FEE, COGS, REALIZED_PNL
7. Insert into `realized_pnl_events`
8. Update conversion record with `cost_out_usdt`, `realized_pnl_usdt`

### Phase 3: Update Create Conversion Form

Enhance the existing `CreateConversionForm.tsx`:

- Add optional fields: local_price, local_currency, fx_rate_to_usdt, market_rate_snapshot
- Auto-derive `execution_rate_usdt` when local_price and fx_rate provided
- Show current WAC position for selected wallet+asset (query `wallet_asset_positions`)
- For SELL: show estimated realized P&L using current avg_cost
- Keep existing fields working as-is for backward compatibility

### Phase 4: Reporting UI

#### 4a. Portfolio Snapshot (new component)

Table showing per wallet+asset:
- Qty on Hand, Avg Cost (USDT), Cost Value (qty * avg_cost)
- Market Value (qty * current_market_rate -- from user input or snapshot)
- Unrealized P&L = Market Value - Cost Value

#### 4b. Realized P&L Report (new component)

Query `realized_pnl_events` with filters:
- Date range, wallet, asset
- Aggregate by day/week/month
- Show: total sells, total proceeds, total COGS, total realized P&L

#### 4c. Conversion History Enhancement

Add columns to existing `ConversionHistoryTable`:
- Execution Rate USDT, Cost Out, Realized P&L (for sells)

#### 4d. Execution vs Market Variance

For each conversion: `execution_rate_usdt vs market_rate_snapshot`
- Variance = execution - market, Variance % = (variance / market) * 100

### Phase 5: Fix P&L Dashboard Asset Filtering

The existing `ProfitLoss.tsx` must filter purchases by `selectedAsset` to avoid mixing BTC/SHIB with USDT rates. This is a separate but related fix using the product code from purchase_order_items.

---

## Technical Details

### Files to Create
- `src/components/stock/conversion/PortfolioSnapshot.tsx`
- `src/components/stock/conversion/RealizedPnlReport.tsx`
- `src/components/stock/conversion/ExecutionVarianceReport.tsx`
- `src/hooks/useWalletAssetPositions.ts`
- `src/hooks/useRealizedPnl.ts`

### Files to Modify
- `src/components/stock/conversion/CreateConversionForm.tsx` -- add WAC fields
- `src/components/stock/conversion/ConversionHistoryTable.tsx` -- add P&L columns
- `src/components/stock/InterProductConversionTab.tsx` -- add report tabs
- `src/hooks/useProductConversions.ts` -- update types for new fields
- `src/pages/ProfitLoss.tsx` -- asset-specific filtering

### Database Migrations
- 1 migration for schema changes (new tables + column additions)
- 1 migration for updated `approve_product_conversion` RPC
- 1 migration to seed `wallet_asset_positions` from existing approved data

### Edge Cases Handled
- Partial sells: WAC naturally handles this (sell any qty up to on_hand)
- Zero balance reset: when qty_on_hand reaches 0, cost_pool and avg_cost reset to 0
- Negative inventory block: validate qty_on_hand >= sell_qty before posting
- 9-decimal precision: all NUMERIC columns use (20,9)
- Different fee assets: journal entries track fee_asset explicitly

