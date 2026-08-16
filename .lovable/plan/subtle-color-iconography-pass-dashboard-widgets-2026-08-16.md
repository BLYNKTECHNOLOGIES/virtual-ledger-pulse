# Subtle Color & Iconography Pass — Dashboard Widgets

Goal: make dashboard widgets easier to read at a glance by adding restrained color and small pictorial cues. No layout rewrites, no new business logic, no data changes — presentation only.

## Design rules (applied everywhere)

- Color only carries meaning: positive/negative/warning/informational. No decorative rainbow.
- Tints only, never solid saturated blocks: 8–12% background tint with a full-strength icon/text on top.
- One accent per widget header, one accent per row at most.
- All colors come from existing semantic tokens (primary/success/warning/destructive/muted) so dark mode and theming keep working. No hardcoded hex or `text-white`-style utilities.
- Icons stay Lucide, 14–16px, subdued weight.

## What changes

1. Widget headers
   - The header icon gets a small rounded tinted tile (e.g. money widgets = primary tint, alerts = warning/destructive tint, people = success tint) instead of a bare grey glyph.
   - A single hairline accent is allowed at the top of a widget only where the widget is genuinely status-bearing (action queues, alerts).

2. List / ranked rows
   - Ranked breakdown rows (expense breakdown, top assets, revenue lists) get a faint proportional bar behind the row in the widget's accent tone, so magnitude reads visually — subtle, roughly 6–10% opacity.
   - Rows in category-style lists get a small category icon (salaries, hardware, banking, HR, capex, etc.) mapped from the category label, tinted to the row's tone.

3. Numbers and deltas
   - Keep existing delta chips, extend the same treatment consistently to all widgets that show a change value.
   - Currency figures stay neutral; only the delta and status words carry color.

4. Charts and sparklines
   - Charts pick up a soft gradient fill under the line/area in the series tone instead of flat grey.
   - Bar charts get a single tone with a lighter tint for non-focus bars.

5. Empty and loading states
   - Empty states get a tinted circular icon badge instead of a plain grey icon, matching the widget's accent.

## Widgets covered

All dashboard tiles: recent orders, expense breakdown, expense trends, growth rate, sales revenue, pending settlements, currently checked in, asset inventory, action required, pending sell/buy approvals, quick links, my tasks, shift reconciliation, interactive heatmap, exchange chart, metric cards.

## Technical notes

- Extend `src/components/dashboard/primitives/WidgetAtoms.tsx`: add an optional `tone` on rank rows to drive the magnitude bar tint, and a small `IconBadge` atom for tinted icon tiles.
- Extend `WidgetHeader` in `src/components/dashboard/primitives/WidgetShell.tsx` with an optional `iconTone`, defaulting to today's neutral so untouched call sites do not change.
- Add a small label→icon/tone mapping helper for category rows, used by expense-style widgets.
- Update call sites in `src/components/dashboard/widgets/RealDataWidgets.tsx`, `MyTasksWidget.tsx`, `ActionRequiredWidget.tsx`, `ShiftReconciliationWidget.tsx`, `QuickLinksWidget.tsx`, `MetricCard.tsx`, `InteractiveHeatmap.tsx`, `ExchangeChart.tsx` to pass the new tone/icon props.
- Any new tint values are added as tokens in `src/index.css` if not already available; both light and dark themes verified.
