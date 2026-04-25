## Gap 9 assessment

Claude’s finding is mostly valid and useful, with one clarification.

What is already implemented:
- Binance ad APIs already return `surplusAmount` through `listWithPagination` and `getDetailByNo`.
- The Ad Manager UI already displays current remaining quantity from `surplusAmount`.
- The auto-price engine already calls `getAdDetail` while inferring Binance floating index, and the `binance-ads` function already enriches ad list results with details for visibility/commission fields.
- `ad_pricing_effectiveness_snapshots` exists, but it is daily and order/log based: price updates, average applied price, competitor price, spread, orders received/completed, and volume.

What is still a real gap:
- There is no durable time-series book for the actual Binance ad state: `surplusAmount`, `initAmount`, price, ratio, ad status, visibility, min/max limits, etc.
- Current effectiveness analytics can tell “what price did we set?” and “what orders happened that day,” but not “how did the ad inventory react after each pricing cycle?”
- This means the auto-price engine cannot distinguish these cases cleanly:
  - Price too competitive: surplus draining too fast.
  - Price too uncompetitive: surplus unchanged for too long.
  - Ad unavailable/private/offline: no drain for operational reasons, not price reasons.

## Usefulness for this ERP

This is useful if treated as a Binance-sourced telemetry book, not as a manually edited stock book.

High-value uses:
- Close the feedback loop for auto-pricing by correlating price/ratio changes to actual ad surplus movement.
- Detect fast ad drain before the operator only sees inventory pressure later.
- Detect stagnant ads where pricing rules keep running but no one is taking the ad.
- Build per-ad performance analytics using the same source of truth Binance provides.
- Improve future automation safely: warnings first, then optional rule suggestions later.

What should not be done:
- Do not infer surplus when Binance does not return it.
- Do not use this as wallet/inventory truth. Ledger remains `wallet_transactions` and `wallet_asset_balances`.
- Do not auto-change pricing solely from drain/stagnation at this stage. Start with visibility and warnings.
- Do not create extra high-frequency Binance calls just to snapshot. Capture from calls we already make wherever possible.

## Implementation plan

### 1. Validate API/proxy field support
- Confirm that the current proxy responses for `listWithPagination` and `getDetailByNo` consistently expose:
  - `advNo`
  - `asset`
  - `tradeType`
  - `price`
  - `priceFloatingRatio`
  - `priceType`
  - `advStatus`
  - `initAmount`
  - `surplusAmount`
  - limit fields when returned, such as `minSingleTransAmount` and `maxSingleTransAmount`
  - visibility fields from `advVisibleRet` when returned by detail
- If any field is not returned, store it as null and display “Not returned by Binance.” No estimation.

### 2. Add an ad state snapshot table
Create a new table, for example `binance_ad_state_snapshots`, with append-only Binance telemetry fields:
- `id`
- `adv_no`
- `rule_id` nullable, because snapshots may come from Ad Manager/manual detail fetches too
- `snapshot_source` such as `auto_price_pre_update`, `auto_price_post_update`, `ad_list`, `ad_detail`
- `captured_at`
- `asset`, `trade_type`, `price_type`, `adv_status`
- `price`, `price_floating_ratio`
- `init_amount`, `surplus_amount`
- `min_single_trans_amount`, `max_single_trans_amount` nullable
- `adv_visible_ret` jsonb nullable
- `raw_payload` jsonb for audit/debugging

Add indexes for:
- `(adv_no, captured_at desc)`
- `(rule_id, captured_at desc)` where `rule_id is not null`
- `(captured_at desc)` for retention/analytics

RLS:
- Authenticated users can read snapshots.
- Writes happen through edge functions/service role only, not directly from the browser.

### 3. Persist snapshots from existing Binance calls
Update `supabase/functions/binance-ads/index.ts`:
- Add a helper like `persistAdStateSnapshot(supabase, adPayload, source, ruleId?)`.
- In `listAds`, persist a snapshot for each returned ad after enrichment, because this already has `surplusAmount` and detail fields where available.
- In `getAdDetail`, persist a snapshot for the returned ad detail alongside the existing commission snapshot logic.
- Include diagnostics in logs: source, ad number, whether `surplusAmount` was present, and whether persistence succeeded.

### 4. Capture pricing-cycle context without extra API quota where possible
Update `supabase/functions/auto-price-engine/index.ts`:
- When it calls `getAdDetail` via `inferBinanceIndex`, pass context:
  - `ruleId`
  - `snapshotSource: auto_price_pre_update`
- After a successful `updateAd`, optionally call `getAdDetail` once for that ad with:
  - `ruleId`
  - `snapshotSource: auto_price_post_update`
- To control rate/API load, post-update detail fetch should be guarded:
  - only for updated ads
  - only if a configurable minimum interval has passed since last snapshot for that ad, e.g. 4–5 minutes
  - never run when the circuit breaker is open or the cycle was skipped

This creates a sequence like:

```text
pricing cycle starts
  -> current Binance ad detail captured (pre-update)
  -> price/ratio update attempted
  -> if update succeeded, post-update detail captured when rate-safe
later cycles
  -> compare surplus deltas over time
```

### 5. Add drain/stagnation analytics helpers
Add database views or RPCs for derived analytics, not manual columns:
- `surplus_delta` = previous snapshot surplus - current snapshot surplus
- `drain_rate_per_hour` from surplus delta over elapsed time
- `hours_since_surplus_changed`
- latest price/ratio at the time of the change
- status classification:
  - `Draining fast`
  - `Healthy movement`
  - `Stagnant`
  - `No Binance surplus returned`
  - `Offline/private/take-break context`

Important: null `surplusAmount` means “not returned by Binance,” not zero.

### 6. Correlate effectiveness snapshots with ad state
Extend daily effectiveness generation or add a separate daily rollup table/view:
- opening surplus for the day
- closing surplus for the day
- total surplus consumed
- average drain rate
- longest stagnation window
- number of price updates during the same window
- average applied price/ratio already available from pricing logs

This closes the current gap: price decisions can be evaluated against actual ad consumption, not just order counts.

### 7. UI visibility in the Auto Pricing area
Add a compact “Ad State / Drain” section for each pricing rule/ad:
- Current Binance surplus
- Last captured time
- 1h / 6h / 24h drain where enough snapshots exist
- Stagnation duration
- Source label: `Live Binance snapshot`, `Last Binance snapshot`, or `Not returned by Binance`
- Warning badges only at this stage:
  - Fast drain warning
  - Stagnant ad warning
  - Missing Binance field warning

Do not automatically change pricing rules from these warnings unless separately approved later.

### 8. Retention and performance
- Keep high-resolution snapshots for a limited period, e.g. 30 days.
- Keep daily rollups longer, e.g. 180–365 days.
- Add a cleanup function or extend existing maintenance cleanup to delete old raw snapshots.
- Avoid snapshotting every manual UI refresh if it creates too much noise; use dedupe rules such as “one snapshot per ad/source every N minutes unless surplus or price changed.”

## Expected outcome

- The Claude gap is useful: it identifies a real missing telemetry layer.
- Current `surplusAmount` usage is live-only and operational; it is not a historical book.
- Implementing this gives the auto-price engine a proper feedback loop:
  - price set
  - Binance ad surplus observed
  - drain/stagnation measured
  - operator sees whether pricing is too aggressive or too weak
- The implementation stays compliant with your Binance API rule because all values originate from Binance responses and nulls are not simulated.