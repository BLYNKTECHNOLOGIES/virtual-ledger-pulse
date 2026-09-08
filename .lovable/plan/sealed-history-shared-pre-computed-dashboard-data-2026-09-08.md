# Sealed history + shared pre-computed dashboard data

## What is happening today

- The terminal dashboard and analytics already read from our own database table `binance_order_history` — no browser calls Binance for history. So the "every user calls the API again" part is already avoided.
- The real cost is different: for a 1-year view each browser downloads **57,526 rows** (the table is 435 MB; only 6,153 rows are from the last 45 days) and then recalculates every KPI, chart and breakdown in the browser, for every user, on every page visit and every filter change.
- Binance is still re-scanned more widely than needed: a "full sync" walks a whole year, and cleanup/backfill work touches old orders that can never change again.

## The arrangement to build

1. **Seal everything older than 45 days.** Orders older than 45 days are treated as final: no Binance re-fetch, no status refresh, no gap-fill. Live pulls are clamped to the last 45 days (plus the existing 24h status overlap and 7-day deep scan, which stay inside that window). A one-time, manually triggered backfill remains available if history ever has to be rebuilt.
2. **Pre-computed buckets for sealed history.** A new table stores per-30-minute totals (30 minutes because the evening shift starts at 17:30, so every shift and every calendar day can be rebuilt exactly from these buckets). Grain: bucket start, exchange account, buy/sell, asset, status group, plus order count, fiat volume, asset quantity, commission and price-weighted totals.
3. **Read path = buckets + live tail.** Any view whose window reaches beyond 45 days reads pre-computed buckets for the sealed part and raw rows only for the last 45 days, then adds the two together. Short windows (today, 7 days, 30 days, custom ranges inside 45 days) keep reading raw rows exactly as now, so nothing changes for the most-used views.
4. **Same numbers, same behaviour.** The bucket grain preserves the shift filter (Full Day / S1 / S2 / S3 on single dates, custom ranges and the 7D / 30D / 1Y presets), IST day boundaries, per-account scoping (Blynk / ASEC), buy vs sell, asset splits, completed / cancelled / auto-cancelled / appeal splits.

## Scope by screen

- **Dashboard** — KPI cards (buy volume, sell volume, average order size, completion rate, buy/sell counts, completed-in-period), trade volume chart and order status breakdown all served from buckets + tail. Live counters (active orders, awaiting payment/release, appeals) are unchanged; they come from the live Binance active-order feed.
- **Analytics** — coarse panels (volume by coin, buy/sell, time-of-day, completion) use the same buckets + tail. Panels that need per-order facts (ERP effective-USDT valuations, ad-level and counterparty drilldowns, exports) keep reading raw rows for the selected window; those rows still live in Supabase, so results are identical.
- **Orders, appeals, ERP sync, exports, chat** — untouched. They read raw rows and are unaffected by bucketing.

## Keeping buckets correct

- Buckets are built and refreshed by a database routine, triggered after each order sync for the days it touched, so a day is rebuilt whenever any order in it changes.
- Days older than 45 days are rebuilt only if their sealed rows change (they should not), and a low-frequency nightly reconciliation re-verifies the most recent sealed days and repairs any drift.
- Verification: for several windows (7 days, 30 days, 1 year, a custom range, and each shift) the bucket-derived totals must match the raw-row totals to the paisa before the new path is switched on.

## Technical notes

- New table `public.terminal_order_rollups` (bucket_start timestamptz, exchange_account_id, trade_type, asset, status_group, order_count, fiat_volume, asset_qty, commission, price_qty_sum), unique on the grain, granted to `authenticated` (read) and `service_role`, RLS mirroring existing terminal read access.
- `rebuild_terminal_order_rollups(from_ts, to_ts)` SQL function recomputes buckets from `binance_order_history`; called after sync for the affected span and by a nightly reconciliation job over the last sealed week.
- `useBinanceOrderSync.tsx`: clamp `fetchOrdersFromBinance` windows and the full-sync path to 45 days; keep retention/cleanup at 1 year; keep the explicit backfill escape hatch.
- New `useOrderRollups` hook + a shared `buildStatsFromRollups` helper feeding `computeOrderStats`-shaped output, so `TerminalDashboard.tsx`, `TradeVolumeChart`, `OrderStatusBreakdown` and the coarse analytics panels keep their current props.
- No Binance API change is involved — this is entirely our storage and read path; Binance capability limits are unaffected.
