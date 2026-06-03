## Goal

Keep the Binance chat inbox clean by automatically marking **small SELL order** chats as read in the background, so big-buyer conversations remain visibly unread and easy to spot.

## Feasibility (Binance API validated)

Confirmed supported — no out-of-scope work:
- The `binance-ads` edge function already has a working `markOrderMessagesRead` action that proxies to `POST /sapi/v1/c2c/chat/markOrderMessagesAsRead`.
- Active orders (`listActiveOrders`) already return `tradeType`, `totalPrice`, `chatUnreadCount`, and `orderNumber`, polled every 5s via `useBinanceActiveOrders`.
- "Small" is defined by the existing `small_sales_config` `[min_amount, max_amount]` range — single source of truth, no new threshold.

History/concluded orders cannot be marked (Binance returns `chatUnreadCount: 0` for them), so the system targets **active SELL orders only** — which matches your workflow (mark before release).

## Scope decisions (from your answers)
- Run **continuously** while orders are active, **only** for the small-sales category (SELL within the configured range).
- **Reuse** `small_sales_config` range.
- Add a dedicated **settings toggle** (independent on/off).
- No big-buyer filtered view.

## What gets built

**1. Settings toggle (already migrated)**
- Added `auto_mark_chat_read` boolean (default `false`) to `small_sales_config`.
- Add a Switch in `src/components/terminal/automation/SmallSalesConfig.tsx` labelled "Auto-mark small sell chats as read", wired through the existing `updateConfig` mutation, with an action-log entry.

**2. Background hook** — `src/hooks/useAutoMarkSmallSalesRead.ts`
- Reuses the shared `useBinanceActiveOrders` 5s poll (no extra timer).
- Reads `small_sales_config`; runs only when `auto_mark_chat_read === true`.
- For each active order: keep only `tradeType === 'SELL'`, `totalPrice` within `[min, max]`, and `chatUnreadCount > 0`.
- Skips orders already marked (local `chat-read-state`) or with an in-flight request (a `useRef` Set guards against duplicate calls).
- Calls `callBinanceAds('markOrderMessagesRead', { orderNo })`; on success mirrors `markOrderChatRead(orderNo)` so the terminal inbox updates instantly.

**3. Mount point** — `src/components/terminal/TerminalPresenceAndAlerts.tsx`
- Add `useAutoMarkSmallSalesRead()` alongside the existing presence/alert hooks (invisible component, already rendered once in the terminal tree).

## Technical notes
- Big-buyer SELL chats and all BUY chats are never touched, so they stay unread/prominent.
- Read-state is also persisted to `localStorage` (`terminal-read-binance-order-chats`) and re-syncs across tabs via the existing custom event.
- Failures are logged and retried on the next poll (no toast spam).

## Out of scope
- Auto-release of coins (still requires explicit 2FA, unchanged).
- Marking concluded/history order chats (not supported by Binance API).
