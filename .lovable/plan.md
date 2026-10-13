# FIN-R0 — Review of the P&L / Financials / Statistics redesign

This is a review of the draft, not a build plan. Nothing will be edited. The answers come from the owner's recorded rules and conventions. Where those don't settle a point, it is marked "not sure — owner to decide".

## Assumptions to correct

- **Net profit rule.** The owner's recorded reporting rule is: Net profit = Gross profit − Operating expenses − Total fees, all on normalised USDT values. So Statistics follows the written rule and P&L does not. Don't call the fee deduction a double count until someone has checked whether the gross-profit history already uses the fee-adjusted rate (see Q2). In the UI pass, show each page's formula exactly as it is.
- **Unit-economics panel.** Fine as a read-out of figures that already exist. It must not bring back conversion P&L, portfolio or mark-to-market views; the owner removed those for good.
- **Excluded buckets.** "Balance Adjustment" accounts and the "Manual Baseline Reset" category are audit-only and are left out of every total. Grouping expenses and income by head must keep them out. Show them under a head only if they already appear on that page today.
- **Owners in Statistics.** The new operator table, top clients and "busiest hours" must apply the same owner exclusion Statistics uses today. Operator names come from the users directory; an id fragment is shown only when there's no match.
- **Clients.** Client emails must never appear anywhere. Clients are identified by phone number, nickname or userNo, never by name.
- **USDT rate.** No fallback rate may be built in. When the live rate isn't available, show the last cached rate in red and say so — this matters for the fee history and every USDT-to-INR conversion.
- **Bank accounts grouped by company.** Only if the viewer can read the company list (as drafted). Show lien status read-only.

## Owner preferences to follow

- Blynk look: cyan primary, Montserrat headings, Manrope body text, JetBrains Mono for figures, 14px corners. No indigo or purple gradients.
- No sideways scrolling on ordinary tables; only genuinely wide grids may have a minimum width. Add paging rather than widening.
- Times and dates in IST, including chart axes, the busiest-hours grid and the export file. Order dates synced from Binance can't be edited.
- Use the app's own confirmation dialogs, never browser pop-ups. Clicking any transaction opens the read-only detail view, subject to permissions.
- Asset amounts to 2 decimals. Where a live API-vs-ERP difference badge exists, it sits to the left of the balance.
- No automatic refresh, except a 30-second refresh where the owner opts in. Keep the live "today" gross-profit merge exactly as it behaves now.
- Every change applies to every place the element appears. If the duplicate KPI strip or a dead button also exists on another page, list it rather than leaving it half-changed.
- What the owner looks at first: net profit and gross profit for the period, then total asset value. Keep those as the first cards.

## Must not be removed or moved

- Everything already on the draft's keep-list, plus:
- The Total Asset Value breakdown, kept with the "Right now" figures.
- The red "cost basis unavailable" / carried-forward warnings on P&L.
- Gross-profit sync and outlier handling.
- The deep-link highlight when a page opens with a transaction id in the link.

## Answers to questions 1–7

1. **Voided expenses — bug.** A reversal and its original should cancel out and be excluded on both sides, as Financials already does (the shared reversal check). Fix it in a separate batch; P&L and Statistics should match Financials.
2. **Net profit — not sure; owner to decide.** The recorded rule includes fees, and P&L leaves out other income. Whether fees are counted twice can only be settled by checking the gross-profit calculation, so verify before changing anything.
3. **Settlements left out of the cash-flow chart — not sure, probably deliberate.** A settlement moves money from the payment gateway to the bank; it isn't new income, and the sale was already counted. Before relabelling, check whether "Money in" counts gateway sales when they're made. If it doesn't, the chart understates income and needs fixing. Until then, label the chart "Excludes gateway settlements (internal transfers)".
4. **Inactive accounts that still hold money — owner to decide.** Recommendation: count every account that holds money, except closed ones, in Total asset value, and flag inactive ones with a balance (as the draft's note does). Don't change the figure in the UI pass.
5. **Upper-case "SALES" counted as other income on P&L — bug.** The match should ignore upper/lower case, as Statistics does.
6. **Revenue counts sales of every status — probably a bug.** Revenue should count completed orders only, like P&L. Confirm with the owner and fix separately.
7. **Sales order dated year 32026 — data error.** Correct that record through the normal edit-and-audit route and add date-range validation on manual entry. Synced orders stay non-editable.

## Technical notes for the later scripts

- Keep data access in the existing hooks (`useTotalAssetValue`, the shared reversal check, the owner-exclusion helper, `fetchAllPaginated` for over 1,000 rows). New presentation components go in `src/components/finance-ui/`.
- Running the queries in parallel must not change the totals: compare before and after for one saved preset on each page.
- The Excel export uses the same figures shown on screen, with IST dates in the file name.
