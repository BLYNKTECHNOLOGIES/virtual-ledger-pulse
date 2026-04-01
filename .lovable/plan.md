

## Problem

The P&L and other ERP calculations need a standardized USDT-equivalent cost basis for **every** purchase and sales order, regardless of the actual asset (BTC, ETH, BNB, etc.). Currently, `market_rate_usdt` is stored but the derived USDT-equivalent quantity and rate are computed on-the-fly (and inconsistently). This leads to incorrect aggregate metrics.

## Solution

Add two new columns — `effective_usdt_qty` and `effective_usdt_rate` — to both `purchase_orders` and `sales_orders`. These are computed at entry time and stored permanently, making downstream P&L calculations simple lookups.

### Calculation formula

Given: `quantity` (asset qty), `total_amount` (INR), `market_rate_usdt` (asset/USDT price)

```text
effective_usdt_qty  = quantity × market_rate_usdt
effective_usdt_rate = total_amount / effective_usdt_qty   (INR per USDT-equivalent)
```

For USDT orders: `market_rate_usdt = 1`, so `effective_usdt_qty = quantity` and `effective_usdt_rate = total_amount / quantity` (which equals the INR unit price).

---

### Step 1: Database migration

Add columns to both tables:

```sql
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS effective_usdt_qty numeric,
  ADD COLUMN IF NOT EXISTS effective_usdt_rate numeric;

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS effective_usdt_qty numeric,
  ADD COLUMN IF NOT EXISTS effective_usdt_rate numeric;
```

Backfill existing data where `market_rate_usdt` is already stored:

```sql
UPDATE purchase_orders
SET effective_usdt_qty  = quantity * COALESCE(market_rate_usdt, 1),
    effective_usdt_rate = CASE
      WHEN quantity * COALESCE(market_rate_usdt, 1) > 0
      THEN total_amount / (quantity * COALESCE(market_rate_usdt, 1))
      ELSE NULL END
WHERE effective_usdt_qty IS NULL AND status = 'COMPLETED';

UPDATE sales_orders
SET effective_usdt_qty  = quantity * COALESCE(market_rate_usdt, 1),
    effective_usdt_rate = CASE
      WHEN quantity * COALESCE(market_rate_usdt, 1) > 0
      THEN total_amount / (quantity * COALESCE(market_rate_usdt,