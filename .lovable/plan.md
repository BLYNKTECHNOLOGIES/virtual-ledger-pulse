# Repair workforce capacity and hiring integrity

## Goal
Make the recorded operational seat plan the default staffing target. A role with fewer active people than its operational capacity must appear short-staffed and produce a reviewable hiring requirement without counting physical seats and employees as the same thing.

## Changes
- Reconcile every active role-level seat entry into one active staffing plan:
  - Approved headcount = operational capacity.
  - Required headcount = operational capacity because the operating policy is 100% occupancy.
  - Existing explicit staffing targets remain authoritative when they exceed capacity.
- Correct the staffing calculation so a shared, non-shift-specific seat entry compares against the busiest simultaneous shift for that role, rather than duplicating one plan row per employee shift.
- Use current effective-dated shift schedules, with work-profile shift only as fallback, everywhere staffing is calculated.
- Calculate each shortage as `max(0, required − current − selected − confirmed joiners)` and subtract any still-open hiring quantity so duplicate requirements are never raised.
- Backfill missing staffing plans from the 12 existing seat records, then create one system-generated **pending approval** hiring requirement for each uncovered shortage. Existing requirements and recruitment openings will be preserved.
- Add database safeguards so future seat-capacity or staffing changes reconcile the same way, with audit entries for generated plans and requirements.
- Update the overview and staffing plan to show capacity-backed targets, uncovered shortages, and already-requested hiring distinctly.

## Verification
- Query every active seat role and prove it has exactly one matching staffing target.
- Reconcile live employees, selected candidates, confirmed joiners, and open requirements; verify no shortage is hidden or double-counted.
- Confirm the Support Staff row remains 1/1 and that genuinely vacant roles produce only the correct requirement quantity.
- Test the Workforce Overview, Staffing Plan, Capacity & Seats, and Hiring Requirements pages in the signed-in preview on desktop and mobile.
- Run the project checks and append the completed integrity repair to the shared state log in IST.

## Technical details
- Replace `hr_workforce_staffing_matrix()` with a scope-safe aggregation that returns one row per plan and uses effective shift schedules.
- Add an idempotent reconciliation function and uniqueness protection for system-generated open requirements.
- Keep physical seat capacity, operational headcount, and recruitment pipeline as separate values; no seat record will be treated as an employee record.
