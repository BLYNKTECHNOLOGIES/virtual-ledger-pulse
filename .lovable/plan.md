Plan to add the bottom graphical representation:

1. Add a dedicated visual analytics section below the current table/list content, so it appears when the user scrolls down.

2. For the Order Types tab, add a polished dashboard-style graphical block showing:
   - Small Buy, Big Buy, Small Sale, Big Sale grouped clearly.
   - Volume, order count, USDT-effective quantity, weighted average rate, and average order.
   - Easy comparison using horizontal bars / composed chart styling instead of only text rows.
   - Buy and sale colors matching the existing theme.

3. For the Ad Performance tab, add a graphical block under the ad list that respects the current Buy Ads / Sell Ads toggle:
   - Keep similar ads together in the same order already requested: small first, big after; then by asset priority such as USDT, BTC, ETH, USDC, FDUSD, BNB, TRX.
   - Show a readable ranked bar chart/card layout for ad volume.
   - Include secondary metrics: orders, effective USDT quantity, weighted rate, and avg order.
   - Avoid sorting by volume as the primary grouping basis.

4. Improve presentability and scanability:
   - Use dark-theme-compatible cards, borders, muted labels, tabular numbers, and clear legends.
   - Keep charts compact but detailed, with tooltips using the same INR/quantity/rate formatting already used in the page.
   - Add empty states if there is no data for the selected period/toggle.

Technical details:
- File to update: `src/pages/terminal/TerminalAnalytics.tsx`.
- Reuse the existing Recharts dependency already imported in this file.
- Add derived chart data from the existing `analytics.orderTypes`, `analytics.orderTypeCoinBreakdown`, and `filteredAdRows` so no new database/API changes are needed.
- Keep Binance data source untouched; this is only a visualization layer over existing analytics data.
- Run a build after implementation to catch TypeScript/rendering issues.