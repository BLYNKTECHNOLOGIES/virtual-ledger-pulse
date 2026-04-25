Root cause found:

The small-buy approval currently inserts the fee into `bank_transactions` as an `EXPENSE`, but stores `category: 'finance_banking_compliance'`. In normal BAMS manual expenses, the app stores the full readable category label, for example `Finance, Banking & Compliance > Processing fees`. Because the payout fee is stored as the internal parent category code, P&L/Statistics can include it in totals but it does not appear as a separate understandable expense category. This also makes category-wise expense breakdowns and reports look incorrect.

Database check confirms existing payout fee rows like:

```text
transaction_type = EXPENSE
category = finance_banking_compliance
description = Processing fee – Payout gateway fee for SB00133 ...
```

Plan to fix everywhere:

1. Create a proper dedicated expense category
   - Add `payout_gateway_fee` under Finance, Banking & Compliance in the expense category list.
   - Label it as `Payout Gateway Fee`.
   - This makes it selectable and visible consistently in BAMS/manual expense UI as well.

2. Standardize small-buy approval fee creation
   - Change `SmallBuysApprovalDialog` so future payout fee expense rows are inserted with:
     ```text
     transaction_type: EXPENSE
     category: Finance, Banking & Compliance > Payout Gateway Fee
     description: Payout gateway fee for SBxxxxx (...)
     reference_number: SBxxxxx
     ```
   - Keep it separate from purchase cost/COGS, so it reduces P&L as an operating expense.
   - Continue using the selected payout fee bank account so bank balance deduction remains controlled by existing DB triggers.

3. Fix completed purchase order fee lookup
   - Update completed order details to find payout fees by `reference_number = order_number` and `transaction_type = EXPENSE`, using either:
     - new category `Finance, Banking & Compliance > Payout Gateway Fee`, or
     - legacy rows whose description contains `Payout gateway fee`.
   - This prevents old completed small-buy groups from disappearing after the category standardization.

4. Make P&L and analytics categorize it correctly
   - Update the P&L expense query/detail list so payout gateway fees appear as a separate `Payout Gateway Fee` expense line/category.
   - Keep these fees included in:
     - P&L Total Expenses
     - P&L Net Profit calculation
     - Statistics/Analytics expense totals
     - Financial dashboard operating expenses
     - Dashboard expense breakdown/trends widgets
   - Existing category exclusions for purchases/sales/opening balance/adjustments will remain unchanged, so payout gateway fee is not accidentally excluded.

5. Backfill existing payout fee records
   - Add a Supabase migration to update legacy rows:
     ```text
     category = 'Finance, Banking & Compliance > Payout Gateway Fee'
     where transaction_type = 'EXPENSE'
       and description ilike '%Payout gateway fee%'
     ```
   - This makes old fee entries immediately appear correctly in P&L and category reports without needing manual edits.

6. Verify data integrity
   - Ensure no duplicate expense is created.
   - Ensure existing bank balances are not recalculated incorrectly: this migration only changes category text, not amount/type/account/date.
   - Run TypeScript/build checks after implementation.

Files expected to change:
- `src/data/expenseCategories.ts`
- `src/components/purchase/SmallBuysApprovalDialog.tsx`
- `src/components/purchase/PurchaseOrderDetailsDialog.tsx`
- `src/pages/ProfitLoss.tsx` if needed for category display normalization
- Dashboard/statistics expense categorization helpers if direct category labels need normalization
- New Supabase migration to backfill old payout fee categories