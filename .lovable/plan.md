# Attendance Summary: Cards / Table view toggle + CSV export

Apply the same view switch pattern used on Leave Allocations to the Attendance Summary page.

## What you will see

- A **Cards | Table** toggle and an **Export CSV** button appear in the page header row, beside the month picker and search.
- **Cards view**: exactly what exists today — the verification banner, the five KPI tiles, and the Overview / People / Patterns / Exceptions insight tabs with all charts, plus the per-employee list below.
- **Table view**: the charted insight block is hidden and the page becomes a single flat data table of the month, one row per employee:
  - Employee, Badge ID, Working Days, Present, Paid Leave, Not Counted (held harmless), Loss of Pay, Overtime (h), Late (min), Early Out (min), Attendance %.
  - Plain styling: sticky header, zebra rows, right-aligned numbers, horizontal scroll on narrow screens; the same table is used on mobile instead of the stacked cards.
  - The month picker, the employee search box, and the verification banner stay visible so the table is still filterable.
- **Export CSV** works in both views and downloads the currently filtered rows with the same columns as the table. Filename `attendance-summary-<YYYY-MM>.csv`.
- The chosen view is remembered for this page across reloads.

## Technical notes

- Reuse `ViewToggle` (`src/components/hrms/ViewToggle.tsx`) and `useViewMode("attendance-summary")`.
- `src/pages/horilla/AttendanceSummaryPage.tsx`: all queries, `filtered`, and derived values stay untouched. Branch rendering only:
  - render `<AttendanceInsights .../>` only when mode is `cards`;
  - in `table` mode drop the `hidden md:block` / `md:hidden` split so the existing desktop table renders at every width, with the tooltip on "Not counted" kept.
- CSV built client-side from `filtered` (quote-escaped Blob download), reusing the same numeric formatting as the table.
- Presentation only — no query, schema, or attendance-computation changes.

## Not in scope

- Column sorting or a column chooser.
- Changes to the insight charts themselves.
