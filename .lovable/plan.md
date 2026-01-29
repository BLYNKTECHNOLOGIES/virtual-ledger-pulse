
# Dual Buyer/Seller Client Management System

## Overview
This plan implements a comprehensive dual-role client management system where a single client can operate as both a buyer and seller, with separate approval workflows for each role, enhanced statistics on the client details page with period filtering, and automatic phone number auto-population in order forms.

## Current State Analysis
- Clients are currently classified as either buyers (with KYC documents) or sellers (without KYC documents)
- Separate approval tabs exist for buyers (`ClientOnboardingApprovals`) and sellers (`SellerOnboardingApprovals`)
- Client details page (`ClientDetail.tsx`) determines buyer/seller status based on `buying_purpose` or `client_type`
- Order forms (`CustomerAutocomplete`, `SupplierAutocomplete`) have partial phone auto-fill functionality
- No "All Time" option in date range picker presets

---

## Implementation Plan

### Phase 1: Database Schema Updates

**1.1 Add Role Tracking Columns to Clients Table**
Add new columns to track dual-role status:
- `is_buyer` (boolean, default false) - Set to true when client has completed at least one sales order
- `is_seller` (boolean, default false) - Set to true when client has completed at least one purchase order
- `buyer_approval_status` (text, default 'NOT_APPLICABLE') - PENDING_APPROVAL / APPROVED / REJECTED / NOT_APPLICABLE
- `seller_approval_status` (text, default 'NOT_APPLICABLE') - PENDING_APPROVAL / APPROVED / REJECTED / NOT_APPLICABLE
- `buyer_approved_at` (timestamp) - When buyer role was approved
- `seller_approved_at` (timestamp) - When seller role was approved

**1.2 Create Database Triggers**
Create triggers to automatically detect when a client needs approval for a new role:
- When a buyer completes their first purchase order, set `seller_approval_status` to 'PENDING_APPROVAL'
- When a seller completes their first sales order, set `buyer_approval_status` to 'PENDING_APPROVAL'

---

### Phase 2: Approval Flow Updates

**2.1 Update Buyer Approval Tab**
Modify `ClientOnboardingApprovals.tsx` to:
- Show both new buyers and existing sellers transitioning to buyer role
- Display a badge indicating "New Buyer" vs "Existing Seller - First Buy"
- Include purchase history summary for existing sellers

**2.2 Update Seller Approval Tab**
Modify `SellerOnboardingApprovals.tsx` to:
- Show both new sellers and existing buyers transitioning to seller role
- Display a badge indicating "New Seller" vs "Existing Buyer - First Sell"
- Include sales history summary for existing buyers

---

### Phase 3: Enhanced Client Details Page

**3.1 Create Composite Client Type Detection**
Update `ClientDetail.tsx` to:
- Determine client type dynamically: BUYER / SELLER / COMPOSITE (both)
- Fetch both sales_orders and purchase_orders for the client
- Show appropriate UI sections based on detected type

**3.2 Create New Dual Statistics Panel**
Create `ClientDualStatistics.tsx` component with:
- Period filter (using DateRangePicker) with All Time option
- **Buy Statistics Section:**
  - Total Buy Orders
  - Total Buy Volume (lifetime value)
  - Average Buy Order Value
  - First/Last Buy Date
- **Sell Statistics Section:**
  - Total Sell Orders
  - Total Sell Volume (lifetime value)
  - Average Sell Order Value
  - First/Last Sell Date
- **Combined Summary:**
  - Total Trade Volume (Buy + Sell)
  - Net Position indicator

**3.3 Update Existing Components**
- `ClientOverviewPanel.tsx`: Add composite type badge, show both buy/sell limits if applicable
- `ClientValueScore.tsx`: Calculate based on both buy and sell activity
- `OrderHistoryModule.tsx`: Add tabs for "Buy Orders" and "Sell Orders", fetch from both tables

**3.4 Add Period Filter with All Time Option**
Update `DateRangePicker.tsx` to include "All Time" as a visible preset button alongside existing options.

---

### Phase 4: Phone Number Auto-Population

**4.1 Update CustomerAutocomplete Component**
Modify `src/components/sales/CustomerAutocomplete.tsx` to:
- Accept `onPhoneChange` callback prop
- Auto-populate phone when client is selected
- Pass phone number back to parent form

**4.2 Update SupplierAutocomplete Component**
The component already has `onContactChange` - verify it's properly wired in all parent forms.

