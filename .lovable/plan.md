# Cards / Table toggle + CSV export on Statutory Settings

Apply the same view switch used on Leave Allocations to the Statutory Settings page.

## What you will see

- The **Cards | Table** toggle and an **Export CSV** button sit in the page header row, next to the info (i) button.
- **Cards view**: unchanged — the current employee rows with PF / ESI / PT badge chips, Edit and history buttons (the existing responsive list keeps behaving as it does today).
- **Table view**: KPI tiles, search, filter and Bulk action all stay. The list is replaced by a flat data table with one row per employee:
  - Employee, Badge ID, Monthly CTC, Effective From, PF (Yes/No), PF Wage Base (Capped ₹15k / Actual), VPF (mode + value), ESI (Yes/No), PT (Yes/No), UAN, ESIC Number, Flag (missing UAN / missing ESIC), and Edit + history actions.
  - Plain styling: sticky header, zebra rows, right-aligned numbers, horizontal scroll on narrow screens. Row selection checkbox kept so Bulk still works from table view.
- **Export CSV**: downloads exactly the rows currently visible (respects search + filter) with the same columns as the table, minus the action buttons.
- The chosen view is remembered for this page across reloads.

## Technical notes

- Reuse `ViewToggle` (`src/components/hrms/ViewToggle.tsx`) and `useViewMode("statutory-settings")` — no new shared primitives.
- `StatutorySettingsPage.tsx`: keep all queries, `activeByEmp`, `rows`, `stats`, mutation and dialog logic untouched. Branch only at the list render between the existing `ResponsiveList` block and a new shadcn `Table` block driven by the same `rows` array.
- CSV built client-side from `rows` (quote-escaped, Blob download), filename `statutory-settings-<YYYY-MM-DD>.csv`.
- Presentation only: no query, schema, RLS or payroll logic changes.

## Not in scope

- Column sorting or a column chooser.
- Other HRMS pages (awaiting your next list).
