# Roadmap — Terminal speed: server-side order collector + faster chat

- [x] Phase 1: `terminal-order-collector` edge function (5s internal loop, cron-started each minute) + `terminal_active_orders_cache` + `terminal_collector_state` tables + Realtime
- [x] Phase 1b: 5-min server cron for order-history sync (`syncTerminalOrdersForErp` scheduler-secret support in `binance-ads`); client auto-sync skips Binance refetch when server data is fresh (ERP chains still run)
- [x] Phase 2: `useBinanceActiveOrders` reads DB cache + Realtime, live Binance fallback when collector stale; manual refresh triggers collector tick
- [x] Phase 3a: archived-history instant paint with Realtime updates; browser credential/socket prewarm removed after server listener became the sole Binance session owner
- [x] Phase 4: staleness banner on Orders page from collector heartbeat
- [x] Verify: tsgo clean, cron job_run_details all succeeded (collector 1m + history 5m), cache 40 rows fresh, heartbeat ok
- [x] STATE_LOG entry appended (IST)
- [x] Phase 3b persistent server-side chat listener on AWS relay host
- [x] Install corrected idempotent listener build on Lightsail; checksum/syntax passed, both sockets stable, new messages saved, heartbeat `connected: 2` / `reconnects: 0`, and zero duplicate groups verified
- [x] Terminal freshness/chat latency: server-only Binance socket ownership, rotating one-minute reconciliation, Realtime/update and mobile-resume refresh
- [x] Add lazy loading to approval and approval history blocks (keep counts correct) — ClientOnboardingApprovals; counts via get_buyer_onboarding_approval_counts RPC, history rows lazy via IntersectionObserver, both tables render 50 rows + Load more
