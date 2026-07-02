# Terminal Shortcuts + Arrow-Key Order Navigation

Bring the ERP's permission-aware shortcut system into the P2P Terminal, plus a new "hold-and-move" arrow navigation that walks through the exact order list you entered from (Active Orders, Appeals, KYC/Bio-flagged, etc.), opening each order's chat as you move.

## Part A — Terminal Shortcut Library

**New file `src/config/terminal-shortcuts.ts`** — a registry mirroring `src/config/shortcuts.ts`, but:
- Routes point to `/terminal/*`.
- Each entry is gated by a `TerminalPermission` (from `useTerminalAuth`), not ERP permissions.
- Uses the same Chrome-safe `Alt+Shift+<key>` scheme, reusing the `matchesCombo` / `comboToDisplay` helpers already in `shortcuts.ts` (exported and shared).

Navigation shortcuts (gated by the same permission as each sidebar item):

```text
Alt+Shift+D  Dashboard        terminal_dashboard_view
Alt+Shift+A  Ads Manager      terminal_ads_view
Alt+Shift+O  Orders           terminal_orders_view
Alt+Shift+U  Automation       terminal_pricing_view
Alt+Shift+W  Assets           terminal_assets_view
Alt+Shift+Y  Analytics        terminal_analytics_view
Alt+Shift+M  MPI              terminal_mpi_view_own
Alt+Shift+P  Payer            terminal_payer_view
Alt+Shift+J  Appeals          terminal_appeals_view
Alt+Shift+K  Small Payments   terminal_small_payments_view
Alt+Shift+G  Logs             terminal_logs_view
Alt+Shift+R  Users & Roles    terminal_users_view
Alt+Shift+S  Settings         terminal_settings_view
```

Global:
```text
Ctrl/Cmd+K   Command palette (terminal-scoped, permission filtered)
/            Focus current page's search box
Alt+Shift+/  Open this Shortcuts help page
```
(All chosen letters are outside Chrome's reserved `Alt+Shift` combos: I, T, A-with-dialogs, N — already documented in `shortcuts.ts`.)

**New file `src/contexts/TerminalShortcutsProvider.tsx`** — global key listener, mounted inside `TerminalLayout` (so it only runs in the terminal and has `useTerminalAuth` in scope). It:
- Ignores keystrokes while typing in inputs/textareas/contenteditable.
- Only fires a navigation shortcut when the user passes its `TerminalPermission` check — a user without permission gets nothing, exactly like the sidebar.
- Handles `/` → focus `[data-page-search]` (reusing `src/lib/focus-page-search.ts`), and `Ctrl/Cmd+K` → terminal command palette.

**New file `src/components/terminal/TerminalCommandPalette.tsx`** — same pattern as the ERP `CommandPalette`, filtered by terminal permissions.

## Part B — Terminal Shortcuts Info Page (permission-aware)

**New file `src/pages/terminal/TerminalShortcuts.tsx`** — mirrors `src/pages/Shortcuts.tsx`: sections for Global / Navigation / Arrow Navigation, rendering each combo as `<kbd>`. Shortcuts the user lacks permission for are shown greyed-out with a "No access" badge (`useTerminalAuth().hasPermission`).

- Add route `/terminal/shortcuts` in `src/App.tsx` (wrapped in `TerminalLayout`).
- Add a **Shortcuts** item to `src/components/terminal/TerminalSidebar.tsx` with **no** `requiredPermission` so it's visible to every terminal user (as requested).

## Part C — Shift + Arrow "Hold & Move Through the List"

The key rule: navigation always follows the **currently displayed/filtered list you entered from**, so it inherently stays inside that group (Active Orders, a status/trade filter, Appeals, KYC/Bio-flagged) and never leaks across groups or past your permissions (you can only step onto rows already visible to you).

**`src/pages/terminal/TerminalOrders.tsx`**
- When an order detail is open (`selectedOrder` set), add a keydown listener for `Shift+ArrowRight`/`Shift+ArrowDown` → next, `Shift+ArrowLeft`/`Shift+ArrowUp` → previous.
- Compute the current index inside `visibleOrders` (the already-filtered list reflecting the active trade/status/assignment tabs + search). Move ±1, clamp at ends, then `setSelectedOrder(nextOrder)` and mark its chat read (same path as `openChatForOrder`), so the chat opens automatically.
- Because `visibleOrders` already encodes the "group through which we entered," stepping stays within Active vs Completed vs a KYC-filtered subset, etc.

**`src/pages/terminal/TerminalAppeals.tsx`**
- When a case chat is open (`chatOrder` set), the same `Shift+Arrow` handler walks `visibleCases` (the current appeals filter) and opens the prev/next case's chat via the existing `openChatForCase` flow.

**Optional small enhancement (non-breaking):** show subtle `‹ ›` prev/next buttons in the `OrderDetailWorkspace` header when a handler is provided, so the same movement is available by click. This only adds optional props (`onPrev?`, `onNext?`) and changes nothing when they're absent.

## Permissions & Safety
- Every navigation shortcut and palette entry is filtered through `useTerminalAuth().hasPermission`, identical to sidebar gating — shortcuts never bypass rules.
- Arrow navigation can only land on rows already rendered for that user, so it cannot expose orders they aren't allowed to see.
- No database, edge-function, or Binance-API changes — this is purely front-end keyboard/routing wiring.

## Verification
- Typecheck.
- Playwright smoke on `/terminal/shortcuts` to confirm the page renders and greys out no-access rows.
- Manual-style check that `Shift+Arrow` inside an open order advances selection within the filtered list only.
