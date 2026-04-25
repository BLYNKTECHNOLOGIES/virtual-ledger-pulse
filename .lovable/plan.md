Assessment of implementation so far

I reviewed the code paths that were changed for:

1. `getUserDetail` / `refreshMerchantState`
2. `binance_merchant_state_snapshots`
3. auto-price circuit-breaker merchant-state correlation
4. `markOrderAsPaid` timestamp capture
5. release-deadline monitoring UI and database table

Overall verdict: the implementation is directionally useful and mostly present, but I found several correctness gaps that should be fixed before treating it as reliable production monitoring.

What appears correct

- The old undocumented `userDetail` route is no longer used in the inspected implementation. `getUserDetail` and `refreshMerchantState` now call:
  - `/api/sapi/v1/c2c/user/baseDetail`
- Merchant snapshots are persisted into `binance_merchant_state_snapshots` when `businessStatus` is numeric.
- The UI card exists and is wired into `AdManager.tsx`.
- `markOrderAsPaid` timestamps are extracted into columns:
  - `notify_pay_time`
  - `confirm_pay_end_time`
  - `complain_freeze_time`
- Both auto-pay and manual mark-paid flows attempt to persist those timestamps.
- `auto-pay-engine` runs `monitorReleaseDeadlines()` and stores checks in `p2p_release_deadline_monitor_log`.
- The edge logs confirm Binance order-detail payloads contain `confirmPayEndTime`, `notifyPayTime`, `additionalKycVerify`, etc., so this class of monitoring is API-supported.

Issues found

1. Merchant-state card may show stale snapshot as if it is current live state

`MerchantStateCard` combines live API data with the latest stored snapshot:

```text
businessStatus = apiData.businessStatus ?? latestSnapshot.business_status
```

This is useful for continuity, but operationally risky. If the live `baseDetail` request fails, the card can still show an old `Open` snapshot unless the operator notices the small API-unavailable badge. For a compliance/account-state monitor, stale data must be visually distinct.

Fix: show live state and cached snapshot separately, or mark cached-only status as stale/cached with destructive/amber styling when live API fails.

2. Manual refresh success toast can be misleading

`useRefreshMerchantState()` shows `Binance merchant state refreshed` if the edge function returns success. But `binance-ads` can return a successful wrapper around a Binance-level non-`000000` result unless the generic response wrapper rejects it.

Fix: enforce Binance-level validation for `refreshMerchantState`: if `result.code !== '000000'`, return `{ success: false, error: ... }` or make `callBinanceAds` inspect nested Binance codes for this action.

3. `persistMerchantStateSnapshot` ignores insert errors

The function inserts the snapshot but does not check the returned `{ error }`. This can silently lose snapshots if RLS/schema/column issues occur.

Fix: capture insert result and throw/log `error` clearly. Same rule should apply to critical timestamp persistence where possible.

4. Circuit-breaker diagnostic label is too generic

The plan called for distinctions like:

```text
merchant_status_open
merchant_status_closed
merchant_status_take_break
merchant_status_unavailable
```

Current implementation stores the triggering reason, such as `circuit_opened_after_failures`, when a status exists. That records when it checked, but not the diagnostic conclusion.

Fix: store both fields:

- `merchant_state_diagnostic_reason`: why it checked
- `merchant_state_diagnostic`: actual diagnosis, e.g. `merchant_status_open`, `merchant_status_closed`, `merchant_status_take_break`, `merchant_status_unavailable`

If adding a new DB column is not preferred, at minimum change `merchant_state_diagnostic` to the diagnostic conclusion and include reason in logs/metadata.

5. Circuit-breaker uses possibly stale `engineState` after changing OPEN to HALF_OPEN

At the start of `auto-price-engine`, it fetches `engineState`. If cooldown elapsed, it updates the DB row to `HALF_OPEN`, but the local variable remains the old OPEN state. Then:

```text
const isHalfOpen = engineState?.circuit_status === 'HALF_OPEN'
```

This means the half-open test flow may not activate correctly immediately after transition. Later circuit update logic may also use stale state.

Fix: after updating to `HALF_OPEN`, update the local state object or re-fetch `ad_pricing_engine_state` before processing.

6. Release-deadline monitoring can repeatedly create duplicate logs forever

`monitorReleaseDeadlines()` suppresses duplicate checks only within the last 5 minutes for the same auto-pay log. It does not stop checking once a prior log is `resolved`, `already_appeal`, or final. This can create noise every cycle for old orders within the 48-hour window.

Fix: before checking, look up latest monitor status for that `auto_pay_log_id`. Skip if latest status is terminal:

- `resolved`
- `already_appeal`
- optionally `detail_unavailable` only after a retry policy, not immediately terminal

