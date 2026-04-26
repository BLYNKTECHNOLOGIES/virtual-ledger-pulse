Plan: Build Small Payments Manager as a post-payment exception workflow

Root-cause findings from the current system

- Payer work is currently optimized only for executing payment. Once a payer clicks Mark Paid, `terminal_payer_order_log` records `marked_paid` and `terminal_payer_order_locks` is immediately changed from `active` to `completed`.
- Because the lock is completed immediately after Mark Paid, the payer’s pending queue no longer keeps strong visibility on the order while the counterparty has not released crypto yet.
- The current “Completed” payer tab shows marked-paid orders, but it is not a task queue with SLA timers, exception tags, ownership, or follow-up responsibility.
- Alternate UPI requests already exist through `terminal_alternate_upi_requests`, but currently there are no rows in production and the workflow only highlights requests in Terminal Orders. It does not hand off the order into a dedicated manager queue.
- Binance/API-supported actions already available: get order detail, list active/history orders, mark paid, send/read Binance chat messages. There is no reliable API-supported “refund received” event from Binance; refund tracking must be an internal operational tag/status, while order completion/cancellation/appeal remains Binance-sourced.

Target operating flow

```text
Payer assignment queue
  -> payer copies payment details / pays
  -> Mark Paid
  -> order leaves payer payment queue
  -> Small Payments Manager queue starts SLA timer
  -> manager follows up in Binance chat / calls externally if needed
  -> tags issue: Awaiting Refund, Payment Not Received, Invalid UPI, Unresponsive, Appeal Risk, etc.
  -> Binance order completes/cancels/appeals
  -> manager queue auto-closes or moves to final state

Alt UPI path
  -> payer clicks Alt UPI before payment
  -> order vanishes from payer queue
  -> manager queue receives it as Invalid/Alternate UPI Needed
  -> manager asks counterparty for new UPI in chat
  -> manager records resolved UPI details
  -> order can return to payer queue or be marked manager-ready for payment, depending on the existing resolved-override behavior
```

What will be built

1. New Small Payments Manager permissions and navigation

- Add terminal permissions:
  - `terminal_small_payments_view`
  - `terminal_small_payments_manage`
- Add a new Terminal sidebar item: “Small Payments”.
- Add a new route/page: `/terminal/small-payments`.
- Add a new assignment manager tab under Terminal Users & Roles, similar to Payer Assignments.

2. Assignment system for Small Payments Managers

- Create a `terminal_small_payment_manager_assignments` table.
- Assignment types will mirror payer assignment patterns:
  - size range
  - Binance Ad ID
- The manager matching rule will use order total and ad ID, same as payer assignment logic, so dedicated managers can own different ranges.
- If multiple managers match the same order, assignment will choose the least-loaded active manager to avoid one person getting all exceptions.

3. Dedicated exception/work queue

Create a first-class table, tentatively `terminal_small_payment_cases`, to track post-payment and exception ownership.

Core fields:
- `order_number`
- `case_type`: `post_payment_followup`, `alternate_upi_needed`, `payment_not_received`, `awaiting_refund`, `invalid_upi`, `unresponsive_counterparty`, `appeal_risk`, `other`
- `status`: `open`, `waiting_counterparty`, `awaiting_refund`, `ready_to_repay`, `resolved`, `closed`, `cancelled`, `appeal`
- `payer_user_id` from the original payer log/lock
- `manager_user_id` assigned by range/ad logic
- `marked_paid_at` or `opened_at` for the SLA timer
- `last_checked_at`, `last_contacted_at`
- `priority`, `notes`, `tags`
- source pointers for audit: `created_from` = `marked_paid`, `alt_upi`, `manual_tag`, etc.

Important: this table will not replace Binance order status. Binance remains source of truth for order completion/cancellation/appeal. The case table only tracks internal operational follow-up.

4. Automatic case creation

- When payer clicks Mark Paid:
  - keep existing Binance Mark Paid action.
  - keep existing `terminal_payer_order_log` insert.
  - create or upsert a Small Payment case for that order.
  - start timer from the exact marked-paid timestamp.
  - assign to matching manager based on size range/ad ID.
- When payer clicks Alt UPI:
  - create/upsert an `alternate_upi_needed` Small Payment case.
  - order should disappear from the payer’s pending queue immediately.
  - assign it to the manager responsible for that order’s range/ad ID.
  - keep existing `terminal_alternate_upi_requests` audit row.

5. Fix payer visibility and timer behavior

- Payer pending queue should exclude orders with an open Small Payment case of `alternate_upi_needed` or similar manager-owned exception.
- Payer completed/post-paid tab will show an obvious elapsed timer for marked-paid orders until Binance finalizes the order.
- Timer styling:
  - normal: under 10 minutes
  - warning: 10–30 minutes
  - urgent: 30+ minutes
  - critical: long-running/unreleased orders
