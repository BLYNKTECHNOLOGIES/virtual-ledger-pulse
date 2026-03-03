

## Operator Assignment System — Plan

### Context
Currently, the terminal has a **Payer Assignment** system where payers are assigned orders by size range or ad ID. The request is to build an analogous **Operator Assignment** system so that operators can be assigned orders based on size ranges and ad IDs, with automatic load-balancing (least active orders) when multiple operators share a range.

### Database Changes

**New table: `terminal_operator_assignments`**
Mirrors `terminal_payer_assignments` but for operators:
- `id` (uuid, PK)
- `operator_user_id` (uuid, FK → users.id)
- `assignment_type` (text: 'size_range' | 'ad_id')
- `size_range_id` (uuid, nullable, FK → terminal_order_size_ranges.id)
- `ad_id` (text, nullable)
- `is_active` (boolean, default true)
- `assigned_by` (uuid, FK → users.id)
- `created_at` (timestamptz, default now())

RLS: Authenticated users can read; admin-only for insert/update/delete (using `has_role` or terminal admin check).

### Code Changes

1. **New hook: `useOperatorAssignments`** (in `src/hooks/useOperatorModule.ts`)
   - CRUD hooks mirroring `usePayerModule.ts` patterns: `useAllOperatorAssignments`, `useCreateOperatorAssignment`, `useToggleOperatorAssignment`, `useDeleteOperatorAssignment`.

2. **New UI: `OperatorAssignmentManager`** (in `src/components/terminal/users/OperatorAssignmentManager.tsx`)
   - Mirrors `PayerAssignmentManager.tsx` — table of assignments with create dialog.
   - Fetches operator-eligible users (those with `terminal_orders_view` permission).
   - Allows assigning by size range or ad ID.

3. **Add "Operator Assignments" tab** in `TerminalUsers.tsx`
   - New tab alongside existing Payer Assignments tab.

4. **Update order filtering in `TerminalOrders.tsx`**
   - Extend the `userSizeRanges` query to also fetch from `terminal_operator_assignments`.
   - Add ad ID–based filtering: if operator has ad_id assignments, only show orders from those ads.
   - When "My Orders" filter is active, show orders auto-assigned to the operator.

5. **Auto-assignment with load balancing**
   - When an order comes in, the existing `displayOrders` logic checks which operators have matching size range or ad ID assignments.
   - Among matching operators, the one with the fewest active orders gets the order auto-assigned (via `terminal_order_assignments`).
   - Integrate this into `useAutoAssignment.tsx` — add an `consider_operator_assignments` flag to the auto-assignment config.

### Workflow Summary

```text
Admin assigns operator → size range / ad ID
         ↓
Order arrives (e.g., ₹5000, ad 123)
         ↓
System checks: which operators are assigned range covering ₹5000 or ad 123?
         ↓
Multiple matches → pick operator with least active orders
         ↓
Auto-assign order → operator sees it in "My Orders"
```

### Suggested Additional Functionalities

Based on the business workflow:

1. **Operator Performance Dashboard** — Track each operator's average handling time, completion rate, and dispute rate per assigned range/ad, helping admins optimize assignments.

2. **Shift-Aware Auto-Assignment** — Only assign orders to operators currently in their active shift window, preventing assignments to off-duty operators.

3. **Capacity Limits per Assignment** — Allow setting a max concurrent order cap per operator per range (e.g., "Operator A handles max 5 orders in the ₹5K–₹50K range simultaneously").

4. **Escalation Rules** — If no operator with a matching assignment is available (all at capacity), auto-escalate to a supervisor or a fallback operator pool.

5. **Assignment Audit Trail** — Log every auto/manual assignment change with timestamps, enabling accountability and dispute resolution.

