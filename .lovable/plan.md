# Plan: Binance Cancel Reason Hardening and Counterparty Intelligence

## Assessment

Claude’s finding is useful, but only partly.

What is confirmed in this project:
- `binance-ads` already forwards `orderCancelReasonCode` and `orderCancelAdditionalInfo` to Binance `POST /sapi/v1/c2c/orderMatch/cancelOrder`.
- The current UI cancel flow does not ask for a reason at all, so the API is usually called without a reason code.
- `getOrderDetail` already persists the raw Binance order detail into `binance_order_history.order_detail_raw`, but it does not extract cancel fields into first-class columns.
- `p2p_counterparties` already supports `is_flagged` and `flag_reason`, but there is no cancellation-reason-based flagging logic.

Your business rule overrides the broad enum: operators should only be offered these two cancellation reasons:
- Code 4: Seller’s payment method issue
- Code 5: Other

Codes 1, 2, 3, and 6 should not be selectable in the ERP cancel UI. Because code 4 is the only operator-selected problematic seller signal in your allowed workflow, automatic flagging should be based on repeated code-4 cancellations, not codes 3/4/6.

## Implementation Scope

### 1. UI cancel flow
Update `OrderActions.tsx` cancellation dialog for BUY orders so operators must choose one of only two Binance-supported reasons:

```text
4 — Seller’s payment method issue
5 — Other
```

Additional behavior:
- Require a reason before final confirmation.
- Show an optional notes field for code 5 and for operational context.
- Keep the existing two-step destructive confirmation pattern using `AlertDialog`.
- Submit `orderCancelReasonCode` and `orderCancelAdditionalInfo` through the existing `useCancelOrder()` mutation.

### 2. Server-side validation
Harden `supabase/functions/binance-ads/index.ts` so `cancelOrder` accepts only allowed reason codes `4` and `5` from this ERP.

If any other code is sent by a manipulated frontend, return a clear 400-style error and do not call Binance.

This avoids relying on UI-only restrictions.

### 3. Decode and store cancellation reasons
Add first-class cancellation reason fields to `binance_order_history` and `p2p_order_records`:
- `cancel_reason_code`
- `cancel_reason_label`
- `cancel_reason_additional`
- `cancel_reason_source` (`operator_cancel`, `binance_order_detail`, or `unknown`)
- `cancel_reason_captured_at`

The label mapping will be conservative and API-aligned:

```text
4 = Seller’s payment method issue
5 = Other
unknown = preserve raw code without guessing
```

If Binance order detail returns `cancelReasonDesc` / `cancelReasonAdditional`, store those as Binance-provided cancellation intelligence. Do not infer missing values.

### 4. Persist our own operator cancellation reason immediately
After a successful `cancelOrder` call:
- Save the selected reason code, decoded label, and notes to `binance_order_history` when the order exists locally.
- Also update `p2p_order_records` if present.
- Preserve the raw Binance response for audit where existing logging supports it.

This gives the ERP a reliable audit trail even if the later order detail response is sparse.

### 5. Capture counterparty-side / Binance-returned cancel reasons from order detail
Enhance the existing `getOrderDetail` persistence path:
- Extract `cancelReasonDesc`, `cancelReasonAdditional`, and any available code-like cancel field from the raw Binance detail object.
- Store exactly what Binance returns.
- Keep the raw `order_detail_raw` unchanged as the source of truth.

If Binance returns null or omits the fields, the UI should show “Not returned by Binance,” not a guessed reason.

### 6. Counterparty risk rule for repeated payment-method cancellations
Implement a database-side helper that flags a counterparty only when repeated operator cancellations use code 4.

Suggested default threshold:
- Flag after 2 code-4 BUY cancellations against the same Binance nickname within 30 days.

Flag result:
- `p2p_counterparties.is_flagged = true`
- Append a clear `flag_reason`, e.g. `Repeated seller payment method issue cancellations: 2 in 30 days`

Code 5 (`Other`) should be stored for audit, but should not auto-flag by itself because it is too broad.

### 7. UI visibility
Surface cancellation intelligence in the terminal without creating a separate compliance page:
- In cancelled order rows/details, display the decoded cancel reason.
- If `cancel_reason_source = binance_order_detail`, label it as Binance-returned.
- If the counterparty is auto-flagged due to code-4 repeats, show the existing flagged counterparty indicator/reason where counterparty data is already displayed.

## Out of Scope / Not Implemented

- Codes 1, 2, 3, and 6 will not be offered in the UI, per your instruction.
- No fraud scoring engine.
- No appeal evidence export.
- No compliance-only audit page.
- No manual synthetic Binance cancel data. If Binance does not return a field, the system will display it as unavailable.

## Technical Notes

Files likely to change:
- `src/components/terminal/orders/OrderActions.tsx`
- `src/hooks/useBinanceActions.tsx`
- `supabase/functions/binance-ads/index.ts`
- Supabase migration for cancel reason columns, indexes, and helper function/trigger
- Type usage updates where needed, without manually editing generated Supabase types unless the environment regenerates them

Security/data-integrity rules:
- Server validates allowed cancel codes, not just the UI.
- Existing destructive confirmation pattern remains.
- RLS remains enforced; persistence from edge function uses service role internally only.
- No hardcoded user identity strings; audit actor stays tied to authenticated flow/logging already in use.

## Verification Plan

After implementation:
- Confirm the UI only presents codes 4 and 5.
- Confirm cancellation cannot be submitted without a selected reason.
- Confirm a manipulated request with code 1/2/3/6 is rejected before reaching Binance.
- Confirm code 4/5 are forwarded to the Binance proxy with the correct field names.
- Confirm cancel reason fields are persisted for local order records.
- Confirm repeated code-4 cancellations flag the counterparty, while code-5-only cancellations do not auto-flag.
- Confirm missing Binance detail cancel fields render as unavailable rather than guessed.