# Faster Terminal Orders + Chat: move the work to the server

## What happens today (verified in code)

- Every operator's browser calls Binance itself, over and over:
  - Active orders: one call every 5 seconds, **per open tab, per Binance account** (`useBinanceActions.tsx` `useBinanceActiveOrders`).
  - Order history sync into our database: every 5 minutes, again triggered from whichever browser has the Terminal open (`useBinanceOrderSync.tsx`).
  - Chat for the open order: a repeat fetch every 5-30 seconds on top of the live socket (`useBinanceChatWebSocket.ts`).
- The chat live connection is opened **by each browser** to the shared relay (`wss://relay.rewarnd.com`), which tunnels to Binance. When a tab is closed or reloaded, that chat connection dies and has to be rebuilt (credential fetch, socket handshake, history reload) — this is the main "slow to open a chat" cost.
- Nothing in Terminal uses Supabase Realtime today; freshness is 100% polling.

So with 6 operators open, Binance is hit ~6x for the same data, everyone pays first-load latency individually, and rate-limit headroom is burned on duplicates.

## The idea you described — is it feasible?

**Orders: yes, fully feasible and the biggest win.** One server-side collector fetches orders once for the whole company, writes them to our database, and every operator reads from our database instantly with live push updates. No Binance rules are broken — this is the normal, recommended pattern (fewer calls, not more).

**Chat: partly feasible.** Binance P2P chat *has no REST send endpoint* — a live socket is required, and a socket must be held by something that stays awake. Supabase edge functions are short-lived, so they cannot hold it. It must live on the existing always-on AWS relay host. That box is outside this repository, so this half is a two-part job: app-side work here, plus a small always-on service on the relay. If we cannot touch the relay host, we keep chat client-side but still make it feel much faster with warm pre-loading (Phase 3 below).

## Plan

### Phase 1 — Server-side order collector (no UI change, immediate speed win)
- New scheduled edge function `terminal-order-collector`, started every minute by cron. Each run stays awake up to ~55 seconds and polls Binance in a ~4-5 second loop, looping over every active Binance account — so operators see updates within about 5 seconds, not 20-30.
- Smart pacing: when an account has zero active orders or nothing changed (Binance lets us compare), the loop backs off to 10-15 s, so the ~17k calls/day-per-account ceiling at full speed only happens while real trading is happening; central retry + 429 backoff included.
- It fetches active orders + recent history through the same `binance-ads` proxy path and upserts into `p2p_order_records` / `binance_order_history` (existing tables, existing sync RPCs — no schema churn).
- Move the 5-minute browser-driven history sync into this cron as well, so it keeps running even with zero tabs open (today history goes stale overnight).

### Phase 2 — Browsers read our database, not Binance
- Terminal Orders switches its list to read `p2p_order_records` with Supabase Realtime subscribed to inserts/updates, replacing the 5-second Binance poll.
- Keep a manual "Refresh from Binance" button and a per-order live detail fetch for actions (accept/release/appeal) so a single order can always be re-checked against Binance directly.
- Keep the existing filters, jurisdiction scoping, assignment rules and multi-account tagging exactly as they are.
- Expected effect: order list opens in ~100-300 ms from our own database instead of waiting on a 1-4 s Binance round-trip, and Binance load drops from "per operator" to a constant.

### Phase 3 — Chat speed
- **3a (in this repo, safe):** pre-warm the chat. Cache credentials globally (already done for 25 min), open the socket when the Orders page loads instead of when a chat is clicked, and paint chat history instantly from `binance_order_chat_messages` while the socket catches up. Also stop the redundant REST poll while the socket is healthy. This alone removes most of the visible "chat is loading" delay.
- **3b (needs the AWS relay host):** one persistent server-side chat listener per Binance account that stays subscribed to all active order chats, writes every message straight into `binance_order_chat_messages`, and pushes it to operators over Supabase Realtime. Browsers then only send messages (via the existing edge-function send path) and never hold their own Binance socket.

### Phase 4 — Guardrails
- Collector writes a heartbeat row; the Terminal header shows a clear "data is stale / collector down" banner so nobody trades on frozen data.
- Central pacing + 429 backoff in the collector (today there is retry logic but no rate-limit-specific handling).

## Pros / cons

**Pros:** dramatically faster page and chat open; Binance call volume independent of how many people are logged in; data keeps flowing when no tab is open; chat history never lost on reload; one place to handle rate limits and errors.

**Cons:** one more moving part that can fail (mitigated by the staleness banner); order freshness becomes collector-interval-bound (20-30 s) unless the operator hits refresh or opens the order; Phase 3b requires work on the AWS relay host that is not in this codebase.

## Suggested order of work
Phase 1 → Phase 2 → Phase 3a first (all inside this project, no external dependency), then decide on 3b once you confirm we can deploy to the relay host.
