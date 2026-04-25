## Assessment

Claude's finding is useful, but only if implemented as a snapshot and audit feature, not as a replacement for dedicated pre-ad commission APIs.

What I verified in our project:
- We already call these relevant Binance/proxy endpoints:
  - `orderMatch/listOrders` via `listActiveOrders`
  - `orderMatch/getUserOrderDetail` via `getOrderDetail`
  - `ads/getDetailByNo` via `getAdDetail` and ad listing enrichment
- Live `getAdDetail` currently returns `commissionRate` and `tradeMethodCommissionRateVoList` for the ad. Example verified response includes:
  - `commissionRate: "0.00105"`
  - `tradeMethodCommissionRateVoList: [{ tradeMethodIdentifier: "UPI", tradeMethodName: "UPI", commissionRate: "0.00105" }]`
- Stored `order_detail_raw` rows also already contain `commissionRate`, `takerCommissionRate`, `commission`, `takerCommission`, and `tradeMethodCommissionRateVoList`.
- Current DB only stores final commission amount as text (`commission`), plus raw JSON. There is no normalized commission-rate snapshot table/columns.

Important limitation:
- This does not fully solve “know the exact rate before creating a brand-new ad/payment-method combination” unless Binance/proxy supports the dedicated commission-rate endpoints.
- Existing responses are still valuable because they give point-in-time proof of what rate Binance returned for actual ads/orders.

## Why this is useful for our ERP/terminal flow

1. Platform fee accuracy/audit
   - We have had multiple commission/fee correction migrations before. A normalized snapshot lets us prove whether the final `commission` amount matches Binance rate × order amount.

2. Drift detection
   - If Binance changes UPI/IMPS/bank transfer commission rates, we can detect it from normal terminal traffic without extra API calls.

3. Ad profitability view
   - Ad Manager can show the current Binance commission rate per payment method directly on each ad.
   - Operators can understand net effective rate after platform fee.

4. Order profile transparency
   - In the existing “View more Binance data” profile area, we can show:
     - selected payment method
     - maker/taker commission rate
     - actual commission charged
     - expected commission based on captured rate
     - mismatch warning if different

5. Future commission-rate API support
   - If/when dedicated endpoints are confirmed and proxy-supported, they can feed the same table for pre-ad posting. Until then we only use verified Binance-returned data from existing calls.

## Implementation plan

### 1. Add normalized storage for commission snapshots

Create a new table, not just hidden JSON fields, so it can be queried and audited:

```text
binance_commission_rate_snapshots
- id uuid primary key
- source_type text              -- ad_detail, order_detail, active_order_list
- source_id text                -- advNo or orderNumber
- order_number text nullable
- adv_no text nullable
- trade_type text nullable
- asset text default USDT
- fiat_unit text default INR
- pay_method_identifier text nullable
- pay_method_name text nullable
- pay_id text nullable
- maker_commission_rate numeric nullable
- taker_commission_rate numeric nullable
- effective_commission_rate numeric nullable
- actual_commission_amount numeric nullable
- commission_asset text nullable
- total_price numeric nullable
- amount numeric nullable
- raw_snapshot jsonb not null
- captured_at timestamptz default now()
- unique(source_type, source_id, pay_method_identifier, coalesce(pay_id,''))
```

Also add helpful indexes by `adv_no`, `order_number`, `pay_method_identifier`, and `captured_at`.

### 2. Add a shared extractor in `binance-ads`

Implement normalization that safely extracts from whichever Binance response has the fields:

- `tradeMethodCommissionRateVoList[]`
- top-level `commissionRate`
- `takerCommissionRate`
- `commission`
- `takerCommission`
- `tradeMethods[]` / `payMethods[]`
- `selectedPayId` / `payId`

Rules:
- Use Binance-returned values only.
- If fields are missing/empty, store nothing and show “Not provided by Binance”.
- Do not infer commission rates from final commission amount unless clearly labelled as a derived audit calculation in UI.

### 3. Capture snapshots where data already flows

Update `supabase/functions/binance-ads/index.ts`:

- `getAdDetail`
  - After successful response, normalize and upsert ad-level commission snapshots.
  - This is best for Ad Manager because it captures current rate per payment method on each ad.

- `getOrderDetail`
  - Extend the existing `order_detail_raw` persistence to also upsert order-level commission snapshots.
  - This is best for actual order audit.

- `listActiveOrders`
  - If `listOrders` response includes commission-rate data, capture it too.
  - If the proxy response does not include it in practice, do not fabricate anything.

Optional in same pass:
- `enrich-order-names`
  - When it calls `getUserOrderDetail` for completed orders, also persist commission snapshots so historical completed orders get covered during enrichment.

### 4. Backfill from already stored raw JSON

Add a safe SQL backfill/function or one-time migration that reads existing:
- `binance_order_history.raw_data`
- `binance_order_history.order_detail_raw`

and inserts snapshots where commission fields exist.

This avoids needing to re-call Binance for every historical order.

### 5. Add frontend hooks

Add hooks in `useBinanceActions.tsx` / ad hooks:

- `useOrderCommissionSnapshots(orderNumber)`
- `useAdCommissionSnapshots(advNo)`
- optional dashboard hook for latest rate by payment method

These should query the normalized table, not scan raw JSON in the browser.

### 6. UI placement

#### Order profile
In `OrderDetailWorkspace.tsx`, inside the existing “View more Binance data” expanded section, add a “Commission snapshot” card:

- Payment method
- Maker commission rate
- Taker commission rate
- Effective rate used
- Actual commission charged by Binance
- Estimated commission from rate, only as an audit comparison
- Difference/mismatch badge if outside a small tolerance
- Captured timestamp and source (`getUserOrderDetail`, `listOrders`, etc.)

#### Ad Manager
For each ad/detail panel:

- Show “Binance commission rate” near payment methods.
- Show rate per payment method if `tradeMethodCommissionRateVoList` exists.
- Show “Not provided by Binance” if absent.
- Optionally show estimated net price after commission for operator awareness, clearly labelled as estimate.

### 7. Guardrails and validation

- Do not implement fake/dummy commission rates.
- Do not hardcode UPI/IMPS rates.
- Do not use this as a substitute for pre-ad rates unless the official endpoint/proxy is verified.
- Treat raw Binance response as source of truth.
- Add mismatch warnings only, not automatic ledger corrections.
- Run TypeScript check.
- Test deployed edge function with:
  - `getAdDetail` for a known ad
  - `getOrderDetail` for a known order
  - DB read query confirming snapshots were inserted

## Expected result

After implementation, we will have a commission-rate snapshot book built from actual Binance responses we already receive. It will improve auditability, operator visibility, and fee drift detection with minimal extra API usage, while staying compliant with the rule that Binance must be the source of truth.