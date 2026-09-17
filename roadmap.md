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
- [x] Terminal inbox identity race: live-order-first frame resolution, side-aware cache metadata, targeted reused-group repair, and duplicate verification
- [x] Terminal unread consistency: outgoing replies advance shared reads, inbox counts only newer counterparty messages, and every chat-opening path persists read state
- [x] Terminal merged-row read persistence: one unambiguous atomic batch write completes before navigation and refreshes inbox, badge, and seen state
- [x] Terminal stale chat-list preview: opened-thread history sync now invalidates inbox/message caches, and returning to the inbox always fetches current stored chronology
- [x] Add lazy loading to approval and approval history blocks (keep counts correct) — ClientOnboardingApprovals; counts via get_buyer_onboarding_approval_counts RPC, history rows lazy via IntersectionObserver, both tables render 50 rows + Load more

# [x] Terminal sidebar: collapsed/expanded icon Y-positions identical (label space preserved, 40px rows both modes, unified header padding + gap)

# [x] HRMS Management: dedicated permission-gated Quiz tab and working Quiz overview route

# [x] HRMS Quiz staff workspace: Dashboard, Drives, Candidates & Attempts, Evaluations, Question Bank, Roles & Blueprints, Settings
# [ ] Terminal merged counterparty chat history: stable account-scoped identity, canceled-order recovery, read-only prior-order timeline, and runtime verification
# [ ] CBT candidate test runner: public registration, instructions, timed sections, autosave, resume, completion
# [ ] CBT advanced staff actions: attempt detail, re-score, time extension, invalidation, resume codes, question version approval/key correction
# [ ] CBT production content: 12 role blueprints, reviewed question bank, cron jobs, and full V1–V13 verification
