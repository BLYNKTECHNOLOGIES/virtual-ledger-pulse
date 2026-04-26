I found the root cause, not just the visible symptom.

The Appeal tab currently treats Binance numeric status `7` as `APPEAL` in the shared UI mapper and the Appeal sync requests `orderStatusList: [7, 8]`. In this project’s actual data/API behavior, the same orders have authoritative history status `CANCELLED_BY_SYSTEM`, while `getUserOrderDetail` still returns numeric `7`. Because the Appeal tab trusted that stale/detail numeric code and later forced `order_status: 'APPEAL'` when opening chat, cancelled orders were incorrectly displayed as “Under Appeal”.

Database check confirmed this is not a single-order issue: active appeal cases currently include cancelled orders where `terminal_appeal_cases.binance_status = APPEAL` but `binance_order_history.order_status = CANCELLED_BY_SYSTEM`.

Plan to fix the integrity properly:

1. Stop hard-coding active appeal status in chat
   - Remove the `preserveOrderStatus` / forced `APPEAL` behavior for Appeal-tab chat.
   - When opening chat from Appeal tab, pass the authoritative resolved order status, not a synthetic appeal status.
   - If the order is cancelled/completed, the detail panel must show Cancelled/Completed exactly like the Orders tab.

2. Make Appeal tab status resolution authoritative
   - Add a local helper in `TerminalAppeals.tsx` that resolves each case status using this priority:
     1. `binance_order_history.order_status` when present and terminal
     2. `p2p_order_records.order_status` when present and terminal
     3. live Binance history/detail only as fallback
     4. `terminal_appeal_cases.binance_status` only if no stronger status exists
   - Active Appeal view will include only records whose resolved status is truly appeal/dispute/requested and not terminal.
   - Cancelled/completed/expired cases will automatically appear only in Appeal History.

3. Repair existing bad appeal records in the database
   - Add a migration/RPC-level cleanup that updates existing active `terminal_appeal_cases` to:
     - `status = 'cancelled'` when authoritative order history says cancelled/system-cancelled/expired
     - `status = 'resolved'` when authoritative order history says completed
     - `binance_status = authoritative status`
   - Insert an appeal case event noting the automatic finalization source so the audit/history remains intact.
   - This will move the currently wrong active cases out of the active Appeal view without deleting history.

4. Harden `upsert_terminal_appeal_case`
   - Update the database function so future syncs cannot downgrade a terminal order back into `under_appeal` just because list/detail returns numeric `7`.
   - Before inserting/updating an appeal as `under_appeal`, it will check `binance_order_history` / `p2p_order_records`. If the authoritative status is terminal, it will store the case as history (`cancelled` or `resolved`) instead.

5. Fix the Appeal sync source logic
   - Stop blindly trusting `orderStatusList: [7, 8]` as “appeal”.
   - Cross-check every candidate returned from `listActiveOrders` against `binance_order_history` and/or `getOrderHistory` before upserting as active appeal.
   - If Binance detail returns `7` but history says `CANCELLED_BY_SYSTEM`, history wins.

6. Align status mapping and remove conflicting interpretations
   - Review and update the shared numeric status mapping so status `7` is not universally treated as `APPEAL` where this project’s actual C2C data uses it as cancelled/system-cancelled in detail responses.
   - Keep appeal detection based on explicit string statuses (`APPEAL`, `IN_APPEAL`, `DISPUTE`, `COMPLAINT`) or confirmed active-list/history evidence, not the stale detail code alone.

7. Overall logical flaw check
   - Audit related order status paths in:
     - `src/pages/terminal/TerminalAppeals.tsx`
     - `src/components/terminal/orders/OrderDetailWorkspace.tsx`
     - `src/components/terminal/orders/OrderSummaryPanel.tsx`
     - `src/lib/orderStatusMapper.ts`
     - terminal sync helpers that still maintain their own numeric maps
   - Consolidate or make explicit any remaining inconsistent status mappings so Orders tab, Appeal tab, chat workspace, and history all agree.

8. Verification
   - Run the build/type check.
   - Re-query the database for active appeal cases whose authoritative order history is terminal; expected result should be zero.
   - Confirm the example order `22881431966534434816` moves to Appeal History and opens as Cancelled, not Under Appeal.