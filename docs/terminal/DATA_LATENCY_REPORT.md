# Terminal Data Latency Report
Generated 8 Sep 2026, 03:35 IST. All times IST. Measured on live production data (last 12h / 3 days).

## 1. Summary table — how late each thing is

| Data the terminal shows | Path | Design delay | Measured |
|---|---|---|---|
| Incoming chat message (counterparty) | Lightsail listener socket → DB → Realtime → open chat | ~1s + 5s safety poll | p50 **229s**, only 29% within 5s (see §3 — defect) |
| Outgoing chat message | Browser → edge function → Binance, verified via history | 1–3s | verified send, no queueing |
| Chat inbox list (unread, previews) | DB RPC + Realtime, 20s fallback poll | ≤20s | matches design |
| New order appears in Orders tab | Server collector tick 4.5s (12s when idle) → cache → UI poll 30s | **5–35s**, worst 47s | collector heartbeat healthy, 120 active orders, 0 failures |
| Order status change (buyer marked paid) | same collector path | **5–35s** | same |
| Our "mark paid" action | direct Binance call, then optimistic UI | instant at Binance; our row re-confirms in 5–35s | — |
| Counterparty released (order completed) | collector 5–35s for status; final record via 5-min history cron | status 5–35s, **full record up to 5.5 min** | cron `terminal-order-history-sync-5m` active |
| Completed/cancelled order history list | 5-min cron + 30s UI staleness | **up to 5.5 min** | — |
| Payer pending queue | 5s poll | 5s | — |
| Appeals board | 10–30s poll | 10–30s | — |
| Assets / wallet balances | 20–30s poll | 20–30s | — |
| USDT reference rate | 60s poll | 60s | — |
| Dashboard daily totals / analytics | derived from history tables, 30s–5 min cache | **30s to 5.5 min behind Binance** | daily aggregates only settle after the 5-min history sync |
| Order search | client-side over loaded window → instant; inbox search is a DB query | instant / ≤20s | — |
| Ad prices (auto-price engine) | pg_cron every 1 min | ≤60s | — |
| Auto-pay / auto-reply engines | pg_cron every 1 min | ≤60s | — |
| SLA checks | every 10 min | ≤10 min | — |
| Counterparty nickname capture | every 30 min | ≤30 min | — |
| Name enrichment | hourly | ≤1h | — |
| MPI / operator scoring snapshot | daily 06:00 IST | 24h | — |

## 2. Effective end-to-end worst cases (what an operator feels)

- Order placed on Binance → visible in Orders tab: **typically 10–20s, worst ~47s**.
- Buyer marks paid → our Payer queue reflects it: **5–35s**.
- We release → order leaves active list: **≤35s**; appears in Completed with full detail **≤5.5 min**.
- Today's volume/profit numbers on the dashboard: **lag the last 5-minute history sync**, so up to ~6 minutes behind reality.

## 3. Defect found: chat capture is not real-time for most messages

Measured on 898 incoming messages in the last 12h (Blynk account; ASEC received none):

| bucket | count |
|---|---|
| ≤2s | 251 |
| 2–5s | 13 |
| 5–30s | 67 |
| 30s–5m | 152 |
| 5–60m | 307 |
| >1h | 108 |

Only ~29% arrive through the live socket path. The rest land later through history sweeps.
Delay is not explained by the order being inactive — messages on *currently active* orders are just
as slow (p50 337s) as messages on inactive ones (p50 209s), so the listener socket is not receiving
the frames for a large share of conversations, and the DB only gets them when a sweep pulls chat
history for that order.

Hourly "fast" ratio is also unstable (e.g. 0/113 at 20:30 IST, 118/149 at 22:30 IST), which points at
the listener's per-account session being intermittently pre-empted / not covering all threads rather
than at throughput limits.

Recommended next step (not yet done): make the listener log per-message source (socket vs sweep) and
add a short-interval unread-driven sweep for any order with a Binance-reported unread count, so the
worst case drops from ~1h to ~30s.
