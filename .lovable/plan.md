# Shifts page: full-width Shift Schedule + CSV export

## What you will see

- On the Shifts page, **Shift Schedule** moves out of the two-column row and spans the **full page width** on its own. **Weekly-Off Patterns** sits below it, also full width (it is a short card, so no wasted space).
- With the extra width the schedule table breathes: Employee, Shift and Effective From columns no longer clip, and the sticky header aligns properly with the first row (the current overlap of the header over "Vikas Kumar Sahu" goes away).
- A new **Export CSV** button appears in the Shift Schedule card header, next to "Change Shift". It downloads the rows currently shown (respects the search box) with columns: Employee Name, Badge ID, Shift, Effective From. Filename `shift-schedule-<YYYY-MM-DD>.csv`.
- Row height and max-height scrolling stay as they are.

## Technical notes

- `src/pages/horilla/ShiftsPage.tsx`: change the `grid lg:grid-cols-2` wrapper (line ~169) to a single-column stack so `ShiftScheduleAssigner` and `WeeklyOffManager` each take full width.
- `src/components/hrms/ShiftScheduleManager.tsx` (`ShiftScheduleAssigner`): lift the search-filtered list into a memo so both the table and the export use the same rows; add a `Download`-icon button in `CardHeader`; build the CSV client-side (quote-escaped) and trigger a Blob download. Fix the sticky header overlap by giving the sticky `thead` a solid background.
- Presentation only — no query, schema or shift-assignment logic changes.

## Not in scope

- Column sorting, pagination, or Excel/PDF export.
