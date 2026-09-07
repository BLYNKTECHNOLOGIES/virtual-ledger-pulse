# Terminal Data Freshness Report — with plain-English meaning and your target column

Generated 8 Sep 2026, 03:46 IST. All times IST.

**How to use this file:** in the last column of every table, write the maximum delay you are
willing to accept for that item (for example `10s`, `1 min`, `real-time`). Leave blank the ones
you are happy with. Send it back and I will re-engineer only the rows you filled in.

---

## 1. Headline — what an operator actually feels

| What you see | What it means | Now | Your target max |
|---|---|---|---|
| Order appears in Orders tab | Time from the counterparty placing the order on Binance to the row showing on your screen | 10–20s, worst ~47s | |
| Buyer marks paid → Payer queue | Time from the buyer tapping "Transferred" to your payer team seeing it | 5–15s, worst 35s | |
| We release → order leaves active list | Time for a released order to disappear from the active list | ≤35s | |
| Completed order full record | Time until the finished order has all details (fees, final amounts, counterparty data) | 1–5 min, worst 5.5 min | |
| Dashboard / daily totals | How far behind reality today's volume, profit and counts are | 1–5 min, worst ~6 min | |
| Incoming chat message | Time from the counterparty sending a message to it appearing in your chat | ~1s when working — **currently broken, see §6** | |
| Outgoing chat message | Time from you pressing send to Binance confirming delivery | 1–3s | |

---

## 2. Orders pipeline

| Parameter | What it means | Now | Your target max |
|---|---|---|---|
| Collector cron | How often the server wakes up to start watching Binance orders | every 1 min | |
| Collector run budget | How long each wake-up keeps watching before the next one takes over (so cover is continuous) | 52s | |
| Poll tick — active | How often the server asks Binance for order changes while trades are running | 4.5s | |
| Poll tick — idle | Slower asking rate when nothing is active, to save Binance rate limits | 12s | |
| Active orders tracked | How many live orders the server is currently watching | 120 (measured) | |
| Accounts covered | Binance accounts being watched | 2 (Blynk, ASEC) | |
| Active-orders screen refresh | How often your browser re-reads the order list from our server | 30s (5s if server looks stale) | |
| Collector heartbeat check | How often the app verifies the server watcher is alive | 15s | |
| Stale warning threshold | How long without a heartbeat before you get the "data may be stale" banner | 60s | |
| Order status detail poll | How often a single opened order re-checks its own status | 20s | |
| Order-detail cache | How long an opened order's details are reused before re-fetching | 60s | |
| Order history sync | How often finished orders are pulled with full detail from Binance | every 5 min | |
| Order history screen refresh | How often the completed/cancelled list refreshes | 30s | |
| Long-tail history queries | Older/heavier history views refresh more slowly to stay fast | 3 min | |
| Order search | Searching within already-loaded orders | instant | |
| Payment countdown timer | The "time left to pay" clock ticking on screen | every 1s | |
| SLA breach check | How often the system flags orders that broke the response deadline | every 10 min | |
| Stale data cleanup | Housekeeping that removes dead terminal records | every 15 min | |

## 3. Chat pipeline

| Parameter | What it means | Now | Your target max |
|---|---|---|---|
| Server listener | A permanent connection on our AWS box that receives Binance chat as it happens | 1 socket per account, both connected | |
| Message storage | Messages are saved in our database so history loads instantly and never duplicates | idempotent | |
| Open-chat delivery | How a new message reaches an open chat window | push (~1s) | |
| Open-chat safety poll | Backup re-check in case the push is missed | 5s | |
| Browser socket role | Browsers only listen; sending goes through our server (Binance allows one live session per account) | receive-only | |
| Reconnect backoff | Longest wait before a dropped browser connection retries | 10s | |
| Chat inbox refresh | How often the conversation list updates unread counts and previews | 20s | |
| Inbox history depth | How far back the inbox looks for conversations | all history | |
| Binance read reconcile | How often we check if you already read a chat in the Binance app, so it stops showing unread here | 90s, 8 threads at a time | |
| Prior-order history load | Loading past conversations with the same counterparty | one batched query, 5 orders per page | |
| Send verification | After sending, we re-read Binance history to confirm the exact message landed | every send | |
| Nickname capture | Background job that stores counterparty nicknames permanently | every 30 min | |
| Name enrichment | Background job that fills in verified names | hourly | |

## 4. Money, assets and pricing

