# Ad Max Quantity — calibration table + one-click "Max" bulk action

Goal: know the highest total ad quantity (initAmount) Binance will accept for each asset in each market zone (Block vs P2P), store it, and let you select ads and push them all to that ceiling with one button.

## 1. Capacity table (stored, not guessed)

A new table holds one row per `exchange account + asset + zone + side`:
- max quantity Binance accepted
- lowest quantity Binance rejected (the bracket)
- how it was determined (probe / manual override / learned from rejection)
- who ran it and when, plus the Binance error code seen at the ceiling

Nothing is inferred or defaulted. Until a combination has been calibrated, the Max button reports "not calibrated" for those ads instead of using a made-up number.

## 2. Auto-probe (binary search)

A "Calibrate limits" screen in Ads Manager runs the discovery:

- For each asset + zone + side combination, it picks a **currently offline ad** of that exact shape as the probe carrier, so no live, publicly visible ad is touched. If no offline ad exists for a combination, that combination is listed as "needs an offline ad" — you can park one ad offline and re-run, rather than the system silently creating public ads.
- Binary search on `initAmount` between the current value and a high upper bound: each step sends a normal ad-update with every other field unchanged, reads Binance's accept/reject, and narrows the bracket. Rejections are classified — only a genuine quantity-cap error narrows the ceiling; balance errors, rate-limit errors and auth errors abort that combination and are reported as-is.
- The probe restores each carrier ad's original quantity when it finishes or aborts.
- Throttled between calls to respect Binance rate limits; live progress per combination; a full log of every attempt (value tried, response code, message) is kept for audit.
- Re-runnable per asset/zone so you can refresh a single row without a full sweep.

Result: a readable table — asset × zone × side → max quantity — with the exact Binance rejection message that established each ceiling. You can also hand-override any cell, which is recorded as a manual override.

## 3. "Max" bulk action

With ads selected in Ads Manager, a **Max Qty** button appears in the bulk toolbar:

- Groups the selection by asset + zone + side and looks up the calibrated ceiling for each.
- For SELL ads, clamps to the available wallet balance for that asset — it applies the lower of (calibrated ceiling, available balance) and shows which one bound it.
- Preview step before anything is sent: per ad, current quantity → target quantity, plus the reason for any clamp, and a clear "not calibrated / skipped" list.
- On execute, updates ads one by one with per-ad success/failure results, exactly like the existing bulk limit editor.
- If Binance rejects a value the table said was fine, the ceiling for that combination is automatically lowered to just under the rejected value and flagged for re-calibration.

## Technical notes

- New table `binance_ad_capacity_limits` (account-scoped, RLS to terminal staff, writes gated on the terminal ad-management permission) plus `binance_ad_capacity_probe_log`.
- Probe runs in a new edge function so the search loop, throttling and restore-on-abort survive page navigation; it reuses the existing `binance-ads` update path and per-account credential resolution.
- Binance API scope: there is no documented endpoint that returns per-asset/per-zone ad quantity caps, which is why discovery is empirical via accepted/rejected ad updates. No cap is fabricated or extrapolated across assets or zones.
- UI: `BulkMaxQuantityDialog` alongside the existing bulk dialogs, a Max Qty entry in `BulkActionToolbar`, and a capacity table view in Terminal settings.
