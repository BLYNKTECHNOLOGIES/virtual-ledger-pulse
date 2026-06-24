# Make remaining ERP entry rows clickable → open detail dialog

## Goal
Following the same pattern already applied to the client Order Summary popup, every place in the ERP that lists transaction-type entries (purchase orders, sales orders, bank transactions, wallet transactions, product conversions) should let the user click a row to open the global **Transaction Detail** dialog with full info.

This reuses the existing system in `src/components/transaction-detail/`:
- `openTransaction({ type, id })` opens the globally-mounted `TransactionDetailDialog` (already in `Layout.tsx`).
- Supported types: `purchase_order`, `sales_order`, `bank_transaction`, `wallet_transaction`, `product_conversion`.

No new infrastructure is needed — only wiring up existing list rows.

## Audit result — files that render entry rows WITHOUT linkage

### Sales / Purchase orders
- `src/components/clients/ClientOrderPreview.tsx` (~line 244) — mixed recent orders, each row has `id` + `order_type` (SALES/PURCHASE).
- `src/components/clients/ClientOverviewPanel.tsx` — recent orders list (sales + purchase merged), row `id` + `order_type`.
- `src/components/dashboard/widgets/RealDataWidgets.tsx` (~line 91) — recent sales orders, row `o.id` → `sales_order`.
- `src/components/clients/ClientTDSRecords.tsx` (~line 220) — purchase orders with TDS, row tied to `purchase_order_id` → `purchase_order`.
- `src/components/accounting/TaxManagementTab.tsx` (~line 313) — TDS records linked to a `purchase_order_id` → `purchase_order`.

### Bank transactions
- `src/components/hrms/ExpenseCategoryDrillDown.tsx` (~line 102) — `bank_transactions`, row `t.id`.
- `src/components/bams/journal/ContraEntriesTab.tsx` — `bank_transactions` rows.
- `src/components/bams/journal/components/TransferHistory.tsx` (~line 98) — bank transfer rows (`bank_transactions`).

### Wallet transactions / product conversions
- `src/components/financials/PlatformFeesSummary.tsx`
  - Conversions table (~line 369): row `c.id` → `product_conversion`.
  - Transfer-fee wallet transactions section: row id → `wallet_transaction`.

### Mixed / needs id resolution (best-effort)
- `src/components/stock/StockReportsTab.tsx` (~lines 420/536) — movement rows use prefixed ids (`POI-<purchaseOrderItemId>`, `WT-<walletTxId>`). Will link only where the underlying transaction id is directly available (wallet tx rows → `wallet_transaction`; purchase rows → resolve to parent `purchase_order` id where present). Rows without a resolvable supported id stay non-clickable.

> Already linked (no change): `ClientOrderSummaryDialog`, `CompletedPurchaseOrders`, `EntryRow`, `SalesPurchasesTab`, `ExpensesIncomesTab`, `StockTransactionsTab`, `ConversionHistoryTable`, `PendingConversionsTable`, and the Purchase/Sales/Stock/Accounting/BAMS/Dashboard/ProfitLoss pages.

## Approach (per file)
1. Import `openTransaction` from `@/components/transaction-detail`.
2. Add `onClick={() => openTransaction({ type, id })}` to each row, plus `cursor-pointer` and a hover style; for mixed lists, derive `type` from the row's `order_type`/source.
3. Preserve existing row actions: clicks on buttons/links inside the row must not trigger navigation (guard with `e.target.closest('button,a,[role="button"]')` or stop propagation on those controls). Where a row already has its own detail dialog (e.g. `OrderHistoryModule` has `handleViewOrder`), leave its existing behavior intact and skip.
4. Only wire rows whose id maps to a supported transaction type; skip aggregate/summary rows.

## Verification
- Typecheck the changed files.
- Spot-check in preview: open Client → order/TDS lists, Dashboard recent sales widget, BAMS contra/transfer history, Accounting tax tab, Platform Fees, and confirm clicking a row opens the detail dialog while in-row buttons still work.

## Notes / limitations
- `PlatformFeesSummary` fee-deduction rows reference an order by `order_number` (not a direct supported id); these will be left non-clickable unless a direct order id is available, to avoid fragile lookups.
- Pure analytics/aggregate views (e.g. `TerminalAnalytics`, `StatisticsTab` charts) are not row-level transaction lists and are out of scope.
