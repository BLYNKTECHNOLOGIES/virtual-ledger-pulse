# Interaction & Motion Layer

Presentation-only pass. No business logic, queries, permissions, routes or calculations change.

Motion budget: 120-180ms, ease-out, no bounce, no page-level transitions, everything respects `prefers-reduced-motion`.

## 1. Motion tokens (src/index.css + tailwind config)

- Add duration/easing tokens (`--ds-motion-fast: 120ms`, `--ds-motion: 160ms`, ease-out curve) and reuse them in every component below instead of ad-hoc values.
- Add `.ds-row` (table row hover + selected state), `.ds-elevate` (subtle card hover lift: border tint + shadow step, no translate beyond 1px), `.ds-press` (active scale 0.985).
- Global `motion-reduce` guard that disables transforms and shortens transitions.

## 2. Primitives

- **Button**: already has hover/active/loading. Tighten disabled treatment (no shadow, muted border), unify press feedback with `.ds-press`, keep the existing `loading` spinner API.
- **Card**: opt-in `interactive` styling via `.ds-elevate` for clickable cards only; static cards stay still.
- **Table**: row hover, `data-state=selected` styling, sticky-header polish, smooth context/row menus.
- **Dropdown / Select / Popover / Context menu**: shorten Radix enter/exit to fast fade + 2px slide + 98% scale.
- **Dialog / AlertDialog**: fade + 98→100% scale in, symmetric exit; overlay fades only.
- **Sheet / Drawer**: slide with the shared easing, no overshoot.
- **Tooltip / Hover card**: fast fade, small delay.

## 3. Toasts

- Sonner toaster: rich colors mapped to semantic tokens for success / error / warning / info, tuned entrance/exit, consistent radius, icon, and close affordance.
- Legacy shadcn toaster (`toast.tsx`) gets matching variant styling so both surfaces look identical.

## 4. Skeletons replacing spinners

New shared skeleton set in `src/components/shared/skeletons/`:
`StatCardSkeleton`, `TableSkeleton`, `ListSkeleton`, `ChartSkeleton`, `FormSkeleton`, `ProfileSectionSkeleton`.

Rollout targets (highest-traffic surfaces first):
- Dashboard widgets (`WidgetSkeleton` already exists — align it to the new set).
- ERP list/table pages currently rendering a centered spinner.
- Profile tabs (reuse the existing `ProfileSkeleton`).
- Charts (P&L, dashboard trends) get a bar/line placeholder instead of a spinner.

Only the loading branch of each component changes.

## 5. Empty & error states

- `EmptyState` and `ErrorState` shared components (icon, title, one-line description, optional action).
- Error state shows a friendly message plus "Try again"; raw messages/stack traces are hidden behind a collapsed "Details" only in dev.
- Replace ad-hoc "No data"/red error text on the main ERP and HRMS surfaces with these.

## 6. Form submission feedback

- Standardize on `Button loading` for every submit action already wired to a mutation `isPending`, plus a success toast using the new variants. No mutation logic touched.

## 7. Navigation transitions

- Very light route-level fade-in (~120ms, no translate) plus a thin top progress bar during lazy chunk loads. No layout animation, no sidebar animation changes.

## 8. Command palette

The ERP palette (`src/components/shortcuts/CommandPalette.tsx`) already has permission-filtered navigation, quick-create actions, recents and entity search. Upgrade rather than rebuild:
- Grouped sections with clear labels: Recents, Actions, Go to, Clients, Orders, People.
- Keyboard shortcut badges on every item that has one (already present for shortcut-backed items; extend to the rest where a binding exists).
- Footer hint bar (`↑↓` navigate, `↵` open, `esc` close).
- Result-count and loading skeleton rows while entity search is in flight, plus a consistent empty state.
- Fast open/close animation matching the dialog treatment.
- Verify Cmd/Ctrl+K is the single consistent binding in `ShortcutsProvider`, and that the terminal palette does not double-fire when both providers are mounted.

## Technical notes

- Files touched: `src/index.css`, `tailwind.config.ts`, `src/components/ui/*` (button, card, table, dialog, alert-dialog, dropdown-menu, select, popover, context-menu, sheet, drawer, tooltip, sonner, toast), new `src/components/shared/skeletons/*`, new `EmptyState`/`ErrorState`, `CommandPalette.tsx`, `ShortcutsProvider.tsx`, and the loading branches of the pages being migrated.
- No changes to Supabase queries, edge functions, RLS, or any HR/finance computation.
- Verification: typecheck plus a Playwright pass over dashboard, an ERP table page, a profile tab and the command palette to confirm hover/selected/loading/empty states render and no console errors appear.
