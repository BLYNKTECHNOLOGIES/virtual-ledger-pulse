

# Implementation Plan: Auto-Create Clients from Purchase Orders with Approval Portal

## Overview
This plan implements a system where suppliers/sellers are automatically created as clients whenever a new purchase order is created. The system will auto-generate unique 6-digit client IDs, provide intelligent auto-complete for supplier names, prevent duplicate entries, and display new clients in a dedicated approval portal with order history summaries.

## Current State Analysis

### Existing Components
- **SupplierAutocomplete** (`src/components/purchase/SupplierAutocomplete.tsx`): Already provides basic autocomplete from the `clients` table
- **clients table**: Has `client_id` (text), `name`, `phone`, `email`, `client_type`, `kyc_status`, and other fields
- **purchase_orders table**: Has `supplier_name` field to store seller information
- **ClientOnboardingApprovals**: Existing approval portal for buyer clients (from sales orders)
- **ClientDashboard**: Shows Buyers and Sellers tabs with existing approval workflow

### Key Requirements
1. Auto-create client when new supplier name is entered in purchase orders
2. Generate random 6-digit client ID
3. Auto-recommend existing clients while typing (prevent duplicates)
4. Force selection from dropdown if name matches existing client
5. New clients appear in approval portal with PENDING status
6. Click on client shows order history summary

---

## Implementation Details

### Phase 1: Enhanced Supplier Autocomplete Component

**File: `src/components/purchase/SupplierAutocomplete.tsx`**

Update the existing component to:
- Show autocomplete suggestions as user types
- Highlight exact matches and prevent creating duplicate names
- Return client ID when existing client is selected
- Flag when a new client will be created

```text
New Behavior Flow:
┌─────────────────────────────────────────────────────┐
│  User types "John" in Supplier Name field           │
├─────────────────────────────────────────────────────┤
│  System queries clients table for matching names    │
│  Shows dropdown: "John Doe (CL123456)"              │
│                  "Johnny Smith (CL789012)"          │
├─────────────────────────────────────────────────────┤
│  If user types exact "John Doe":                    │
│  → Force selection from dropdown                    │
│  → Show warning: "Client exists, please select"     │
├─────────────────────────────────────────────────────┤
│  If user types "John Wayne" (new):                  │
│  → Show badge: "New client will be created"         │
│  → Allow submission                                 │
└─────────────────────────────────────────────────────┘
```

**Props Enhancement:**
- `onClientSelect(clientId: string, clientName: string)`: Called when existing client selected
- `onNewClient(name: string)`: Called when new client name is confirmed
- `selectedClientId`: Current selected client ID (if any)

### Phase 2: Client Auto-Creation Logic

**File: New utility function in purchase order creation**

When creating a purchase order with a new supplier name:

1. **Generate Client ID**: Create a random 6-digit alphanumeric ID
   - Format: 6 random characters (e.g., "7X9K2M")
   - Ensure uniqueness by checking against existing `client_id` values

2. **Create Client Record**:
   ```typescript
   {
     name: supplierName,
     client_id: generated6DigitId,
     client_type: 'SELLER', // Mark as seller type
     kyc_status: 'PENDING_APPROVAL', // New status for approval workflow
     date_of_onboarding: today,
     phone: contactNumber (if provided),
     // Other fields as null/defaults
   }
   ```

3. **Link to Purchase Order**: Store `client_id` reference in purchase order

**Files to Modify:**
- `src/components/purchase/NewPurchaseOrderDialog.tsx`
- `src/components/purchase/ManualPurchaseEntryDialog.tsx`

### Phase 3: New Seller Approval Portal

**File: `src/components/clients/SellerOnboardingApprovals.tsx`** (New)

Create a dedicated approval tab for newly created seller clients:

**UI Layout:**
- Tab in ClientDashboard: "New Seller Approvals"
- Table showing pending sellers with columns:
  - Seller Name
  - Generated Client ID
  - Contact Number
  - First Order Date
  - First Order Amount
  - Source (Manual Entry / Stock Import)
  - Status (PENDING_APPROVAL / APPROVED / REJECTED)
  - Actions (Review / Approve / Reject)

**Features:**
- Click on seller name opens Order Summary dialog
- Approve action changes `kyc_status` to 'VERIFIED'
- Reject action with reason field

### Phase 4: Client Order Summary Dialog

