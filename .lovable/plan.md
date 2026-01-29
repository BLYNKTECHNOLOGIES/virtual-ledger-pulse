
# Implementation Plan: Date-Based Period Calculations for PNL Dashboard

## Overview
This plan replaces the current FIFO-based profit calculation methodology with a simpler date-based period calculation. All statistics will be calculated based on the selected date period, making the P&L dashboard more intuitive and aligned with traditional accounting practices.

## Current State Analysis

### Current Implementation
- Uses FIFO (First-In-First-Out) methodology to match sales with purchases
- Calculates profit by matching each sale to the earliest corresponding purchase
- Complex logic that spans across different time periods (buys may be from previous periods)

### User Requirements
1. **Period-Based Calculations**: All calculations strictly within selected date range
2. **Average Purchase Rate** = Sum of Purchase Totals / Sum of Purchase Quantities (within period)
3. **Average Sales Rate** = Sum of Sales Totals / Sum of Sales Quantities (within period)
4. **Net Profit Margin (NPM)** = Average Sales Rate - Average Purchase Rate
5. **Gross Profit** = NPM × Total Sales Quantity (in period)
6. **Net Profit** = Gross Profit - Total Expenses + Total Income
7. **New Summary Widget**: Display Total Revenue, Total Expense, Total Income, Gross Profit, Net Profit

---

## Calculation Formula Summary

```text
For Selected Period (e.g., Jan 1 - Jan 15):
┌────────────────────────────────────────────────────────────────────┐
│ PURCHASES IN PERIOD:                                                │
│   Total Purchase Value = Σ (quantity × unit_price)                  │
│   Total Purchase Qty   = Σ (quantity)                               │
│   Avg Purchase Rate    = Total Purchase Value / Total Purchase Qty  │
├────────────────────────────────────────────────────────────────────┤
│ SALES IN PERIOD:                                                    │
│   Total Sales Value    = Σ (quantity × unit_price)                  │
│   Total Sales Qty      = Σ (quantity)                               │
│   Avg Sales Rate       = Total Sales Value / Total Sales Qty        │
├────────────────────────────────────────────────────────────────────┤
│ PROFIT CALCULATIONS:                                                │
│   NPM (per unit)       = Avg Sales Rate - Avg Purchase Rate         │
│   Gross Profit         = NPM × Total Sales Qty                      │
│   Net Profit           = Gross Profit - Expenses + Other Income     │
│   Profit Margin %      = (Net Profit / Total Revenue) × 100         │
└────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### Phase 1: Update Core Calculation Logic

**File: `src/pages/ProfitLoss.tsx`**

Replace the `calculateFIFOMatches` function with a new `calculatePeriodBasedMetrics` function:

```typescript
interface PeriodMetrics {
  // Purchase metrics
  totalPurchaseValue: number;
  totalPurchaseQty: number;
  avgPurchaseRate: number;
  
  // Sales metrics
  totalSalesValue: number;
  totalSalesQty: number;
  avgSalesRate: number;
  
  // Profit metrics
  npm: number;           // Per unit margin
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
  
  // Expense/Income
  totalExpenses: number;
  totalIncome: number;
}
```

**Key Changes:**
1. Remove FIFO matching logic entirely
2. Filter both purchases AND sales within the selected date range
3. Calculate averages using period data only
4. Derive profit from period averages

### Phase 2: Update Data Fetching

Modify the query to filter purchase orders within the date range (currently it fetches all purchases):

```typescript
// Fetch purchase orders within period
const { data: purchaseOrders } = await supabase
  .from('purchase_orders')
  .select(`
    id,
    order_date,
    total_amount,
    purchase_order_items(quantity, unit_price, total_price)
  `)
  .gte('order_date', startStr)
  .lte('order_date', endStr);
```

### Phase 3: Add Period Summary Widget

Create a new comprehensive summary card showing all key metrics in one place:

```text
┌─────────────────────────────────────────────────────────────────────┐
│  📊 Period Summary: Jan 1 - Jan 15, 2026                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Total Revenue        Total Expenses       Total Income             │
│  ₹5,00,000           ₹50,000              ₹10,000                   │
│                                                                      │
│  ─────────────────────────────────────────────────────────          │
│                                                                      │
│  Avg Purchase Rate    Avg Sales Rate       NPM (per unit)           │
│  ₹85.50              ₹87.25               ₹1.75                     │
│                                                                      │
│  ─────────────────────────────────────────────────────────          │
│                                                                      │
│  Gross Profit         Net Profit           Profit Margin            │
│  ₹8,750              ₹-31,250             -6.25%                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Phase 4: Update Trade Table Display

