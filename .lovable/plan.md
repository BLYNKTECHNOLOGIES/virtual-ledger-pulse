# Terminal Module — Redesign Reconnaissance (Discovery Only)

This is an inventory, not an implementation plan. Zero code was changed. The Terminal is already ~99% token-clean (only 4 hex literals total), so a redesign should work primarily through the `.terminal` CSS token block + shadcn primitives, not per-component color edits.

## 1. FILES

### Routing / Shell
- `src/App.tsx` — mounts 17 terminal routes, each wrapped in `<TerminalLayout>` (standalone shell, NOT the main ERP `<Layout>`). ~660 lines total.
- `src/components/terminal/TerminalLayout.tsx` (~85) — root shell. Applies `.terminal` class, nests auth/biometric gates, ExchangeAccount + Shortcuts providers, sidebar + header + `<main>`.
- `src/components/terminal/TerminalSidebar.tsx` (~200) — left nav (Operations group, badges for active/pending counts, "Soon" tags, ERP Dashboard footer button).
- `src/components/terminal/TerminalHeader.tsx` (~130) — 40px top bar: sidebar trigger, Connected pulse, break badge, exchange switcher, notification bell, user dropdown.
- `src/components/terminal/TerminalPermissionGate.tsx`, `BiometricAuthGate.tsx`, `BiometricRegistrationDialog.tsx`, `DataConflictBanner.tsx`, `TerminalPresenceAndAlerts.tsx`, `TerminalNotificationBell.tsx`, `TerminalCommandPalette.tsx`.

### Pages (`src/pages/terminal/`, by size)
- `TerminalOperatorDetail.tsx` (1577) — per-operator deep-dive.
- `TerminalOrders.tsx` (1492) — main operator screen: order list + chat inbox/thread + detail workspace.
- `TerminalAnalytics.tsx` (1058) — charts/volume analytics.
- `TerminalMPI.tsx` (875) — operator performance index.
- `TerminalSettings.tsx` (562), `TerminalAppeals.tsx` (544), `TerminalAutomation.tsx` (409), `TerminalLogs.tsx` (310), `TerminalDashboard.tsx` (272), `TerminalAuditLogs.tsx` (215), `TerminalPayer.tsx` (205), `TerminalSmallPayments.tsx` (200), `TerminalShortcuts.tsx` (129), `TerminalUsers.tsx` (80), `TerminalAssets.tsx` (76), `TerminalComingSoon.tsx` (31), `TerminalAdManager.tsx` (10 — thin wrapper around ERP `AdManager`).

### Components (`src/components/terminal/**`, ~16.7k lines total) — grouped
- `assets/` — AssetOverview, AssetDetailPanel, AssetMovementHistory, SpotTradingPanel, TradeHistory.
- `automation/` — Auto{Assignment,Pay,PayWithLog,PricingLogs,PricingRuleDialog,PricingRules,ReplyExecutionLog,ScreenshotConfig}, HybridPriceAdjuster, Small{Buys,Orders,Sales}Config, CompletedOrdersExport.
- `dashboard/` — MetricCards, AdPerformanceWidget, OperationalAlerts, OrderStatusBreakdown, TradeVolumeChart, TimePeriodFilter.
- `orders/` — OrderDetailWorkspace, OrderSummaryPanel, ChatPanel, ChatInbox, ChatThreadView, InternalChatPanel, OrderActions, OrderAssignmentDialog, PaymentDetailsCard, PastInteractionsPanel, QuickReceiveDialog, UpdatePaymentMethodDialog, Counterparty{Badge,ContactInput,PanInput}; `orders/chat/` — ChatBubble, ChatImageLightbox, ChatImageUpload, OrderChatSeparator, QuickReplyBar.
- `payer/` — PayerAssignmentManager, PayerMyAssignments, PayerOrderRow.
- `users/` — TerminalUsersList (553), UserConfigDialog (572), TerminalRolesList (731), TerminalSizeRanges, TerminalHierarchyView, TerminalOrgChart, TerminalRoleComparison, OperatorAssignmentManager, TerminalExchangeAccounts, BiometricManagementDialog.
- `mpi/OperatorDetailDialog.tsx`, `settings/PlatformDisplayCard.tsx`, `small-payments/SmallPaymentManagerAssignmentManager.tsx`.

