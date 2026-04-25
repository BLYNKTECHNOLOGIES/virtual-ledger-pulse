## Finding assessment

Claude's Gap 7 is partially valid and useful, but not fully accurate for this project.

What is already implemented:
- `binance-ads` `listActiveOrders` already forwards some filters: `advNo`, `asset`, `tradeType`, `startDate`, `endDate`.
- Terminal UI already uses `chatUnreadCount` from active orders for unread badges/counts.
- Terminal UI already uses `notifyPayEndTime` for payment countdowns.
- `tradeMethodCommissionRateVoList` is already snapshotted from active order list responses.
- Gap 4 already added release-deadline monitoring from `markOrderAsPaid` response timestamps.

What is still useful:
- `auto-pay-engine` still fetches active BUY orders with only `{ page, rows, tradeType: "BUY" }`, then filters locally. If Binance/proxy supports `orderStatusList`, it should request only actionable states to reduce API load and stale/noise exposure.
- `auto-reply-engine` fetches active orders with only `{ page, rows }`. It should use bounded/status-filtered requests so rules are evaluated only against actionable orders.
- `binance-ads` currently does not forward `orderStatusList` or `payType` in `listActiveOrders`, so frontend/automation cannot use those filters through the central API wrapper.
- `confirmPayEndTime` from `listOrders` can be captured as an additional source for release-deadline monitoring, but it must be treated as Binance-sourced only and not inferred.
- `notifyPayEndTime` from `listOrders` is already used in the UI, but auto-pay/reply should preserve it consistently in logs/metadata for auditability.

What should not be overbuilt:
- No manual shadow fields for Binance order state.
- No guessed deadlines if Binance returns null.
- No per-ad or pay-method analytics UI until we first confirm the proxy accepts `advNo` and `payType` for `listOrders` and returns stable data.

## Implementation plan

### 1. Validate Binance/proxy support before changing behavior
- Add a safe diagnostic path in the existing `binance-ads` `listActiveOrders` action to forward only documented/supported list filters.
- Validate these fields against the current proxy behavior:
  - `orderStatusList`
  - `advNo`
  - `payType`
  - `startDate`
  - `endDate`
- If `orderStatusList` or `payType` is rejected by the proxy, do not simulate them; keep client-side filtering and return a clear diagnostic message.

### 2. Harden `binance-ads` `listActiveOrders` request builder
- Extend the request body whitelist to include:
  - `orderStatusList`
  - `payType`
  - existing `advNo`, `asset`, `tradeType`, `startDate`, `endDate`, `page`, `rows`
- Validate types before forwarding:
  - `orderStatusList` must be an array of Binance status numbers/strings.
  - dates must be passed through only when present, not generated.
  - empty/null filters should be omitted.
- Keep raw Binance response shape intact so fields are not dropped.

### 3. Use status-bounded order fetches in automation engines
- Update `auto-pay-engine` live order fetch to request only BUY orders in payment-actionable states, if proxy validation succeeds.
- Update `auto-reply-engine` active-order fetch to request active/actionable states instead of unbounded active pages, if proxy validation succeeds.
- Preserve fallback behavior: if filtered requests fail, log the proxy limitation and fall back to current unfiltered calls plus existing local safety filters.

### 4. Capture useful response fields without inventing values
- Extend normalized order objects in automation to preserve:
  - `chatUnreadCount`
  - `tradeMethodCommissionRateVoList`
  - `confirmPayEndTime`
  - `notifyPayEndTime`
- Store these in existing log metadata where appropriate rather than creating unnecessary manual source-of-truth columns.
- For release-deadline monitoring, use `confirmPayEndTime` from `listOrders` as an additional Binance source only when present.
- UI should display “Not returned by Binance” when these fields are missing, not estimate them.

### 5. Improve terminal visibility using existing UI patterns
- Keep current unread-count badges, but make sure they are sourced from the active-order response and remain stable after merge with history records.
- In the order detail/workspace, surface Binance-provided deadlines consistently:
  - payment deadline: `notifyPayEndTime`
  - release deadline: `confirmPayEndTime`
- Do not add new manual analytics pages at this stage.

### 6. Add audit/observability for filtered fetches
- Add non-sensitive metadata to automation run summaries:
  - whether filtered `listOrders` was used
  - requested status filters
  - fallback reason if proxy rejected filters
  - count of orders fetched per page
- This helps verify efficiency improvement without exposing secrets or raw credentials.

## Technical notes

Target files:
- `supabase/functions/binance-ads/index.ts`
- `supabase/functions/auto-pay-engine/index.ts`
- `supabase/functions/auto-reply-engine/index.ts`
- `src/hooks/useBinanceActions.tsx` if hook typing needs filter support
- `src/pages/terminal/TerminalOrders.tsx` only if deadline/unread merge needs display hardening

No database migration is planned initially because the existing logs/metadata and commission snapshot logic can hold the additional response fields. A migration should only be added later if validated Binance data proves valuable for long-term reporting.

Expected business value:
- Lower Binance/proxy load for automation runs.
- Less noisy automation candidate pools.
- Better audit visibility for payment/release deadlines.
- More reliable terminal unread indicators without extra chat fetches.
- Foundation for later per-ad/pay-method analytics, but only after API support is proven.