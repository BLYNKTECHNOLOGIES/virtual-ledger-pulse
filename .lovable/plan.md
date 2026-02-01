

# System-Wide Action Audit Logging & Transaction Activity Visibility

## Executive Summary

This plan implements a complete audit trail system that:
1. Records every human-initiated action with user ID and timestamp across all modules
2. Displays actor and timestamp details on closed transactions (completed, cancelled, expired)

---

## Part A: Universal Action Logging

### 1. Database Schema

#### 1.1 Create Central `system_action_logs` Table

A new table to capture all human-initiated actions across the platform:

```text
+---------------------------+--------------------------------------------+
| Column                    | Description                                |
+---------------------------+--------------------------------------------+
| id                        | UUID primary key                           |
| user_id                   | Actor's user ID (references users)         |
| action_type               | Controlled action type string              |
| entity_type               | Type of entity (purchase, sale, client...) |
| entity_id                 | UUID of the affected entity                |
| module                    | Module name (purchase, sales, stock...)    |
| recorded_at               | Server-side timestamp                      |
| metadata                  | Optional JSON for non-sensitive context    |
| created_at                | Record creation timestamp                  |
+---------------------------+--------------------------------------------+
```

**Key Constraints:**
- RLS policy: Allow all authenticated operations (matches existing patterns)
- Immutable: No UPDATE or DELETE policies
- Unique constraint on `(entity_id, action_type)` to prevent duplicates

#### 1.2 Defined Action Types

Organized by module:

**Purchase Module:**
- `purchase.order_created`
- `purchase.banking_collected`
- `purchase.pan_collected`
- `purchase.added_to_bank`
- `purchase.payment_recorded`
- `purchase.order_completed`
- `purchase.order_cancelled`
- `purchase.order_edited`

**Sales Module:**
- `sales.order_created`
- `sales.order_completed`
- `sales.order_cancelled`
- `sales.order_edited`
- `sales.manual_entry_created`

**Stock Module:**
- `stock.adjustment_created`
- `stock.transfer_created`
- `stock.wallet_adjusted`

**Clients Module:**
- `client.created`
- `client.updated`
- `client.kyc_approved`
- `client.kyc_rejected`
- `client.seller_approved`
- `client.buyer_approved`

**Banking (BAMS) Module:**
- `bank.transaction_created`
- `bank.transfer_completed`
- `bank.account_created`
- `bank.account_closed`

**User Management:**
- `user.created`
- `user.updated`
- `user.role_assigned`
- `user.password_reset`
- `user.status_changed`

**Other Modules:**
- `expense.created`
- `employee.onboarded`
- `employee.offboarded`

### 2. Logging Utility Module

Create `src/lib/system-action-logger.ts`:

```typescript
// Core function signature
export async function logAction(params: {
  userId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  module: string;
  metadata?: Record<string, any>;
}): Promise<void>
```

**Key Behaviors:**
- **Idempotent**: Uses `upsert` with `ignoreDuplicates: true` on `(entity_id, action_type)` to prevent duplicate logs
- **Non-blocking**: Errors are logged but don't throw, preventing disruption to main workflows
- **Server-side timestamp**: Uses `new Date().toISOString()` at time of execution
- **Automatic user resolution**: Gets current user from localStorage session

### 3. Integration Points by Module

#### 3.1 Purchase Module (12 files to modify)

| File | Actions to Log |
|------|----------------|
| `NewPurchaseOrderDialog.tsx` | `purchase.order_created` |
| `ManualPurchaseEntryDialog.tsx` | `purchase.order_created`, `purchase.manual_entry_created` |
| `CollectFieldsDialog.tsx` | `purchase.banking_collected`, `purchase.pan_collected` |
| `SetTimerDialog.tsx` | `purchase.added_to_bank` |
| `RecordPaymentDialog.tsx` | `purchase.payment_recorded` |
| `BuyOrdersTab.tsx` | `purchase.order_completed`, `purchase.order_cancelled` |
| `EditPurchaseOrderDialog.tsx` | `purchase.order_edited` |

#### 3.2 Sales Module (8 files to modify)

| File | Actions to Log |
|------|----------------|
| `SalesOrderDialog.tsx` | `sales.order_created` |
| `StepBySalesFlow.tsx` | `sales.order_created` |
| `SalesEntryDialog.tsx` | `sales.manual_entry_created` |
| `OrderCompletionForm.tsx` | `sales.order_completed` |
| `EditSalesOrderDialog.tsx` | `sales.order_edited` |
| `Sales.tsx` (page) | `sales.order_cancelled` |