### Terminal-specific hooks/contexts
- Contexts: `ExchangeAccountContext.tsx` (active Binance account switcher), `TerminalShortcutsProvider.tsx` (Ctrl+K + nav shortcuts).
- Hooks: `useTerminalAuth`, `useTerminalPresence`, `useTerminalNotifications`, `useTerminalAppeals`, `useTerminalBiometricSession`, `useTerminalJurisdiction`, `useTerminalUserPrefs` (per-user tab persistence), `useTerminalPurchaseSync`, `useTerminalSalesSync`; Binance: `useBinanceActions`, `useBinanceAds`, `useBinanceAssets`, `useBinanceOrders`, `useBinanceOrderSync`, `useBinanceChatWebSocket`; plus `useP2PTerminal`, `usePayerModule`, `useErpActionQueue`, `useOrderActors`, `useInternalChat`, `useCounterpartyChatHistory`, `useCounterpartyLinkedClient`, `useAdRestTimer`, `useAutoAssignment`, `useAutoPricingRules`, `useHybridPriceAdjuster`, `useAuto{Screenshot,MarkSmallSalesRead}`, `useSmall{Buys,Sales}Sync`, `useSpotTrade*`, `useWalletAssetPositions`.
- Config: `src/config/terminal-shortcuts.ts`, `src/config/shortcuts.ts`.

## 2. THEME

The `.terminal` token block lives in `src/index.css` **lines 126–186**, plus scoped component overrides at **lines 232–285**. Full block:

```text
.terminal {
  --background: 225 22% 7%;   /* #0F1115 */   --foreground: 225 25% 91%; /* #E6EAF2 */
  --card: 225 20% 9%;         --card-foreground: 225 25% 91%;
  --popover: 225 18% 13%;     --popover-foreground: 225 25% 91%;
  --primary: 217 91% 60%;     --primary-foreground: 0 0% 100%;   /* finance blue #3B82F6 */
  --secondary: 225 18% 14%;   --secondary-foreground: 225 18% 90%;
  --muted: 225 16% 15%;       --muted-foreground: 225 10% 72%;   /* #A8AEBB */
  --accent: 225 18% 16%;      --accent-foreground: 225 25% 93%;
  --destructive: 0 84% 60%;   --destructive-foreground: 0 0% 100%;
  --success: 142 71% 45%;     --warning: 38 92% 50%;   --info: 199 89% 48%;
  --border: 225 14% 17%;      --input: 225 18% 11%;    --ring: 217 91% 60%;
  --trade-buy: 142 64% 40%;   --trade-sell: 0 72% 51%; --trade-pending: 45 93% 47%;
  --chart-1..5: blue/green/amber/violet/red;
  --sidebar-background: 225 25% 5%;  --sidebar-foreground: 225 12% 52%;  (+ sidebar accent/border/ring)
  --shadow-xs..lg: deep hsl(225 40% 2%) exchange-grade shadows;
}
```

Scoped overrides (lines 232–285): custom 6px scrollbars; dense tables — `thead th` 10px uppercase 0.05em tracking, 8px padding; `tbody td` 12px, 8px padding, hover `rgba(255,255,255,.045)`, selected `primary/.08`; `.tabular-nums` feature settings.

**Where `.terminal` is applied:** `TerminalLayout.tsx` root — `<div className="terminal">` wrapping the entire provider tree. Everything inside inherits the dark token overrides; nothing leaks outside because tokens are re-declared, not global.

## 3. LAYOUT (screen structure)

**Shell (all pages):**
```text
<div.terminal>
  TerminalAuthProvider → AccessGate → BiometricAuthGate
    ExchangeAccountProvider → TerminalShortcutsProvider
      SidebarProvider
        [hidden md:block] TerminalSidebar (Operations nav + badges)
        SidebarInset
          TerminalHeader (h-10: trigger | Connected pulse ‖ break badge, exchange switcher, bell, user menu)
          <main overflow-auto> {page} </main>
```

**TerminalOrders (primary operator screen):** header row (title chip + chat/inbox buttons) → Tabs (order categories) → order list (dense table rows). Full-screen takeovers when a chat is open: `ChatInbox` list view, or `ChatThreadView` (`h-[calc(100vh-48px)]`).

**OrderDetailWorkspace (3-pane operator cockpit):**
```text
[ 280px left: OrderSummaryPanel ] [ center: ChatPanel + OrderActions ] [ 280px right: InternalChatPanel / PaymentDetails ]
```
Fixed 280px side rails (`border-r`/`border-l`, `bg-card`), scrollable center. Sub-panels: OrderSummaryPanel, ChatPanel (chat/ChatBubble/QuickReplyBar/ChatImageUpload), OrderActions (2-col action grid), PaymentDetailsCard, PastInteractionsPanel. Dialogs: OrderAssignment, QuickReceive, UpdatePaymentMethod.

