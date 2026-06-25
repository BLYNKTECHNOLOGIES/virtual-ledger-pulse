# RA (Relationship Associate) Dashboard

Build a Relationship Associate workflow: seniors assign clients (buyers & sellers) from the Client Directory to RAs; RAs work a dedicated dashboard where they contact clients and log a conversation; assigners monitor RA progress from a new tab inside Clients. One client has one active RA at a time. Conversation logs surface in the RA dashboard, the Client Directory, and each client's own page.

## Permissions (User Management)

Add two new `app_permission` enum values, wired into the existing role/permission system:
- `ra_assign` — senior who can select clients in the directory and assign them to RAs, and see the Assignments tab.
- `ra_dashboard_view` — RA who gets their own dashboard and appears in the assignee picker.

These are added to the enum, to the `availablePermissions` list in `AddRoleDialog`/`EditRoleDialog`, and to the admin permission set in `usePermissions`. Existing role-permission UI then manages them with no extra work.

## Database

New table `ra_assignments` (one active row per client):
- `client_id`, `ra_user_id` (current RA), `assigned_by` (senior), `status` (`active` / `reassigned`), assigned/updated timestamps.
- Unique partial index on `client_id WHERE status='active'` to enforce single active RA. Re-assigning marks the old row `reassigned` and inserts a new active row.

New table `ra_client_remarks` (the conversation log):
- `client_id`, `ra_user_id`, `assignment_id`, `remark` (text), `file_url` (nullable), `file_name`, `contact_outcome` (e.g. Connected / No Answer / Callback), `created_at`.

Both tables get GRANTs + RLS for `authenticated`, plus `service_role`. Remark file uploads go to a new private `ra-remarks` storage bucket with RLS policies.

RA remarks are also reflected into the existing `client_communication_logs` (type `ra_remark`) on insert, so they appear automatically in the client page's existing communication/conversation log and anywhere that log is shown.

## Client Directory — selection & assignment (gated by `ra_assign`)

In `ClientDashboard.tsx` (buyers and sellers tables):
- Add a checkbox column (header = select-all of the currently filtered/visible rows). Selection works with any filter applied since it operates on the already-filtered list.
- A sticky action bar appears when rows are selected: "Assign N clients to RA" → opens an **Assign to RA** dialog.
- The dialog lists only users holding `ra_dashboard_view` (fetched via role_permissions), shows each client's current RA if any, warns on re-assignment, and writes `ra_assignments` (deactivating prior active rows).
- Row click still opens the client page; checkbox click is isolated so it does not navigate.

## RA Dashboard (new page, gated by `ra_dashboard_view`)

New route `/ra-dashboard`, new sidebar entry (permission `ra_dashboard_view`), new page `src/pages/RADashboard.tsx`.
- Loads clients assigned to the logged-in RA (active assignments), paginated past 1000.
- Line-by-line table: Client Name, Phone, Risk Level, Total Orders, Total Order Volume, Last Order Date, latest remark/outcome, and actions.
- Order stats reuse `useClientTypeFromOrders` (sales for buyers, purchase for sellers; combined for composite).
- **Remark** action per row → dialog to type text + optional file upload + outcome; saves to `ra_client_remarks` (+ mirror to communication log). Shows the full conversation log history for that client.
- **Open client** action → navigates to `/clients/:id` (full client page, same view as directory), so RA sees complete details.

## Assignments tab (inside Clients, gated by `ra_assign`)

Add a third top-level tab in `ClientDashboard` ("Assignments"):
- Lists each RA with summary status: total assigned, contacted vs not contacted, last activity.
- Clicking an RA expands/opens a panel listing all their assigned clients with the remarks/conversation log done by that RA, plus ability to re-assign.

## Client page & directory reflection

- Client page already renders communication logs; RA remarks appear there automatically via the mirrored `client_communication_logs` entries (labelled "RA Remark").
- Client Directory rows get a small indicator (assigned RA name / latest RA remark snippet) so assignment status is visible in the directory.

## Recommendations included
- **Outcome tags** on each remark (Connected / No Answer / Callback / Not Interested) for quick filtering and status rollups.
- **Contacted vs pending status** per client driven by whether any remark exists, surfaced in both RA dashboard and Assignments tab.
- **Re-assignment history preserved** (old rows kept as `reassigned`) for accountability.
- **Audit trail**: assignments and remarks both carry actor + timestamp.

## Technical notes
- New enum values via `supabase--migration` (ALTER TYPE ... ADD VALUE), then tables/bucket/RLS in follow-up migration (enum add value must commit before use).
- No business-logic changes to orders/wallets — purely a CRM overlay reading existing order data.
- Phone shown from `clients` record per the contact-by-phone requirement (note: email collection remains prohibited per project rules).
