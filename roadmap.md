# Roadmap — Terminal speed: server-side order collector + faster chat

- [x] Phase 1: `terminal-order-collector` edge function (5s internal loop, cron-started each minute) + `terminal_active_orders_cache` + `terminal_collector_state` tables + Realtime
- [x] Phase 1b: 5-min server cron for order-history sync (`syncTerminalOrdersForErp` scheduler-secret support in `binance-ads`); client auto-sync skips Binance refetch when server data is fresh (ERP chains still run)
- [x] Phase 2: `useBinanceActiveOrders` reads DB cache + Realtime, live Binance fallback when collector stale; manual refresh triggers collector tick
- [x] Phase 3a: chat prewarm (credential prefetch on Orders page), REST poll drops to 30s while WS healthy, archived-history instant paint (already present in ChatPanel)
- [x] Phase 4: staleness banner on Orders page from collector heartbeat
- [x] Verify: tsgo clean, cron job_run_details all succeeded (collector 1m + history 5m), cache 40 rows fresh, heartbeat ok
- [x] STATE_LOG entry appended (IST)
- [ ] Deferred (needs AWS relay host): Phase 3b persistent server-side chat listener
