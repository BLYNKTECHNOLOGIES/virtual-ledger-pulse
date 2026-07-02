# ERP Keyboard Shortcuts + Shortcuts Tab

Add a permission-aware keyboard shortcut system to the ERP: modifier-combo shortcuts that avoid browser/OS conflicts, a searchable command palette (Ctrl/Cmd+K), context-aware "open dialog" actions, and a **Shortcuts** help tab visible to every user.

## Design decisions (from your answers)
- **Combo style:** `Alt+Shift+<Key>` for all navigation and actions. This range is not bound by Chrome, Edge, or Windows, so nothing clashes with browser chrome. Palette uses the near-universal `Ctrl/Cmd+K` (with `preventDefault` so it never triggers the browser's address-bar search).
- **Actions:** Shortcuts both navigate to a module AND can open that module's primary "create" dialog.
- **Palette:** included, fuzzy-search over every destination/action the current user is allowed to see.

## Permission safety (core requirement)
Nothing bypasses rules or RLS:
- Every shortcut and palette entry is filtered through the existing `usePermissions().hasAnyPermission(...)` using the exact same permission arrays already defined for each sidebar item. If a user can't see a module in the sidebar, its shortcut and palette entry simply don't exist for them.
- "Open dialog" shortcuts never call the database directly. They navigate to the target route and set a `?quickAction=new` flag; the page's existing (already permission-gated) create button/dialog is what opens. If the user lacks manage rights, the button/dialog isn't rendered and nothing happens.
- Shortcuts are ignored while typing in inputs, textareas, selects, or contenteditable fields, so they never interfere with data entry.

## Proposed shortcut library
Navigation (`Alt+Shift+…`), each gated by that module's view permission:

```text
Alt+Shift+D   Dashboard          Alt+Shift+A   Tax Management (Accounting)
Alt+Shift+S   Sales              Alt+Shift+F   Financials
Alt+Shift+P   Purchase           Alt+Shift+R   Risk Management
Alt+Shift+B   BAMS               Alt+Shift+U   User Management
Alt+Shift+C   Clients            Alt+Shift+H   HRMS
Alt+Shift+O   Terminal Orders    Alt+Shift+G   Tasks
Alt+Shift+K   Stock Management   Alt+Shift+L   Compliance
Alt+Shift+E   ERP Entry          Alt+Shift+M   Statistics
```

Global / actions:

```text
Ctrl/Cmd + K        Open command palette (search any module/action you can access)
Alt+Shift+N         Create new in the current module (opens its primary dialog)
Alt+Shift+/  ( ? )  Open the Shortcuts help
Esc                 Close palette / dialogs (native)
```

Context-aware `Alt+Shift+N` is wired for the highest-traffic create flows: Sales order, Purchase order, BAMS journal entry, Client add, ERP entry, Task. Other pages can be added later using the same pattern.

## What gets built

1. **Central shortcut registry** — `src/config/shortcuts.ts`
   - Single source of truth: array of `{ id, keys, label, description, category, url?, quickAction?, permissions[] }`.
   - Reused by the provider, the palette, and the Shortcuts help page so definitions never drift.

2. **Global shortcut provider** — `src/contexts/ShortcutsProvider.tsx`, mounted inside `Layout`.
   - Attaches one `keydown` listener; matches combos, checks `hasAnyPermission`, ignores typing contexts, calls `navigate()` (with optional `?quickAction=new`), toggles palette/help.

3. **Command palette** — `src/components/shortcuts/CommandPalette.tsx`
   - Built on the existing `cmdk` (`components/ui/command.tsx`) in a dialog. Lists only permitted entries, grouped by category, shows each combo as a `kbd` badge, runs the action on select.

4. **Quick-action hook** — `src/hooks/useQuickAction.ts`
   - Reads `?quickAction=new` from the URL, fires once, and clears the param. Added to the 6 target pages to auto-open their existing create dialog (each still permission-gated).

5. **Shortcuts help page** — `src/pages/Shortcuts.tsx` + route `/shortcuts`
   - Visible to all authenticated users (no permission gate). Renders the full library grouped by category; shortcuts the user can't use are shown greyed/labelled "no access" so the page is a complete reference without being misleading. Includes OS-aware key rendering (⌘ on Mac, Ctrl on Windows).

6. **Sidebar + nav entry**
   - Add a **Shortcuts** item (Keyboard icon) to `AppSidebar` standalone items with empty `permissions` so it shows for everyone, plus the route in `App.tsx`. Optional small "Shortcuts (Alt+Shift+/)" link in the top header.

## Technical notes
- Key matching normalizes `event.altKey && event.shiftKey && event.code`; uses `code` (physical key) so it's layout-independent.
- Typing guard: skip when `document.activeElement` is INPUT/TEXTAREA/SELECT or `isContentEditable`, and when a modal text field has focus.
- Palette and help both read from the same registry; adding a shortcut later means editing only `shortcuts.ts` (+ a `useQuickAction` line if it opens a dialog).
- No schema changes, no edge functions, no new dependencies (`cmdk` already present).

## Out of scope
- Per-user customizable/remappable shortcuts (can be a later enhancement backed by a `user_shortcut_prefs` table).
- Deep in-page actions beyond opening the primary create dialog for the 6 listed modules.
