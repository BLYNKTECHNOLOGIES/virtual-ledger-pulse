# Shift-wise Ad Uptime Tracking (MPI)

Goal: a shift-level dashboard that shows, for every trading day and shift, how long our Buy ads, Sell ads and small-sale ads were genuinely live on Binance — and makes any attempt to fake that uptime visible.

## What "active time" will mean

Binance only tells us an ad is online or offline. Online alone is easy to fake (ad online but with no balance behind it, absurd limits, no payment method, or a price nobody will ever hit). So each ad minute is graded:

- **Effective active** — online, tradable surplus above a floor, sane min/max limits, at least one payment method, and price within a competitive distance of the live market.
- **Hollow active** — online but failing one of the above. Counted separately and shown as a warning, never as uptime.
- **Offline** — paused or closed.

Shift uptime % = effective active minutes / shift minutes, computed per side (Buy / Sell / small-sale) and rolled up.

## Coverage view (all vs partial)

For each minute we also record how many of the expected ads were live, so the shift shows one of:

- **Full** — every expected ad on that side effective-active
- **Partial** — some live, some down (with the exact ad numbers and how long each was down)
- **Down** — none live

Small-sale ads are recognised automatically: any ad whose min/max single-transaction amount sits inside the configured small-sales band is classed as a small-sale ad; the rest are normal Buy/Sell ads.

## Fake-uptime defences

1. Truth comes only from Binance ad state captured server-side on a fixed one-minute heartbeat — never from anything an operator types or from a screen being open.
2. Hollow-active minutes (no surplus / no payment method / uncompetitive price / limits outside the band) are excluded from uptime and listed as "appears active but untradable".
3. Every pause, resume, price change, limit change and surplus top-up is already logged with the actor; the dashboard shows the pause/resume timeline next to the uptime bar, so short "unpause just before shift end" behaviour is visible.
4. Gaps in the heartbeat itself are marked as *unmeasured* instead of being credited as active, so stopping the collector cannot manufacture 100%.
5. Uptime is only ever computed backwards from stored minute records; there is no manual override field anywhere in the flow.

## Dashboard (MPI, shift-level only)

New "Ad Uptime" section in the Terminal MPI area, scored per shift, not per person:

- Day/shift selector with fixed Terminal shift windows (Morning / Evening / Night, configurable once in Terminal settings, IST).
- Three headline cards: Buy uptime %, Sell uptime %, Small-sale uptime %.
- A 24-hour timeline strip per side, banded by shift, coloured effective-active / hollow / offline / unmeasured.
- Coverage row: Full / Partial / Down minutes with the worst-offending ad numbers.
- Downtime table: ad number, side, from–to (IST), duration, reason (paused, no surplus, no payment method, price off-market), and who acted.
- Shift comparison: last 7 / 30 days uptime per shift so weak shifts stand out.
- Same permission gating as the rest of MPI; mobile-friendly card fallback.

## Technical approach

- New table `terminal_ad_uptime_minutes` (one row per ad per minute: adv_no, exchange account, side, asset, ad class buy/sell/small_sale, online flag, surplus, min/max limits, payment-method count, price, market reference price, grade, shift key, IST date) with a unique key on (adv_no, minute, account) so re-runs are idempotent.
- New table `terminal_shift_windows` for the fixed shift definitions.
- New edge function `terminal-ad-uptime-collector` on a one-minute cron: pulls current ads for both accounts through the existing Binance ads proxy path, grades each ad, writes the minute rows, and marks a heartbeat. Any minute with no heartbeat renders as unmeasured. Reuses the existing per-account credential/proxy plumbing; adds no new Binance capability.
- Nightly rollup into `terminal_ad_uptime_shift_summary` (date, shift, side, minutes by grade, coverage minutes, downtime episodes as jsonb) so the dashboard reads pre-aggregated rows.
- Downtime episodes derived by collapsing consecutive non-effective minutes; joined with the existing ad action log for actor attribution.
- Frontend: `AdUptimePanel` plus small child components under the Terminal MPI page, React Query with 60s refetch, semantic tokens only.
- Retention: minute rows pruned after 90 days by the existing telemetry prune job; shift summaries kept indefinitely.

## Binance scope note

Everything above uses ad listing/detail fields Binance already returns (status, surplus, min/max amounts, payment methods, price). Binance exposes no historical ad-status log, so history starts from the day the collector is enabled — there is no way to backfill past uptime, and nothing will be estimated.

## Build order

1. Shift windows table + settings screen for the three fixed windows.
2. Minute table, heartbeat, and collector function on cron; verify grading against live ads.
3. Nightly shift rollup + downtime episode derivation.
4. MPI Ad Uptime dashboard UI.
5. 7/30-day shift comparison and downtime attribution table.