#### 3.3 Stock Module (6 files to modify)

| File | Actions to Log |
|------|----------------|
| `StockTransactionsTab.tsx` | `stock.adjustment_created`, `stock.transfer_created` |
| `StockAdjustmentTab.tsx` | `stock.adjustment_created` |
| `ManualWalletAdjustmentDialog.tsx` | `stock.wallet_adjusted` |
| `EditWalletDialog.tsx` | `stock.wallet_edited` |
| `AddProductDialog.tsx` | `stock.product_created` |

#### 3.4 Client Module (5 files to modify)

| File | Actions to Log |
|------|----------------|
| `AddClientDialog.tsx` | `client.created` |
| `EditClientDetailsDialog.tsx` | `client.updated` |
| `ClientOnboardingApprovals.tsx` | `client.buyer_approved`, `client.buyer_rejected` |
| `SellerOnboardingApprovals.tsx` | `client.seller_approved`, `client.seller_rejected` |

#### 3.5 Banking/BAMS Module (5 files to modify)

| File | Actions to Log |
|------|----------------|
| `BankAccountManagement.tsx` | `bank.account_created` |
| `CloseAccountDialog.tsx` | `bank.account_closed` |
| `ExpensesIncomesTab.tsx` | `bank.transaction_created` |
| `ContraEntriesTab.tsx` | `bank.transfer_completed` |
| `ManualBalanceAdjustmentDialog.tsx` | `bank.balance_adjusted` |

#### 3.6 User Management Module (4 files to modify)

| File | Actions to Log |
|------|----------------|
| `AddUserDialog.tsx` | `user.created` |
| `EditUserDialog.tsx` | `user.updated`, `user.role_assigned` |
| `ResetPasswordDialog.tsx` | `user.password_reset` |
| `PendingRegistrationsTab.tsx` | `user.approved`, `user.rejected` |

---

## Part B: Activity Timeline Display on Closed Transactions

### 1. Create Reusable Activity Timeline Component

Create `src/components/ui/activity-timeline.tsx`:

```typescript
interface ActivityTimelineProps {
  entityId: string;
  entityType: string;
  showOnlyForStatuses?: string[];  // Only show for completed/cancelled/expired
}
```

**Features:**
- Fetches logs from `system_action_logs` for the given entity
- Displays in chronological order with actor name and timestamp
- Read-only, clearly labeled
- Human-readable action descriptions
- Collapsible section to avoid cluttering UI

### 2. Integration in Transaction Details Dialogs

#### 2.1 Purchase Module

**File: `PurchaseOrderDetailsDialog.tsx`**

Add Activity Timeline section showing:
- Order Created by [User] at [Timestamp]
- Banking Details Collected by [User] at [Timestamp]
- PAN/TDS Collected by [User] at [Timestamp]
- Added to Bank by [User] at [Timestamp]
- Payment Recorded by [User] at [Timestamp]
- Order Completed/Cancelled by [User] at [Timestamp]

#### 2.2 Sales Module

**File: `SalesOrderDetailsDialog.tsx`**

Add Activity Timeline section showing:
- Sale Created by [User] at [Timestamp]
- Order Completed by [User] at [Timestamp]

#### 2.3 Stock Module

**File: `StockTransactionsTab.tsx`**

For completed transactions, show:
- Transaction Created by [User] at [Timestamp]

### 3. Data Fetching Hook

Create `src/hooks/useActivityTimeline.ts`:

```typescript
export function useActivityTimeline(entityId: string, entityType: string) {
  // Fetches and returns formatted activity logs
  // Joins with users table to get actor names
  // Returns loading state and data
}
```

---

## Technical Details

### Database Migration

Create migration with:

1. `system_action_logs` table
2. RLS policies allowing:
   - SELECT for all authenticated users
   - INSERT for all authenticated users
   - No UPDATE or DELETE
3. Indexes on `entity_id`, `entity_type`, `user_id`

### Logging Helper Pattern

