# Late Come & Early Out: Cards / Table view toggle + CSV export

Same pattern already applied to Leave Allocations and Attendance Summary.

## What you will see

- A **Cards | Table** toggle and an **Export CSV** button join the filter row (month, type, search).
- **Cards view**: unchanged — the three KPI tiles (Late Comes, Early Outs, Employees Affected) plus the Employee Summary / All Records tabs exactly as they render today, including click-through to the incident detail dialog.
- **Table view**: the KPI tiles are hidden and the page shows a plain data table for whichever tab is active, at every screen width (no separate mobile card list):
  - Employee Summary: Employee, Badge ID, Late Count, Total Late (min), Early Out Count, Total Early (min), Total Incidents — plain numbers, no coloured pills. Rows stay clickable to open the incident dialog.
  - All Records: Date, Employee, Badge ID, Type, Minutes.
  - Sticky header, zebra rows, right-aligned numbers, horizontal scroll on narrow screens.
- **Export CSV** works in both views and exports the active tab's rows with the columns above, respecting month/type/search filters. Filenames `late-early-summary-<YYYY-MM>.csv` and `late-early-records-<YYYY-MM>.csv`.
- The chosen view is remembered for this page across reloads.

## Technical notes

- Reuse `ViewToggle` and `useViewMode("late-early")`; lift the current `Tabs` value into state so the export and table branch know which tab is active.
- `src/pages/horilla/LateComeEarlyOutPage.tsx`: keep the query, `filtered`, `employeeSummary` and `summaryList` computation untouched. Branch only on render — hide the KPI card row in table mode, and swap the `hidden md:table` / `md:hidden` classes so the table renders at all widths with plain cells.
- CSV built client-side (quote-escaped Blob download).
- Presentation only — no query, schema or penalty-logic changes.

## Not in scope

- Column sorting or a column chooser.