7. Release-deadline monitor uses only auto-pay logs newer than 48 hours

This is okay for noise control, but it means manual or older unresolved issues disappear from active checking after 48 hours even if still not final. For P2P operations, 48 hours may be acceptable, but it should be explicit.

Fix: keep 48-hour cap if desired, but also surface a UI note: “Monitoring checks marked-paid orders from the last 48 hours.” If operationally required, extend to 7 days but skip terminal statuses.

8. Awaiting-release count may include already-final orders

UI `awaitingReleaseCount` is based only on successful mark-paid logs whose `confirm_pay_end_time` is in the future. It does not know whether the order was already released/completed after mark-paid.

Fix: calculate awaiting/overdue from the latest release monitor status or from refreshed order detail where available; otherwise label it as “marked paid, deadline pending” rather than guaranteed awaiting release.

9. RLS only allows SELECT on new tables

This is probably fine because inserts use service role in edge functions. But if any client mutation is later attempted, it will fail. No immediate fix needed unless client-side writes are introduced.

10. Scheduled execution is not proven from code alone

The UI text says auto-pay runs every 60 seconds, and `auto-pay-engine` runs deadline monitoring whenever invoked. But I cannot confirm from files alone that Supabase cron is configured. If cron is not configured, deadline monitoring only works when the engine is called by some existing scheduler or operator action.

Fix: verify existing Supabase scheduled jobs. If missing, configure a compliant scheduled invocation for `auto-pay-engine` using `pg_cron`/`pg_net` outside migrations because it contains project-specific URL/key data.

Implementation plan to correct and verify

1. Tighten merchant-state response validation

- Update `binance-ads` so `getUserDetail` and `refreshMerchantState` fail explicitly when:
  - HTTP status is not OK
  - Binance `code !== '000000'`
  - response data is missing/empty
  - `businessStatus` is absent or non-numeric for refresh monitoring
- Check and log/throw errors from `persistMerchantStateSnapshot` insert.
- Keep using only `/api/sapi/v1/c2c/user/baseDetail`.

2. Make merchant-state UI safe against stale data

- In `MerchantStateCard`, distinguish:
  - live API status
  - latest cached DB snapshot
  - API unavailable / stale cached display
- If live API fails, do not present cached `Open` as normal. Show “Cached: Open” plus “Live API unavailable” in amber/destructive styling.
- Show snapshot age clearly.

3. Correct circuit-breaker diagnostic semantics

- Fix local state handling after OPEN to HALF_OPEN transition.
- Store diagnostic conclusion based on Binance business status:
  - `1 -> merchant_status_open`
  - `2 -> merchant_status_closed`
  - `3 -> merchant_status_take_break`
  - unknown/failure -> `merchant_status_unavailable`
- Preserve the trigger reason either in a new column or in structured metadata/logs.

4. Reduce release-deadline monitor noise

- Before inserting a new monitor log, check latest status for the same `auto_pay_log_id`.
- Skip terminal statuses (`resolved`, `already_appeal`) so already-closed orders do not keep generating checks.
- Keep retrying true transient failures with a controlled interval.
- Include a clear 48-hour monitoring window note, or extend the window if operations require longer tracking.

5. Improve release-deadline UI wording

- Rename “awaiting release” count to a safer label if it is based only on mark-paid logs, e.g. “deadline pending”.
- Show terminal statuses distinctly:
  - resolved: green
  - overdue: amber/destructive
  - already appeal/dispute: amber
  - detail unavailable/error: destructive diagnostic

6. Verify database and runtime state

After implementation, run read-only checks against Supabase:

- Confirm columns exist on `p2p_auto_pay_log`.
- Confirm recent rows have `confirm_pay_end_time` populated after mark-paid success.
- Confirm `binance_merchant_state_snapshots` has recent rows with `business_status = 1/2/3` or logs an explicit API error.
- Confirm `ad_pricing_engine_state` merchant diagnostic fields are populated after circuit checks.
- Confirm `p2p_release_deadline_monitor_log` is not duplicating terminal resolved/appeal rows every cycle.

7. Verify scheduler

- Check whether `auto-pay-engine` is invoked on the promised interval.
- If no schedule exists, add a Supabase cron invocation outside migrations using project-specific function URL/key.

Expected outcome

- Merchant state becomes reliable, not just visually present.
- Operators can tell whether the displayed Binance state is live or cached.
- Auto-price circuit incidents will correctly identify Binance-side account state vs internal automation/proxy failures.
- Release-deadline monitoring will keep useful alerts without creating repeated noise for already-final orders.
- The implementation remains compliant with the Binance API-source-of-truth rule and does not invent/manual-fill Binance state.