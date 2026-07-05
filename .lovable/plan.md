## Ad Manager reconnaissance — complete

Full findings written to `.lovable/plan.md` (recon report, no code touched). Summary:

**Files/endpoints** — `AdManager.tsx` renders `CategorizedAdTable`; all API via `binance-ads` edge fn (`listAds`, `updateAd`, `updateAdStatus`, `postAd`). List fetch has NO auto-refresh (30s staleTime, manual RefreshCw only). Price changes route through the 1001-line `CreateEditAdDialog` (no inline edit).

**UI** — RestTimer/MerchantState strip → PageHeader → Filters → Bulk toolbar → Tabs (All/Block/Active/Private/Inactive) → nested collapsible table (category → fixed/floating → rows). Multi-select + 6 bulk actions already exist. Price change ≈ 4 clicks today.

**Data per ad** — price, priceType, floatingRatio, init/surplus, min/max limits, payment methods, commission, status, timestamps, remarks, autoReplyMsg. **No competitor/rank/book data anywhere.**

**Automation boundary** — repricing/scheduling/auto-pay/auto-reply all live in TerminalAutomation; Ad Manager stays manual only.

**Top grounded opportunities** (manual, cheap): inline row price quick-edit, buy/sell split, summary strip, denser rows, user sort, dynamic asset filter, opt-in auto-refresh, surface stale-price age/remarks.

No implementation is proposed here — this was recon only. Approve to move any of the opportunities into a build plan.