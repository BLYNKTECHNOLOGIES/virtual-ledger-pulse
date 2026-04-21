

## Binance Wallet 7,538 USDT Drift — Root Cause & Permanent Fix Plan

### Root Cause (in code)

The defect lives in **`src/hooks/useProductConversions.ts`** and the supporting RPC `approve_product_conversion`. The approval flow trusts the **operator-entered draft** (`quantity`, `execution_rate_usdt`, `gross_usd_value`, `net_usdt_change`) as the post-fill truth, then writes those numbers straight into `wallet_transactions` / `wallet_asset_balances`.

Three concrete code-level faults make drift inevitable:

1. **No re-fetch of the actual fill before posting.**
   `useCreateConversion` inserts `net_asset_change` and `net_usdt_change` computed in the browser from `quantity * execution_rate_usdt`. `useApproveConversion` then calls `approve_product_conversion(p_conversion_id, p_approved_by)` — the RPC posts the row's stored numbers. Nowhere does the code read `spot_trade_history.executed_quantity` / `quote_quantity` for that order before crediting the wallet.

2. **`actual_usdt_received` and `rate_variance_usdt` are write-only placeholders.**
   The schema has these guard columns, but no code path populates them. The trigger that's supposed to block high-variance approvals therefore never fires (variance is `NULL`, treated as 0). The dust-snap guard documented in `mem://financials/p2p-wac-integration` only handles asset remainders, not USDT-side partial fills.

3. **Fee handling is single-sided.**
   `fee_amount` / `fee_asset` are recorded on the conversion row, but BNB-paid commissions returned by Binance (`commission`, `commissionAsset`) are not reconciled against `wallet_fee_deductions`, so any BNB fee silently inflates the USDT credit.

The combined effect: when Binance partially fills (e.g. BTC 0.01238 requested, 0.00007 actually filled in `CONV-20260421-008`), the ERP credits the **intended** USDT, not the **received** USDT. Six such fills in the last ~13h compound to ≈3,324 USDT; older un-reconciled fills + un-mirrored BNB fees explain the rest.

### Fix Plan (root-cause, not patch)

**1. Make `spot_trade_history` the single source of truth for conversion postings**
- Add a new edge function `reconcile-conversion-fill` that, given a `conversion_id`, calls Binance `GET /api/v3/myTrades` (via existing proxy) using `clientOrderId` stored in `metadata.client_order_id`, and writes:
  - `actual_quantity_filled`
  - `actual_usdt_received` (= sum of `quoteQty`)
  - `actual_fee_amount`, `actual_fee_asset`
  - `rate_variance_usdt` (= `net_usdt_change - actual_usdt_received`)
- Trigger it automatically inside `useApproveConversion` **before** the RPC call. Approval is blocked until the row has a non-null `actual_usdt_received`.

**2. Rewrite `approve_product_conversion` to post actuals, not intents**
- Migration: change the RPC to use `actual_quantity_filled` / `actual_usdt_received` / `actual_fee_amount` when posting to `wallet_transactions` and `wallet_asset_balances`.
- Add a hard guard: `IF rate_variance_usdt > 1 AND NOT metadata->>'variance_override_by'` → raise exception. Override requires Super Admin and is logged.

**3. Mirror BNB / non-USDT fees as separate ledger entries**
- Inside the RPC, when `actual_fee_asset <> asset_code AND actual_fee_asset <> 'USDT'`, insert a paired `wallet_fee_deductions` row in the fee asset, instead of silently netting it into USDT.

**4. Lock down the draft path**
- In `useCreateConversion`, stop persisting `gross_usd_value` / `net_usdt_change` as authoritative. Rename DB columns to `expected_*` (migration + view) so no future code mistakes intent for actual.

**5. One-time corrective reconciliation**
- Run `reconcile-conversion-fill` for every `erp_product_conversions` row from the last 30 days where `actual_usdt_received IS NULL`.
- For the 6 identified refs (`CONV-20260421-004, -007, -008, -010, -013, -018`) and any others with `rate_variance_usdt > 1`, post compensating `wallet_transactions` rows with `reference_type='RECONCILIATION'` and `metadata.original_conversion_id`. No silent balance edits.

**6. Permanent guardrail**
- New scheduled edge function `audit-binance-vs-ledger` (hourly): pulls Binance Spot account balance, compares to `wallet_asset_balances` for `BINANCE BLYNK`, writes deltas to a new `wallet_drift_audit` table, and pages on `|delta| > 5 USDT`.

### Files / DB Objects Touched

- `src/hooks/useProductConversions.ts` — call reconcile before approve; remove client-computed authoritative numbers.
- `supabase/functions/reconcile-conversion-fill/index.ts` — new.
- `supabase/functions/audit-binance-vs-ledger/index.ts` — new (cron).
- Migration: add `actual_*` and `expected_*` columns, rewrite `approve_product_conversion`, add variance-block trigger, create `wallet_drift_audit`.
- Migration: backfill + corrective `wallet_transactions` for the 6 refs.

### What This Prevents Going Forward

- Partial fills can no longer over-credit the wallet — postings come from Binance's own trade records.
- BNB / cross-asset fees are accounted in their own ledger lines.
- Any future drift > 5 USDT is detected within an hour, not days later.
- Operator-entered intent is structurally separated from actual fill, so a code change can never again confuse the two.

