
# Plan: Role-Based Purchase Functions with Shared Timer Visibility

## Overview

This plan implements a dual-function system for the Purchase terminal where users can have **Purchase Creator** and/or **Payer** functions enabled. These functions control visibility of certain actions and buzzer relevance, while ensuring **shared visibility for timers and terminal statuses**.

---

## Key Clarifications Applied

| Element | Purchase Creator | Payer | Combined |
|---------|-----------------|-------|----------|
| **Order Expiry Timer** | Visible | Visible | Visible |
| **Added to Bank Timer** | Visible | Visible | Visible |
| **Order Expired Status** | Visible | Visible | Visible |
| **Order Completed Status** | Visible | Visible | Visible |
| **Buzzers for these timers** | Role-specific | Role-specific | All |

---

## Phase 1: User Management Integration

### 1.1 Update Type Definitions

**File: `src/types/auth.ts`**

Add purchase function flags to the `DatabaseUser` interface:

```typescript
export interface DatabaseUser {
  // ... existing fields
  is_purchase_creator?: boolean;
  is_payer?: boolean;
}
```

### 1.2 Update EditUserDialog

**File: `src/components/user-management/EditUserDialog.tsx`**

Add a "Purchase Functions" section with two checkboxes:
- **Purchase Creator** - Creates orders, collects TDS/payment details
- **Payer** - Handles bank addition and payment actions

Include helper text explaining each function's responsibilities.

### 1.3 Update useUsers Hook

**File: `src/hooks/useUsers.tsx`**

- Fetch `is_purchase_creator` and `is_payer` in user queries
- Include these fields in the `updateUser` mutation

---

## Phase 2: Create Purchase Function Hook

### 2.1 New Hook: usePurchaseFunctions

**File: `src/hooks/usePurchaseFunctions.tsx` (New)**

This hook fetches the current user's purchase function flags from the database:

```typescript
interface PurchaseFunctionContext {
  isPurchaseCreator: boolean;
  isPayer: boolean;
  isCombined: boolean;  // Both enabled = use existing workflow unchanged
  isLoading: boolean;
  
  // Action visibility helpers
  canCreateOrders: boolean;           // Creator only
  canCollectBanking: boolean;         // Combined only (neither role alone)
  canAddToBank: boolean;              // Payer or Combined
  canRecordPayment: boolean;          // Payer or Combined
  
  // Buzzer relevance helper
  isAlertRelevant: (alertType: AlertType, orderStatus: string) => boolean;
}
```

**Logic:**
- If both functions enabled (`isCombined`): all current behavior applies unchanged
- If only Creator: restricted actions, specific buzzer rules
- If only Payer: different restricted actions, different buzzer rules
- Fetches from `users` table using current user's ID

---

## Phase 3: Role-Based Buzzer System

### 3.1 Extended Alert Types

**File: `src/hooks/use-order-alerts.ts`**

Add new alert types for role-specific notifications:

```typescript
export type AlertType = 
  | 'new_order' 
  | 'info_update' 
  | 'payment_timer' 
  | 'order_timer'
  | 'review_message'      // Payer sent review to Creator
  | 'banking_collected'   // Payer-relevant
  | 'payment_done';       // Creator-relevant (subtle)
```

### 3.2 Buzzer Intensity Control

Add intensity parameter to control sound behavior:

```typescript
type BuzzerIntensity = 'single' | 'continuous' | 'interval';

interface TriggerOptions {
  intensity: BuzzerIntensity;
  intervalMs?: number;  // For interval mode (e.g., 10 seconds)
}
```

### 3.3 Complete Buzzer Relevance Matrix

| Event | Purchase Creator | Payer | Combined |
|-------|-----------------|-------|----------|
| Order Created | Not relevant | Single buzzer | Current |
| Banking Collected | Not relevant | Single buzzer | Current |
| PAN Collected | Not relevant | Not relevant | Current |
| Added to Bank (status change) | Not relevant | Not relevant | Current |
| Bank Timer 5 min | Not relevant | Single buzzer | Current |
| Bank Timer 2 min | Not relevant | Every 10 seconds | Current |
| Payment Done | Single (subtle) | Not relevant | Current |
| Order 5 min left | Single buzzer | Not relevant | Current |
| Order 2 min left | Continuous | Not relevant | Current |
| Order Expired | Not relevant | Single buzzer | Current |
| Order Cancelled | Not relevant | Single buzzer | Current |
| Review Submitted | Single buzzer | N/A (they submit) | N/A |

---

## Phase 4: UI Visibility Controls

### 4.1 Update BuyOrderCard

**File: `src/components/purchase/BuyOrderCard.tsx`**

Integrate `usePurchaseFunctions` hook and apply role-based visibility:

