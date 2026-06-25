# Auto-close RA clients on "Not Interested" / "Converted"

When an RA logs a remark with outcome **Not Interested** or **Converted**, that client should disappear from the RA's own dashboard, while still appearing in the manager's Client → Assignments tab with the final status.

## Behavior
- Add **"Converted"** to the contact-outcome list (currently: Connected, No Answer, Callback Requested, Not Interested, Wrong Number, Other).
- On saving a remark whose outcome is **Not Interested** or **Converted**, the client's active assignment is moved to a terminal status (`not_interested` or `converted`).
- RA Dashboard ("My Assigned Clients") only shows `active` assignments, so the client drops off automatically after the remark is saved.
- The remark/conversation history is preserved (it lives in `ra_client_remarks`, untouched).
- The manager Assignments tab keeps showing the client under the RA, now labeled with its final status (Not Interested / Converted) instead of just Contacted/Pending.

## Changes

### 1. `src/hooks/useRA.tsx`
- Add `"Converted"` to `CONTACT_OUTCOMES`.
- In `useAddRARemark`, after inserting the remark, if `contactOutcome` is `"Not Interested"` or `"Converted"` and an `assignmentId` is present, update that `ra_assignments` row: set `status` to `"not_interested"` or `"converted"`. Invalidate `["ra-assignments"]` so the RA dashboard refreshes.
- Add a new hook `useAllRAAssignments()` that fetches assignments across all statuses (paginated), for the manager view.

### 2. `src/components/clients/RAAssignmentsTab.tsx`
- Switch from `useActiveRAAssignments` (active only) to the new `useAllRAAssignments` so closed clients still appear.
- In each RA's client table, derive the Status badge from the assignment status:
  - `active` → Contacted (green) if a remark exists, else Pending (yellow)
  - `converted` → "Converted" (emerald)
  - `not_interested` → "Not Interested" (red)
  - `reassigned` → hide or label "Reassigned" (gray) — keep current behavior of only listing the latest assignment per RA.
- Per-RA summary counts updated to reflect active vs closed (e.g. show "active assigned" count from active rows so workload numbers stay meaningful).

### 3. `src/pages/RADashboard.tsx`
- No query change needed (already filters `status = "active"`), but confirm the list re-fetches after a remark closes a client (handled by the `["ra-assignments"]` invalidation in step 1).

## Technical notes
- No DB schema change required — `ra_assignments.status` is already a free-text status column already using `active`/`reassigned`. We add `converted` and `not_interested` as new values.
- The existing trigger that mirrors remarks into `client_communication_logs` is unaffected.
- Re-assigning a client later (via AssignToRADialog) already deactivates prior assignments by setting `status='reassigned'`; a closed (`converted`/`not_interested`) client can still be reassigned because that flow targets `status='active'` only — so a manager who reassigns a closed client should be handled: I'll widen the re-assignment deactivation to also cover non-active rows for the same client to avoid duplicate active rows. (Minor safeguard.)
