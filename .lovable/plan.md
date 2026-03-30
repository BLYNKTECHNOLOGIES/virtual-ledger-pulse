

# P2-DI-03: Platforms Table — Full Consequence Analysis

## Current State

The `platforms` table has **0 rows** but is actively queried by two dialogs:

| Consumer | Location | Effect of Empty Table |
|----------|----------|----------------------|
| `SalesOrderDialog.tsx` | Sales module — creating new sales orders | **Platform dropdown is always empty** — users cannot select a platform |
| `OrderCompletionDialog.tsx` | KYC/Order completion flow | **Platform dropdown is always empty** — users cannot tag which platform an order was completed on |
| `invoicePdfGenerator.ts` | Invoice PDF generation | Reads platform from `sales_orders.platform` column — **not broken** (reads stored string, not the table) |

## What's Actually Happening in Production

Despite the empty `platforms` table, **1,327 sales orders already have platform values** stored as free-text strings:

| Platform Value | Orders |
|---------------|--------|
| `BINANCE BLYNK` | 1,224 |
| *(null/empty)* | 587 |
| `BINANCE` | 96 |
| `KUCOIN` | 4 |
| `Binance` | 2 |
| `BITGET` | 1 |

This means the platform dropdown **was functional at some point** (or values were inserted by another mechanism), but the lookup table was never seeded — so **currently users creating new sales orders cannot select a platform at all**.

## Consequences of NOT Seeding

1. **Sales workflow broken** — Every new sales order has `platform = null` because the dropdown has no options. 587 orders already have null platform (likely recent).
2. **Reporting gaps** — Any report filtering or grouping by platform misses ~44% of orders.
3. **Invoice PDFs show "N/A"** — The PDF generator falls back to "N/A" when platform is null.
4. **Data inconsistency** — Existing data has 5 different string variations (`BINANCE`, `Binance`, `BINANCE BLYNK`, `KUCOIN`, `BITGET`) with no normalization.

## Consequences of Seeding

1. **Dropdown works again** — Users can select platforms when creating sales orders.
2. **Data normalization opportunity** — Can standardize existing free-text values to match seeded platform names.

## Recommended Fix

**Seed the platforms table** with the platforms actually used in production data, then normalize existing order data.

### Step 1: Seed platforms table
Insert rows based on actual usage:
- `BINANCE` (covers "Binance", "BINANCE", "BINANCE BLYNK")
- `KUCOIN`
- `BITGET`

### Step 2: Normalize existing sales_orders.platform values
- `Binance` → `BINANCE`
- `BINANCE BLYNK` → `BINANCE` (or keep as-is if "BLYNK" is a meaningful sub-platform)

### Step 3: No schema changes needed
The `platforms` table schema is already correct (id, name, is_active, timestamps). The `sales_orders.platform` column stores the platform name as text — no FK relationship exists, so seeding just populates the dropdown.

**Decision needed from you:**
- Should `BINANCE BLYNK` remain as a separate platform or be normalized to `BINANCE`?
- Any other platforms to add (e.g., OKX, BYBIT)?

**Effort**: 5 minutes — 3 INSERT statements + 2 UPDATE statements.

