
# Updated Implementation Plan: Role-Based Purchase Functions

## Correction Applied

**Bank Timer 2 min (Payer)**: The buzzer plays **for 10 seconds only** - this is a single buzzer with a 10-second duration cutoff, NOT a repeating buzzer every 10 seconds.

---

## Updated Buzzer Relevance Matrix

| Event | Purchase Creator | Payer | Combined |
|-------|-----------------|-------|----------|
| Order Created | Not relevant | Single buzzer | Current |
| Banking Collected | Not relevant | Single buzzer | Current |
| PAN Collected | Not relevant | Not relevant | Current |
| Added to Bank | Not relevant | Not relevant | Current |
| Bank Timer 5 min | Not relevant | Single buzzer | Current |
| **Bank Timer 2 min** | Not relevant | **For 10 seconds only** | Current |
| Payment Done | Single (subtle) | Not relevant | Current |
| Order 5 min left | Single buzzer | Not relevant | Current |
| Order 2 min left | Continuous | Not relevant | Current |
| Order Expired | Not relevant | Single buzzer | Current |
| Order Cancelled | Not relevant | Single buzzer | Current |
| Review Submitted | Single buzzer | N/A | N/A |

---

## Buzzer Intensity Types

The implementation will support three buzzer intensity modes:

1. **Single** - Plays once, stops immediately after
2. **Continuous** - Repeats until attended (for Creator's Order 2 min alert)
3. **Duration-limited** - Plays for a specific duration then auto-stops (for Payer's Bank Timer 2 min - 10 seconds)

---

## Technical Implementation

### `src/hooks/usePurchaseFunctions.tsx`

The `getBuzzerIntensity()` function will return:

```typescript
type BuzzerIntensity = 
  | { type: 'single' }
  | { type: 'continuous' }
  | { type: 'duration'; durationMs: number };

// For Payer's Bank Timer 2 min:
{ type: 'duration', durationMs: 10000 } // 10 seconds
```

### Alert System Integration

When triggering the buzzer for Bank Timer 2 min (Payer role):
- Start the buzzer/alarm
- Set a timeout for 10 seconds
- After 10 seconds, automatically stop the buzzer
- Buzzer can also be stopped earlier if user clicks "Attended" or notification

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/types/auth.ts` | Edit | Add `is_purchase_creator` and `is_payer` fields |
| `src/hooks/usePurchaseFunctions.tsx` | Create | New hook with role context and buzzer intensity logic |
| `src/hooks/useUsers.tsx` | Edit | Fetch/update purchase function fields |
| `src/hooks/use-order-alerts.ts` | Edit | Add duration-limited buzzer support |
| `src/components/user-management/EditUserDialog.tsx` | Edit | Add Purchase Functions checkboxes |
| `src/components/purchase/BuyOrderCard.tsx` | Edit | Role-based visibility for actions |
| `src/components/purchase/BuyOrdersTab.tsx` | Edit | Pass role context |
| `src/components/purchase/BuyOrderAlertWatcher.tsx` | Edit | Role-based alert filtering with duration support |
| `src/components/purchase/ReviewDialog.tsx` | Create | Payer review submission dialog |
| `src/components/purchase/ReviewIndicator.tsx` | Create | Creator review notification badge |
| `src/lib/alert-notifications.ts` | Edit | Add review notification type |

---

## Timer & Status Visibility (Unchanged)

Both roles always see:
- Order expiry timer display
- Added to bank timer display  
- Order Expired status
- Order Completed status
- Order Cancelled status

Only the buzzers/attended buttons are role-specific.

---

## Implementation Order

1. Update `src/types/auth.ts` - Add type definitions
2. Create `src/hooks/usePurchaseFunctions.tsx` - Core hook with duration-limited buzzer support
3. Update `src/hooks/useUsers.tsx` - Fetch/update purchase functions
4. Update `src/components/user-management/EditUserDialog.tsx` - Add checkboxes
5. Update `src/hooks/use-order-alerts.ts` - Add alert types and duration-limited intensity
6. Update `src/lib/alert-notifications.ts` - Add alert details
7. Create `src/components/purchase/ReviewDialog.tsx` - Review submission
8. Create `src/components/purchase/ReviewIndicator.tsx` - Review display
9. Update `src/components/purchase/BuyOrderCard.tsx` - Role-based UI
10. Update `src/components/purchase/BuyOrdersTab.tsx` - Integration
11. Update `src/components/purchase/BuyOrderAlertWatcher.tsx` - Role-based alerts with auto-stop

---

## Technical Notes

- Combined mode (both functions enabled) bypasses all role-based restrictions for backward compatibility
- Timers are always visible to both roles - only buzzers are role-specific
- Terminal statuses (Completed, Cancelled, Expired) are visible to all roles
- Duration-limited buzzer uses `setTimeout` to auto-stop after 10 seconds
- User can still manually stop buzzer early via "Attended" or notification click
