I found the root cause for the shown order `22881448455329239040`:

- `getOrderDetail` from Binance returns `orderStatus: 5`, which correctly means the order itself is `COMPLETED`.
- The same Binance detail response also returns appeal/complaint fields: `complaintStatus: 2`, `complaintReason: ...`, `canCancelComplaintOrder: true`, and chat logs include a `submit_appeal` system event.
- The current UI only passes the order status into the detail panel as the primary status, and the active appeal marker is not consistently preserved into the opened chat/detail workspace.
- A previous fix incorrectly tried to solve this by forcing or suppressing one status. That is flawed because order lifecycle and appeal/complaint lifecycle are two separate Binance states.

The correct behavior should be:

```text
Order lifecycle:   Completed / Cancelled / Pending / etc.
Appeal lifecycle:  Under Appeal / Resolved / Closed / etc.

If both are true:
Show both badges together, e.g.  Completed + Under Appeal
```

Plan to fix properly:

1. Centralize dual-status resolution
   - Add a small helper for appeal/complaint detection using Binance-supported fields:
     - `complaintStatus`
     - `complaintReason`
     - `isComplaintAllowed`
     - `canCancelComplaintOrder`
     - existing `terminal_appeal_cases.status`
   - Keep `orderStatus` mapping separate from complaint/appeal mapping.
   - Do not map numeric completed status `5` into appeal, and do not let `COMPLETED` erase an active appeal.

2. Fix the Appeal tab row data
   - For active appeal cases, display the order lifecycle status from authoritative records/live detail where available.
   - Also display the appeal status separately, so rows can show `Completed + Under Appeal` or `Cancelled + Under Appeal`.
   - Stop using `binance_status` as a mixed field for both concepts in visible UI.

3. Fix chat/detail opened from Appeal tab
   - When opening the order workspace from Appeal tab, pass:
     - `order_status`: actual order lifecycle status, e.g. `COMPLETED`
     - `appeal_status`: active appeal status, e.g. `Under Appeal`
   - Update `OrderDetailWorkspace` so live Binance detail can enhance, not overwrite, the active appeal marker.
   - Update `OrderSummaryPanel` to render both badges consistently when both states exist.

4. Fix active vs history logic
   - Active Appeal view should be controlled by the appeal case status (`under_appeal`, `checked_in`, etc.), not only by final order status.
   - Appeal History should only receive cases when the appeal case itself is resolved/closed/cancelled.
   - This matches your requirement: completed/cancelled orders can still remain in active Appeal view if their appeal is still open.

5. Add sync hardening for Binance APIs
   - During `Sync Binance Appeals`, use Binance appeal candidate list plus detail verification where needed.
   - If Binance detail shows a completed order with active complaint fields, keep it as active appeal and store/display both states.
   - If Binance detail/history shows no active complaint/appeal signal, then move the case to Appeal History only when the appeal is actually final.

6. Data integrity cleanup
   - Add a migration to preserve existing appeal cases while correcting status semantics:
     - keep active appeal records active when complaint/appeal evidence exists,
     - keep `binance_status`/order lifecycle as order status only,
     - log correction events in `terminal_appeal_case_events`.
   - Avoid deleting appeal records so history remains intact.

7. Verification
   - Recheck the specific order `22881448455329239040` after implementation.
   - Expected result:
     - Appeal tab row: `Completed` and `Under Appeal` visible together.
     - Opened chat/detail: Status section shows both `Completed` and `Under Appeal`.
     - Orders tab remains consistent and still shows completed order status.

Technical files expected to change:
- `src/lib/orderStatusMapper.ts`
- `src/pages/terminal/TerminalAppeals.tsx`
- `src/components/terminal/orders/OrderDetailWorkspace.tsx`
- `src/components/terminal/orders/OrderSummaryPanel.tsx`
- possibly `src/hooks/useP2PTerminal.tsx` for typed appeal metadata
- a Supabase migration for data cleanup / helper function updates