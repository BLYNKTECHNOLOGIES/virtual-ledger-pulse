

## ERP Entry Manager — Plan (Revised)

A new sidebar tab **"ERP Entry"** at `/erp-entry` that consolidates every pending ERP entry into one chronological feed, reusing the existing approval dialogs so both views stay in lock-step.

### Sources & ordering

Single hook `useErpEntryFeed()` parallel-queries the four pending tables, normalises rows to `{ id, source, occurred_at, asset, amount, direction, label, sublabel, raw }`, merges, and sorts by **actual transaction time** (Binance `movement_time` / order `create_time` / conversion `trade_time`) — not sync time.

| Source | Table | Sort timestamp |
|---|---|---|
| Deposit / Withdrawal | `erp_action_queue` (PENDING) | `movement_time` |
| Terminal Purchase (individual) | `terminal_purchase_sync` (pending, **excluding small-buys batches**) | `order_data->>create_time` |
| Terminal Sales (individual) | `terminal_sales_sync` (pending, **excluding small-sales batches**) | `order_data->>create_time` |
| Small Buys batch | `small_buys_sync` (status=`pending_approval`) | `time_window_start` |
| Small Sales batch | `small_sales_sync` (status=`pending_approval`) | `time_window_start` |
| Spot Conversion | `erp_product_conversions` (PENDING_APPROVAL) | `trade_time` |

Default sort: oldest pending at top (per requirement); one-click toggle to newest-first.

### Small Buys / Small Sales — separate channel (per your clarification)

- Small buys/sales **never** appear as individual rows in ERP Entry. Individual terminal purchase/sales rows in the feed are filtered to exclude any order that falls inside the small-buys/small-sales amount window (using `small_buys_config` / `small_sales_config`).
- Small buys/sales appear only as **two dedicated channels**: "Small Buys" and "Small Sales". Each shows a single row per existing pending batch (`small_buys_sync` / `small_sales_sync`).
- A **"Sync Small Buys"** and **"Sync Small Sales"** button in the toolbar are the *only* triggers that call `syncSmallBuys()` / `syncSmallSales()` — which group qualifying orders into one bulk batch and create one feed row. No automatic / continuous small-batch generation.
- The global "Sync All" button **excludes** small buys/sales sync calls — it only runs movements + completed buy orders + completed sell orders + spot trades. This guarantees small batches are produced only on explicit operator click.

### UI

```text
┌──────────────────────────────────────────────────────────────────┐
│ ERP Entry          [Source ▾] [↻ Sync All] [▾ Sync Small ▾]      │
│ 12 pending · 4 dep · 3 sale · 2 conv · 3 buy · 1 SB · 0 SS       │
├──────────────────────────────────────────────────────────────────┤
│ ⬇ Deposit · USDT 7,000     21 Apr 18:42  TRC20  abc…ef           │
│   BINANCE BLYNK                          [ Entry ] [ Reject ]    │
├──────────────────────────────────────────────────────────────────┤
│ 🛒 Terminal Buy · 4,820 USDT 21 Apr 18:31  Order 17… UPI         │
│ 📦 Small Buys batch · 14 orders · 8,940 USDT  21 Apr 17:00–18:00 │
│ 💱 Conversion BTC→USDT     21 Apr 18:14  CONV-…019               │
│ 💵 Terminal Sale · 1,200   21 Apr 17:58  Order 18…  IMPS         │
└──────────────────────────────────────────────────────────────────┘
```

- Color-coded left icon per source. Source filter chips: All / Deposits / Withdrawals / Terminal Buy / Terminal Sale / **Small Buys** / **Small Sales** / Conversions.
- Sticky day separators. Search across order#, tx_id, counterparty, asset, amount.
- "Stale > 6h" red dot on rows pending beyond 6 hours.
- Auto-refresh every 30 s.

### Action behaviour — reuse existing dialogs verbatim

| Source | Dialog reused |
|---|---|
| Deposit / Withdrawal | `ActionSelectionDialog` → Purchase / Sales / Wallet Transfer |
| Terminal Purchase | `TerminalPurchaseApprovalDialog` |
| Terminal Sales | `TerminalSalesApprovalDialog` |
| Small Buys batch | existing Small Buys approval dialog |
| Small Sales batch | existing Small Sales approval dialog |
| Conversion | `ConversionApprovalDialog` |

Same dialogs → same React-Query keys → approval in ERP Entry instantly disappears from the original tab and vice-versa. No duplicate state.

### Toolbar buttons

- **Sync All** — parallel: `binance-assets checkNewMovements`, `syncCompletedBuyOrders`, `syncCompletedSellOrders`, spot-trade sync. *Does not* trigger small-buys/sales sync.
- **Sync Small ▾** — split menu with two items: *Sync Small Buys now*, *Sync Small Sales now*. Each calls only its respective `syncSmallBuys()` / `syncSmallSales()` and produces at most one bulk batch row.

### Bonus (no extra operator effort)

- Keyboard nav: `↑/↓` move, `Enter` open, `R` reject.
- Bulk-reject for terminal_purchase_sync / terminal_sales_sync rows that already support it.
- "Why is this here?" (i) tooltip per row explaining the detection rule.

### Files

**Add**
- `src/pages/ErpEntryManager.tsx`
- `src/components/erp-entry/EntryRow.tsx`
- `src/components/erp-entry/EntryFilters.tsx`
- `src/components/erp-entry/SyncAllButton.tsx`
- `src/components/erp-entry/SyncSmallMenu.tsx`
- `src/hooks/useErpEntryFeed.ts`
- `src/hooks/useErpEntrySyncAll.ts`

**Edit**
- `src/components/AppSidebar.tsx` — add "ERP Entry" item (Inbox icon).
- `src/App.tsx` — register `/erp-entry` route under Layout + AuthCheck + QueryProvider.

### Not changed

- No DB schema changes, no edge function changes, no changes to existing tabs/dialogs/widgets.
- No changes to balance/ledger logic.
- Small buys/sales sync remains 100 % manual-trigger only (already true today via `useSmallBuysSync` — we simply do not add any automatic caller in this feature).

### Risk notes

- Existing RLS + permission gates on each source table apply unchanged; forbidden sources are silently skipped per user.
- Filtering individual terminal orders against `small_buys_config` / `small_sales_config` ranges prevents the same order appearing twice (once as individual + once inside a future batch).

