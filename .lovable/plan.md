
## Quick Receive — Final Implementation Plan

### Discovery (already verified read-only)
- ✅ `supabase/functions/binance-ads/index.ts` already accepts and forwards `confirmPaidType` on BOTH `releaseCoin` (line 392) and `checkIfCanRelease` (line 423). **No edge function changes needed.**
- ✅ `useReleaseCoin` hook already accepts `confirmPaidType` parameter. **No hook signature change needed.**
- ✅ `OrderActions.tsx` currently shows ReleaseCoin only for `SELL + Pending Release`. BUY-side has no quick path — this is the gap to fill.
- ✅ `useAdActionLog.ts` has `AdActionTypes.ORDER_RELEASED`, `ORDER_MARKED_PAID`, etc. — needs new `ORDER_QUICK_RECEIVED` constant.
- ✅ Order detail responses already carry `quickConfirmAmountUpLimit` (Binance-native field, passed through unchanged).

### Mechanism (reconciled with Binance SAPI v7.4 doc)
- "Quick Receive" = `POST /sapi/v1/c2c/orderMatch/releaseCoin` with body field `confirmPaidType: "quick"` invoked by the **BUYER** after marking paid.
- Binance auto-releases the seller's crypto into our wallet using our merchant security deposit as collateral, eliminating waiting on a slow seller.
- Eligibility gate (per-order): order's `quickConfirmAmountUpLimit` (fiat ceiling) > 0 AND `totalPrice <= quickConfirmAmountUpLimit`.
- 2FA required (same auth payload as normal release: `authType` + method-specific code).

### Files to Modify

**1. `src/hooks/useAdActionLog.ts`**
- Add constant: `ORDER_QUICK_RECEIVED: 'order.quick_received'`
- Add to `ACTION_CATEGORIES.orders` array
- Add to `getActionLabel()` switch: `'Quick Receive (Auto-Release)'`

**2. `src/components/terminal/orders/OrderActions.tsx`**
- Pass `totalPrice` and `quickConfirmAmountUpLimit` as new optional props from parent.
- Add new `<QuickReceiveAction>` component (sibling to existing `ReleaseCoinAction`).
- Render strictly only when:
  ```ts
  tradeType === 'BUY'
  && opStatus === 'Pending Release'   // status 2: we marked paid, awaiting seller release
  && Number(quickConfirmAmountUpLimit) > 0
  && Number(totalPrice) <= Number(quickConfirmAmountUpLimit)
  ```
- UI: 2FA picker (Google/Yubikey/Email/Mobile) reusing the same auth flow as `ReleaseCoinAction`, AlertDialog showing: order amount, ceiling, warning "This auto-releases crypto using your security deposit. Use only after confirming fiat sent."
- On click: call `releaseCoin.mutate({ orderNumber, confirmPaidType: 'quick', authType, [fieldName]: code })`.
- On success: log `ORDER_QUICK_RECEIVED` to `ad_action_logs` with `{orderNumber, totalPrice, quickConfirmAmountUpLimit, asset, fiatUnit, authType}`.

**3. Parent of `OrderActions.tsx`** (`OrderSummaryPanel.tsx` or whichever order detail panel renders it)
- Pass through `totalPrice` and `quickConfirmAmountUpLimit` from the order detail response to `<OrderActions>`.
- Display `quickConfirmAmountUpLimit` as a small "Quick Receive Limit: ₹X" read-only line under the order amount (only when > 0) so operators see the eligibility ceiling.

**4. `src/components/terminal/payer/PayerOrderRow.tsx`**
- Currently only has Mark-as-Paid. Add a "⚡ Quick Receive" button beside it.
- Render only on rows where: order is BUY + status is Pending Release (already paid) + `quickConfirmAmountUpLimit > 0` + `totalPrice <= quickConfirmAmountUpLimit`.
- Same 2FA dialog as in OrderActions (extract a small shared component `QuickReceiveDialog` to avoid duplication, place in `src/components/terminal/orders/QuickReceiveDialog.tsx`).
- On success: log `ORDER_QUICK_RECEIVED` AND call existing `onMarkPaidSuccess`-style refresh callback to refetch payer queue.

**5. New: `src/components/terminal/orders/QuickReceiveDialog.tsx`**
- Shared component used by both `OrderActions` and `PayerOrderRow`.
- Props: `orderNumber, totalPrice, quickConfirmAmountUpLimit, asset, fiatUnit, advNo?, onSuccess?`.
- Encapsulates: trigger button, AlertDialog, 2FA picker, code input, success/failure toast, audit log call.

### Audit Logging Detail
Every successful Quick Receive logs to `ad_action_logs` via `logAdAction()`:
```ts
{
  actionType: AdActionTypes.ORDER_QUICK_RECEIVED,
  advNo,                    // when available
  metadata: {
    orderNumber,
    confirmPaidType: 'quick',
    totalPrice,
    quickConfirmAmountUpLimit,
    asset,
    fiatUnit,
    authType,               // which 2FA method was used
    source: 'orders' | 'payer',  // which UI tab triggered it
  }
}
```
The `created_by`/actor UUID is auto-captured by `logAdAction` via `auth.uid()` (existing behavior — verified in hook).

### Edge Cases Handled
1. **Stale ceiling** — Binance rejects with error code; we catch, surface a clear toast ("Order exceeds current Quick Receive ceiling — use normal Release"), and log the failure with reason.
2. **Race vs seller manually releasing** — Binance returns "order already released" error; we toast and refresh order list.
3. **2FA replay protection** — reuse existing `releaseFiredRef` pattern from `ReleaseCoinAction` to prevent double-submit (YubiKey/FIDO2 codes are one-shot).
4. **Status mismatch at click time** — re-check `opStatus === 'Pending Release'` inside click handler before firing.
5. **Hidden, not greyed** — when ineligible, button is not rendered at all (per requirement: "only reflects in eligible orders").

### Out of Scope (Per Binance SAPI v7.4 — confirmed by Claude's exhaustive doc audit)
- ❌ "Quick Cancel" — does NOT exist in the API. No `confirmPaidType`-equivalent flag on `cancelOrder`. Will not be built.
- ❌ Server-side automation (auto-fire Quick Receive without operator click) — out of scope; stays operator-initiated to preserve attribution and 2FA compliance.

### Post-Implementation Verification (will run after deploy)
1. `supabase--deploy_edge_functions` is NOT needed (no edge function changes).
2. Open the Orders tab in preview, locate a BUY order in Pending Release with `quickConfirmAmountUpLimit > 0` — confirm the new ⚡ Quick Receive button renders.
3. Locate a BUY order with `quickConfirmAmountUpLimit = 0` or with `totalPrice > ceiling` — confirm button is HIDDEN.
4. Trigger a Quick Receive on a real eligible order; verify:
   - Network: `binance-ads` invocation body contains `confirmPaidType: "quick"`.
   - Edge function logs (`supabase--edge_function_logs`) show the proxied `releaseCoin` call returning success.
   - `ad_action_logs` table has the new row with correct actor UUID and metadata.
5. Repeat verification on the Payer tab.
6. If Binance returns a non-success code in the Quick Receive call, document the exact error and confirm our toast surfaces it accurately.

### Risk Assessment
- **Low risk**: backend code path is unchanged (already supports the flag); we're adding a UI-only branch with strict eligibility gating that defaults to hidden.
- **No DB migration** required — we use the existing `ad_action_logs` table and a new string constant.
- **No new permissions** — Quick Receive is a sub-mode of the existing release flow; if a user is allowed to release, they're allowed to quick-release.
