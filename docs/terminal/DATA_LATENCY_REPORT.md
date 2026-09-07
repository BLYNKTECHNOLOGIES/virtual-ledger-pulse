# Terminal Data Freshness & Latency Report (full parameter sweep)

Generated 8 Sep 2026, 03:45 IST. All times IST. Values are read from the live code paths
(polling intervals, cron schedules, collector cadence) and, where marked **measured**, from
production data in the last 12 hours / 3 days.

Legend for "worst case": design delay of the slowest hop in the chain (server capture +
client refresh), not counting Binance-side delay or network outages.

---

## 1. Headline — what an operator actually feels

| Event | Chain | Typical | Worst case |
|---|---|---|---|
| Order placed on Binance → visible in Orders tab | collector 4.5s → cache → UI 30s | 10–20s | ~47s (measured) |
| Buyer marks paid → Payer queue reflects it | collector 4.5s → UI 5s (payer) / 30s (orders) | 5–15s | 35s |
| We release → order leaves active list | collector + UI | ≤35s | 35s |
| Completed order with full record | 5-min history cron | 1–5 min | 5.5 min |
| Dashboard / daily totals | history tables + 30s–5 min cache | 1–5 min | ~6 min |
| Incoming chat message | Lightsail socket → DB → Realtime | ~1s | **defective, see §6** |
| Outgoing chat message | edge fn → Binance, verified by history read | 1–3s | 5s |

---

## 2. Orders pipeline

| Parameter | Value | Where |
|---|---|---|
| Collector cron | every 1 min | `terminal-order-collector-1m` |
| Collector run budget | 52s per invocation (continuous cover) | `terminal-order-collector/index.ts` |
| Poll tick while orders active | 4.5s | `ACTIVE_TICK_MS` |
| Poll tick while idle / after failure | 12s | `IDLE_TICK_MS` |
| Active orders currently tracked | 120, 0 consecutive failures (measured) | `terminal_collector_state` |
| Accounts covered | 2 (Blynk, ASEC) | collector heartbeat |
| Active-orders UI poll | 30s (5s when collector is stale) | `useBinanceActions.tsx` |
| Active-orders stale window | 2s | `useBinanceActions.tsx` |
| Collector heartbeat poll (banner) | 15s, runs in background too | `useTerminalCollector.ts` |
| Staleness threshold for banner | 60s since last tick | `COLLECTOR_STALE_MS` |
| Order status detail poll | 20s | `useBinanceActions.tsx` |
| Order-detail cache | 60s | `useBinanceActions.tsx` |
| Order history sync cron | every 5 min | `terminal-order-history-sync-5m` |
| Order history UI cache | 25–60s, poll 30s | `TerminalOrders.tsx` |
| Long-tail history queries | cache 2 min, poll 3 min | `TerminalOrders.tsx` |
| Order search | client-side over loaded window | instant |
| Countdown timers (payment window) | recomputed every 1s | `OrderSummaryPanel.tsx` |
| SLA breach check | every 10 min | `terminal-sla-check` |
| Stale terminal data cleanup | every 15 min | `terminal-cleanup` |

## 3. Chat pipeline

| Parameter | Value |
|---|---|
| Server listener | persistent WebSocket per Binance account on Lightsail, 2 connected, 0 reconnects (measured) |
| Persistence | `binance_order_chat_messages`, idempotent on `(order_number, dedupe_key)` |
| Open-chat delivery | Supabase Realtime, filtered to the active order (~1s) |
| Open-chat safety poll | 5s visible, stale 3s |
| Browser socket role | receive-only (sending is server-owned; Binance allows one live session per account) |
| Browser socket reconnect backoff | capped at 10s; shared per-account socket, 15-min idle keepalive |
| Chat inbox refresh | 20s |
| Inbox history window | full history (no 7-day cut) |
| Legacy REST chat poll | 10s |
| Binance read-receipt reconcile | up to 8 unread threads every 90s |
| Counterparty prior-order history | one batched DB query, page size 5 orders |
| Outgoing send verification | send frame, then confirm exact content in chat history |
| Nickname capture cron | every 30 min |
| Name enrichment cron | hourly |

