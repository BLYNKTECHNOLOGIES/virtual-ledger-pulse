# Price Ladder for mixed selections (multi-coin, fixed + floating)

Today the Price Ladder button is disabled unless the selection is a single asset and a single side, and it ladders raw values (a fixed price and a floating ratio are laddered on the same number). This change makes the ladder work on any selection: several coins, both price types, one entered fixed top rate.

## Behaviour

Operator selects any number of ads and enters **one fixed top rate** (INR) plus an **anchor asset** (defaults to the highest-count asset in the selection, e.g. USDT).

1. **Groups** — ads are split into groups by asset + trade side (BUY/SELL). Each group ladders independently.
2. **Per-asset top rate** — the entered rate belongs to the anchor asset. For every other asset the top rate is scaled by the live Binance reference price ratio:
   `top(asset) = entered x refPrice(asset) / refPrice(anchor)`
   Reference prices come from Binance `getReferencePrice` for that asset + side. If Binance returns no reference price for an asset, that group is skipped and flagged in the UI as unavailable — no estimated or inferred value is substituted.
3. **Floating maximum** — inside each group the floating ads get their own top expressed as a ratio, derived from that group's fixed top rate exactly like Hybrid Adjust:
   `rawPct = (top - index) / top x 100`, `ratio = 100 + rawPct - hybridAdjuster`
   The index used is the same live reference price for that asset + side, and the Hybrid Price Difference Adjuster setting is subtracted.
4. **Separate ladders** — within a group, fixed ads ladder on price and floating ads ladder on ratio, each ordered by its current value descending, stepping down 0.5 per rung (existing `LADDER_STEP`).
5. Rungs that fall to zero or below are blocked before any API call, naming the offending rung.
6. Execution keeps the existing multi-pass retry behaviour so Binance price-overlap rejections clear once lower rungs have moved.

## Guardrails

- Minimum 2 selected ads; no asset/side restriction any more.
- Reference price is required per asset — missing or zero means the group is not touched.
- No new database objects, no simulated Binance fields; updates go through the existing ad-update path only.

## Flow

Form (top rate + anchor asset, live per-asset top rate preview) → Confirm (grouped preview table: asset + side heading, each ad's current → new price or ratio) → Execute with 300 ms spacing and retry passes → Result list grouped the same way.

## Technical notes

- `src/components/ad-manager/BulkPriceLadderDialog.tsx`: replace `buildLadder` with a grouped builder returning `{ asset, side, topPrice, index, rungs[] }`; rungs carry `floating`, `current`, `next` as today so the executor and result list need only minor changes. Ratio conversion reuses the Hybrid Adjust formula; `useHybridPriceAdjuster()` supplies the offset.
- Reference prices: fetch per unique asset + side pair in the dialog. `useBinanceReferencePrice` is single-pair, so add a small hook that issues one query per pair (`useQueries`) over the same `binance-ads` `getReferencePrice` action — no new backend work.
- `src/components/ad-manager/BulkActionToolbar.tsx`: drop the single-asset / single-side gating on the Price Ladder button; keep only the "select at least 2 ads" condition and update the tooltip.
- `src/pages/AdManager.tsx`: unchanged wiring.
