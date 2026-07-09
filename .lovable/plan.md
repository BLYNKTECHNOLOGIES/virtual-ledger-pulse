# Terminal Keyboard Shortcuts — Audit & Fix Plan

I traced every shortcut in the registry (`src/config/terminal-shortcuts.ts`) → the
central listener (`src/contexts/TerminalShortcutsProvider.tsx`) → the real handlers
(`TerminalOrders.tsx`, `ChatPanel.tsx`, `QueueMode.tsx`, `useTerminalHotkeys.ts`,
`focus-page-search.ts`). The registry is a clean single source of truth, and most
shortcuts work exactly as documented. A handful are documented but only fire inside
**Queue Mode**, not in a normally-opened order.

## Working correctly (verified)

- **Navigation** — all Alt+Shift combos (D, A, O, U, W, Y, M, P, J, K, G, R, S) navigate to the right route and are permission-gated.
- **Go-to sequences** — `g` then o/d/a/p/m/q/b/s all navigate correctly (600ms window).
- **Orders list** — `J`/`K` move focus, `Enter`/`O` open, `[`/`]` switch tabs, `F` search, `R` refresh, `U` back.
- **Order detail** — `C` copy order #, `Shift+C` copy fiat, `I` internal chat, `A` focus first action (focus only), `U` back to list.
- **Queue Mode** — `J`/`K`/`←`/`→` next/prev, and `1–9` quick reply + `/` chat focus (these are wired via `useTerminalHotkeys`, which is only mounted here).
- **System** — `Ctrl/Cmd+K` palette, `/` page search, `Shift+/` help overlay, `Shift+D` mute toggle.
- **Chat composer** — `Enter` sends, `Esc` blurs the box (handled by the input's own `onKeyDown`).

## Broken / mismatched (documented but not functional outside Queue Mode)

1. **`1–9` Insert Quick Reply** — The central provider never dispatches digit events; only `useTerminalHotkeys` does, and that hook is mounted only in Queue Mode. In a normally-opened order the number keys do nothing, despite the docs listing scope "Order chat".
2. **`/` Focus Chat Input** — In order detail, `/` runs page-search (`focusPageSearch`), which never matches the chat box (it's not a search input). Documented under Chat but only works in Queue Mode. Also, `/` is listed twice (System "Search This Page" and Chat "Focus Chat Input"), which reads as a conflict.
3. **`Esc` Step Back (Order Detail)** — The provider's Escape branch only closes the help overlay / clears the go-to buffer. It never steps back from an open order to the list, so `t-detail-esc` is effectively unimplemented.
4. **`Shift+Enter` New Line** — The chat composer is a single-line `<input>`, so a newline is impossible anywhere. The doc entry is inaccurate.

## Fix plan

**1. Centralize `1–9` and `/`→chat in the provider** (`TerminalShortcutsProvider.tsx`)
- In the `/` page-search branch: if `focusPageSearch()` returns false, fall back to focusing `[data-terminal-chat-input]` (and preventDefault when found). This makes `/` focus chat in an open order while keeping page-search behavior elsewhere — resolving the double-listing.
- Add digit handling: on `1`–`9` (when not typing / no overlay), dispatch the existing `QUICK_REPLY_EVENT` (via a small exported helper in `useTerminalHotkeys.ts`). `ChatPanel` already subscribes, and it's only mounted when an order is open, so this is a no-op elsewhere.
- Remove the `/` and digit handling from `useTerminalHotkeys.ts` so Queue Mode doesn't double-fire; that hook keeps only prev/next. Verified Queue Mode's `J`/`K`/arrows still work (arrows via the hook; `j`/`k` context keys are ignored by `TerminalOrders` while in queue mode).

**2. Implement `Esc` step-back** (`TerminalShortcutsProvider.tsx`)
- Reorder the Escape branch: close help → if a Radix overlay is open, let Radix handle it → if a text input is focused, blur it (covers chat/detail composer blur) → otherwise dispatch `orders-back` so `TerminalOrders` returns from an open order to the list.

**3. Correct documentation** (`terminal-shortcuts.ts`)
- Fix the `Shift+Enter` entry (single-line composer — no newline) or remove it.
- Tweak `t-orders-open` keys so `/` reads clearly as "or" rather than an actual key, and align the `/` chat-focus copy with the new fallback behavior.

## Technical notes

- All changes stay within the "central listener, no parallel window keydown listeners" architecture and the hard rule that **no money-moving action is ever bound to a key** — every added handler only focuses, dispatches an existing non-destructive event, or navigates.
- No permission logic changes; permission gating in the registry/overlay is unaffected.
- Verify after: typecheck, then a Playwright pass on `/terminal/orders` opening an order to confirm `1–9`, `/`, and `Esc` behave as documented.