- The timer will be based on `marked_paid_at` from logs/cases, not UI state, so it survives refreshes and shift changes.

6. Small Payments Manager page

New page sections:
- Summary cards:
  - Open cases
  - Overdue cases
  - Awaiting refund
  - Alternate UPI needed
  - Unresponsive counterparties
  - Completed/closed today
- Filters:
  - My assigned / all if manager/admin
  - case type
  - tag/status
  - age bucket
  - size range/ad ID
  - search by order number/counterparty
- Main table:
  - timer prominently visible
  - order no, amount, asset, counterparty, payer, assigned manager
  - Binance status
  - case status/tag
  - last contact/check
  - actions

7. Case detail workspace

The manager will be able to open a case and see:
- Binance order details
- payment details / resolved alternate UPI if available
- original payer and marked-paid time
- Binance chat messages using existing chat APIs/hooks
- send chat message using existing `sendChatMessage`
- internal notes and status history
- action buttons:
  - Set tag/status: Awaiting Refund, Payment Not Received, Invalid UPI, Unresponsive, Alternate UPI Needed, Ready to Re-pay, Resolved
  - Mark contacted
  - Resolve alternate UPI with new details
  - Close case when Binance is completed/cancelled or when operationally resolved

8. Alternate UPI handoff behavior

- The existing Alt UPI button will be changed from “request and remain in payer workflow” to “request and handoff to Small Payments Manager”.
- Once manager resolves alternate UPI:
  - the payer can see the updated override payment details if the order is returned to payer payment queue.
  - the case status changes to `ready_to_repay` or `resolved`, depending on the existing Binance status.
- I will keep this API-compliant: the updated UPI is internal operational override only. Binance’s original payment method payload is not mutated unless Binance supports such an action, which it currently does not appear to.

9. Data integrity and audit

- Use idempotent inserts/upserts so repeated Mark Paid or Alt UPI clicks do not create duplicate cases.
- Add case event history table, e.g. `terminal_small_payment_case_events`, for:
  - created
  - assigned
  - tag changed
  - status changed
  - note added
  - contacted
  - resolved/closed
- Use actual user UUIDs for all audit columns.
- Do not use client-side localStorage for role/manager authorization.
- Add RLS policies aligned with terminal permissions; authenticated users can only act through permissions and assignment rules.

10. Binance status reconciliation

- The module will use Binance active/history data and existing `binance_order_history` to auto-detect final states.
- Cases should auto-show final state when Binance status becomes `COMPLETED`, `CANCELLED`, `EXPIRED`, `APPEAL`, or dispute-related status.
- Cases will not invent refund status from Binance. “Awaiting refund” will be an internal tag/status because refund-arrival evidence is outside currently confirmed Binance order APIs.

Technical implementation steps

1. Database migration
- Add terminal permissions.
- Create `terminal_small_payment_manager_assignments`.
- Create `terminal_small_payment_cases`.
- Create `terminal_small_payment_case_events`.
- Add indexes for order number, manager, payer, status, case type, marked-paid/opened timestamp, and active cases.
- Enable RLS and add policies consistent with terminal permission access.

2. Hooks and logic
- Add `useSmallPaymentsManager` hooks for assignments, cases, case updates, and event history.
- Extend payer logic in `usePayerModule.ts`:
  - create case on Mark Paid.
  - create case on Alt UPI.
  - exclude manager-owned Alt UPI/open exception cases from payer pending queue.
  - expose marked-paid timer metadata.

3. UI additions
- Add `TerminalSmallPayments.tsx` page.
- Add table row/card components for cases.
- Add case detail dialog/workspace with Binance chat integration.
- Add `SmallPaymentManagerAssignmentManager` under Users & Roles.
- Add route and sidebar entry.

4. Payer UI updates
- Add highly visible post-Mark-Paid elapsed timer in completed/paid rows.
- Change Alt UPI button behavior to show that the order is being handed off to Small Payments Manager.
- Add badges when an order has an open small-payment case.

5. Verification
- Confirm Mark Paid creates exactly one case per order.
- Confirm Alt UPI creates exactly one manager case and removes the order from payer pending view.
- Confirm manager assignments route cases by size range/ad ID.
- Confirm timers persist after refresh.
- Confirm completed/cancelled Binance statuses close or clearly finalize cases.
- Confirm users without manager permission cannot see or mutate manager cases.

Expected result

- Payers focus only on making payments, not long follow-up conversations.
- Every marked-paid order remains visible in a managed queue until Binance finalizes it.
- Invalid UPI and payment-not-received exceptions are immediately routed to the right team.
- Managers can tag, prioritize, chat, follow up, and audit every exception.
- No fake Binance data is created; Binance status remains authoritative and internal operational tags are clearly separated.