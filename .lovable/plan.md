# Shift filtering for date ranges and quick presets

Today the S1 / S2 / S3 / Full Day chips only appear when a single date is picked. Selecting a range (or 7D / 30D / 1Y) always uses whole days. This adds shift selection to those modes: for every day inside the selected window, only the chosen shift's hours are counted.

## Behaviour

- The shift chips stay visible in every mode: single date, custom range, and the 7D / 30D / 1Y presets.
- Shifts keep their existing IST hours: S1 Night 1AM–9AM, S2 Morning 9AM–5:30PM, S3 Evening 5:30PM–1AM.
- For a multi-day window, each day contributes only its shift slice. Example: 1–5 Sep with S2 counts five separate 9AM–5:30PM blocks, not one continuous stretch.
- The evening shift crosses midnight, so the last day of the window includes its after-midnight tail (up to 1AM the next morning), as confirmed.
- Nothing in the future is counted — the window is still capped at the current time.
- Every number driven by the filter follows the same rule: order counts, buy/sell volume, average order size, completion rate, status breakdown, the trade-volume and activity charts, ad performance, and dashboard exports.
- The header label reads, for example, "01 Sep – 08 Sep · Morning (9AM–5:30PM)" so it is obvious a shift filter is active.
- The chosen shift is remembered per operator alongside the existing saved filter, and older saved filters without a shift simply behave as Full Day.

## Technical notes

- `src/components/terminal/dashboard/TimePeriodFilter.tsx`
  - Extend `TimeFilter` so `range`, `7d`, `30d`, `1y` also carry `shift: ShiftKey`.
  - `getTimestampsForFilter` keeps returning the outer bounds (first day's shift start → last day's shift end, capped at now) so the database read stays scoped and cheap.
  - Add `buildShiftWindows(filter)` returning the per-day IST intervals, and `makeShiftPredicate(filter)` returning `(timestampMs) => boolean` used for exact per-order filtering. Full Day returns a single continuous window (no behaviour change).
  - Show the shift chips in all modes; update `getFilterLabel`, `serializeTimeFilter`, `deserializeTimeFilter` (defaulting a missing shift to `all`).
- `src/pages/terminal/TerminalDashboard.tsx` — replace the plain `createTime >= start && <= end` filter with the predicate; pass the predicate-filtered order list into `computeOrderStats` and keep the outer bounds for the period window.
- `src/hooks/useBinanceOrders.tsx` — `computeOrderStats` accepts an optional `inWindow` predicate for its "completed in period" check so it matches the shift slices instead of the outer span.
- `src/pages/terminal/TerminalAnalytics.tsx` — apply the same predicate to its order list; daily buckets stay daily, hourly buckets stay for single-date mode.
- Charts and exports consume the already-filtered list, so no separate change is needed there.
- No database or Binance API change: this is purely a client-side time-window refinement over data already fetched (Binance exposes no shift concept, so filtering must happen on `createTime`).

## Verification

- Compare, for a fixed range, the sum of per-day single-date S2 results against the range+S2 result — they must match exactly.
- Confirm Full Day range results are unchanged from today's behaviour.
- Confirm the evening shift on the last day includes orders between midnight and 1AM the following morning, and that nothing after "now" is included.