## 4. Money, assets and pricing

| Parameter | Refresh | Stale window |
|---|---|---|
| Binance spot/funding balances | 30s | 10s |
| Wallet / stock balances (ERP) | 30s | 10s |
| Asset movement list | — | 10s |
| Asset movement history (older) | — | 60s |
| Deposit/withdraw history | 15 min | 10 min |
| Pending asset movements | 20s | 8s |
| USDT reference rate | 60s | 30s |
| Spot index (INR) | — | 30s |
| Coin market rates (non-USDT) | 6h | 6h |
| Average cost (WAC) | 60s | 60s |
| Bank accounts (active) | 30s | 10s |
| Small-payments manager queue | 10s | 5s |
| Payer pending queue | 5s | 2s |
| Payer row / my assignments | 60s | 30s |
| Credit sub-ledgers | — | 60s |

## 5. Ads, automation and analytics

| Parameter | Refresh |
|---|---|
| Ad list (auto-refresh on) | 30s (off by default toggle) |
| Ad detail | on open, no cache |
| Ad price ranges | 60s poll, 15s stale |
| Ad payment methods | 10 min cache |
| Ad capacity limits | 60s stale |
| Ad rest timer | 30s |
| Ad zone map | 10 min |
| Auto-price engine | cron every 1 min |
| Auto-pay engine | cron every 1 min |
| Auto-reply engine | cron every 1 min |
| Auto-pricing rules / state | 30s poll, 10s stale |
| Automation status panel | 30s |
| Copilot settings | 60s; training cron hourly |
| Appeals board | 10–15s (list), 30s (enriched) |
| Appeals auto-sync | 90s |
| Analytics dashboard aggregates | 30s stale (live tiles), 5 min stale (heavy series) |
| MPI operator scoring snapshot | daily 06:00 IST |
| Terminal balance snapshot | daily 04:00 IST |
| Daily gross profit / asset value snapshot | daily 05:30 IST |
| Risk detection | daily 06:00 IST |
| Pricing effectiveness snapshot | daily 06:30 IST |
| Beneficiary capture | every 2 min |
| ERP action queue | 30s (plus a 2-min integrity check) |
| ERP entry feed / rejected feed | 30s / 60s |
| Reconciliation cockpit | 60s |
| Terminal notifications | 30s |
| Internal (staff) chat | 30s |
| Presence heartbeat | periodic heartbeat while the tab is open |
| Biometric session revalidation | periodic timer while unlocked |

## 6. Known defect — incoming chat is not real-time for most messages

Measured on 898 incoming messages, last 12h (Blynk account; ASEC received none):

| Bucket | Count |
|---|---|
| ≤2s | 251 |
| 2–5s | 13 |
| 5–30s | 67 |
| 30s–5m | 152 |
| 5–60m | 307 |
| >1h | 108 |

Only ~29% arrive through the live socket path; p50 is 229s. Active orders are just as slow
(p50 337s) as inactive ones (p50 209s), so this is not an "order closed" effect — the listener
is not receiving frames for a large share of threads and the DB only fills in when a history
sweep runs. Hourly "fast" ratio swings wildly (0/113 at 20:30 IST, 118/149 at 22:30 IST),
pointing at intermittent per-account session pre-emption rather than throughput.

Recommended (not yet done): tag each stored message with its source (socket vs sweep) and add a
short-interval unread-driven sweep for any order Binance reports as unread, dropping the worst
case from ~1h to ~30s.

## 7. Caveats

- Binance-side propagation is excluded; these numbers start at the moment Binance exposes the data.
- Background tabs pause most polls (`pollWhenVisible`); the collector heartbeat is the exception.
- Duplicate cron entries exist for some non-terminal jobs; they do not affect terminal freshness.
