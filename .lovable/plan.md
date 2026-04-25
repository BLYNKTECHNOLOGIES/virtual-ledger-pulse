Plan to apply the same effective USDT coin-breakdown treatment to the Ad Performance tab:

1. Add a selected-ad state in `TerminalAnalytics.tsx`
   - Let the user click an ad row in the Ad Performance list.
   - Highlight the selected ad, similar to the selected order type behavior.
   - Default to the first visible ad when the Buy/Sell toggle changes.

2. Build ad-level coin breakdown data
   - Extend the existing Ad Performance aggregation to keep a coin-wise breakdown per ad.
   - For each selected ad, group completed orders by asset: USDT, BTC, ETH, USDC, FDUSD, BNB, TRX, etc.
   - Use existing `effectiveUsdtQty` and `effectiveUsdtRate` fields, not raw non-USDT coin amount/rate.
   - Show effective quantity in USDT terms and weighted effective price in INR/USDT.

3. Update the Ad Performance tab layout
   - Keep the current Buy Ads / Sell Ads toggle.
   - Left/main card: clickable ad rows ordered as requested: small first, big second, then asset priority.
   - Right/detail card: “Coin Breakdown” for the selected ad, matching the Order Types tab behavior.
   - Empty states for no ads or no selected-ad coin data.

4. Improve the bottom graphical section for ads
   - Add a selected-ad summary inside the graphical representation.
   - Add a coin-wise effective USDT visual panel for the selected ad at the bottom.
   - Keep the existing ad chart grouped by similar ad type, not volume-first sorting.

Technical details:
- File to update: `src/pages/terminal/TerminalAnalytics.tsx`.
- No Binance API or database changes are needed.
- Data will be derived from the already-normalized cached Binance orders and existing ERP effective valuation mappings.
- Preserve current Buy/Sell toggle behavior and sort order.
- Run a build after implementation to catch TypeScript/rendering issues.