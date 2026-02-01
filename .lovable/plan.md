
# Fix: Prevent State Revert When Providing TDS After Add to Bank

## Problem Analysis

The current bug occurs in this sequence:
1. Order is created (status: `new`)
2. Bank details are provided (status: `banking_collected`)  
3. Payer performs "Add to Bank" (status: `added_to_bank`, timer starts)
4. Payment Creator clicks "Provide TDS" button
5. **BUG**: CollectFieldsDialog sets `order_status: 'pan_collected'`, reverting the workflow

The root cause is in `CollectFieldsDialog.tsx` line 77:
```typescript
const updateData: Record<string, any> = { order_status: targetStatus };
```

When `targetStatus = 'pan_collected'` but the order is already at `added_to_bank`, the dialog blindly sets the status backwards.

---

## Solution

Implement a **state progression guard** in `CollectFieldsDialog.tsx` that:

1. Checks the current order status before updating
2. Only advances status forward, never backward
3. For PAN collection specifically: if order is already at/past `added_to_bank`, **preserve the current status** and only update TDS/PAN data fields

### Code Changes

**File: `src/components/purchase/CollectFieldsDialog.tsx`**

1. Import `STATUS_ORDER` from buy-order-types to compare status positions
2. In `handleSubmit`:
   - Get the current status position in the workflow
   - Get the target status position
   - Only include `order_status` in update if `targetPosition > currentPosition`
   - For TDS updates after Add to Bank: update only the data fields (pan_number, tds_applied, etc.)

---

## Technical Implementation

```typescript
// Before the update, determine if status should change
const currentPosition = STATUS_ORDER.indexOf(order.order_status as BuyOrderStatus);
const targetPosition = STATUS_ORDER.indexOf(targetStatus);

// Only include status if moving forward OR if not yet in the workflow
const shouldUpdateStatus = targetPosition > currentPosition || currentPosition === -1;

const updateData: Record<string, any> = {};

// CRITICAL: Only advance status, never revert
if (shouldUpdateStatus) {
  updateData.order_status = targetStatus;
}

// Continue with field updates (banking or pan data)...
```

---

## Verification Checklist

After this fix:
- Providing TDS before Add to Bank moves status to `pan_collected` (forward movement)
- Providing TDS after Add to Bank **keeps** status at `added_to_bank` (no revert)
- TDS/PAN data fields are always saved regardless of status change
- Add to Bank timer is unaffected by TDS updates
- Order can correctly progress to "Paid" once TDS is provided

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/purchase/CollectFieldsDialog.tsx` | Add state guard to prevent backward status transitions |

This is a surgical fix that does not alter role permissions, timer logic, or workflow order - it only prevents the specific bug of status regression when collecting PAN data after Add to Bank.
