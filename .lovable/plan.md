# AD MANAGER — RECONNAISSANCE (read-only)

Route: `/ad-manager` (main) + `src/pages/terminal/TerminalAdManager.tsx` (wrapper, gate `terminal_ads_view`). Both render `src/pages/AdManager.tsx`.

## 1. FILES + ENDPOINTS
Page: `src/pages/AdManager.tsx` (256). Hooks: `src/hooks/useBinanceAds.tsx` (307).
Components (src/components/ad-manager/):
- CategorizedAdTable.tsx (507) — main table (default render)
- AdTable.tsx (175) — flat table (NOT imported by page; legacy/unused)
- AdManagerFilters.tsx (113), BulkActionToolbar.tsx (93)
- CreateEditAdDialog.tsx (1001), PaymentMethodBadge.tsx (31)
- RestTimerBanner.tsx (155), MerchantStateCard.tsx (69)
- Bulk*: BulkEditLimitsDialog(180), BulkFloatingPriceDialog(198), BulkHybridAdjustDialog(285), BulkStatusDialog(117), BulkRiskGuardDialog(124)

All API via `supabase.functions.invoke('binance-ads', {action})` (`callBinanceAds`, useBinanceAds.tsx:98):
- List fetch: `useBinanceAdsList` → action `listAds`. Combined-account fan-out (accountsToQuery), merges online/private(1)+offline(3) in parallel. staleTime 30s, `refetchOnWindowFocus:false`, **NO refetchInterval** — refresh only manual (RefreshCw / filter reset). AdManager.tsx:60-61.
- Price update: no dedicated endpoint; goes through `updateAd` (`useUpdateAd`, :239) via CreateEditAdDialog OR bulk floating (`BulkFloatingPriceDialog`)/hybrid.
- Status change (pause/resume/online/offline): `useUpdateAdStatus` → action `updateAdStatus` (:263). Single toggle handleToggleStatus (:99), bulk via BulkStatusDialog.
- Create/edit: `usePostAd`→`postAd`, `useUpdateAd`→`updateAd` (:214/239).
- Ref price: `useBinanceReferencePrice`→`getReferencePrice` (60s poll) — ONLY used inside CreateEditAdDialog, not list.

## 2. CURRENT UI
Layout: RestTimerBanner + MerchantStateCard row → PageHeader (Sync icon + Create Ad) → Filters card → conditional BulkActionToolbar → Tabs [All / Block / Active / Private / Inactive] → single Card w/ CategorizedAdTable.
CategorizedAdTable: nested collapsible groups — Category (Block / Small Buy / Small Sale / Big Buy / Big Sale) → sub-group (Fixed / Floating) → ad rows. Collapse state persisted per-user in localStorage. Category/group/row checkboxes for multi-select. Small vs Big derived from minSingleTransAmount vs small_buys/sales_config.
Row columns: checkbox, Ad ID (last 8 + AccountBadge), Type (BUY/SELL + Block badge), Asset, Price Type, Price (flash, floating% suffix), Available Qty (surplus/init), Order Limit (min~max ₹), Payment Methods (3 badges + commission% + overflow), Status badge, Updated, Actions.
Per-ad actions (3): automation exclude toggle (ShieldBan/Check), Edit (opens dialog), Status toggle (Power/PowerOff/Lock).
**Price change cost today = many clicks:** Edit icon → CreateEditAdDialog (1001-line form) → change price → save. No inline price edit. Bulk floating% and hybrid adjust exist as dialogs.
Bulk/multi-select: YES (toolbar: Edit Limits, Adjust Floating%, Hybrid Adjust, Risk Guard, Activate, Deactivate).
Filters: Asset, Trade Type, Status, Price Type, start/end date, Reset. Sorting: fixed (asset asc, then price asc within group) — no user sort.
Competitor/rank/book data: NONE fetched or displayed anywhere in the list.

## 3. DATA AVAILABLE per ad (BinanceAd, useBinanceAds.tsx:36)
price, priceType(1 fixed/2 floating), priceFloatingRatio, initAmount, surplusAmount, minSingleTransAmount, maxSingleTransAmount, tradeMethods[], commission fields, advStatus(1/2/3), asset, fiatUnit, tradeType, classify(block), autoReplyMsg, remarks, createTime, updateTime, onlineNow, tags, many buyer/KYC limits, _exchangeAccountId. **No rank/book position** in payload.

## 4. AUTOMATION BOUNDARY (TerminalAutomation — do NOT overlap)
Tabs: auto-reply, schedules, auto-pay, export(completed orders), small-orders config, hybrid price adjuster, auto-pricing rules, auto-screenshot. Ad-level automation exclusion toggle lives on the ad row but its engine is Automation. Ad Manager work must stay manual: list display, manual price/status edits, bulk manual actions. No repricing/scheduling logic here.

## 5. GROUNDED OPPORTUNITIES (manual only, cheap given existing code/data)
- Inline price quick-edit on the row → reuse `useUpdateAd`/BulkFloatingPriceDialog logic; cuts price change from ~4 clicks to 1-2 (CategorizedAdTable AdPriceCell + useUpdateAd).
- Buy/Sell split view or side-by-side desks — data already has `tradeType`; categorizeAds already buckets buy/sell (CategorizedAdTable.tsx:125-140).
- Summary strip (total online/private/offline, surplus per asset, count by category) above table — all derivable from `ads` already in memory (AdManager.tsx:64-69; mirror TerminalDashboard AdPerformanceWidget).
- Denser desk-style rows / compact toggle — reuse existing columns; row already has all fields (CategorizedAdTable rows).
- User-controlled sort (price, surplus, updated) — data present, sort is currently hardcoded (categorizeAds sortGroup :144).
- Asset filter is hardcoded to 6 coins — derive options from live `ads` assets (AdManagerFilters.tsx:24-31).
- Auto-refresh toggle for the list — add opt-in refetchInterval (useBinanceAdsList staleTime already 30s; memory: 30s opt-in polling).
- Surface `remarks`/`autoReplyMsg`/payTimeLimit + stale-price age (now−updateTime) as row hints — fields already fetched, unused in list (BinanceAd:63-79).
