## Goal

Make the ERP keyboard shortcuts (1) fully non-conflicting with Chrome, (2) a bit more usable, and (3) add a new "focus this page's search" action available both as a shortcut and as a header button that works relative to whatever page the user is on.

## 1. Chrome conflict audit (against Google's official shortcut list)

I checked every existing combo against Chrome for Windows/Linux and Mac. Only three genuinely collide with a Chrome browser shortcut:

| Current combo | Action | Chrome collision |
|---|---|---|
| `Alt+Shift+A` | Tax Management | Chrome "Focus on inactive dialogs" |
| `Alt+Shift+N` | Create New (contextual) | Chrome "Open split view in active tab" |
| `Ctrl+K` | Command Palette | Chrome "Search from address bar" |

Also **reserved by Chrome and therefore must stay unused**: `Alt+Shift+I` (feedback), `Alt+Shift+T` (focus toolbar). All other nav combos (`Alt+Shift+D/S/P/B/C/O/K/E/F/R/U/H/G/L/M`) are clear — Chrome only uses those letters with `Ctrl`/`Ctrl+Shift`, not `Alt+Shift`, so there is no collision.

### Fixes
- **Tax Management:** `Alt+Shift+A` → `Alt+Shift+X` (mnemonic: ta**X**).
- **Create New:** `Alt+Shift+N` → `Alt+Shift+Enter`.
- **Command Palette:** keep `Ctrl/Cmd+K`. Cmd+K on macOS has no Chrome binding at all. On Windows, `Ctrl+K` opens the omnibox only if the page doesn't handle it — our provider already calls `preventDefault()`, which fully and reliably suppresses Chrome's behaviour (the same mechanism Slack/Notion/Linear use). This is the one universally expected palette combo and the header already advertises it, so we keep it but I'll add an inline note in the Shortcuts page explaining the interception. If you'd rather move it off Ctrl+K entirely, say so and I'll switch it to `Alt+Shift+Space`.

## 2. New feature — contextual page search

A single action that focuses/opens the search box of whatever page the user is currently on.

- **Shortcut:** `/` (plain slash, when not already typing in a field) — the familiar GitHub/Slack "focus search" key, with zero Chrome conflict.
- **Header button:** a Search-icon button in `TopHeader` that fires the same action, so mouse users get it too.
- **How it resolves the right box:** a `focusPageSearch()` helper looks for `[data-page-search]` on the current page first, then falls back to the first visible `input[type="search"]` / `input[placeholder*="search" i]`. It focuses, selects existing text, and scrolls it into view.
- I'll tag the primary search inputs on the highest-traffic pages with `data-page-search` (Sales, Purchase, BAMS, Clients, Terminal Orders, Stock); the heuristic fallback covers every other page automatically with no per-page edit.

## 3. A few more usable shortcuts

- `Alt+Shift+Enter` — contextual "Create new" (moved off the conflicting N).
- `/` — focus current page's search (new).
- Keep `Alt+Shift+/` for the Shortcuts help page (distinct from plain `/`).
- Everything remains permission-gated exactly as today; nothing bypasses `usePermissions`.

## Technical changes

- **`src/config/shortcuts.ts`** — remap Tax to `Alt+Shift+X`, Create New to `Alt+Shift+Enter`; add a `global-page-search` entry (`/`). Add a comment block listing Chrome-reserved combos so future additions avoid them.
- **`src/contexts/ShortcutsProvider.tsx`** — handle the new `/` page-search key (ignored while typing); expose `focusPageSearch` via context so the header button can call it.
- **`src/lib/focus-page-search.ts`** (new) — the resolver helper described above.
- **`src/components/TopHeader.tsx`** — add the Search-icon "page search" button wired to `focusPageSearch()`; update the placeholder/hint text.
- **Page search inputs** — add `data-page-search` to the main filter input on Sales, Purchase, BAMS, Clients, Terminal Orders, Stock.
- **`src/components/shortcuts/CommandPalette.tsx`** and **`src/pages/Shortcuts.tsx`** — reflect the remapped combos, add the new page-search shortcut, and add the "Chrome-safe / reserved keys" note.

No schema, edge-function, or dependency changes.