**Always Visible (Both Roles):**
- Order expiry timer display
- Added to bank timer display
- Order status (including Expired, Completed, Cancelled)
- Order details and amounts
- View Details button

**Purchase Creator View:**
- Can create orders
- Hide "Add to Bank" button
- Hide "Collect Banking Details" action
- Hide banking-related attended buttons/blinking
- Show "Review Pending" indicator when Payer submits review

**Payer View:**
- Cannot create orders
- Show "Waiting for bank details" when banking not collected
- Show "Add to Bank" when banking available
- Show "Record Payment" options
- Show "Review" button to send message to Creator

**Combined View:**
- Full current functionality unchanged

### 4.2 Action Button Visibility Logic

```typescript
// Pseudo-code for action visibility
const showAddToBankButton = canAddToBank && bankingCollected;
const showCollectBankingButton = canCollectBanking && !bankingCollected;
const showPaymentButton = canRecordPayment;
const showAttendedButton = isAlertRelevant(currentAlertType, orderStatus);
```

---

## Phase 5: Review System (Payer to Creator Communication)

### 5.1 New Component: ReviewDialog

**File: `src/components/purchase/ReviewDialog.tsx` (New)**

Dialog for Payer to send review messages:
- Text area for message input
- Submit button
- On submit: creates record in `purchase_order_reviews` table
- Triggers `review_message` alert for Purchase Creator

### 5.2 New Component: ReviewIndicator

**File: `src/components/purchase/ReviewIndicator.tsx` (New)**

Shows pending reviews for Purchase Creator:
- Badge showing unread review count
- Click to view review messages
- Mark as read functionality

### 5.3 Review Alert Integration

**File: `src/components/purchase/BuyOrderAlertWatcher.tsx`**

- Subscribe to `purchase_order_reviews` table for realtime updates
- When new review created: trigger `review_message` alert for Creators
- Filter reviews based on user's purchase function role

---

## Phase 6: Update Alert Watcher

### 6.1 Role-Filtered Alert Processing

**File: `src/components/purchase/BuyOrderAlertWatcher.tsx`**

- Import and use `usePurchaseFunctions` hook
- Before emitting any notification/buzzer, check `isAlertRelevant(alertType, orderStatus)`
- Apply intensity rules based on role (single vs continuous vs interval)

```typescript
// Pseudo-code for filtered alerts
orders.forEach((order) => {
  const alertState = needsAttention(order.id);
  if (!alertState?.needsAttention || !alertState.alertType) return;
  
  // Role-based filtering
  if (!isAlertRelevant(alertState.alertType, order.order_status)) return;
  
  // Proceed with notification...
});
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/types/auth.ts` | Edit | Add `is_purchase_creator` and `is_payer` fields |
| `src/hooks/usePurchaseFunctions.tsx` | Create | New hook for purchase role context |
| `src/hooks/useUsers.tsx` | Edit | Fetch/update purchase function fields |
| `src/hooks/use-order-alerts.ts` | Edit | Add new alert types, intensity control |
| `src/components/user-management/EditUserDialog.tsx` | Edit | Add Purchase Functions checkboxes |
| `src/components/purchase/BuyOrderCard.tsx` | Edit | Role-based visibility for actions |
| `src/components/purchase/BuyOrdersTab.tsx` | Edit | Pass role context, fetch reviews |
| `src/components/purchase/BuyOrderAlertWatcher.tsx` | Edit | Role-based alert filtering |
| `src/components/purchase/ReviewDialog.tsx` | Create | Payer review submission dialog |
| `src/components/purchase/ReviewIndicator.tsx` | Create | Creator review notification badge |
| `src/lib/alert-notifications.ts` | Edit | Add review notification type |

---

## Implementation Order

1. **Type definitions and database integration** - Add fields to types, update hooks
2. **usePurchaseFunctions hook** - Create role detection and helpers
3. **User Management UI** - Add checkboxes for assigning functions
4. **Alert system updates** - Add types, intensity control, filtering
5. **BuyOrderCard visibility** - Apply role-based rendering
6. **Review system** - Dialog, indicator, and realtime integration
7. **Testing** - End-to-end workflow validation for each role

---

## Technical Notes

- The "combined" mode (both functions enabled) bypasses all role-based restrictions to maintain backward compatibility
- Timers (order expiry and bank addition) are always visible to both roles - only buzzers are role-specific
- Terminal statuses (Completed, Cancelled, Expired) are visible to all roles
- The database columns `is_purchase_creator` and `is_payer` already exist with `boolean NOT NULL DEFAULT false`
- The `purchase_order_reviews` table exists with appropriate structure for the review system
- Buzzer intensity is controlled at the trigger level (single play vs interval vs continuous loop)
