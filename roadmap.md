# Roadmap — Terminal speed: server-side order collector + faster chat

- [ ] Phase 1: `terminal-order-collector` edge function (5s internal loop, cron-started each minute) + `terminal_active_orders_cache` + `terminal_collector_state` tables + Realtime
- [ ] Phase 1b: 5-min server cron for order-history sync (`syncTerminalOrdersForErp` scheduler-secret support in `binance-ads`); client auto-sync skips Binance refetch when server data is fresh
- [ ] Phase 2: `useBinanceActiveOrders` reads DB cache + Realtime, live Binance fallback when collector stale; manual refresh triggers collector tick
- [ ] Phase 3a: chat prewarm (credential prefetch on Orders page), skip REST poll while WS healthy, archived-history instant paint (already present in ChatPanel)
- [ ] Phase 4: staleness banner on Orders page from collector heartbeat
- [ ] Verify: build logs, DB checks, collector logs; append STATE_LOG entry (IST)
- [ ] Deferred (needs AWS relay host): Phase 3b persistent server-side chat listener