**4.3 Update All Sales Order Forms**
Update these components to use auto-populated phone:
- `StepBySalesFlow.tsx` - Already has some auto-fill, ensure complete coverage
- `EnhancedOrderCreationDialog.tsx` - Add client autocomplete with phone auto-fill
- `QuickSalesOrderDialog.tsx` - Add client autocomplete with phone auto-fill
- `SalesEntryDialog.tsx` - Add client autocomplete with phone auto-fill

**4.4 Update All Purchase Order Forms**
Verify these components properly use `onContactChange`:
- `NewPurchaseOrderDialog.tsx` - Already implemented
- `ManualPurchaseEntryDialog.tsx` - Already implemented, verify usage

---

## File Changes Summary

### New Files
1. `src/components/clients/ClientDualStatistics.tsx` - Comprehensive buy/sell statistics panel
2. `supabase/migrations/[timestamp]_add_client_dual_roles.sql` - Database migration

### Modified Files
1. `src/pages/ClientDetail.tsx` - Add composite type detection, include new statistics panel
2. `src/components/clients/ClientOverviewPanel.tsx` - Show composite type badge and dual stats
3. `src/components/clients/ClientValueScore.tsx` - Include sell activity in calculations
4. `src/components/clients/OrderHistoryModule.tsx` - Add buy/sell tabs, fetch purchase orders
5. `src/components/clients/ClientOnboardingApprovals.tsx` - Handle existing seller first-buy approvals
6. `src/components/clients/SellerOnboardingApprovals.tsx` - Handle existing buyer first-sell approvals
7. `src/components/sales/CustomerAutocomplete.tsx` - Add phone auto-population callback
8. `src/components/sales/EnhancedOrderCreationDialog.tsx` - Add customer autocomplete
9. `src/components/sales/QuickSalesOrderDialog.tsx` - Add customer autocomplete
10. `src/components/ui/date-range-picker.tsx` - Add visible "All Time" preset button

---

## Technical Details

### Composite Type Detection Logic
```text
1. Fetch sales_orders where client_name OR client_phone matches
2. Fetch purchase_orders where supplier_name OR contact_number matches
3. If sales_orders.length > 0 AND purchase_orders.length > 0 -> COMPOSITE
4. If sales_orders.length > 0 only -> BUYER
5. If purchase_orders.length > 0 only -> SELLER
```

### Approval Trigger Logic
```text
On new sales_order INSERT:
  IF client exists in clients table
  AND client.is_seller = true
  AND client.is_buyer = false:
    SET client.buyer_approval_status = 'PENDING_APPROVAL'

On new purchase_order INSERT:
  IF supplier exists in clients table
  AND client.is_buyer = true
  AND client.is_seller = false:
    SET client.seller_approval_status = 'PENDING_APPROVAL'
```

### Phone Auto-Population Flow
```text
1. User types client name in order form
2. Autocomplete shows matching clients
3. User selects a client
4. Phone number auto-fills into phone field
5. Phone field becomes read-only (or editable with warning)
6. On subsequent orders, same client selection = same phone auto-fill
```

---

## UI/UX Changes

### Client Details Page Layout (Composite Client)
```text
+------------------------------------------+
| Client Overview (COMPOSITE badge)        |
| - Shows both Buy and Sell stats inline   |
+------------------------------------------+
| Dual Statistics Panel                    |
| [Period Filter: Today | 7 Days | ... | All Time]
| +------------------+------------------+  |
| | BUY STATISTICS   | SELL STATISTICS  |  |
| | Orders: 15       | Orders: 8        |  |
| | Volume: ₹5L      | Volume: ₹3L      |  |
| | Avg: ₹33,333     | Avg: ₹37,500     |  |
| +------------------+------------------+  |
| Total Trade Volume: ₹8L                  |
+------------------------------------------+
| Order History                            |
| [Buy Orders] [Sell Orders] Tabs          |
+------------------------------------------+
```

### Client Directory Changes
Clients with COMPOSITE type will show a special badge indicating dual role.

---

## Testing Checklist
- New buyer first purchase triggers seller approval request
- Existing buyer first sale triggers buyer-to-seller approval request
- Existing seller first purchase triggers seller-to-buyer approval request
- Client details page shows correct stats for all three types
- Period filter correctly filters all statistics
- All Time shows lifetime data
- Phone auto-populates correctly in all order forms
- Phone doesn't need to be re-entered for returning clients
