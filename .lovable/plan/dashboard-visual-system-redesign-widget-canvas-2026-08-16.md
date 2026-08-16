# Dashboard visual system redesign — widget canvas

Goal: make every dashboard widget look like it belongs to one production-grade ERP, regardless of role, size or content. No widget is added, removed, renamed or re-scoped; no data, permission, registry or business logic changes.

## What exists today (verified)

- `src/pages/Dashboard.tsx` owns the 12-column grid, per-user widget order/spans persistence, edit mode, dnd-kit sorting, and renders two families: built-in sections (metric cards, action-required, quick-links, heatmap, recent activity, my-tasks) and registry widgets via `DashboardWidget`.
- `src/components/dashboard/DashboardWidget.tsx` is the shell for all registry widgets: gradient header strip, gradient icon chip per category, a three-dot menu (Move Up / Move Down / Remove), and a `switch` mapping widget id → content component.
- `src/components/dashboard/DraggableDashboardSection.tsx` wraps every tile: blue drag pill outside the card, dashed amber ring in edit mode, floating label chip, red remove dot, S/M/L/XL resize pills.
- `src/components/dashboard/widgets/RealDataWidgets.tsx` holds ~20 content components with per-widget ad-hoc paddings, hardcoded chart palette (`COLORS` hex array), `text-[10px]` metadata, and one shared `WidgetLoader` spinner used by all.

Result: three competing visual languages (built-in sections, registry shells, widget internals) on the same canvas.

## The redesign

### 1. Widget shell primitives (new, shared)

`src/components/dashboard/primitives/`:

- `WidgetShell` — the single container: `bg-card`, 1px border, 12px radius, `shadow-xs` at rest → `shadow-sm` on hover, consistent internal padding, full-height flex column so neighbours in a row align. Accepts `header`, `footer`, `state` (`loading` / `error` / `empty` / `ready`), `accent` (semantic only).
- `WidgetHeader` — 40px band: 13–14px semibold title, optional muted subtitle, optional inline filter slot, actions slot that is `opacity-0 group-hover/widget:opacity-100 focus-within:opacity-100` (always visible on touch), and the action menu at the end. Neutral icon chip (`bg-muted`, muted-foreground) replaces the per-category gradient chips.
- `WidgetBody` — scroll container with consistent padding and `min-h` per span so rows stay level.
- `WidgetMenu` — one dropdown used by every widget: Refresh (invalidates that widget's queries), Move up / Move down, Resize submenu (reusing the existing span values), Remove. Items render only when the corresponding handler is passed, so no capability is invented.
- `WidgetMetric`, `WidgetListRow`, `WidgetMeta`, `WidgetStatus` — the shared content atoms (label / value / delta, row with leading chip + two-line left + right-aligned tabular number, timestamps, semantic badge).
- `WidgetSkeleton` — variant-aware skeleton (`metric` / `chart` / `list` / `table`) replacing the single spinner; the shell picks a variant from a `skeleton` prop on the widget definition, defaulting to `list`.
- `WidgetEmpty`, `WidgetError` — compact, icon + one line + optional Retry (wired to the existing refetch when present). Errors never print raw messages.

### 2. Apply the shell

- `DashboardWidget.tsx` keeps its `switch` and every case body untouched; only the surrounding `Card`/`CardHeader`/menu is swapped for `WidgetShell` + `WidgetHeader` + `WidgetMenu`. The category gradient helper is dropped in favour of a neutral chip plus a semantic accent where the category already implies one.
- The `default:` fallback case becomes a proper "widget preview" empty state instead of a big gradient circle.
- Built-in sections in `Dashboard.tsx` (recent activity, and the wrappers for action-required / quick-links / heatmap / my-tasks) get the same shell so they stop looking like a different product. Their internals and handlers stay as they are.
- Inside `RealDataWidgets.tsx`: replace ad-hoc `p-4`/`text-[10px]`/inline colors with the atoms and the global type classes (`t-card-title`, `t-secondary`, `t-label`), and swap `WidgetLoader` for `WidgetSkeleton`. Queries, keys, filters, math and navigation are not touched.

### 3. Charts

One `WidgetChart` wrapper (fixed heights per span, consistent margins) and one `chartTheme` module: tokenised series colors derived from the design system instead of the hardcoded hex `COLORS`, faint horizontal-only gridlines, no axis lines, 11px muted tick labels, a shared tooltip styled like the app's popovers, and a compact legend only where one already exists. Recharts data props stay identical.

### 4. Grid and density

- Keep the existing 12-column span logic and adaptive row-filling function exactly as-is; it already drives persistence.
- Breakpoint mapping becomes explicit and predictable: mobile 1 column, `sm` 2 columns for small tiles, `lg` full 12-column grid. Uniform gap (16px desktop / 12px mobile), `items-stretch` retained, and equal `min-h` per span class so tiles in a row end flush.
- Remove the `pl-4` shift that currently pushes the whole grid sideways in edit mode (the drag handle moves inside the tile instead).

### 5. View mode vs edit mode

- **View mode**: no rings, no handles, no labels. Hover only lifts the shadow and reveals the header actions. Drag is disabled, so viewing can't nudge a widget.
- **Edit mode**: a quiet top bar (not the amber alert block) with the mode name, widget count, Add widget, Reset and Done. Tiles get a dashed primary-tinted outline, an in-header grip that becomes the drag affordance, a persistent remove button in the header (not a floating red dot), and the size control as a segmented S/M/L/XL row in the tile footer instead of a floating pill.
- **Dragging**: the lifted tile keeps a `DragOverlay` ghost at reduced opacity while its origin slot shows a dashed placeholder, so the drop target is explicit. Existing `handleDragEnd` / `arrayMove` / persistence untouched.

### 6. Accessibility & motion

Icon-only buttons get `aria-label`; the menu is the shadcn/Radix dropdown (correct ARIA by default); drag handles are real buttons with dnd-kit keyboard sensor added alongside the pointer sensor, so reordering works from the keyboard; status is always icon + text, never color alone; focus rings visible on tiles and controls. All transitions 150–200ms on `opacity`/`box-shadow`/`border-color` only, with `motion-reduce` guards — no transform animation on the grid.

## Technical notes

- New files: `src/components/dashboard/primitives/*` and `src/lib/dashboard/chartTheme.ts`.
- Edited: `Dashboard.tsx` (presentation only — header, banner, grid classes, built-in wrappers), `DashboardWidget.tsx` (shell swap), `DraggableDashboardSection.tsx` (edit affordances), `RealDataWidgets.tsx` (styling only), plus the built-in widget components for shell adoption.
- Untouched: widget registry, `AddWidgetDialog`, permission gating, persistence shape (`activeWidgetIds`, `customSpans`), all queries and all handlers.
- Verification: typecheck, then Playwright renders at 1440 / 1024 / 834 / 390 to confirm no overflow and no console errors. Note: the preview Supabase is external/unmanaged, so an authenticated dashboard screenshot cannot be captured from here — visual sign-off on the live dashboard will be yours.
