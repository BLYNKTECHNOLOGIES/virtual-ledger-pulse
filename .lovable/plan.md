# Terminal Data Freshness — Targets & Improvement Plan

All times IST. Measured values are from live production data (7–8 Sep 2026). Fill in your **Target max** for each row — only rows with a target will be worked on. Leave blank = acceptable as-is.

## 1. Orders

| # | Parameter | What it means | Current delay | Target max |
|---|-----------|---------------|---------------|------------|
| 1.1 | New order → Orders tab | Time from a buyer placing an order on Binance until it appears in your Terminal Orders list | 5–35s typical, ~47s worst | ______ |
| 1.2 | Buyer marks paid → Payer queue | Time from buyer clicking "Paid" until the order shows in the payment-verification queue | 5–35s | ______ |
| 1.3 | Release → order leaves active list | Time from releasing crypto until the order moves out of Active into history | ≤35s (active list); ≤5.5 min (full completed record) | ______ |
| 1.4 | Order status change → detail view | Any status change (appeal, cancel, etc.) reflected when you open the order | 5–35s | ______ |
| 1.5 | Order search freshness | How recent an order can be and still be found via search | Same as 1.1 | ______ |
| 1.6 | Order history sync (completed orders) | Completed/cancelled orders fully archived with detail data | Every 5 min (cron) | ______ |

## 2. Chat

| # | Parameter | What it means | Current delay | Target max |
|---|-----------|---------------|---------------|------------|
| 2.1 | Counterparty message → open chat | New message arrives while you have that chat open | ~1s via Realtime IF the listener captured it — but listener misses many frames (see 2.4) | ______ |
| 2.2 | Counterparty message → inbox preview/unread badge | Inbox list updates with new message preview and unread count | Up to 20s polling (when listener captures it) | ______ |
| 2.3 | Own message sent → visible in chat | Your sent message appears in the thread | Instant (optimistic) | ______ |
| 2.4 | **Listener frame capture rate (DEFECT)** | Share of incoming messages the always-on Lightsail listener actually captures live | Only ~29% within 5s; half took >4 min; 108 of 898 took >1 hour. Missing frames fill in later via history sync | ______ |
| 2.5 | Read on Binance app → reflected in Terminal | If you read a chat in the Binance app, the Terminal unread badge clears | Up to 90s background reconciliation (max 8 visible threads per cycle) | ______ |
| 2.6 | "Seen by" marker propagation | Another operator's seen-marker visible to you | Next inbox refresh (~20s) | ______ |
| 2.7 | Older chat history loading | Loading previous orders' messages when scrolling up | One DB query (fast since batching fix) | ______ |

## 3. Ads

| # | Parameter | What it means | Current delay | Target max |
|---|-----------|---------------|---------------|------------|
| 3.1 | Ad list refresh | Your ads' price/status/quantity as shown in Ads Manager | On page load / manual refresh | ______ |
| 3.2 | Ad price edit → live on Binance | Quick Edit price change pushed to Binance | Immediate API call; confirmation on next fetch | ______ |
| 3.3 | Auto-price engine tick | Automatic price adjustments following the index | Per engine schedule; circuit breaker after 5 failures, 10-min cooldown | ______ |

## 4. Wallet / Assets

| # | Parameter | What it means | Current delay | Target max |
|---|-----------|---------------|---------------|------------|
| 4.1 | Binance balance → Terminal asset view | USDT/other asset balances shown in Terminal | 10s–15 min depending on dataset | ______ |
| 4.2 | Deposit/withdrawal reflection | A Binance deposit appearing in asset views | Same as 4.1 | ______ |

## 5. Dashboard & Analytics

| # | Parameter | What it means | Current delay | Target max |
|---|-----------|---------------|---------------|------------|
| 5.1 | Dashboard daily totals | Today's volume/profit figures | Up to ~6 min behind (waits for 5-min history sync) | ______ |
| 5.2 | MPI performance scores | Operator performance metrics | Stale windows 30s–5 min | ______ |
| 5.3 | Real-time history merge | Terminal history merged view | Every 15s | ______ |

## 6. Background jobs (cron)

| # | Job | What it does | Schedule | Target max |
|---|-----|--------------|----------|------------|
| 6.1 | terminal-order-collector | Polls Binance for active orders (4.5s ticks, 52s per minute) | Every 1 min | ______ |
| 6.2 | terminal-order-history-sync | Archives completed orders + chat history | Every 5 min | ______ |
| 6.3 | terminal-sla-check | Checks orders breaching SLA timers | Every 10 min | ______ |
| 6.4 | chat-listener (Lightsail) | Always-on WebSocket capturing chat frames | Continuous | ______ |

## Root-cause note on chat (2.4)

The 4.5s polling collector is NOT the bottleneck for chat — the WebSocket listener is dropping/missing frames (order-scoped and inquiry frames). Fix options once you set a target:
- Harden listener frame parsing so no message type is discarded (orderless frames already handled via INQ- keys).
- Add a per-active-order chat history sweep (every N seconds) as a guaranteed backstop — caps worst case at that interval.
- Add listener health alerting when frame rate drops.

## How to proceed

1. You reply with target times for the rows you care about (e.g. "1.1: 10s, 2.1: 5s, 2.4: 30s worst case").
2. I implement per target: shorter poll intervals, more Realtime subscriptions, listener hardening, backstop sweeps.
3. Every change is verified with live DB/log measurements and reported in IST.