Simplify the trade table to show period-based data:
- Remove FIFO matching columns (Matched Order)
- Keep: Date, Asset, Type (Buy/Sell), Quantity, Rate, Total
- Add: Period contribution to average

### Phase 5: Update Formula Reference

Update the formula reference card to reflect new calculations:
- **Avg Purchase Rate** = Total Purchase Value ÷ Total Purchase Qty
- **Avg Sales Rate** = Total Sales Value ÷ Total Sales Qty  
- **NPM** = Avg Sales Rate - Avg Purchase Rate
- **Gross Profit** = NPM × Total Sales Qty
- **Net Profit** = Gross Profit - Expenses + Income

---

## UI Changes

### New Top Summary Cards Layout (6 cards instead of 5)

| Card | Value | Description |
|------|-------|-------------|
| Total Revenue | ₹X | Sum of all sales in period |
| Total Expenses | ₹X | Operational costs in period |
| Total Income | ₹X | Other income in period |
| Gross Profit | ₹X | Trading profit (NPM × Qty Sold) |
| Net Profit | ₹X | Gross - Expenses + Income |
| Profit Margin | X% | Net Profit / Revenue × 100 |

### New Period Averages Card

A dedicated card showing:
- **Purchases**: Total Qty, Total Value, Avg Rate
- **Sales**: Total Qty, Total Value, Avg Rate
- **NPM**: Per-unit margin with visual indicator

---

## Technical Implementation

### File Modified
- `src/pages/ProfitLoss.tsx`

### Changes Summary

1. **Remove** `calculateFIFOMatches` function
2. **Add** `calculatePeriodMetrics` function with date-filtered logic
3. **Update** purchase orders query to filter by date range
4. **Update** `ProfitLossData` interface to include new metrics:
   - `avgPurchaseRate`
   - `avgSalesRate`
   - `totalPurchaseQty`
   - `totalSalesQty`
   - `npmPerUnit`
5. **Add** Period Summary widget card
6. **Update** existing summary cards layout
7. **Update** Formula Reference card with new methodology

### Code Example: New Calculation Function

```typescript
const calculatePeriodMetrics = (
  purchaseItems: PurchaseItem[],
  salesItems: SalesItem[],
  expenses: number,
  income: number
): PeriodMetrics => {
  // Purchase calculations
  const totalPurchaseValue = purchaseItems.reduce(
    (sum, item) => sum + (item.quantity * item.unit_price), 0
  );
  const totalPurchaseQty = purchaseItems.reduce(
    (sum, item) => sum + item.quantity, 0
  );
  const avgPurchaseRate = totalPurchaseQty > 0 
    ? totalPurchaseValue / totalPurchaseQty : 0;
  
  // Sales calculations
  const totalSalesValue = salesItems.reduce(
    (sum, item) => sum + (item.quantity * item.unit_price), 0
  );
  const totalSalesQty = salesItems.reduce(
    (sum, item) => sum + item.quantity, 0
  );
  const avgSalesRate = totalSalesQty > 0 
    ? totalSalesValue / totalSalesQty : 0;
  
  // Profit calculations
  const npm = avgSalesRate - avgPurchaseRate;
  const grossProfit = npm * totalSalesQty;
  const netProfit = grossProfit - expenses + income;
  const profitMargin = totalSalesValue > 0 
    ? (netProfit / totalSalesValue) * 100 : 0;
  
  return {
    totalPurchaseValue,
    totalPurchaseQty,
    avgPurchaseRate,
    totalSalesValue,
    totalSalesQty,
    avgSalesRate,
    npm,
    grossProfit,
    netProfit,
    profitMargin,
    totalExpenses: expenses,
    totalIncome: income
  };
};
```

---

## Validation & Edge Cases

1. **No purchases in period**: Set avgPurchaseRate to 0, show warning
2. **No sales in period**: Set avgSalesRate to 0, grossProfit = 0
3. **Single day selected**: Works correctly with from = to date
4. **Large date ranges**: Query optimization with proper indexing
5. **Decimal precision**: All amounts display with 2 decimal places per project guidelines

---

## Summary of Deliverables

| Component | Change |
|-----------|--------|
| Calculation Logic | FIFO replaced with period-based averages |
| Purchase Query | Filtered by date range |
| Summary Cards | 6 cards with all key metrics |
| Period Averages Widget | New card showing purchase/sales averages |
| Trade Table | Simplified without FIFO matching |
| Formula Reference | Updated with new methodology |
