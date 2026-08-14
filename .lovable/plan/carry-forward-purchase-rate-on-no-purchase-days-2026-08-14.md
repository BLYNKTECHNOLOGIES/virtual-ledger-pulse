# Carry-forward purchase rate on no-purchase days

## Problem

On a day (or period) with zero purchases, the P&L treats cost as zero, so the entire sale value becomes profit. The screenshot shows it: Avg Purchase Rate ₹0.00, Effective Purchase Rate "—", NPM = the full sales rate ₹106.50.

This exists in two places that both compute the same way:

- `src/pages/ProfitLoss.tsx` — the dashboard. When no purchase orders fall in the period, `avgPurchaseRate` is 0 and `effectivePurchaseRate` is null, so `npm = avgSalesRate - 0`.
- `supabase/functions/snapshot-daily-profit/index.ts` — the nightly writer for `daily_gross_profit_history`. Same zero-cost path, so stored history rows on no-purchase days carry an inflated gross profit.

## What changes

When the selected period has no purchases, fall back to the **most recent earlier day that did have purchases** and use that day's fee-adjusted (effective) purchase rate as the cost basis. No lookback limit — walk back until a purchase day is found.

Rules:

- Fallback triggers only when the period's purchase quantity is zero. If any purchases exist in the period, current behaviour is unchanged.
- The carried rate is the **effective** purchase rate of that source day (purchase value ÷ quantity net of USDT fees), matching how the rate is derived today.
- The fallback respects the asset filter: with an asset selected, only that asset's purchase days count; in "All Assets" mode the USDT-normalised effective quantities are used.
- If no earlier purchase day exists at all, the rate stays unavailable and gross profit is shown as unavailable rather than as full sales value.

## What the user sees

- Avg / Effective Purchase Rate shows the carried rate with a small "carried forward from <date>" caption and an info tooltip explaining that no stock was bought in this period.
- NPM and Gross Profit are computed from that carried rate, so a no-purchase selling day no longer reads as 100% margin.
- Gross Profit History rows that were derived this way are marked the same way in `GrossProfitHistoryTab`.

## Historical backfill

`daily_gross_profit_history` rows that were written with a zero/absent purchase rate get recomputed with the carry-forward rule, chronologically so each day can see the last real purchase day before it. Days that genuinely had purchases are left untouched. A one-line entry is appended to `docs/STATE_LOG.md` recording the restatement.

## Technical notes

- Add a shared resolver that, given an end date and asset filter, returns `{ rate, sourceDate }` for the latest prior purchase day: query `purchase_orders` (completed) ordered by date descending, group the newest qualifying date's orders, and compute value ÷ (qty − that day's USDT fees). Fees come from the same sources the dashboard already uses (`wallet_fee_deductions`, conversion fees, transfer fees), scoped to that day.
- `ProfitLoss.tsx`: replace `purchaseRateForProfit = effectivePurchaseRate ?? avgPurchaseRate` with the resolver result when in-period purchase qty is 0, and surface `carriedFrom` in `PeriodMetrics` for the UI caption.
- `snapshot-daily-profit`: same resolver logic server-side; store the carried rate in `effective_purchase_rate` and record that it was carried (reuse an existing nullable column if present, otherwise add one via migration).
- Backfill runs through the snapshot function over the affected date range rather than raw SQL, so one code path owns the math.
- Verification: recompute the day in the screenshot (Aug 15, 2026) and confirm NPM drops from ₹106.50 to sales rate minus the carried rate, and spot-check a few backfilled history rows against their source purchase day.
