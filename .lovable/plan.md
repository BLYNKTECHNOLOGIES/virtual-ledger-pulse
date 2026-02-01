# ✅ COMPLETED: Action Timing Storage for Purchase Workflow

## Implementation Summary

Created a timing storage system to capture precise timestamps for all significant purchase workflow actions. This enables future turnaround time analysis without any current analytics computation.

---

## Database Schema

**Table: `purchase_action_timings`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| order_id | uuid | FK to purchase_orders |
| action_type | text | Type of action recorded |
| actor_role | text | Role performing action (purchase_creator, payer, system) |
| actor_user_id | uuid | Optional FK to users |
| recorded_at | timestamptz | Server-side timestamp |
| created_at | timestamptz | Record creation time |

**Constraints:**
- `UNIQUE (order_id, action_type)` - Prevents duplicate timestamps
- `ON CONFLICT DO NOTHING` - Ensures immutability

---

## Action Types Tracked

| Action Type | Trigger Location | Actor Role |
|-------------|-----------------|------------|
| `order_created` | NewPurchaseOrderDialog | purchase_creator |
| `manual_entry_created` | ManualPurchaseEntryDialog | purchase_creator |
| `banking_collected` | CollectFieldsDialog | purchase_creator |
| `pan_collected` | CollectFieldsDialog | purchase_creator |
| `added_to_bank` | SetTimerDialog | payer |
| `payment_created` | RecordPaymentDialog | payer |
| `payment_completed` | RecordPaymentDialog | payer |
| `order_completed` | BuyOrdersTab | payer |
| `order_cancelled` | BuyOrdersTab | system |

---

## Helper Module

**File: `src/lib/purchase-action-timing.ts`**

```typescript
// Main function - idempotent, non-blocking
recordActionTiming(orderId, actionType, actorRole, actorUserId?)

// Batch recording
recordMultipleTimings(orderId, actions[])

// Query for debugging
getOrderTimings(orderId)
```

**Key Behaviors:**
- Uses `upsert` with `ignoreDuplicates: true` for immutability
- Silently fails to avoid blocking workflows
- Logs warnings for debugging

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/purchase-action-timing.ts` | NEW - Helper module |
| `src/components/purchase/CollectFieldsDialog.tsx` | Records banking_collected, pan_collected |
| `src/components/purchase/SetTimerDialog.tsx` | Records added_to_bank |
| `src/components/purchase/RecordPaymentDialog.tsx` | Records payment_created, payment_completed |
| `src/components/purchase/NewPurchaseOrderDialog.tsx` | Records order_created |
| `src/components/purchase/ManualPurchaseEntryDialog.tsx` | Records manual_entry_created, order_created |
| `src/components/purchase/BuyOrdersTab.tsx` | Records order_completed, order_cancelled |

---

## Data Integrity Guarantees

✅ **Immutable** - Once recorded, timestamps cannot be overwritten
✅ **Idempotent** - Multiple calls for same action are safe
✅ **Non-blocking** - Errors don't disrupt main workflows
✅ **Survives refresh** - Persisted to database immediately
✅ **No duplication** - Unique constraint prevents duplicates