```typescript
// Example usage in a component
import { logAction } from '@/lib/system-action-logger';
import { useAuth } from '@/hooks/useAuth';

// After successful action
await logAction({
  userId: user?.id,
  actionType: 'purchase.order_created',
  entityType: 'purchase_order',
  entityId: newOrderId,
  module: 'purchase',
  metadata: { order_number: orderNumber }
});
```

### Activity Timeline Component

```typescript
// Compact timeline display
<ActivityTimeline 
  entityId={order.id}
  entityType="purchase_order"
  showOnlyForStatuses={['COMPLETED', 'CANCELLED']}
/>
```

---

## Files to Create

| Path | Description |
|------|-------------|
| `src/lib/system-action-logger.ts` | Central logging utility with `logAction()` function |
| `src/components/ui/activity-timeline.tsx` | Reusable timeline display component |
| `src/hooks/useActivityTimeline.ts` | Hook for fetching activity logs |
| Migration SQL file | Creates `system_action_logs` table |

---

## Files to Modify

### Purchase Module (7 files)
- `src/components/purchase/NewPurchaseOrderDialog.tsx`
- `src/components/purchase/ManualPurchaseEntryDialog.tsx`
- `src/components/purchase/CollectFieldsDialog.tsx`
- `src/components/purchase/SetTimerDialog.tsx`
- `src/components/purchase/RecordPaymentDialog.tsx`
- `src/components/purchase/BuyOrdersTab.tsx`
- `src/components/purchase/PurchaseOrderDetailsDialog.tsx`

### Sales Module (5 files)
- `src/components/sales/SalesOrderDialog.tsx`
- `src/components/sales/StepBySalesFlow.tsx`
- `src/components/sales/SalesEntryDialog.tsx`
- `src/components/sales/EditSalesOrderDialog.tsx`
- `src/components/sales/SalesOrderDetailsDialog.tsx`
- `src/pages/Sales.tsx`

### Stock Module (4 files)
- `src/components/stock/StockTransactionsTab.tsx`
- `src/components/stock/StockAdjustmentTab.tsx`
- `src/components/stock/ManualWalletAdjustmentDialog.tsx`
- `src/components/stock/AddProductDialog.tsx`

### Client Module (4 files)
- `src/components/clients/AddClientDialog.tsx`
- `src/components/clients/EditClientDetailsDialog.tsx`
- `src/components/clients/ClientOnboardingApprovals.tsx`
- `src/components/clients/SellerOnboardingApprovals.tsx`

### Banking/BAMS Module (5 files)
- `src/components/bams/BankAccountManagement.tsx`
- `src/components/bams/CloseAccountDialog.tsx`
- `src/components/bams/journal/ExpensesIncomesTab.tsx`
- `src/components/bams/journal/ContraEntriesTab.tsx`
- `src/components/bams/ManualBalanceAdjustmentDialog.tsx`

### User Management (4 files)
- `src/components/user-management/AddUserDialog.tsx`
- `src/components/user-management/EditUserDialog.tsx`
- `src/components/user-management/ResetPasswordDialog.tsx`
- `src/components/user-management/PendingRegistrationsTab.tsx`

---

## Implementation Order

1. **Phase 1: Database & Core Infrastructure**
   - Create migration for `system_action_logs` table
   - Create `system-action-logger.ts` utility

2. **Phase 2: Purchase Module** (Priority - Most complex)
   - Add logging to all purchase dialogs
   - Add Activity Timeline to PurchaseOrderDetailsDialog

3. **Phase 3: Sales Module**
   - Add logging to sales dialogs
   - Add Activity Timeline to SalesOrderDetailsDialog

4. **Phase 4: Stock Module**
   - Add logging to stock transactions

5. **Phase 5: Other Modules**
   - Clients, Banking, User Management

6. **Phase 6: Activity Timeline Component**
   - Create reusable component
   - Integrate into transaction detail views

---

## Rules Enforced

1. **No duplicate logs**: Unique constraint on `(entity_id, action_type)` with `ignoreDuplicates`
2. **No overwrites**: Logs are immutable once created
3. **No UI-triggered logs**: Only action execution creates logs
4. **Server-side timestamps**: Precise recording at execution time
5. **Non-blocking**: Logging failures don't disrupt main workflows
6. **No business logic changes**: Pure data capture and display

---

## Success Criteria

- Every human action has User ID and Timestamp recorded
- Every closed transaction shows who performed each major action and when
- Works consistently across all modules
- No behavioral changes introduced
- Data is future-analytics ready

