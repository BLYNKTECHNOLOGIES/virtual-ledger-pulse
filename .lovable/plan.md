# Capacity & Shift Planning Visuals

## Goal
Turn **Capacity & Seats** into the selected detailed capacity dashboard while keeping physical desks, operational capacity, and employee headcount distinct.

## What will change
- Keep the existing filters, four summary cards, permissions, add/edit/delete actions, and detailed seat table.
- Add a **Seat Breakdown** visual by department/position showing occupied, available, and overflow seats.
- Add **Shift-wise Occupancy** from current employee shift assignments, including shift timings, assigned people, available seats, utilisation, and clear full/overflow states.
- Add a compact **Shift Planning** matrix that compares each role's shift distribution against its physical seats, making the busiest shift and cross-shift totals explicit.
- Improve the existing table's shift column so non-shift-specific rows show the actual live shift mix rather than a dash.
- Provide compact mobile versions of all new visuals without nested cards or horizontal text collisions.

## Data rules
- Physical seats remain sourced only from the existing seat-capacity records.
- Staff and shift allocation remain sourced from active employee work records and current effective-dated shift schedules; no duplicate staffing records will be created.
- Shared-desk occupancy remains the **busiest simultaneous shift**, while total staff across all shifts is shown separately.
- A shift-specific capacity row counts only employees assigned to that shift.
- Missing shift assignments appear as **Unassigned**, never inferred.

## Technical details
- Extend the workforce lookup to include shift start/end times and use the current effective-dated schedule as the authoritative shift assignment when available, falling back to work information only when no current schedule exists.
- Centralize the seat/shift aggregation into a small typed helper so the KPI cards, visuals, mobile view, and table cannot disagree.
- Use existing Blynk semantic color tokens, chart components, Manrope/Montserrat typography, compact radii, and permission-aware controls.
- Verify with type checking, the automatic build log, database count comparisons, and Playwright at desktop and mobile sizes.
