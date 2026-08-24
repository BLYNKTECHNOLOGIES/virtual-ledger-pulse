# Terminal Audit: P2P Zone, Block Zone and Merchant Levels

The new verified facts change the ground truth for every competitive engine in the Terminal:

- Zone is selected by the Binance search parameter `classifies`: P2P zone = `["mass","profession"]`, Block zone = `["block"]`. They are two separate order books with different top merchants and different price levels (our own USDT ad: 100.22 in P2P zone vs 100.10 in Block zone).
- `shieldMerchantAds: true` is only a badge filter inside a zone, not a zone switch.
- Advertisers carry a level (`userIdentity`: `MASS_MERCHANT` / `BLOCK_MERCHANT`) and badges (`Block`, `Shield`, `Ordinary`), plus `vipLevel`.
- Our own ads already carry a `classify` field (`block` / `profession`) returned by the ads listing.

## What the audit found

1. **Zone blindness in our own ad handling.** `classify` is currently used only to draw a "Block" badge in the ad tables and board view. It is not a filter, not a grouping key, and not part of any bulk action. So Price Ladder, Hybrid Adjust, Floating Price and Bulk Risk Guard can silently mix P2P-zone and Block-zone ads of the same asset/side into one ladder or one reference calculation, even though the two books trade at different prices.
2. **Auto-pricing rules can target the wrong book.** The rule now has a zone selector, but the ads a rule drives are chosen purely by ad number. Nothing checks that a selected ad's `classify` matches the rule's zone, so a block ad can be repriced against the P2P book (and vice versa) with no warning.
3. **Merchant intelligence is thrown away at the edge.** `searchP2PMerchant` in `binance-ads` maps competitor rows down to nickname/price/rate/online and drops `userIdentity`, `badges` and `vipLevel`. It also hardcodes `publisherType: "merchant"` with no `classifies`, no ticket-size filter, and loops 25 pages every call. Result: the merchant preview inside the rule dialog, and any future depth view, cannot see merchant level or zone at all.
4. **No competitor book view in the Terminal.** There is no screen where an operator can see the two zones side by side with their top merchants and badges — the only competitor read is the single-nickname preview inside the auto-pricing dialog.
5. **Ad creation is locked to the P2P zone.** The create/edit ad dialog hardcodes `classify: 'profession'`, so block-zone ads can only be created on Binance itself.
6. **Logs and analytics have no zone dimension** beyond the new pricing-log columns: effectiveness snapshots, engine state and analytics do not separate "we won the P2P book" from "we won the block book".

## Proposed work

### Phase 1 — Zone becomes a first-class attribute
- Surface zone on every ad surface: a Zone column/pill (P2P / Block) in the ad table, board view and categorized table, plus a **Zone filter** in `AdManagerFilters` alongside asset/side/status.
- Make every bulk pricing action zone-aware: Price Ladder, Hybrid Adjust and Bulk Floating group by `asset + side + zone` instead of `asset + side`, and each zone group uses its own zone's competitor book as reference. Mixed-zone selections are grouped, never merged.
- Block cross-zone laddering the same way buy/sell mixing is already blocked, with an explanatory tooltip.

### Phase 2 — Full merchant intelligence from the edge function
- Extend `searchP2PMerchant` to accept `zone` (mapped to `classifies`), `badges`, `minAmount`, `publisherType` and page budget, and to return `userIdentity`, `badges`, `vipLevel`, `classify`, min/max limits and pay types per row.
- Treat `BLOCK_MERCHANT` identity as implying the `Block` badge when the array omits it.
- Reduce the fixed 25-page crawl to an early-exit search (stop once the target or enough badged rows are found) to cut latency and rate-limit pressure.

### Phase 3 — Zone Book view (new Terminal screen/panel)
- A side-by-side **P2P zone / Block zone** book for a chosen asset, side and ticket size, showing rank, merchant, level badges, price, limits and where our own ad sits in each book.
- Per-zone "our rank" and "spread to top" readouts, so operators can see instantly that we are #1 in one zone and #4 in the other.

### Phase 4 — Engine hardening
- Validate rule/ad zone consistency: warn in the rule dialog and log a `zone_mismatch` skip in the engine when an ad's `classify` does not match the rule's `competitor_zone`.
- Extend badge targeting to merchant level (`MASS_MERCHANT` / `BLOCK_MERCHANT`) and optional `vipLevel` floor, so a rule can say "follow the top Block merchant in the P2P zone, ignore ordinary users".
- Record zone and matched merchant level on effectiveness snapshots and engine state, and add a zone filter to the auto-pricing logs view.

### Phase 5 — Ad creation and analytics
- Let the create/edit ad dialog choose the zone (`classify`), gated by what `getAvailableAdsCategory` reports for the account, so block ads can be created from the Terminal.
- Add zone breakdown to Terminal analytics: fill rate, realized margin and win-rate per zone, so pricing aggression can be tuned per book.

## Technical notes

- Zone mapping: `p2p` -> `classifies: ["mass","profession"]`, `block` -> `classifies: ["block"]`. Our ad's own zone comes from `classify` on the ads listing (`profession` / `block`).
- Badge extraction stays centralized in one helper shared by `auto-price-engine` and `binance-ads` so the identity-implies-badge rule is applied once.
- All competitor data continues to come only from live Binance responses — no inferred or synthesized merchant levels, and empty/restricted results are shown as empty with operator messaging.
- Database work is additive: zone/level columns on effectiveness snapshots and engine state; no changes to existing pricing logic beyond the grouping key.

## Sequencing

Phases 1 and 2 are the foundation and are worth doing together. Phase 3 gives operators visibility, Phase 4 makes the engines safe, Phase 5 completes coverage. Each phase is independently shippable.
