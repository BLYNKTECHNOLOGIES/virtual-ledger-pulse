
# Plan: Client Order Snapshot on Hover Preview

## Overview
Add a hover preview card to the client/supplier autocomplete dropdowns in Purchase and Sales dialogs. When hovering over a suggested client name, a compact snapshot of their recent order history will appear - helping users distinguish between similarly-named clients.

---

## Visual Design

### Current State (Without Hover)
```
+--------------------------------------------+
| [Client Name Input Field                 ] |
+--------------------------------------------+
| Rajesh Kumar                    [RK-1234] |
| Phone: 9876543210 | Type: HNI              |
+--------------------------------------------+
| Rajesh Kumar Singh              [RK-5678] |
| Phone: 9123456789 | Type: INDIVIDUAL       |
+--------------------------------------------+
```

### With Hover Preview (Proposed)
```
+--------------------------------------------+
| [Client Name Input Field                 ] |
+--------------------------------------------+
| Rajesh Kumar                    [RK-1234] | ← Hover here
| Phone: 9876543210 | Type: HNI              |
+--------------------------------------------+     +--------------------------------+
| Rajesh Kumar Singh              [RK-5678] |     | 📊 Order Snapshot              |
| Phone: 9123456789 | Type: INDIVIDUAL       |     +--------------------------------+
+--------------------------------------------+     | Rajesh Kumar (RK-1234)         |
                                                   | Member since: Jan 2024         |
                                                   +--------------------------------+
                                                   | RECENT ORDERS                  |
                                                   | ───────────────────────────    |
                                                   | Buy:  ₹12.5L (15 orders)       |
                                                   | Sell: ₹8.2L  (8 orders)        |
                                                   +--------------------------------+
                                                   | LAST 3 TRANSACTIONS            |
                                                   | • SO-241201 | ₹85,000 | 2 days |
                                                   | • PO-241128 | ₹1.2L   | 5 days |
                                                   | • SO-241125 | ₹45,000 | 8 days |
                                                   +--------------------------------+
                                                   | 🏷️ COMPOSITE CLIENT             |
                                                   +--------------------------------+
```

---

## Preview Card Content

### Section 1: Client Identity Header
- **Client Name** (bold)
- **Client ID** badge
- **Member Since**: Date of onboarding (e.g., "Jan 2024" or "45 days ago")
- **Client Type Badge**: HNI / INDIVIDUAL / BUSINESS
- **Composite Badge** (if client has both buy & sell orders)

### Section 2: Order Summary Statistics
| Metric | Display |
|--------|---------|
| Total Buy Value | ₹ amount with order count |
| Total Sell Value | ₹ amount with order count |
| Average Order Value | ₹ amount |
| Last Order Date | Relative time (e.g., "3 days ago") |

### Section 3: Last 3 Transactions (Most Recent)
Compact list showing:
- Order number (SO-XXXXXX / PO-XXXXXX)
- Amount (₹)
- Relative time
- Type badge (Buy/Sell)

---

## Technical Implementation

### 1. Create Reusable Preview Component

**New Component: `ClientOrderPreview.tsx`**

```typescript
interface ClientOrderPreviewProps {
  clientId: string;
  clientName: string;
  clientData?: {
    client_id: string;
    phone: string;
    date_of_onboarding: string;
    client_type: string;
  };
}
```

This component will:
- Accept client ID and fetch recent orders on demand
- Use `useQuery` with `enabled: false` initially, triggered on hover
- Display loading skeleton while fetching
- Cache results for subsequent hovers

### 2. Data Fetching Strategy

**Lazy Load on Hover**: Fetch order data only when user hovers (not on initial client list load)

```typescript
// Fetch last 5 orders combined (sales + purchase)
const { data: recentOrders, refetch } = useQuery({
  queryKey: ['client-preview-orders', clientId],
  queryFn: async () => {
    // Fetch sales orders (buy)
    const { data: salesOrders } = await supabase
      .from('sales_orders')
      .select('order_number, total_amount, order_date')
      .or(`client_name.eq.${name},client_phone.eq.${phone}`)
      .neq('status', 'CANCELLED')
      .order('order_date', { ascending: false })
      .limit(5);
    
    // Fetch purchase orders (sell)
    const { data: purchaseOrders } = await supabase
      .from('purchase_orders')
      .select('order_number, total_amount, order_date')
      .or(`supplier_name.eq.${name},contact_number.eq.${phone}`)
      .neq('status', 'CANCELLED')
      .order('order_date', { ascending: false })
      .limit(5);
    
    return { salesOrders, purchaseOrders };
  },
  enabled: false, // Manual trigger on hover
  staleTime: 60000, // Cache for 1 minute
});
```

### 3. Update Autocomplete Components

**Files to Modify:**
- `src/components/purchase/SupplierAutocomplete.tsx`
- `src/components/sales/CustomerAutocomplete.tsx`

**Changes:**
- Wrap each client suggestion row with `HoverCard` from Radix UI
- Trigger order preview fetch on `onOpenChange` of HoverCard
- Position preview card to the right side of dropdown

```typescript
<HoverCard openDelay={300} closeDelay={100}>
  <HoverCardTrigger asChild>
    <div className="px-3 py-2 hover:bg-gray-100 cursor-pointer">
      {/* Existing client row content */}
    </div>
  </HoverCardTrigger>
  <HoverCardContent side="right" align="start" className="w-80">
    <ClientOrderPreview 
      clientId={client.id}
      clientName={client.name}
      clientData={client}
    />
  </HoverCardContent>
</HoverCard>
```

---

## Component Structure

```
+-- ClientOrderPreview.tsx (NEW)
|   |-- Header: Name, ID, Member Since
|   |-- Stats Grid: Buy/Sell totals
|   |-- Recent Transactions List
|   |-- Client Type Badges
|
+-- SupplierAutocomplete.tsx (MODIFY)
|   |-- Wrap suggestions with HoverCard
|   |-- Import ClientOrderPreview
|
+-- CustomerAutocomplete.tsx (MODIFY)
    |-- Wrap suggestions with HoverCard
    |-- Import ClientOrderPreview
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/clients/ClientOrderPreview.tsx` | CREATE | New preview component showing order snapshot |
| `src/components/purchase/SupplierAutocomplete.tsx` | MODIFY | Add HoverCard wrapper around client suggestions |
| `src/components/sales/CustomerAutocomplete.tsx` | MODIFY | Add HoverCard wrapper around client suggestions |

---

## Performance Considerations

1. **Lazy Loading**: Orders fetched only on hover, not on dropdown open
2. **Debounced Hover**: 300ms delay before showing preview (prevents flash on quick scroll)
3. **Query Caching**: Results cached for 1 minute using React Query
4. **Limited Data**: Only fetch last 5 orders per type (not full history)
5. **Skeleton Loading**: Show loading state while fetching

---

## Summary

This feature adds an elegant hover preview that shows:
- Client identity confirmation (ID, type, tenure)
- Quick order statistics (total buy/sell values)
- Recent transaction list (last 3 orders)

This helps operators quickly distinguish between similarly-named clients (e.g., "Rajesh Kumar" vs "Rajesh Kumar Singh") by seeing their order history at a glance before selection.
