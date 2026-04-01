

## Issue: `market_rate_usdt` is 1 on the corrected ETH order

The purchase order `469c0eef` (the ETH order we fixed from USDT) still has `market_rate_usdt = 1`. In the P&L "All Assets" calculation, this means:

- 0.255 ETH × 1 = **0.255 USDT-equivalent** (wrong)
- ₹50,000 INR / 0.255 USDT = **₹195,693 per USDT** contribution to weighted average

The other two ETH orders have `market_rate_usdt` of ~2100, which correctly converts:
- 0.255 ETH × 2100 = **535 USDT-equivalent**
- ₹50,000 / 535 = **₹93.46** per USDT contribution (reasonable)

This single corrupted rate is pulling the weighted average from ~₹97.19 up to ~₹98.83.

## Fix

Run a migration to correct the `market_rate_usdt` on this purchase order to the actual ETH/USDT rate at the time (~2020, derived from the order's INR price and prevailing USDT/INR rate):

```sql
UPDATE purchase_orders 
SET market_rate_usdt = 2020
WHERE id = '469c0eef-afa1-45fe-bdf2-d02cec8c92e9';
```

The value 2020 is derived from: `unit_price_inr / usdt_inr_rate` = `195,693 / 97.3 ≈ 2011`, rounded to align with the market ETH price on that date (other ETH orders show ~2100). We can use the average of the other two ETH orders' rates for accuracy: `(2103.41 + 2100.39) / 2 ≈ 2101.9`.

### Technical detail
- **Table**: `purchase_orders`
- **Column**: `market_rate_usdt` (stores the asset's USDT price at purchase time, used for multi-asset P&L conversion)
- **Affected logic**: `ProfitLoss.tsx` line 272 reads this value to convert non-USDT purchases into USDT-equivalent quantities

