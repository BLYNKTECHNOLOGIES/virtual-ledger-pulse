I analyzed the Terminal Analytics implementation and the live database shape. The delay is mainly not from the charts themselves; it is from how the page fetches and enriches data before it can render.

Key findings:

1. The analytics page currently loads one full year of Binance order history every time
   - Current table size: about 32,242 `binance_order_history` rows.
   - Even when the user is viewing Today, the hook first fetches all rows from the last 365 days, then filters in the browser.
   - Today only needs about 469 rows, 7D about 1,465 rows, 30D about 4,181 rows.
   - This means the page often downloads and processes 7x to 70x more data than needed.

2. Effective valuation enrichment is done for every loaded order number
   - `useEffectiveOrderValuations(orderNumbers)` receives all fetched order numbers.
   - With 32k orders, it chunks into many DB queries against:
     - `terminal_purchase_sync`
     - `terminal_sales_sync`
     - `small_buys_order_map`
     - `small_sales_order_map`
     - `small_buys_sync`
     - `small_sales_sync`
     - `purchase_orders`
     - `sales_orders`
   - For Today/7D this is unnecessary because only the visible period needs valuation.

3. The page waits for valuations before showing analytics
   - `isLoading` includes `valuationsLoading`, so a large valuation query chain keeps the whole Analytics page on the spinner.
   - This matches the screenshot: side menu is visible, content area remains loading.

4. Ad metadata is fetched live from Binance on page load
   - `useBinanceAdsList({ advStatus: null })` calls the `binance-ads` edge function.
   - That function fetches online/private and offline ads, and for online ads enriches each ad by calling ad detail APIs.
   - This adds network/API latency and can slow initial render, especially if Binance/proxy is slow.

5. Auto-sync is not running on the Analytics page
   - The 5-minute auto-sync hook is only used in `TerminalDashboard`, not `TerminalAnalytics`.
   - So if staff directly opens Analytics, the data shown depends on the last sync elsewhere or manual sync.
   - Current sync metadata shows the last order sync took about 8.1 seconds, but Analytics itself does not trigger/update that pipeline.

Main contenders causing slowness:
- Full 365-day client-side order fetch before filtering.
- Multi-table valuation enrichment over all 32k orders.
- Waiting for all enrichments before rendering anything.
- Live Binance ad-list/detail calls during Analytics page load.
- No lightweight Analytics-specific sync/status mechanism on the Analytics route.

Plan to fix and optimize:

1. Make order history fetching period-aware
   - Update `useCachedOrderHistory` to accept a start/end timestamp.
   - Query only the selected period from `binance_order_history` instead of always fetching 365 days.
   - For the default Today view, this should reduce the loaded rows from about 32k to about 469.
   - Keep a safe fallback for other consumers like Dashboard that may still need the old behavior.

2. Make valuation enrichment period-aware
   - Build `orderNumbers` from the already period-filtered orders only.
   - This prevents valuation queries for orders outside the current date/range.
   - Add `enabled` and stable query keys based on period/order list to avoid unnecessary refetches.

3. Allow fast first render
   - Do not block the whole page on valuation enrichment.
   - Render core metrics from order history first.
   - Show small inline loading indicators or “valuation loading” text only for valuation-dependent rate/USDT fields until enrichment finishes.
   - This prevents the blank spinner state when only secondary metrics are pending.

4. Reduce ad metadata latency
   - Avoid fetching all live ad details before the page can render.
   - Use order-level `advNo`, `tradeType`, and `asset` immediately.
   - Load live ad metadata lazily or use cached ad snapshots if available.
   - Keep Binance API truth intact: no fake ad fields; if Binance/proxy has not returned metadata yet, show “Ad detail loading/not returned”.

5. Add Analytics freshness visibility and refresh control
   - Show “Last order sync” and “last sync duration” on Analytics header using `binance_sync_metadata`.
   - Add a small refresh/sync button on Analytics to trigger incremental order sync when staff needs immediate reflection.
   - After sync completes, invalidate the period-specific analytics query.

6. Add server-side fast aggregation option
   - Create a Supabase RPC/view for Terminal Analytics summary over a date range.
   - Compute totals, order type groups, ad groups, and rate metrics in SQL instead of in the browser.
   - Keep raw order detail lists separate and paginated.
   - This is the bigger performance win for future growth beyond 32k orders.

7. Database/index checks
   - Current `binance_order_history(create_time desc)` index exists and is being used.
   - Add/confirm composite indexes for common analytics filters if needed:
     - `(create_time desc, order_status, trade_type)` or equivalent ordering that matches actual query patterns.
     - `adv_no` if ad-performance aggregation is moved server-side.
   - Keep unique indexes on sync mapping tables as they already support order-number lookups.

Expected impact:
- Today view: avoid loading ~31,700 unnecessary rows.
- 7D view: avoid loading ~30,700 unnecessary rows.
- Spinner time should drop significantly because the page no longer waits for full-year valuation enrichment.
- Analytics data should reflect faster because staff can sync directly from Analytics and see sync freshness.
- Future scaling improves because heavy grouping can move to SQL/RPC instead of browser memory processing.

Implementation files likely involved:
- `src/hooks/useBinanceOrderSync.tsx`
- `src/pages/terminal/TerminalAnalytics.tsx`
- Possible new Supabase migration for analytics RPC/indexes
- Possible generated type refresh or typed RPC casting if needed

Validation after implementation:
- Build check.
- Compare row counts loaded for Today/7D/30D/1Y.
- Confirm core Analytics renders before valuation enrichment completes.
- Confirm Ad Performance still groups small/big and asset order correctly.
- Confirm sync timestamp updates after manual Analytics refresh.