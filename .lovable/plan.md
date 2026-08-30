# Price Ladder — allow a floating ratio as the ladder input

Today the Price Ladder in Terminal → Ad Manager only accepts a **fixed top rate** (INR) for an anchor asset; floating ads get their top converted from that price using the Hybrid Adjust formula. This change adds the reverse: the operator can enter a **floating top ratio** instead, and fixed ads are derived from it — the same two-way relationship Hybrid Adjust already uses.

## Behaviour

A small mode switch at the top of the ladder form: **Fixed rate (INR)** or **Floating ratio (%)**.

- **Fixed rate** — unchanged from today (anchor asset + INR top rate; floating tops derived per group).
- **Floating ratio** — the operator enters one top ratio, e.g. `103.20`.
  - The ratio is market-relative, so it applies as the top rung to **every** asset + side + zone group directly. No anchor asset is needed and the anchor selector is hidden in this mode.
  - For each group, the equivalent fixed top price is derived from that group's live INR index with the inverse Hybrid Adjust formula:
    `price = index / (1 - (ratio + adjuster - 100) / 100)`
    where `adjuster` is the Hybrid Price Difference Adjuster setting and `index` is the live spot × USDT/INR index already used by the dialog.
  - Inside each group, floating ads ladder down on ratio from the entered top, fixed ads ladder down on price from the derived top — both stepping `0.51` per rung, ordered by current value descending, exactly as today.
  - Groups whose asset has no live index price are skipped and flagged (only when that group contains fixed ads; a floating-only group needs no index and ladders fine).
  - Rungs falling to zero or below are blocked before any API call, naming the offending rung. A derived price that is non-finite or negative (ratio math out of range) also blocks that group with a clear reason.

Confirmation preview, multi-pass retry execution and the result list stay exactly as they are — they already show per-group "current → new" for both price and ratio.

## Guardrails

- No new Binance fields or simulated data — only `price` / `priceFloatingRatio` written through the existing ad-update path.
- No database changes.
- Reference index remains the live spot × USDT/INR index (never a hardcoded rate); fallback-rate warnings already surfaced in the dialog remain.

## Technical notes

- `src/components/ad-manager/BulkPriceLadderDialog.tsx`:
  - Add `mode: 'fixed' | 'ratio'` state and a two-button toggle in the form step; reset it with the dialog.
  - Add `ratioToPrice(ratio, index, adjuster)` next to the existing `priceToRatio`, as its exact inverse.
  - Extend `buildLadderGroups` with a `mode` argument: in `ratio` mode `topRatio` is the entered value for every group and `topPrice` is derived per group from its index; in `fixed` mode the current anchor-scaling path is untouched. Group skip reasons updated per mode.
  - Form copy and validation messages switch with the mode ("Enter the top floating ratio" vs "Enter the fixed top rate for {anchor}").
- `src/components/ad-manager/BulkActionToolbar.tsx` and `src/pages/AdManager.tsx`: unchanged.
