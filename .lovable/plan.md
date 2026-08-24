# Price Ladder — bulk stepped pricing for selected ads

Add a new bulk action in Terminal Ad Manager: select several ads of the same asset and same side, enter one top rate, and the ads are re-priced in a descending ladder with a fixed 0.5 gap.

## Behaviour

- Operator enters a single **top rate** (e.g. 100).
- Selected ads are sorted by their current price, highest first.
- The ladder is applied top-down with a fixed step of 0.5:
  - highest-priced ad → 100
  - 2nd → 99.5
  - 3rd → 99
  - 4th → 98.5
- Fixed-price ads (priceType 1): the ladder sets the absolute fiat price.
- Floating ads (priceType 2): the ladder is applied to the floating ratio instead, using the same 0.5 step, ordered by current ratio.
- Mixed fixed + floating in one selection is allowed, but the ladder is applied inside each price-type family separately (a fixed ad's price and a floating ad's ratio are not comparable) — the preview makes this explicit.

## Guardrails

- Requires a single asset and a single trade side (all BUY or all SELL). Otherwise the button is disabled with a tooltip telling the operator to narrow the selection.
- Needs at least 2 selected ads.
- Rejects a resulting price/ratio that goes to zero or negative — blocked before any API call, with the offending rung named.
- Stablecoin step rules already in place for ad pricing are respected: the ladder rounds each rung to the asset's allowed price precision.
- No new database objects, no simulated Binance fields — the ladder only writes `price` / `priceFloatingRatio` through the existing ad-update path.

## Flow

Form (enter top rate) → Confirm (full preview table: each ad's current → new value, in ladder order) → Execute one-by-one with the existing 300 ms spacing → Result list with per-ad success/failure.

## Technical notes

- New file `src/components/ad-manager/BulkPriceLadderDialog.tsx`, modelled on the existing `BulkFloatingPriceDialog` (same step machine: form → confirm → executing → done, same `useUpdateAd` mutation payload shape including `tradeMethods`, `payTimeLimit`, `exchange_account_id`, and `oldPrice`/`oldRatio` for the audit log).
- `src/components/ad-manager/BulkActionToolbar.tsx`: add a "Price Ladder" button with an `ArrowDownWideNarrow` icon, enabled only when the selection is single-asset, single-side and has 2+ ads; disabled state carries the reason as a tooltip.
- `src/pages/AdManager.tsx`: add `bulkLadderOpen` state, the `onBulkPriceLadder` handler, and render the new dialog next to the other bulk dialogs with `onComplete={handleBulkComplete}` so the ad list refreshes.
- Ordering is by current value descending; ties keep their existing table order so repeated runs are stable.