| Parameter | What it means | Now | Your target max |
|---|---|---|---|
| Binance balances | Spot and funding balances shown in Assets | 30s | |
| Wallet / stock balances | Our own ERP inventory figures | 30s | |
| Asset movement list | Recent deposits, withdrawals and transfers | 10s freshness | |
| Deposit/withdraw history | Older on-chain movement records | 15 min | |
| Pending movements | Transfers still awaiting confirmation | 20s | |
| USDT reference rate | The INR reference rate used across the terminal | 60s | |
| Spot index (INR) | Binance-derived index price used for pricing | 30s | |
| Other coin rates | Non-USDT market rates | 6 hours | |
| Average cost (WAC) | Weighted average buying cost used for profit maths | 60s | |
| Bank accounts | Balances/limits of your payment bank accounts | 30s | |
| Small-payments queue | Queue for small-value payment handling | 10s | |
| Payer pending queue | Orders waiting for your payer to send money | 5s | |
| Payer assignments | Which payer holds which order | 60s | |
| Credit sub-ledgers | Client credit balances | 60s | |

## 5. Ads, automation and analytics

| Parameter | What it means | Now | Your target max |
|---|---|---|---|
| Ad list auto-refresh | How often the Ads Manager list re-reads from Binance (toggle) | 30s | |
| Ad detail | Single ad's live data when opened | on open | |
| Ad price ranges | Competitor price band used for positioning | 60s | |
| Ad payment methods | Payment methods available on ads | 10 min | |
| Ad capacity limits | Per-ad exposure limits | 60s | |
| Ad rest timer | Cooldown timer between automated ad edits | 30s | |
| Auto-price engine | How often prices are recalculated and pushed to Binance | every 1 min | |
| Auto-pay engine | How often the system pays eligible buy orders automatically | every 1 min | |
| Auto-reply engine | How often automatic chat replies are evaluated | every 1 min | |
| Pricing rules/state | Rule status and engine state shown on screen | 30s | |
| Copilot | Suggestion settings refresh / model training | 60s / hourly | |
| Appeals board | Disputed orders list | 10–15s | |
| Appeals auto-sync | Background pull of appeal updates from Binance | 90s | |
| Analytics tiles | Live counters on the analytics page | 30s | |
| Analytics heavy charts | Long-range series that are expensive to compute | 5 min | |
| MPI operator scoring | Daily operator performance snapshot | daily 06:00 | |
| Terminal balance snapshot | Daily frozen balance record for audit | daily 04:00 | |
| Profit / asset snapshots | Daily profit and asset-value records | daily 05:30 | |
| Risk detection | Daily scan for suspicious counterparty patterns | daily 06:00 | |
| Pricing effectiveness | Daily review of how your pricing performed | daily 06:30 | |
| Beneficiary capture | Saving counterparty bank beneficiaries | every 2 min | |
| ERP action queue | Items waiting to be booked into the ERP | 30s | |
| ERP entry feed | Synced purchase/sale entries awaiting approval | 30s | |
| Reconciliation cockpit | Shift reconciliation figures | 60s | |
| Terminal notifications | Alert bell contents | 30s | |
| Internal staff chat | Team-to-team chat inside the terminal | 30s | |
| Presence heartbeat | Who is online on the terminal | continuous | |

## 6. Known defect — incoming chat is not real-time for most messages

Measured on 898 incoming messages in the last 12 hours:

| Arrived within | Count | Meaning |
|---|---|---|
| ≤2s | 251 | truly live |
| 2–5s | 13 | acceptable |
| 5–30s | 67 | noticeable lag |
| 30s–5m | 152 | customer thinks you ignored them |
| 5–60m | 307 | effectively missed |
| >1h | 108 | only appeared when history was swept |

Only ~29% arrive live; the middle message takes 229 seconds. This happens equally on active
orders, so it is not caused by closed orders — the always-on listener is missing frames and the
database only fills in later during history sweeps.

Fix available (not yet done): tag each message with how it arrived, and add a fast sweep for any
order Binance reports as unread — worst case would drop from about an hour to about 30 seconds.

| Item | Your target max |
|---|---|
| Incoming chat message worst case | |
| Incoming chat message typical | |

## 7. Caveats

- These timings start when Binance exposes the data; Binance's own delay is not included.
- Background browser tabs pause most refreshes to save resources; the server watcher never pauses.
- Faster refresh costs Binance rate limit, so very aggressive targets on many rows at once may
  force trade-offs — tell me your priorities and I will allocate the limit accordingly.
