# Counterparty details panel in the chat view

When an operator opens a chat, the wide empty area next to the messages will hold a
counterparty profile panel built entirely from data we already store (Binance order
history, saved nicknames/verified names, linked ERP client records).

## What the operator sees

A details column on the right of the chat (on phones it becomes a slide-over opened
from a "Details" button in the chat header), with four blocks:

1. **Identity**
   - Nickname (unmasked when we have it), verified name, BUY/SELL side, exchange
     account (Blynk / ASEC), first-order or repeat badge.

2. **Trade record with us**
   - Total orders, completed vs cancelled, appeal count.
   - Total traded volume and value, average order size.
   - First trade and last trade dates (IST).
   - Buy/sell split.

3. **Past orders**
   - Scrollable list: order number, date (IST), asset amount, ₹ value, status chip.
   - Clicking a row opens that order's chat/details, same as the inbox does today.
   - Loads in pages so long histories stay fast.

4. **Client link, KYC and behaviour**
   - Matched ERP client (if any) with risk level and buyer/seller approval status,
     plus a link through to the client page for users with permission.
   - Saved PAN/contact where present.
   - Behaviour signals derived from their order history: cancellation rate, typical
     order size, most-used payment method, and average time from order creation to
     completion. Each signal shows the number of orders it is based on; where the
     underlying timestamps are absent the signal is shown as "not available"
     rather than estimated.

Nothing is invented: if a value is not present in stored Binance data or ERP
records, the panel says so instead of guessing.

## Technical notes

- New read-only `SECURITY DEFINER` RPC `get_counterparty_profile(p_order_number,
  p_exchange_account_id)` that reuses the same self-account/counterparty resolution
  logic already proven in `get_counterparty_order_history` (so we never group by our
  own `takerUserNo` or by a masked nickname). It returns identity fields, aggregate
  trade stats, and behaviour aggregates in one call; the existing paged order-history
  RPC continues to feed the past-orders list.
- Grants: `authenticated` execute only; no new tables.
- New hook `useCounterpartyProfile.ts` (react-query, 60s stale time) plus reuse of
  `useCounterpartyLinkedClient` and `useCounterpartyChatHistory`.
- New component `src/components/terminal/orders/CounterpartyDetailsPanel.tsx`,
  rendered beside `ChatPanel` in `ChatThreadView.tsx` (full-screen inbox chat) and in
  the order page chat workspace, collapsed behind a Sheet under `lg`.
- Styling follows the existing Blynk terminal tokens used by the data-grid inbox rows;
  no new colours or fonts.
- Verification: run the new RPC against real counterparties and cross-check totals
  against raw `binance_order_history` rows, then typecheck/build before reporting done.
