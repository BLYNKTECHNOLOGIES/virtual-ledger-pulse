Assessment

Claude's Finding has two parts, and they should not be treated equally:

1. `markOrderAsPaid` timestamps
   - This is useful, but it has already been implemented in this project after the previous approved work.
   - Current code now extracts `notifyPayTime`, `confirmPayEndTime`, `complainFreezeTime`, persists them into `p2p_auto_pay_log`, creates `p2p_release_deadline_monitor_log`, and surfaces release-deadline checks in the Auto-Pay UI.
   - So this should not be rebuilt. The right next step is only a verification/refinement pass.

2. `user/baseDetail.businessStatus`
   - This is genuinely useful and still underutilized.
   - I verified the deployed `getUserDetail` call is using the documented `/sapi/v1/c2c/user/baseDetail` endpoint and it returns usable merchant data, including:
     - `businessStatus: 1`
     - nickname, KYC status, country, registerDays, etc.
   - However, the app currently only exposes `useBinanceUserDetail()` as a query hook. It does not store, trend, alert, or correlate `businessStatus` with the auto-price circuit breaker.
   - This is a real self-monitoring gap: if Binance puts the merchant into `2 = Closed` or `3 = Take break`, the pricing/rest/ads automation can misdiagnose the problem as our internal failure instead of a Binance-side account state.

Why it is useful for BlynkEx

- It gives the ERP a Binance-source-of-truth getter for merchant state, instead of relying only on local rest timers or setter calls like merchantOnline/merchantOffline.
- It improves incident diagnosis:

```text
Auto-price circuit opens
        |
        v
Fetch Binance baseDetail.businessStatus
        |
        +-- 1 Open       -> likely our proxy/API/pricing/rate issue
        +-- 2 Closed     -> Binance/account/compliance closure; stop retrying as normal
        +-- 3 Take break -> merchant is on Binance break; suppress noisy failures and show rest/break state
```

- It protects data integrity because the state originates from Binance API, not manual operator input.
- It can be used by operators to immediately see whether ads are not updating because of our automation circuit or because Binance itself has placed the merchant in a restricted/break state.

Implementation Plan

1. Add first-class merchant state storage

Create a migration for a new `binance_merchant_state_snapshots` table, with RLS enabled for authenticated reads:

- `id uuid primary key`
- `business_status integer not null`
- `business_status_label text not null` (`open`, `closed`, `take_break`, `unknown`)
- `kyc_passed boolean`
- `user_kyc_status text`
- `kyc_type integer`
- `nickname text`
- `country_code text`
- `register_days integer`
- `bind_mobile_status text`
- `over_complained integer`
- `source text default 'baseDetail'`
- `raw_data jsonb not null`
- `checked_at timestamptz default now()`

Add indexes on:
- `checked_at desc`
- `business_status`

This keeps the data auditable and avoids relying only on live query state.

2. Persist `baseDetail` responses from the existing `getUserDetail` action

Update `supabase/functions/binance-ads/index.ts` inside `getUserDetail`:

- Keep the documented endpoint: `/api/sapi/v1/c2c/user/baseDetail`
- Preserve current strict validation for empty responses.
- When Binance returns `code === '000000'` and valid data, insert a merchant-state snapshot.
- Normalize status labels:
  - `1 -> open`
  - `2 -> closed`
  - `3 -> take_break`
  - anything else -> `unknown`
- Return the raw Binance result plus diagnostics, without inventing fallback values.

3. Add a dedicated merchant-state monitor action

Add a new action in `binance-ads`, for example `refreshMerchantState`, that:

- Calls the same documented `baseDetail` endpoint.
- Persists the snapshot.
- Returns the normalized merchant state.

This makes it reusable from:
- UI refresh button
- auto-price engine diagnostic check
- future scheduled monitor, if needed

4. Correlate merchant state with the auto-price circuit breaker

Update `supabase/functions/auto-price-engine/index.ts` so that when the circuit opens or is already open:

- It checks `baseDetail.businessStatus` through a shared helper or direct proxy call.
- It stores a snapshot.
- It updates circuit metadata/log output to distinguish:
  - `merchant_status_open` -> internal/proxy/pricing failure likely
  - `merchant_status_closed` -> Binance-side closure/compliance/account issue
  - `merchant_status_take_break` -> Binance-side break state
  - `merchant_status_unavailable` -> cannot determine

Do not auto-toggle merchantOnline/merchantOffline based on this value. This is monitoring and diagnosis only, because Binance is the source of truth.

5. Surface the status in Terminal UI

Add a compact Merchant State card in the Terminal automation/ad manager area, using the existing `useBinanceUserDetail()` or a new `useRefreshMerchantState()` hook:

- Show current Binance business status:
  - Open: normal/success badge
  - Closed: destructive badge with operator warning
  - Take break: amber/rest badge
  - Unknown/unavailable: destructive/diagnostic messaging
- Show last checked time and endpoint diagnostics.
- Show KYC status and nickname as supporting details.
- Add manual “Refresh Binance State” action that calls the API, not local-only data.

6. Refine, not rebuild, release-deadline monitoring

Because `markOrderAsPaid` timestamps are already implemented, only perform a verification pass:

- Confirm `p2p_auto_pay_log` rows are populated for both auto and manual mark-paid flows.
- Confirm `p2p_release_deadline_monitor_log` is receiving checks after `confirm_pay_end_time` passes.
- If needed, tighten the monitoring query to avoid duplicate noisy checks for already-final orders.
- If a true cron schedule is not configured yet, add a compliant scheduled invocation for `auto-pay-engine` so deadline monitoring runs even when no operator opens the UI.

7. Verification

After implementation:

- Call `binance-ads` with `getUserDetail` / `refreshMerchantState` and verify `businessStatus` is returned and stored.
- Query the snapshot table to confirm persisted values.
- Force/read an auto-price circuit-open scenario via existing state/logs and confirm merchant state diagnostics are recorded.
- Verify UI shows Binance state clearly and does not infer/guess values when the API fails.

Expected Outcome

- The ERP becomes aware of Binance's actual merchant/account state.
- Auto-price circuit-breaker incidents become diagnosable as either internal automation failure or Binance-side business-state restriction.
- Existing release-deadline automation remains intact and is only audited/refined rather than duplicated.
- All data continues to originate from documented Binance API responses, matching your Binance integration rule.