**Dashboard:** MetricCards row → TradeVolumeChart / OrderStatusBreakdown / AdPerformanceWidget / OperationalAlerts, with TimePeriodFilter.

## 4. STYLING PATTERNS
- **Hardcoded colors:** essentially none — only 4 hex literals across the whole module: `#888` ×3 and `#26A17B` ×1 (USDT green). **Zero** tailwind palette classes (no `bg-gray-*`, `text-red-*`, etc.). Redesign is token-driven.
- **Tables vs cards:** dense exchange tables dominate (order lists, logs, users, appeals) styled via the `.terminal thead/tbody` overrides; cards (`Card`/`CardContent`) used for dashboards, panels, dialogs. Uses shadcn `Tabs` heavily; `useTerminalUserPrefs` persists active tab.
- **Fonts:** global Inter (forced `!important` in base layer). Weight usage: `font-medium` ×264, `font-semibold` ×131, `font-bold` ×59, `font-mono` ×43 (mono reserved for numeric/IDs). No terminal-specific font family.
- **Spacing:** page padding `p-4 md:p-6 space-y-4/5`; header `h-10`; side rails `w-[280px]`; badges 18px pills; micro type (`text-[9px]/[10px]/[11px]` uppercase tracking labels).
- **Icons:** lucide throughout (3.5–4 size in nav/header).
- **Animations/transitions:** `animate-spin` ×79 (loaders), `transition-colors` ×51, `animate-pulse` ×22 (Connected dot, live badges), `transition-all` ×6, `transition-opacity` ×5, `transition-transform` ×4, `duration-200/300` ×2. Table rows use CSS `transition: background-color .1s`.

## 5. REAL-TIME & PERF
**Polling (react-query `refetchInterval`):**
- `useBinanceActions`: active orders 5s (background), order status 20s, 30s, 120s; chat 10s; 15s.
- `useBinanceAds`: 60s. `useBinanceAssets`: 30s/20s/15min. `useTerminalAppeals`: 10s/15s. `useTerminalNotifications`: 30s. `usePayerModule`: 5s. `useErpActionQueue`: 30s.
- **WebSocket:** `useBinanceChatWebSocket` — live order chat via relay, ping keepalive interval, reconnect logic (account-scoped).
- **Intervals/timers:** `useTerminalPresence` heartbeat; `useTerminalBiometricSession` revalidation; `useBinanceOrderSync` periodic sync; countdown/expiry timers in `OrderSummaryPanel`, `AutoPaySettings`, `BiometricAuthGate`, `TerminalOrders`.

**Large lists (must stay per-row animation-free):** order list in TerminalOrders (5s refresh), logs/audit logs, appeals, users, MPI, analytics tables, chat message lists. Redesign must avoid per-row flash/transition on these — the existing `.terminal tbody tr` only animates background on hover, which is safe. Any live-value micro-interaction should be confined to single KPI cells, not table rows.

## 6. BOUNDARIES (what a `.terminal`-scoped redesign must respect)
- **Standalone shell:** terminal pages render inside `TerminalLayout`, NOT the ERP `Layout`. The two shells are fully independent.
- **Shared with ERP:** all shadcn primitives (`@/components/ui/*` — Card, Tabs, Button, Dialog, Badge, Command, Sidebar, etc.) and the semantic token names. These primitives are theme-agnostic; they render dark only because `.terminal` redeclares tokens. **Editing a shadcn primitive would affect the whole ERP** — keep redesign in `.terminal` token values + terminal-owned components only.
- **`TerminalAdManager` reuses the ERP `AdManager` page** — restyling shared AdManager internals leaks into the main app; treat with care.
- **Do not touch:** the main `:root`/`.dark` token blocks, ERP `Layout`, login/OAuth screens, and global base layer (fonts/overflow). Confine changes to lines 126–285 of `index.css` and files under `src/pages/terminal/**` + `src/components/terminal/**`.
- **Logic untouchable:** all polling hooks, WebSocket, Binance actions, auth/biometric gates, permission gates — presentation-only changes.

### Redesign leverage points (for the future build pass)
1. `.terminal` token block (126–186) — palette/contrast/accent overhaul with one edit, app-wide within terminal.
2. `.terminal` table/scrollbar overrides (232–285) — density, row rhythm, header treatment.
3. `TerminalLayout` / `TerminalHeader` / `TerminalSidebar` — shell chrome.
4. `OrderDetailWorkspace` + panels — the cockpit that operators live in.
5. `dashboard/*` widgets — KPI/card visual system.
