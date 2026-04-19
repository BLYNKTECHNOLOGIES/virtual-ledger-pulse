
## Extended Audit — Additional Aggregation Sites Found

After scanning the entire ERP, I found **4 more sites** that aggregate bank/wallet balances without excluding the Balance Adjustment Account/Wallet, plus **1 selector** that should hide the adjustment account from picker UI.

### New aggregation sites to fix

1. **`src/pages/Financials.tsx` line 117** — `totalBankBalance` reduce loop (separate from the line 103 filter that was already added; this one operates on the same filtered `bankData`, but let me re-verify... actually `bankData` IS already filtered at line 103, so this one is fine ✅).

2. **`src/components/dashboard/DashboardWidget.tsx` line 67** — `WalletBalanceWidgetContent` sums `wallets.current_balance` for the dashboard "Wallet Balance" widget. **Needs `isAdjustmentWallet` filter.**

3. **`src/components/stock/WalletManagementTab.tsx` line 623** — `totalBalance` displayed at the top of the Wallet Management tab. **Needs `isAdjustmentWallet` filter** (or kept as-is since this is a management view? — recommend filter + show adjustment wallet separately with a badge, mirroring the BAMS pattern).

4. **`src/hooks/useActiveBankAccounts.tsx` (lines 59–73)** — `calculateTotalAvailableBalance`, `calculateTotalBalance`, `calculateTotalLienAmount` are reusable aggregators. Currently only consumed by `SmallBuysApprovalDialog` (selector context — fine) and `BeneficiaryManagement` (selector — fine). But to make these helpers safe for any future consumer, **add a filter inside the helpers themselves** so any future aggregation use is automatically clean.

### Selector UI to update (hide from picker)

5. **`src/components/widgets/BankBalanceFilterWidget.tsx`** — the user-pickable bank filter widget. The adjustment account should not appear in the selectable bank list (it would skew any user-selected total). **Filter it out of `bankAccounts` list.**

### Sites confirmed safe (no change needed)

- `useActiveBankAccounts` consumers (`SmallBuysApprovalDialog`, `BeneficiaryManagement`) — pure selectors, user picks one specific bank.
- `QuickSalesOrderDialog`, `TaxManagementTab`, `EditSalesOrderDialog`, etc. — all bank/wallet selectors for assigning a transaction to one specific account.
- `erp-balance-snapshot` edge function — writes per-row audit snapshots, must include the adjustment account for auditability.
- `ShiftReconciliationWidget` — operator manually reconciles each bank individually; adjustment account shouldn't be on the reconciliation roster but isn't summed into a total here.
- All `invalidateQueries(['bank_accounts'])` / CRUD references — non-aggregating.

### Files to edit
1. `src/components/dashboard/DashboardWidget.tsx` — filter `isAdjustmentWallet` in `WalletBalanceWidgetContent`
2. `src/components/stock/WalletManagementTab.tsx` — filter `isAdjustmentWallet` from `totalBalance` and the displayed wallet list (with a small "Audit Bucket" badge for visibility, like BAMS)
3. `src/hooks/useActiveBankAccounts.tsx` — add `isAdjustmentBank` filter inside the three `calculate*` helpers
4. `src/components/widgets/BankBalanceFilterWidget.tsx` — exclude adjustment account from the selectable bank list

### Out of scope
- `useActiveBankAccounts` hook query itself — kept unfiltered so selector dialogs (BAMS, Beneficiary mgmt) can still target the adjustment account when needed for manual contra entries.

### No DB migration required
All changes are client-side filters using the existing `src/lib/adjustment-accounts.ts` helpers.