**File: `src/components/clients/ClientOrderSummaryDialog.tsx`** (New)

When clicking on a client in the approval portal:

**Summary Display:**
- Total number of purchase orders
- Total purchase value
- First order date
- Last order date
- Average order value

**Order List:**
- Table of all purchase orders for this seller
- Columns: Order Number, Date, Product, Quantity, Amount, Status
- Pagination for large datasets

### Phase 5: Database Considerations

**Status Values Enhancement:**
Add a new KYC status specifically for sellers:
- `PENDING_APPROVAL`: Newly auto-created, awaiting review
- `VERIFIED`: Approved by admin
- `REJECTED`: Rejected, cannot create new orders

**Query Enhancement:**
- Filter clients by `kyc_status = 'PENDING_APPROVAL'` for approval portal
- Filter by absence of KYC documents (pan_card_url, aadhar_front_url) to identify sellers

---

## File Changes Summary

### New Files
1. `src/components/clients/SellerOnboardingApprovals.tsx` - Approval portal for sellers
2. `src/components/clients/ClientOrderSummaryDialog.tsx` - Order history summary popup
3. `src/utils/clientIdGenerator.ts` - Utility for generating unique 6-digit IDs

### Modified Files
1. `src/components/purchase/SupplierAutocomplete.tsx` - Enhanced with strict matching and duplicate prevention
2. `src/components/purchase/NewPurchaseOrderDialog.tsx` - Auto-create client logic
3. `src/components/purchase/ManualPurchaseEntryDialog.tsx` - Auto-create client logic
4. `src/components/clients/ClientDashboard.tsx` - Add "New Seller Approvals" tab

---

## Technical Details

### 6-Digit Client ID Generation
```typescript
// Generate unique 6-character alphanumeric ID
const generateClientId = async () => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let clientId = '';
  let isUnique = false;
  
  while (!isUnique) {
    clientId = Array.from({ length: 6 }, () => 
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    
    // Check uniqueness in database
    const { data } = await supabase
      .from('clients')
      .select('id')
      .eq('client_id', clientId)
      .maybeSingle();
    
    isUnique = !data;
  }
  
  return clientId;
};
```

### Duplicate Name Prevention Logic
```typescript
// In SupplierAutocomplete
const handleInputChange = (value: string) => {
  const exactMatch = clients?.find(
    c => c.name.toLowerCase() === value.toLowerCase()
  );
  
  if (exactMatch) {
    setError('This client already exists. Please select from suggestions.');
    setMustSelectExisting(true);
  } else {
    setError(null);
    setMustSelectExisting(false);
  }
};
```

### Order Summary Query
```typescript
// Fetch all purchase orders for a seller
const { data: orders } = await supabase
  .from('purchase_orders')
  .select('*')
  .eq('supplier_name', clientName)
  .order('order_date', { ascending: false });

// Calculate summary
const summary = {
  totalOrders: orders.length,
  totalValue: orders.reduce((sum, o) => sum + o.total_amount, 0),
  firstOrder: orders[orders.length - 1]?.order_date,
  lastOrder: orders[0]?.order_date,
  averageValue: totalValue / orders.length
};
```

---

## User Experience Flow

```text
Purchase Order Creation:
────────────────────────

1. User opens "New Purchase Order" or "Manual Purchase Entry"
2. User starts typing supplier name
   ├── Existing matches appear in dropdown
   │   └── User selects → Contact auto-fills, client_id linked
   └── No exact match
       └── User enters new name
           ├── Badge shows: "New seller will be created"
           └── On submit: Client auto-created with 6-digit ID

Approval Portal:
────────────────

1. Admin navigates to Clients → New Seller Approvals
2. Sees table of newly created sellers with PENDING status
3. Clicks on seller name
   └── Order Summary dialog opens showing:
       ├── Client ID, Name, Contact
       ├── Order Statistics (count, total value, dates)
       └── Full order history table
4. Admin clicks Approve/Reject
   └── Status updates, seller becomes active/inactive
```

---

## Considerations

1. **Backward Compatibility**: Existing purchase orders without client linkage will continue to work
2. **Performance**: Client search uses debounced queries to avoid excessive API calls
3. **Data Integrity**: Client IDs are validated for uniqueness before creation
4. **User Feedback**: Clear visual indicators for new vs. existing clients

