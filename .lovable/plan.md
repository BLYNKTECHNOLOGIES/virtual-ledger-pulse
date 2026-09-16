# Ad Active-Time: real categories, private ads excluded, blended shift score

Rework the Ad Uptime tracking so it measures only one thing — was the ad genuinely live and public — and reports it in the four categories we actually trade in, with a blended score per shift.

## What counts as active

- Active = ad is Online on Binance AND is not Private.
- Private ads are never active. Private = Binance online plus `advVisibleRet.userSetVisible = 1`, the same rule the Ad Manager already uses. Private minutes are shown as their own state ("Private"), not as uptime and not as offline.
- Everything else is dropped: no balance/surplus check, no min/max limit check, no price-vs-market check. An ad that is online and public is active, full stop.
- Minutes where the collector did not run stay "unmeasured" and are never credited.

## Categories

| Category | Rule |
| --- | --- |
| Lightning small sale | SELL, min/max inside the small-sales band (₹200–₹4,000), payment method Lightning UPI (`UPIQRCode`) |
| Small sale | SELL, inside the same band, payment method UPI (not Lightning) |
| Big sell | SELL, outside the small-sales band (typically ₹10,000+) |
| Big buy | BUY, any amount |

Zone (P2P / Block) and coin are recorded on every minute row, so Big buy and Big sell can be broken down by coin and by Block zone in the UI without creating extra categories.

Bands come from the existing small sales configuration — no second definition.

## Scoring per shift

- Sales side 60%: Lightning small sale 15%, Small sale 15%, Big sell 30%.
- Buy side 40%: Big buy.
- Each category's own score = active minutes / shift minutes, plus a multi-ad bonus: having more than one ad live at the same time in a category scores higher than one. The bonus is capped, so beyond the best simultaneous count we have seen for that category in the trailing 7 days it adds nothing (no manual targets to maintain).
- Blended shift score = weighted sum of the four category scores. Shown per shift, never per person.

## Coverage reporting

No expected-count targets. For each category and minute we report how many ads were live, and the UI shows: minutes with 0 live (down), 1 live, 2 live, 3+ live, plus the peak concurrent count. That makes "all buy ads active vs partial" visible from the counts themselves.

## Dashboard changes (MPI → Ad Uptime)

- Four category cards: Lightning small sale, Small sale, Big sell, Big buy — each with active %, peak concurrent ads, private minutes.
- One blended shift score headline with the 60/40 split shown.
- Timeline strip per category coloured active / offline / private / unmeasured.
- Downtime table: ad number, category, coin, zone, from–to (IST), duration, state (offline or private), and who acted (from the existing ad action log).
- Coin / zone filter for the Big buy and Big sell cards.
- 7 / 30-day shift comparison of the blended score.

## Technical notes

- `terminal_ad_uptime_minutes`: add `is_private`, `zone`, `pay_method_identifiers`, replace `ad_class` values with `lightning_small_sale` / `small_sale` / `big_sell` / `big_buy`; grade becomes `active` / `private` / `offline`. Hollow-reason columns kept but unused (no data loss), and hollow grading removed from the collector.
- Collector: `listWithPagination` does not return `advVisibleRet`, so it enriches each ad with the ad-detail call the same way `binance-ads` `listAds` does (bounded concurrency, per-account proxy path). If a detail lookup fails for an ad, that ad's minute is recorded as `unmeasured` for privacy rather than being credited as active. Market-price lookup and surplus/limit logic are deleted, which removes the public-search call entirely.
- `rollup_terminal_ad_uptime`: rewritten for the new categories, concurrency buckets (0/1/2/3+), peak concurrent count, private minutes and the weighted blended score; trailing-7-day peak used for the bonus cap.
- Historical rows collected under the old grading are re-labelled where the stored fields allow (side + band + zone) and left with no private flag, since privacy was not captured before; the UI marks pre-cutover days as "privacy not measured".
- Frontend: `AdUptimePanel.tsx` reworked for four categories, blended score and the new states.

## Binance scope note

Online state, `advVisibleRet` (private), `tradeMethods`, `classify` (zone), asset and min/max amounts are all fields Binance already returns. Binance exposes no history of ad status or visibility, so measurement still starts from the collector's own minute records — nothing is backfilled or estimated.

## Build order

1. Schema + category/grading change on the minute table.
2. Collector rewrite: privacy enrichment, category assignment, drop the optimisation checks.
3. Rollup rewrite: concurrency buckets, private minutes, blended 60/40 score with capped bonus.
4. MPI panel rework.
5. Verify live against current ads (private ads must show 0 active minutes) and re-roll today.
