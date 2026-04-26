Audit result: Small Payments Manager is partially implemented, but not safe to treat as fully working yet.

What is already correctly present
- Route and sidebar entry exist for `/terminal/small-payments`.
- New tables exist for manager assignments, cases, and case events.
- Payer flow attempts to create a manager case after Mark Paid and Alternate UPI.
- Payer pending queue excludes orders that already have an open Small Payment case.
- Basic manager dashboard exists with timers, filters, case actions, notes, and Binance chat view.
- TypeScript compile check passes.

Critical issues found

1. No real users currently have the new permissions
Database check shows zero role-permission rows for:
- `terminal_small_payments_view`
- `terminal_small_payments_manage`
- `terminal_small_payments_assign`

Impact:
- The sidebar tab will not show for normal users.
- No manager can access the module unless they are Super Admin or the role is manually edited later.
- The assignment manager dropdown can be empty because it searches users through these permissions.

2. Payers may not be authorized to create cases
The latest RPC requires:
- `terminal_payer_manage`, or
- `terminal_small_payments_manage`

But the Payer page itself only requires `terminal_payer_view`, and the Small Payments Manager role template gives `terminal_payer_view` but not `terminal_payer_manage`.

Impact:
- Normal payer clicking Mark Paid or Alt UPI can successfully mark paid / request alternate UPI, but the small payment case creation can fail silently because it is fire-and-forget.
- This directly breaks the main requirement that every marked-paid / Alt UPI order should move to the manager module.

3. Mark Paid handoff is fire-and-forget and not awaited
`PayerOrderRow` calls `upsertSmallPaymentCase.mutate(...)` instead of `await mutateAsync(...)`.

Impact:
- The payer sees success even if manager case creation fails.
- The order may remain unmanaged or disappear inconsistently depending on later cache refresh.
- Data integrity is weak because handoff is not transactional from the UI perspective.

4. Alternate UPI handoff can fail after already requesting alternate UPI
The UI first creates the old `terminal_alternate_upi_requests` row, then separately creates a Small Payments case.

Impact:
- If the second call fails, the old alternate UPI request exists but the manager module never receives the case.
- The payer may think it was handed off because the button says requested.

5. RLS visibility is too broad for payers
Current policy allows anyone with `terminal_payer_view` to read all small payment cases and events.

Impact:
- A payer can potentially see every manager case, not only cases they originated.
- This contradicts the intended dedicated manager workflow and leaks operational data.

6. Assignment ownership allows overlapping managers
The unique indexes prevent duplicate active assignment only for the same manager and same range/ad, but do not prevent two different managers from owning the same active Ad ID or same size range.

Impact:
- Routing may become ambiguous.
- The function picks one by workload, which may be useful for load sharing, but it contradicts “assigned to whoever that particular range was assigned” if the business intent is exclusive ownership.

7. Closing/resolution does not happen automatically from Binance status
Cases are opened after Mark Paid, but there is no status sync that automatically resolves/closes the case when Binance order status becomes `COMPLETED`, `CANCELLED`, or `EXPIRED`.

Impact:
- Manager dashboard will accumulate stale open cases after the counterparty releases.
- Timers can show overdue even after the order is completed unless a manager manually closes it.

8. Case event logging is incomplete for status button changes
Status buttons update the case row directly. They do not always add a case event unless using the RPC event function.

Impact:
- Audit trail is incomplete for tag/status changes, reducing usefulness for accountability.

9. “Mark Contacted” and “Mark Checked” do not update the selected dialog state immediately
The underlying query invalidates, but the open dialog uses the old selected case object.

Impact:
- The list may update after refetch, but the currently open dialog can display stale values until reopened.

10. Manager assignment UI permission mismatch
`TerminalUsers.tsx` shows the Small Payments assignment tab for `terminal_small_payments_assign`, `terminal_users_manage`, or admin, but inside it uses a permission gate with only `terminal_small_payments_assign` and `terminal_users_manage`.

Impact:
- A Super Admin/admin may see the tab but get silent blocked content if their effective admin path is not included by the gate logic.

11. No current production data verifies the flow
Database currently shows:
- 0 small payment cases
- 0 manager assignments
- 0 case events

Impact:
- The implementation has not yet been exercised end-to-end with live records.

Fix plan

1. Seed and repair permissions properly
- Add a migration to attach the new Small Payments permissions to appropriate existing roles:
  - Small Payments Manager: view + manage
  - Terminal Supervisor/Admin/Super Admin or equivalent roles: view + manage + assign
- Keep roles in `p2p_terminal_roles` / `p2p_terminal_role_permissions`; do not store role flags on users.
- Ensure the frontend role template and database defaults match.

2. Fix payer authorization for case handoff
- Update `upsert_terminal_small_payment_case` so `terminal_payer_view` users can create/update cases only for orders they are actively handling/originating.
- Do not grant broad manager powers to payers.
- Tighten authorization inside the RPC instead of relying only on frontend gates.

3. Make handoff reliable in the payer UI
- Change Mark Paid and Upload+Mark Paid flows to `await upsertSmallPaymentCase.mutateAsync(...)` after Binance Mark Paid succeeds.
- If case creation fails, show a clear error and keep the user aware that manager handoff failed.
- Invalidate payer orders, open small payment cases, and manager case queries after successful handoff.

4. Make Alternate UPI handoff consistent
- Ensure Alt UPI request and Small Payment case creation are coordinated.
- If the old alternate UPI request succeeds but manager case creation fails, show an explicit warning and do not pretend the handoff is complete.
- Prefer creating the manager case immediately and visibly as the operational source of truth.

5. Tighten RLS policies
- Remove broad `terminal_payer_view` read access from all cases/events.
- Allow payer read only where `payer_user_id = auth.uid()`.
- Allow manager read only where `manager_user_id = auth.uid()`.
- Allow supervisor/admin read via `terminal_small_payments_manage`.
- Assignment management remains restricted to `terminal_small_payments_assign` / admin-level permission.

6. Decide and enforce assignment collision behavior
- If one range/Ad ID should have exactly one manager, add partial unique indexes on active `size_range_id` and active `ad_id` globally.
- If multiple managers per range are intended for load balancing, update UI copy to say “pool” and show that it routes by workload.
- I recommend exclusive assignment unless you want round-robin/team pools.

7. Add automatic case closure/sync
- Add a sync step in the manager query/RPC or a lightweight database function that checks matched Binance history/status.
- Auto-close or flag cases when order status is completed/cancelled/expired.
- Keep manual override/status notes for refund and exception states.

8. Improve audit trail
- Route status changes through a function that logs `status_changed`, `tag_changed`, and `priority_changed` events.
- Preserve previous and new values in `terminal_small_payment_case_events`.

9. Fix frontend stale state and UI guards
- Refresh selected case data in the dialog after updates.
- Add manager reassignment/unassigned case visibility for supervisors.
- Fix `TerminalUsers` permission gate so Super Admin/admin paths align with visible tab logic.

10. Verification after implementation
- Run TypeScript validation.
- Query role permissions to confirm rows exist.
- Test/create a controlled case through the RPC with an authorized user path.
- Verify normal managers see only their assigned cases.
- Verify payers can create handoff cases but cannot see all manager cases.
- Verify zero-assignment cases show as unassigned/supervisor-visible instead of disappearing.

Expected result
- Mark Paid and Alt UPI reliably create manager cases.
- Dedicated managers get a clean queue based on assignment.
- Payers cannot see unrelated manager cases.
- Admins can configure assignments and supervise unassigned/stale cases.
- Cases do not remain open forever after Binance completion.
- The module becomes operationally reliable instead of only visually present.