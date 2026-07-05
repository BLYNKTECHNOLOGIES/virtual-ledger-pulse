# STOCK MANAGEMENT — FULL RECON

Page: src/pages/StockManagement.tsx (194 ln). Gate: PermissionGate `stock_view` (L45). Tab state from `?tab=` (L30-40). useDeepLinkHighlight(['txId']) L42.

## 1. TABS (value | label | mobile | gate → component :lines)
- quickview | Products | — | none → ProductCardListingTab (323) L96-100/133
- transactions | Transactions | — | none → StockTransactionsTab (1328) L101-105/137
- warehouse | Warehouse | — | none → WalletManagementTab (1033) L106-109/141
- conversions | Conversions | — | none → InterProductConversionTab (44) L110-114/145
- valuation | Valuation | — | none → InventoryValuationTab (111) L115-119/149
- reports | Reports | — | none → StockReportsTab (575) L120-123/153
- integrity | Ledger Integrity | "Chain" | roles super admin/admin/coo/auditor (L23,29) → LedgerIntegrityTab (794) L124-130/158

## 2. PER-TAB ELEMENTS (top→bottom)
### quickview / ProductCardListingTab
- Add Product btn → AddProductDialog (L152,317) writes products
- Search input (L161)
- Asset cards: stock+cost ← useProductStockWithCost; live API bal ← useBinanceBalancesByWallet (~15min, ref-only); INR val ← useCoinMarketRates+useUSDTRate (L26-31)
- extra queries: terminal_wallet_links, wallets, products (L45,56,83)
- "View in warehouse" btn → setSearchParams tab=warehouse (L305)

### transactions / StockTransactionsTab
- Manual Stock Adjustment btn → Dialog (L882,1106); mutation writes wallet_transactions (L448-504)
- Search + type/wallet/asset filters (L896-928)
- Table ← stock_transactions (L80) + joins sales_orders/purchase_order_items/wallet_transactions/erp_product_conversions/products/users (L108-303); wallets refetch 30s (L415); useAssetCodes
- Reverse row → AlertDialog (L1282) rpc reverse_wallet_transaction (L586)

### warehouse / WalletManagementTab
- Buttons: Import→ImportWalletsDialog, Add Transaction, Manual Adjustment→ManualWalletAdjustmentDialog, Add Wallet (L666-687)
- wallets query 30s (L110-121), transactions←wallet_transactions 30s (L126-144), binanceBalances, terminal_wallet_links (L93-98)
- Mutations: addWallet/deleteWallet→wallets (L149,180); addTransaction→wallets+wallet_transactions (L204-268); deleteTransaction→rpc reverse_wallet_transaction (L313); EditWalletDialog (L398)

### conversions / InterProductConversionTab (sub-tabs create/pending/history)
- CreateConversionForm: wallets query; submit writes erp_product_conversions
- PendingConversionsTable: terminal_wallet_links; approve/reject → ConversionApprovalDialog (writes erp_product_conversions)
- ConversionHistoryTable: wallets + conversions read

### valuation / InventoryValuationTab (read-only)
- 3 cards Total Value/Total Products/Stock Alerts + product table ← useProductStockWithCost (L8). No actions.

### reports / StockReportsTab (read-only + CSV)
- Filters: type + wallet (L360-374); date range
- exportToCSV client-side (L131-153); Download btns (L308,334)
- Queries: wallets, stock_transactions (paginated L41), usdtProduct(products), wallet_transactions, products inventory, low-stock products, purchase_order_items; useAverageCost (L23)

### integrity / LedgerIntegrityTab (roles only)
- 4 stat cards ← wallet_transactions count + reversals (L244); anchors; blocked tamper count
- Chain Verification: Snapshot Anchor→rpc snapshot_ledger_anchor (WRITE ledger_anchors, L182); Verify Per-Asset→rpc verify_all_wallet_asset_running_balances; Run→rpc verify_wallet_chain (read-only)
- Bank card: rpc verify_bank_chain, verify_all_bank_running_balances (read-only)
- Tables: ledger_anchors, ledger_tamper_log, bank_ledger_tamper_log (reads; tamper logs written by DB triggers)

## 3. DATA MODEL
- products: asset/product master (quickview, valuation, reports)
- wallets: warehouse accounts (all tabs); refetch 30s in transactions+warehouse
- wallet_transactions: canonical money-moving ledger (warehouse, transactions, integrity, reports); 30s refetch
- stock_transactions: unit stock movement log (transactions, reports)
- erp_product_conversions: inter-product conversions (conversions tab)
- terminal_wallet_links: API-linked wallet map (quickview, warehouse, pending conv)
- ledger_anchors / ledger_tamper_log / bank_ledger_tamper_log: integrity only
- WRITES rpc: reverse_wallet_transaction (transactions+warehouse), snapshot_ledger_anchor (integrity)

## 4. OVERLAP MAP
- wallet_transactions rendered in warehouse + transactions + integrity + reports (4 views).
- reverse_wallet_transaction identical action in transactions (AlertDialog L1282) AND warehouse (L313).
- Manual adjustment dialog duplicated: transactions inline Dialog (L1106) vs warehouse ManualWalletAdjustmentDialog component.
- wallets query duplicated in transactions, warehouse, reports, conversion subtables.
- stock_transactions shown in transactions + reports (same table, list vs aggregate).
- products/valuation: quickview + valuation both derive from useProductStockWithCost.

## 5. USAGE FRICTION (code-observed)
- Add Product only from quickview; adjustments split across two tabs (transactions vs warehouse) — same intent, two UIs.
- valuation tab has no filters/search (L69 table only).
- reports filters limited to type+wallet+date; no asset filter (unlike transactions L928).
- No cross-tab shared filter state; each tab refetches wallets independently.
- Multiple 30s refetch intervals compound load on wallets/wallet_transactions.
- No mock/TODO/dead code found in these tabs.

## 6. CROSS-PAGE COUPLING (restructure risk)
- stock_transactions consumed by: purchase (CompletedPurchaseOrders, ManualPurchaseEntryDialog), sales (OrderCompletionForm, SalesEntryDialog, StepBySalesFlow, TerminalSalesApprovalDialog), pages Purchase/Sales.
- wallet_transactions consumed by: dashboard widgets, financials PlatformFeesSummary, hrms StatisticsTab, purchase/sales edit+entry dialogs, transaction-detail adapter, hooks useAssetCodes/useProductConversions/useWalletStock, ErpEntryManager, ProfitLoss.
- wallets consumed broadly: clients OrderHistory, dashboard erp-actions, purchase/sales dialogs, terminal PlatformDisplayCard, sync hooks, useWalletStock(WithCost), useWalletFees.
- erp_product_conversions consumed by: dashboard widgets, financials, transaction-detail adapter, hooks (useErpEntryFeed, useProductConversions, useSpotTrade*), ProfitLoss.
- Shared hooks: useProductStockWithCost (also terminal AssetOverview), useAverageCost (also sales SalesOrderDialog).
- Ledger tables + all 5 verify/anchor rpcs: NO consumers outside LedgerIntegrityTab (safe to change in isolation).
