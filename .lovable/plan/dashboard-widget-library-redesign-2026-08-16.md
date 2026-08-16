# Dashboard Widget Library Redesign

Redesign how every existing dashboard widget looks, using one shared BLYNK design language with content-appropriate internal layouts. No widget is added, removed, renamed or rewired; no data, permission, role, calculation or registry logic changes.

## What exists today (inspected)

- Registry: 10 built-in widgets (metric cards, action required, quick links, heatmap, recent activity, my tasks) plus ~28 registry widgets across Sales, Purchase, Clients, Stock, Banking, PNL, Statistics, Activity, Compliance, HRMS, Payroll, Terminal.
- `DashboardWidget.tsx` is the switch that renders each registry widget inside the new `WidgetShell`.
- `RealDataWidgets.tsx` holds 19 widget bodies (charts, lists, KPI grids, approval queues, status panels).
- Standalone widgets still use raw shadcn `Card` markup with their own headers: Action Required, Quick Links, My Tasks, Interactive Heatmap, Shift Reconciliation.
- Primitives already built last turn: `WidgetShell/Header/Body/Footer/Menu/Skeleton/Empty/Error`, `WidgetMetric/ListRow/List/Meta/Status/Chart`, and `chartTheme.ts`.

## Approach

Group the widgets by the pattern their content actually needs, then give each group one refined composition built from shared primitives.

1. **Single-metric widgets** (Total Sales, Sales Orders, Clients, Total Cash, Stock Value, Wallet Balance, Bank Balance, Total Purchases, PO Count, Gross Profit, Profit Margin, Growth Rate, Conversion Rate, Earnings Rate)
   One dominant value, a subordinate label, a delta/trend chip, optional sparkline strip. Compact vertical rhythm, tabular numerals, no oversized colored boxes.

2. **Chart widgets** (Revenue Chart, Customer Growth, Cash Flow, Expense Trends, Expense Breakdown, Interactive Heatmap)
   Header with title plus optional inline range control, then a framed plot area with token-driven axes, minimal gridlines, unified tooltip card, compact legend below. Charts fill available height rather than fixed pixel blocks.

3. **List / transaction widgets** (Recent Orders, Recent Activity, Pending Settlements, Upcoming Tasks, My Tasks)
   Dense scannable rows: leading state icon, two-line primary/secondary, right-aligned numeric column with consistent formatting, hover affordance, row click preserved where it exists today. Optional footer with the existing "view all" link only where one already exists.

4. **Status / operational widgets** (Team Status, Inventory Status, Compliance Alerts, Payroll Summary, Performance Overview, Daily Activity, Quick Stats)
   A small summary strip of 2–4 subordinate stats plus a body of status rows or progress bars, using semantic tone plus icon plus text (never colour alone).

5. **Action widgets** (Action Required, Terminal Sales/Purchase Approval, Quick Links, Shift Reconciliation)
   Counts as quiet chips, one primary action per widget with the rest as quiet or menu items, destructive treatment kept distinct. Existing actions are preserved exactly.

## Cross-cutting work

- Migrate the five standalone `Card`-based widgets onto `WidgetShell`/`WidgetHeader` so headers, padding, radius and borders match the registry widgets.
- Per-pattern loading skeletons (metric / chart / list / status shapes) replacing generic spinners.
- Consistent empty and error states per widget, with retry wired to the widget's existing refetch where one exists.
- Density adapts to tile width via container-based classes so narrow tiles drop secondary columns instead of wrapping badly, and wide tiles gain breathing room rather than stretched text.
- Sweep remaining hardcoded hex/colour utilities inside widget bodies onto semantic tokens.

## Technical notes

- Extend `primitives/WidgetShell.tsx` and `WidgetAtoms.tsx`; add `WidgetStatGrid`, `WidgetProgressRow`, `WidgetSparkline`, and pattern-specific skeletons (`WidgetSkeleton variant="chart" | "list" | "metric" | "status"`).
- Files touched: `primitives/*`, `lib/dashboard/chartTheme.ts`, `DashboardWidget.tsx`, `widgets/RealDataWidgets.tsx`, `widgets/MyTasksWidget.tsx`, `ActionRequiredWidget.tsx`, `QuickLinksWidget.tsx`, `InteractiveHeatmap.tsx`, `ShiftReconciliationWidget.tsx`, and presentation-only spots in `pages/Dashboard.tsx`.
- All queries, mutations, permission gates, registry entries, sizes and role filters stay byte-identical in behaviour; edits are JSX/class-level.
- Delivered in passes (primitives → metrics → charts → lists → status → actions → consistency review), with a typecheck after each pass and a final side-by-side visual review of the whole library.
