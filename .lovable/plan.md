## Gap 8 assessment

Claude’s finding is partially valid, not fully accurate.

What is already implemented:
- `queryCounterPartyStats` exists in `binance-ads` and calls Binance/proxy endpoint `/sapi/v1/c2c/orderMatch/queryCounterPartyOrderStatistic`.
- The terminal already fetches these stats via `useCounterpartyBinanceStats(orderNumber)`.
- The order workspace already displays:
  - `registerDays` as “Joined X days ago”
  - `numberOfTradesWithCounterpartyCompleted30day` as “Trades with us (30d)”
- So it is not true that these fields are completely unused.

What is still a real gap:
- These fields are only consumed live in the UI for the currently opened order.
- They are not snapshotted into `p2p_counterparties`, `binance_order_history`, or a dedicated risk snapshot table.
- They are not used by automation/risk logic to assign trust tiers, raise warnings, or explain why an operator should be cautious.
- Existing “Orders Completed With Us” also uses local `binance_order_history` by `verified_name`, which is useful but weaker than Binance’s direct relationship field because verified names are not globally unique in this project.

## Usefulness for this ERP

This is useful if handled as Binance-sourced risk intelligence, not as a new manual truth source.

High-value uses:
- Detect first-time or low-history counterparties using Binance’s direct relationship count.
- Highlight brand-new Binance accounts using `registerDays`.
- Create operator-visible trust labels in the terminal without requiring separate manual checks.
- Improve auditability: later we can answer “what did Binance say about this counterparty at the time of the trade?”

What should not be done:
- Do not infer relationship count when Binance does not return it.
- Do not replace KYC/client identity rules with nickname-only logic.
- Do not auto-block orders only because account age is low; this should start as warnings/trust tiering unless you later approve strict automation.
- Do not spend extra API quota in background loops unless the endpoint is confirmed stable and rate-safe.

## Implementation plan

### 1. Validate Binance/proxy response shape
- Confirm the endpoint returns the expected fields through the current proxy:
  - `registerDays`
  - `numberOfTradesWithCounterpartyCompleted30day`
  - existing surrounding stats such as completion rate and 30d completed count
- Keep the response raw shape intact.
- If the proxy does not return either field consistently, mark the missing item as “Not returned by Binance” and do not simulate it.

### 2. Add a Binance-sourced counterparty stats snapshot
- Add nullable Binance snapshot columns to `p2p_counterparties`, or use a compact dedicated table if existing table bloat is a concern.
- Recommended minimal fields:
  - `binance_register_days`
  - `binance_trades_with_us_30d`
  - `binance_counterparty_stats_raw`
  - `binance_counterparty_stats_captured_at`
  - `binance_counterparty_stats_order_number`
- These fields are snapshots only, not manually editable source-of-truth data.

### 3. Persist stats when the terminal already fetches them
- Update `queryCounterPartyStats` in `supabase/functions/binance-ads/index.ts` so that after a successful Binance response it optionally persists the snapshot.
- The frontend should pass enough context to map the stats safely:
  - `orderNumber`
  - `counterpartyNickname` when available
  - `verifiedName` only as supporting context, not as the unique key
- Persist only if a valid counterparty nickname/order mapping exists.
- Do not create fake counterparties from incomplete Binance data.

### 4. Derive non-manual trust/risk labels
- Add a small deterministic helper for display labels, for example:
  - `First-time / low relationship`: trades with us 30d = 0
  - `Known counterparty`: trades with us 30d between 1 and 9
  - `Trusted recent counterparty`: trades with us 30d >= 10
  - `New Binance account`: registerDays < 30
  - `Fresh account warning`: registerDays < 7
- Treat null as “Not returned by Binance,” not as zero.

### 5. Improve terminal visibility
- Keep the existing live stats display.
- Add a compact “Binance Relationship Risk” block in the order workspace using:
  - live `queryCounterPartyStats` when available
  - stored snapshot as fallback
- Clearly label the source:
  - “Live Binance stats”
  - “Last Binance snapshot”
  - “Not returned by Binance”
- Keep the local completed-order count, but label it separately as “Local ERP history” because it is based on internal synced orders and verified-name matching.

### 6. Optional flagging, but only as a warning at this stage
- Do not auto-flag counterparties immediately based only on low `registerDays` or low relationship count.
- Add warning metadata/UI indicators first.
- If later you want automation, define explicit thresholds such as:
  - account age < 7 days and trades with us 30d = 0
  - plus separate negative signal such as cancel reason code 4 repeats, appeal signals, or over-complained status
- This avoids overreacting to legitimate new counterparties.

### 7. Add observability
- Add non-sensitive diagnostics to the returned result or edge logs:
  - endpoint called
  - whether snapshot persisted
  - fields present/missing
  - target order number
- Do not log sensitive identity documents, full raw personal identifiers, or secrets.

## Technical notes

Likely target files:
- `supabase/functions/binance-ads/index.ts`
- `src/hooks/useBinanceActions.tsx`
- `src/components/terminal/orders/OrderDetailWorkspace.tsx`
- a new migration for counterparty stat snapshot fields/table

Expected outcome:
- The fields Claude mentioned remain visible live, but also become durable, auditable Binance-sourced risk signals.
- Operators get clearer first-time/new-account warnings in the terminal.
- The ERP avoids unsafe inference and respects Binance API/proxy limitations.