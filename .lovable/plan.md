Plan to implement Binance counterparty risk-detail capture and UI

I agree with the finding: the system already calls `getUserOrderDetail`, but only uses it for verified name in `enrich-order-names`. The live terminal profile also calls `getOrderDetail`, but the extra maker/taker risk fields are not normalized, persisted, or displayed usefully. This is a real data-capture gap.

What I will implement

1. Validate and normalize the Binance payload shape
- Keep using the existing supported proxy endpoint:
  `POST /sapi/v1/c2c/orderMatch/getUserOrderDetail`
- Use the existing `binance-ads` edge function action `getOrderDetail`, which already sends both `adOrderNo` and `orderNo`.
- Add a small normalizer that chooses the actual counterparty object based on our side of trade:
  - Our BUY order: counterparty is seller/maker-or-taker depending on Binance payload role.
  - Our SELL order: counterparty is buyer/maker-or-taker depending on Binance payload role.
- Avoid guessing fields that Binance does not return. If a field is absent/null, the UI will show “Not provided by Binance”, not inferred values.

2. Store the extra order-detail snapshot
- Add structured columns to `binance_order_history` so completed/historical orders keep the snapshot instead of losing it:
  - `order_detail_raw jsonb` — raw `getUserOrderDetail` response detail for audit/debug.
  - `counterparty_risk_snapshot jsonb` — normalized risk/stats/KYC subset used by UI and future risk scoring.
  - `counterparty_risk_captured_at timestamptz`.
- This keeps order-level snapshots because values like credit score, complaints, in-progress appeal counts, and risk flags can change over time. It is safer than only overwriting the master `p2p_counterparties` row.
- No secrets or credentials will be stored.

3. Update enrichment so it captures more than verified name
- Update `supabase/functions/enrich-order-names/index.ts` to:
  - Continue filling `verified_name`.
  - Store `order_detail_raw` and `counterparty_risk_snapshot` for every order it processes.
  - Process orders that are missing either verified name or risk snapshot, not just `verified_name IS NULL`.
  - Include completed orders and recent terminal-relevant orders where detail is available.
- Preserve rate limiting and retry behavior.

4. Capture snapshots during live terminal usage as well
- Update `supabase/functions/binance-ads/index.ts` action `getOrderDetail` to return the full detail as it does now, and optionally persist a normalized snapshot to `binance_order_history` when an `orderNumber` is provided.
- This means operators opening an order profile will also help fill missing snapshots without waiting for the enrichment job.
- If the order is not yet in `binance_order_history`, the function will return live data only and not create fake/manual records.

5. Add a “View more Binance data” section in the order profile
- Update `OrderDetailWorkspace.tsx` profile panel.
- Keep the current profile clean by default.
- Add a small button/accordion: “View more Binance data”.
- Only after clicking, show organized sections:
  - Risk warnings:
    - maliceInitiatorCount
    - complaintCount
    - overComplained
    - inAppealCount
    - inAppealCountAfterBuyerPaid
    - buyerCreditScore/sellerCreditScore or normalized counterparty credit score
  - Historical stats:
    - accountAge/register days
    - appealed counts and appeal rates
    - finish rates
    - avg pay/release time
    - counterparty count
  - Current activity load:
    - tradingCount
    - inProcessCount
    - buyerPayedCount
    - active appeal counters
  - KYC snapshot:
    - kycLevel, kycStatus, identityStatus, faceStatus, addressStatus, certificateStatus
    - kycType/companyName if provided
    - Name fields only if Binance provides them for that order
  - Raw/source metadata:
    - captured timestamp
    - “Live from Binance” vs “Stored snapshot”
- High-risk signals will be highlighted, especially:
  - `maliceInitiatorCount > 0`
  - `inAppealCountAfterBuyerPaid > 0`
  - `overComplained = true`
  - high complaint/appeal counts

6. Add reusable hooks/types for terminal profile data
- Extend `useBinanceActions.tsx` / terminal hooks to expose:
  - live order detail from Binance
  - stored risk snapshot fallback from `binance_order_history`
  - normalized `counterpartyRiskSnapshot`
- Update TypeScript interfaces in local code. I will not manually edit generated Supabase types unless the build requires regeneration patterns already used in this repo.

7. Keep risk-detection integration ready, but do not silently auto-block yet
- I will not immediately change order assignment, payer filtering, or client risk classification based only on this new data without a separate rule design, because that could disrupt operations.
- I will surface the strongest Binance risk signals in the profile first.
- The normalized snapshot will make it straightforward to later update the risk-detection edge function with explicit thresholds after you approve the policy.

Technical details

Expected database migration:
```sql
alter table public.binance_order_history
  add column if not exists order_detail_raw jsonb,
  add column if not exists counterparty_risk_snapshot jsonb,
  add column if not exists counterparty_risk_captured_at timestamptz;

create index if not exists idx_binance_order_history_risk_snapshot_gin
  on public.binance_order_history using gin (counterparty_risk_snapshot);
```

Normalized snapshot shape will be similar to:
```text
{
  source: "getUserOrderDetail",
  counterpartySide: "buyer" | "seller",
  topLevel: {
    maliceInitiatorCount,
    complaintCount,
    overComplained,
    buyerCreditScore,
    sellerCreditScore,
    isRiskCount,
    idNumberMasked
  },
  historyStats: {
    accountAge,
    appealedOrderCountHistorical,
    appealedOrderCountLast30Days,
    appealedRateHistorical,
    appealedRateLast30Days,
    creditScore,
    avgPayTime,
    avgReleaseTime,
    counterpartyNum,
    finishRate,
    finishRateLatest30Day
  },
  inProgressStats: {
    inAppealCount,
    inAppealCountAfterBuyerPaid,
    inAppealCountAfterCancelled,
    inAppealCountAfterCompleted,
    buyerPayedCount,
    tradingCount,
    inProcessCount
  },
  kyc: {
    kycLevel,
    kycStatus,
    identityStatus,
    faceStatus,
    addressStatus,
    certificateStatus,
    kycType,
    firstName,
    middleName,
    lastName,
    companyName
  }
}
```

Important handling for sensitive fields
- If Binance returns `idNumber`, I will not display it fully in the UI. I will mask it and store only a masked/limited representation in the normalized snapshot unless existing raw audit storage is explicitly required. The raw response column is useful for audit, but I will avoid exposing raw sensitive identifiers in the terminal UI.

Validation after implementation
- Run TypeScript check.
- Deploy/test updated edge functions.
- Call `binance-ads/getOrderDetail` on an existing order and verify the response still works.
- Verify `binance_order_history` updates only existing Binance-origin records and does not create fake/manual order data.
- Confirm the profile shows the compact view by default and reveals the extra sections only after “View more Binance data” is clicked.