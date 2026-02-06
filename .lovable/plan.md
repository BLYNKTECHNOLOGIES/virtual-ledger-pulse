
## Group Pending Settlements by Date within Each Payment Method

### Current State
Transactions within each payment method group are listed in a flat table without any date grouping. There is one "Select All" button per payment method that selects all transactions across all dates.

### Planned Changes

**File: `src/components/bams/payment-gateway/PendingSettlements.tsx`**

1. **Add date grouping logic** after the existing gateway grouping:
   - Within each `GatewayGroup`, sort sales by `order_date` descending (latest first)
   - Group them by date string (e.g., "2/6/2026", "2/5/2026") using `toLocaleDateString()`
   - Create a helper type `DateGroup = { date: string; sales: PendingSale[]; totalAmount: number }`

2. **Add per-date "Select All" functionality**:
   - New handler `handleSelectDateGroup(sales: PendingSale[])` that toggles all sales within a specific date group
   - Keep the existing gateway-level "Select All" which selects across all dates

3. **Restructure the table rendering** within each gateway card:
   - Instead of one flat table, render date sub-headers within the table body
   - Each date sub-header row will span all columns and include:
     - The formatted date (e.g., "6 Feb 2026")
     - Transaction count for that date
     - Subtotal amount for that date
     - A "Select All" checkbox for that date group
   - Transaction rows follow under their respective date header

### Visual Layout (per gateway card)

```text
+----------------------------------------------------------+
| UPI - pos.11375848@indus           ₹465,012  Select All  |
|----------------------------------------------------------|
| [Date Header] 6 Feb 2026 - 1 txn - ₹50,000  [] Select   |
|   [] | Order | Client | Amount | Bank | Actions          |
|   [] | 228.. | Shani  | 50,000 | VTX  | Settle Now       |
|----------------------------------------------------------|
| [Date Header] 5 Feb 2026 - 11 txn - ₹415,012 [] Select  |
|   [] | Order | Client | Amount | Bank | Actions          |
|   [] | 228.. | Parba  | 40,000 | VTX  | Settle Now       |
|   [] | OFS.. | RITIK  | 20,000 | VTX  | Settle Now       |
|   ...                                                    |
+----------------------------------------------------------+
```

### Technical Details

- Remove the "Date" column from individual rows since dates are now shown as group headers
- The date grouping is done client-side using a `useMemo` or inline grouping within the render
- Date sub-header rows use `TableRow` with a single `TableCell` using `colSpan={7}` containing a flex layout with date label, count, amount, and checkbox
- Gateway-level "Select All" remains unchanged and selects/deselects everything across all dates
- Per-date "Select All" only toggles transactions within that specific date
