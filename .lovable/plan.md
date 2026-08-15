# Card / Table view toggle for HRMS pages

Add a reusable "Pictorial | Table" switch to HRMS pages. Pictorial keeps the current UI exactly as-is. Table renders the same data as a plain, dense, styled table. First applied to the Leave Allocations page only; further pages come later on your instruction.

## What you will see on Leave Allocations

- A small two-button segmented toggle in the page header row (next to Bulk Allocate / Allocate Leave): **Cards** and **Table**.
- Cards view: unchanged — same KPI tiles, filters, per-employee cards with coloured leave chips and progress bars.
- Table view: KPI tiles and filters stay; the employee cards are replaced by one table.
  - Columns: Employee, Badge ID, Status (probation flag), then one column per leave type showing `This Qtr / Balance / Used`, and a final Total Balance column.
  - One row per employee, sticky header, zebra rows, right-aligned numeric cells, horizontal scroll on small screens.
  - Same search / year / quarter filtering, same active-employee and probation rules — no data logic changes.
- Your chosen view is remembered per user, per page (survives reload).

## Technical notes

- New `src/components/hrms/ViewToggle.tsx` — segmented control (`LayoutGrid` / `Table2` icons) with a `value` / `onChange` API.
- New `src/hooks/useViewMode.ts` — localStorage-backed `"cards" | "table"` state keyed by page id, mirroring the existing `useTerminalUserPrefs` pattern.
- `LeaveAllocationsPage.tsx`: keep all queries and derivations (`groupedArr`, `cumulativeData`, probation helpers) untouched; branch only at render between the existing card block and a new table block built from the same `groupedArr` + `leaveTypes` arrays.
- Table uses the existing shadcn `Table` primitives and design tokens only (no hardcoded colours except the existing leave-type colour dots).
- Pure presentation change: no query, RPC, schema, or permission changes.

## Not in scope

- Applying the toggle to other HRMS pages (awaiting your list).
- Column sorting, column chooser, or CSV export in table view — can be added later if wanted.
