

# Add Sort Functionality to Client Directory

## What's changing
A "Sort" dropdown will be added next to the Filter button in both Buyers and Sellers tabs. It will default to **Onboarded: Newest First** (matching the current database ordering by `created_at desc`).

## Sort Options
- **Onboarded: Newest First** (default)
- **Onboarded: Oldest First**
- **Name: A-Z**
- **Name: Z-A**
- **Orders: Most First**
- **Orders: Least First**
- **Last Order: Newest First**
- **Last Order: Oldest First**

## UI Placement
The sort dropdown will sit between the Filter button and the "Add New" button in both Buyers and Sellers sections, using the existing `Select` component with an `ArrowUpDown` icon.

## Technical Details

### File: `src/components/clients/ClientDashboard.tsx`

1. **Add imports**: `ArrowUpDown` from lucide-react; `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from UI components.

2. **Add state variables** (default: `onboarding` / `desc`):
   - `buyerSort` and `sellerSort` of type `string` with values like `"onboarding-desc"`, `"name-asc"`, `"orders-desc"`, `"lastOrder-desc"`, etc.
   - Using a single combined string avoids needing two state variables per tab.

3. **Add a sort helper function** that takes the filtered array, sort value, `clientOrderCounts` map, and `isBuyer` flag:
   - `name`: `localeCompare` on `client.name`
   - `orders`: numeric compare on `salesOrderCount` or `purchaseOrderCount`
   - `lastOrder`: date string compare on `lastSalesOrderDate` or `lastPurchaseOrderDate`
   - `onboarding`: date string compare on `client.date_of_onboarding` or `client.created_at`

4. **Update `filteredBuyers` and `filteredSellers` useMemo** to apply sorting after filtering. Add sort state to dependency arrays.

5. **Add `Select` dropdown** in both the Buyers toolbar (around line 346) and Sellers toolbar (around line 468) with the 8 sort options listed above.

