# Mark small-trade chats read

Add a second action next to "Mark all read" in the Chats inbox: **Mark small trade chats read**. It clears only the low-value trade chatter so messages from big-value clients stay visible.

## What the operator sees

- In the inbox header, next to "Mark all read", a new button: `Mark small chats read` with a live count, e.g. `Mark small chats read (37)`.
- Hidden when the count is zero.
- Hovering it shows which bands are used, e.g. "Sell ₹1,000–₹50,000 · Buy ₹1,000–₹40,000" so nobody has to guess.
- After clicking: a toast confirming how many chats were cleared, and the badge/unread list updates immediately.

## Rules for what counts as "small"

1. A chat is small only if its order amount falls inside the configured small-order band for its side: sell orders use the Small Sales range, buy orders use the Small Buys range (both taken from the automation settings exactly as configured).
2. **A counterparty who has any non-small order in the inbox is never touched.** If a person has ten ₹5,000 trades and one ₹5,00,000 trade, their row stays unread. This protects repeat big clients.
3. Anything that cannot be proven small stays unread: enquiry threads with no order, missing or zero amount, missing side, or an order whose side has no configured band.
4. Only rows that are currently unread are acted on.
5. Account scoping is respected: each order is marked on its own exchange account (Blynk / ASEC), never with the wrong account's credentials.

## What happens on click

For each qualifying order number:
- local read state marked (instant badge update),
- shared read state written so every operator's inbox agrees, tagged with a distinct source so it is auditable as an automated bulk clear,
- Binance is told the order chat is read, per order, on that order's own account.

Failures on individual orders are collected, not fatal: the toast reports how many were cleared and how many could not be reached, and unreached ones stay unread so nothing is silently lost.

## Technical notes

- File: `src/components/terminal/orders/ChatInbox.tsx` — new memo `smallTradeOrders` computed from the pre-merge `conversations` list (per-order granularity), plus a new handler and header button. The merged rows are only used to enforce rule 2.
- New hook `src/hooks/useSmallTradeBands.ts` reading `small_sales_config` and `small_buys_config` (min/max), cached 60s. Same source the small-order automation uses, so the bands can never drift.
- Classification helper `src/lib/small-trade.ts`: `isSmallTradeOrder({ tradeType, totalPrice }, bands)` returning `true` only for an explicit SELL/BUY with a finite total price inside `[min, max]`. Shared so the auto-mark automation and this button can never disagree.
- Exclusion: build the set of counterparty identity keys (same key the inbox already uses for merging) that own at least one unread-or-not order failing `isSmallTradeOrder`; drop every order under those keys.
- Marking reuses the existing `mark_terminal_binance_chats_read` RPC with source `operator_small_trades`, and `markOrderMessagesRead` via `callBinanceAds(action, params, accountId)` scoped per order account. `INQ-*` threads are skipped for the Binance call (Binance rejects synthetic keys).
- Invalidates `terminal-chat-inbox`, `terminal-chat-inbox-unread`, `terminal-chat-seen-map` so the Orders page badge follows.
- No schema change; no Binance capability beyond the already-used documented mark-read endpoint.

## Verification

- Compute the candidate set against live inbox data and confirm every selected order's amount sits inside its band and no selected counterparty has a big order.
- Confirm counts before/after via the inbox RPC, and that a known big-value thread remains unread.
- Type check and build.
