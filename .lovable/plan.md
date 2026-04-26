Plan to reflect the current order status in Small Payments Manager:

1. Display a dedicated Current Order Status badge
- Add a clear status badge in each Small Payments row, next to the existing case status.
- Keep the Small Payments case status separate from the Binance order status so operators can distinguish:
  - Case workflow status: Open / Awaiting Refund / etc.
  - Actual Binance order status: TRADING / BUYER_PAYED / COMPLETED / CANCELLED / APPEAL / etc.

2. Source the status from the authoritative local order records
- Update the Small Payments query to enrich each case from `p2p_order_records` and/or `binance_order_history` by order number.
- Prefer the freshest stored Binance/order status over the stale `terminal_small_payment_cases.binance_status` snapshot.
- Keep `terminal_small_payment_cases.binance_status` only as a fallback when no synced order record exists.

3. Keep statuses refreshed after sync
- When Small Payments data loads/refetches, use the latest synced status already persisted by the Orders/Payer sync flows.
- If the latest local order status differs from the case snapshot, optionally update the Small Payments case snapshot in the background so reassignment and detail views stay consistent.
- This avoids manual or dummy status entry; status remains derived from Binance-synced data only.

4. Reflect status in both row and Manage dialog
- Row view: show current status prominently under/near the order number or in the Case column.
- Manage dialog: add an `Order Status` field alongside amount, asset, counterparty, payer, and manager.
- The chat fallback object should also use this current status when opening the chat workspace.

Technical details
- File to update: `src/hooks/useSmallPaymentsManager.ts`
  - Extend `SmallPaymentCase` with an optional current status field, e.g. `current_order_status`.
  - After loading cases, fetch matching statuses from `p2p_order_records` and `binance_order_history`.
  - Merge status by order number using precedence:
    1. freshest `p2p_order_records.order_status` / synced record
    2. `binance_order_history.order_status`
    3. `terminal_small_payment_cases.binance_status`
- File to update: `src/pages/terminal/TerminalSmallPayments.tsx`
  - Render the current order status badge in the table and detail dialog.
  - Use the current status in `buildFallbackOrder`.
- Run TypeScript/build validation after changes.