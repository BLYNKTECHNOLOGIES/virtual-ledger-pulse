Plan to fix the Small Payments Manager workflow

1. Add a Chat action beside Manage
- In the Small Payments Manager table, add a compact Chat button/icon next to the existing Manage button for every order.
- Clicking Chat will open the same full order chat workspace pattern used on the Terminal Orders page, not the small embedded chat panel.
- The chat shortcut will stop row-click propagation so it does not accidentally open the Manage dialog.
- It will use the existing Binance chat component and existing `terminal_orders_chat` permission behavior where applicable.

2. Build a safe order object for Small Payments chat
- The Small Payments table currently stores only case/order summary fields, while `OrderDetailWorkspace` expects a `P2POrderRecord`-shaped object.
- The implementation will first look up the matching `p2p_order_records` row by `binance_order_number = case.order_number`.
- If a local order record exists, open the full `OrderDetailWorkspace` using that authoritative row.
- If not found, fall back to a minimal order object from the small-payment case fields so the Binance chat can still open by order number.
- This does not create fake Binance data; it only uses existing local order data plus Binance chat API calls already supported by the current proxy.

3. Preserve tags and case details when reassignment changes
- Root cause found: `upsert_terminal_small_payment_case` currently keeps the old manager forever via `manager_user_id = COALESCE(manager_user_id, v_manager)`. That means when assignment rules change and the same open order should reflect under a different manager, reassignment may not happen correctly.
- The fix will update the database function so reassignment changes only `manager_user_id` when the assignment resolver returns a different valid manager, while preserving:
  - `tags`
  - `notes`
  - `case_type` history behavior
  - status history
  - payer, marked-paid timestamp, amount, asset, counterparty, and Binance status details
  - event history
- Add an `assigned` event when the manager actually changes, with previous and new manager IDs, so the audit trail remains intact.

4. Keep the UI consistent after reassignment
- Ensure small-payment queries still fetch the same case row and hydrate the current manager/payer names.
- Invalidate/refetch small-payment case queries after status/event changes as already done.
- Keep the current RLS model: normal managers only see their own assigned cases unless they have small-payment manage/view permissions.

5. Verify
- Run TypeScript/build validation.
- Verify the Small Payments table shows Manage + Chat actions.
- Verify Chat opens the same order workspace behavior as Terminal Orders.
- Verify an existing open case retains its tags/details/events after manager reassignment and simply appears under the newly assigned manager.

Technical notes
- Main files to update:
  - `src/pages/terminal/TerminalSmallPayments.tsx`
  - possibly `src/hooks/useSmallPaymentsManager.ts`
  - a new Supabase migration replacing `public.upsert_terminal_small_payment_case`
- Existing APIs/components to reuse:
  - `OrderDetailWorkspace`
  - `ChatPanel`
  - `useBinanceChatMessages` / `sendChatMessage` through `binance-ads`
  - `p2p_order_records` as the local order source
- No manual Binance data creation will be added. Chat remains backed by the existing Binance chat API proxy.