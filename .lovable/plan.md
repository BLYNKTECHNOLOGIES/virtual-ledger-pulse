

## Fix: Effective Purchase Rate in CSV Export

### Problem
The CSV export in `src/pages/Purchase.tsx` (lines 178-184) manually calculates the effective USDT rate using `market_rate_usdt`, `quantity`, and `total_amount`. This produces incorrect values for non-USDT coins because it doesn't match the normalized `effective_usdt_rate` that is stored on the purchase order record (computed at order time by the Effective USDT Engine and locked via price snapshot).

### Root Cause
```typescript
// Current (WRONG) — recalculates at export time
let effectivePriceUsdt = pricePerUnit;
if (assetType !== 'USDT' && marketRate > 0 && quantity > 0) {
  const totalAmountInr = order.total_amount || 0;
  const usdtEquivQty = quantity * marketRate;
  effectivePriceUsdt = usdtEquivQty > 0 ? totalAmountInr / usdtEquivQty : pricePerUnit;
}
```

### Fix
Use the stored `effective_usdt_rate` field from the purchase order record (already fetched via `select *`). Fall back to the manual calculation only if the field is null (for legacy orders).

### File to Modify
**`src/pages/Purchase.tsx`** — lines 178-184

Replace the manual calculation block with:
```typescript
// Use stored effective_usdt_rate (source of truth), fall back to manual calc for legacy orders
let effectivePriceUsdt = order.effective_usdt_rate 
  ? Number(order.effective_usdt_rate)
  : pricePerUnit;

if (!order.effective_usdt_rate && assetType !== 'USDT' && marketRate > 0 && quantity > 0) {
  const totalAmountInr = order.total_amount || 0;
  const usdtEquivQty = quantity * marketRate;
  effectivePriceUsdt = usdtEquivQty > 0 ? totalAmountInr / usdtEquivQty : pricePerUnit;
}
```

This ensures the CSV export shows the same effective purchase rate used in WAC/P&L calculations.

