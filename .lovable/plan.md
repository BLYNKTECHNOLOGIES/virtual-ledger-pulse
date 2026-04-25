Plan to improve the Terminal Analytics tab

Goal: make Analytics useful without making the main screen data-heavy. The default view will show only the most important KPIs and charts, while detailed breakdowns will be available inside clickable tabs/cards.

1. Redesign the analytics layout
- Keep the existing date/shift/range filter at the top.
- Replace the current dense page with:
  - compact KPI summary cards
  - one primary chart
  - clickable drill-down tabs below
- Use the existing dark terminal UI style and avoid oversized tables on the first view.

Proposed layout:
```text
Analytics header + time filter

Top summary cards:
Completed Orders | Buy Volume | Sell Volume | Avg Rate | Completion / Appeal snapshot

Primary chart:
Daily / hourly order activity

Drill-down tabs:
Overview | Order Types | Ad Performance | Rates | Status / Risk
```

2. Add order classification: small buy, big buy, small sale, big sale
- Use the existing `small_buys_config` and `small_sales_config` thresholds.
- Classify completed Binance orders by:
  - BUY + within small buy range = Small Buy
  - BUY + outside range = Big Buy
  - SELL + within small sales range = Small Sale
  - SELL + outside range = Big Sale
- Show this in a dedicated “Order Types” tab with:
  - count
  - INR volume
  - crypto quantity
  - average order size
  - average rate
- This will be based on existing Binance order history data, not manual entries.

3. Add buy/sell volume by ad
- Use `advNo` / `adv_no` from `binance_order_history`.
- Build an “Ad Performance” tab showing per-ad:
  - Ad ID
  - trade type: BUY / SELL
  - asset
  - completed order count
  - total INR volume
  - total crypto quantity
  - average rate
  - last order time
- Keep the default view compact by showing top ads first, with the full list inside the tab.
- If available from `useBinanceAdsList`, enrich each ad with current status/price; otherwise show only Binance order-derived metrics.

4. Add rate analytics
- Add a “Rates” tab showing:
  - average buy rate
  - average sell rate
  - weighted average buy rate
  - weighted average sell rate
  - min/max rate for the selected period
  - rate by order type
  - rate by ad
- Use `unitPrice` when available; otherwise calculate `totalPrice / amount` as fallback from Binance order data.

5. Add daily order chart by time
- For 1-day / shift filters: show hourly buckets in IST.
- For 7D / 30D / 1Y filters: show daily buckets.
- Chart metrics:
  - buy order count
  - sell order count
  - buy volume
  - sell volume
- Keep the chart readable with toggle controls or tabs: “Orders” vs “Volume”.

6. Add insight cards, not just raw data
- Add short insight cards like:
  - “Best performing ad by volume”
  - “Highest average sell rate”
  - “Peak trading hour”
  - “Buy/Sell volume imbalance”
  - “Appeal/cancel drag”
- These should be computed from real synced Binance data only.

7. Technical implementation
- Update `src/pages/terminal/TerminalAnalytics.tsx` as the main page.
- Add helper components if the page becomes too large, likely under `src/components/terminal/analytics/`:
  - `AnalyticsKpiStrip`
  - `OrderTypeBreakdown`
  - `AdVolumeBreakdown`
  - `RateAnalyticsPanel`
  - `OrderActivityChart`
- Add a small analytics helper layer for calculations:
  - normalize Binance cached orders
  - classify order type using small buy/sale config
  - aggregate by ad
  - aggregate by hour/day in IST
  - calculate weighted average rates
- Extend the cached order query only if required to include all fields already present in `binance_order_history` such as `adv_no`, `unit_price`, `asset`, `fiat_unit`, and timestamps. No new database table is required for this request.

8. Verification
- Run TypeScript checks.
- Verify the analytics tab loads with existing cached data.
- Check edge cases:
  - no orders in selected period
  - missing ad number
  - zero amount / invalid unit price
  - disabled or missing small buy/small sales config
  - 1-day chart hourly grouping vs range chart daily grouping

Important limitation
- This will use data already available from Binance order history and ads list. I will not invent ad metrics that Binance does not provide. If an ad has no orders in the selected period, it can appear in ad status summaries, but it cannot have fake volume/rate metrics.