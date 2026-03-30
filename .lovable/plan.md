

# Fix: Realized P&L Showing Wrong Values (Zero Cost Basis)

## Root Cause

**160 out of 195 P&L events have `avg_cost_at_sale = 0` and `cost_out_usdt = 0`**, making the entire proceeds appear as profit. This massively inflates the reported Realized P&L.

The issue: When assets are purchased via P2P purchase orders (the primary acquisition path), the `wallet_asset_positions` table (which tracks WAC — weighted average cost) is **never updated**. Only conversion BUY operations update it. So when assets acquired via purchase orders are later sold via conversion, the WAC lookup returns 0, and COGS = 0.

```text
Purchase Order (BTC bought) → wallet_transactions ✓ → wallet_asset_positions ✗ (no cost update)
Conversion SELL (BTC sold)  → reads wallet_asset_positions → avg_cost = 0 → COGS = 0 → P&L inflated
```

## Fix (2 parts)

### Part 1: Update `approve_product_conversion` to calculate cost from purchase history when WAC is zero

When `v_pos.avg_cost_usdt = 0` and it's a SELL, derive the average cost from completed purchase orders for that asset. This is a fallback that uses:
```sql
SELECT SUM(poi.quantity * po.market_rate_usdt) / NULLIF(SUM(poi.quantity), 0)
FROM purchase_order_items poi
JOIN purchase_orders po ON po.id = poi.purchase_order_id
JOIN products p ON p.id = poi.product_id
WHERE po.status = 'COMPLETED' AND p.code = v_conv.asset_code
```

If this returns a valid cost, use it. Otherwise, fall back to the conversion's own execution rate as a conservative estimate.

### Part 2: Backfill the 160 corrupted P&L events

A one-time data migration to recalculate the 160 zero-cost events using the weighted average purchase cost per asset at the time of each sale. For each corrupted event:
- Recalculate `avg_cost_at_sale` from purchase order history
- Recalculate `cost_out_usdt = sell_qty * avg_cost_at_sale`
- Recalculate `realized_pnl_usdt = proceeds_usdt_net - cost_out_usdt`
- Also update the corresponding `erp_product_conversions` row's `cost_out_usdt` and `realized_pnl_usdt`

### Part 3: Sync `wallet_asset_positions` from purchase orders going forward

Add logic to the manual purchase RPC (the `create_manual_purchase_complete_v2` function) so that when a purchase order is created/completed, the `wallet_asset_positions` WAC pool is updated with the purchase cost, matching the pattern used in conversion BUYs.

## Implementation Plan

| # | Action | Target |
|---|--------|--------|
| 1 | Migration: Add purchase-cost fallback to `approve_product_conversion` for SELL when WAC=0 | SQL function |
| 2 | Migration: Backfill 160 zero-cost P&L events with correct cost from purchase history | Data fix |
| 3 | Migration: Update `create_manual_purchase_complete_v2` to update `wallet_asset_positions` on purchase completion | SQL function |
| 4 | No frontend changes needed — the report component is correct, only the underlying data is wrong | — |

### Technical Details

The backfill will use a per-asset weighted average cost from all completed purchase orders. For each asset:
- BTC: ~$65,270 avg cost (from ~0.967 BTC purchased at various `market_rate_usdt` values)
- BNB: ~$604 avg cost
- ETH: ~$1,946 avg cost
- USDC: ~$0.96 avg cost (approximation from INR conversion)
- XRP, SOL, TON, TRX, SHIB: similarly derived

The purchase order `market_rate_usdt` field directly gives the USDT cost per unit, so the calculation is: `SUM(quantity * market_rate_usdt) / SUM(quantity)` per asset code.

