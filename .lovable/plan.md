# Fix the Cash Flow Overview chart

## What's wrong today

The "Cash Flow Overview" chart on Financial Management → Overview is not a cash flow chart at all. It plots exactly two points — total Revenue and total Expenses for the selected period — and joins them with a shaded area. That produces the meaningless downward slope in the screenshot: a straight line from one aggregate to another, an axis in "K" that reads `00000K`, and no time dimension whatsoever.

Two further issues make it read wrong:
- Revenue comes from sales orders while Expenses come from bank transactions, so the two points are not comparable cash movements.
- The Y-axis formatter divides by 1,000 and prints raw numbers, so crore-scale values overflow the axis gutter and get clipped.

## What it should be

A real cash-flow-over-time chart for the selected date range:

- Money In and Money Out per bucket, plus a Net Cash Flow line.
- Buckets chosen from the range length: daily for ranges up to ~62 days, monthly beyond that.
- Both series sourced from the same ledger (`bank_transactions`) so in/out are apples-to-apples, applying the same category exclusions already used for Total Expenses, and excluding the adjustment/audit buckets per project rules.
- Compact Indian currency on the axis and tooltip (₹1.6 Cr, ₹45.6 L) via the existing `formatCompactINR` / `formatExactINR` helpers, so nothing clips.
- Empty-state message when the range has no transactions, instead of a flat misleading slope.

## Technical notes

- Extend the existing `financial_data` query in `src/pages/Financials.tsx` to also pull `transaction_date`, `transaction_type`, `amount`, `category`, `bank_account_id` for the range using `fetchAllPaginated` (ranges exceed 1000 rows), filter out adjustment banks with `isAdjustmentBank` and the COGS/settlement categories already excluded, then aggregate into `{ bucket, inflow, outflow, net }`.
- Replace the two-point `AreaChart` with a `ComposedChart`: stacked-free `Area`/`Bar` for inflow (success token) and outflow (destructive token), plus a `Line` for net. Colors stay on semantic tokens.
- Axis: `tickFormatter={formatCompactINR}`; tooltip shows exact INR per series.
- No schema or backend changes; presentation and one query extension only.
