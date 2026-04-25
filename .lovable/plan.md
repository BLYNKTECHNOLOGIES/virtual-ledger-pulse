## Finding

The screenshot is not showing a simple UI loading issue. The expanded panel is displaying fields that Binance is not returning from the currently used order-detail response.

Current live `getOrderDetail` logs show Binance returns useful order-level data such as:

- `commissionRate`
- `takerCommissionRate`
- `commission`
- `payMethods`
- `orderStatus`
- `notifyPayTime`
- `confirmPayEndTime`
- `complaintDeadline`
- `avgReleasePeriod`
- `avgPayPeriod`

But it does not return the nested objects the UI expects for the Risk/Historical/KYC sections:

- `buyer.userOrderHistoryStatsVo`
- `seller.userOrderHistoryStatsVo`
- `userOrderInProgressStatsVo`
- `userKycVo`
- `maliceInitiatorCount`
- `buyerCreditScore`
- `sellerCreditScore`

Because those nested objects are absent, the UI correctly falls back to “Not provided by Binance”, but the label makes it look like the feature is broken. It is actually over-displaying fields that are not available from this endpoint/proxy response.

## Why this matters

The current panel creates false expectation and operational noise. Operators see many “Not provided by Binance” rows and may assume Binance data capture failed, even though Binance did return useful fields.

The fix should not invent or infer unavailable Binance fields. Per your Binance integration rule, we should only show API-backed data and clearly mark unavailable API scope.

## Plan

### 1. Stop rendering unavailable risk/KYC rows as normal data

Update `OrderDetailWorkspace.tsx` so the expanded panel only renders sections when at least one real value exists.

Instead of showing 15 rows of “Not provided by Binance”, it will show a compact message:

> Binance did not return counterparty risk/KYC detail for this order through the current API response.

This keeps the UI honest and prevents false alarms.

### 2. Add an “Order-level Binance data” section using fields that are actually returned

Add a section for confirmed fields currently present in `getUserOrderDetail`, such as:

- Order status
- Payment method
- Notify payment time
- Confirm payment deadline
- Complaint deadline / complaint allowed
- Average release period
- Average pay period
- Online status
- Additional KYC flag

These are useful to your terminal workflow and are API-backed.

### 3. Fix commission snapshot display logic

The commission snapshot currently shows a misleading mismatch warning because it compares:

- rate-based theoretical commission: `amount * commissionRate`
- actual returned commission: often `0`

For Binance P2P, `commission: 0` can be a legitimate API value, especially depending on maker/taker/origin and promotional/fee configuration. The UI should not automatically call this a discrepancy unless Binance provides enough context to prove it is wrong.

Change the warning copy from “differs from audit estimate” to a neutral “Rate-based estimate” note, or only flag mismatch when both actual commission and fee basis are explicitly reliable.

### 4. Preserve raw snapshots for audit, but make the UI API-capability-aware

Keep storing:

- `order_detail_raw`
- `counterparty_risk_snapshot`
- `binance_commission_rate_snapshots`

But enhance the normalized snapshot with metadata like:

```text
availableFields: [...]
missingSections: ["counterpartyRisk", "kyc", "historicalStats"]
sourceEndpoint: getUserOrderDetail
```

This makes future debugging easier without pretending missing fields exist.

### 5. Root-cause verification after implementation

After the fix, verify:

- `getOrderDetail` still persists raw Binance data.
- Expanded panel no longer floods rows with “Not provided by Binance”.
- Available order-level timings and commission fields display correctly.
- Risk/KYC sections show only when Binance actually returns those objects.
- No dummy/manual shadow fields are introduced.

## Files to update

- `src/components/terminal/orders/OrderDetailWorkspace.tsx`
- `supabase/functions/binance-ads/index.ts`

No database migration is required unless we decide to persist the optional `availableFields/missingSections` metadata separately. The existing JSON snapshot columns can store this safely.