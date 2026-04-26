Audit result: Appeal module is partially implemented, but it is not production-safe yet. The main UI exists, but there are permission, workflow, Binance-source, and data-integrity gaps that can make the module appear blank, fail silently, or produce misleading operational data.

Critical findings

1. Appeal permissions are not seeded to existing roles
- Database check shows all existing terminal roles currently have `NULL` for `terminal_appeals_*` permissions.
- Result: nobody except Super Admin fallback can reliably access/use the tab, request appeals, or manage timers.
- The role templates in the UI were updated, but templates do not update already-existing roles in the database.

2. Toggle permission mismatch
- UI shows the module toggle only for `isSuperAdmin`.
- Database function also allows only Super Admin.
- But `terminal_appeals_toggle` permission was created and added to role templates, which is misleading because it does nothing unless the user is Super Admin.
- Fix: either remove functional reliance on this permission, or keep it visible as informational but enforce “Super Admin only.” I recommend Super Admin only, per your requirement.

3. The tab may be blank by default
- `terminal_appeal_config.is_enabled` defaults to `false`.
- Since no appeal permissions are seeded, normal appeal handlers cannot even see the tab/config.
- Result: users may think implementation is broken.
- Fix: seed correct permissions, but keep the global module off until Super Admin turns it on.

4. Binance appeal sync is likely not reliable enough
- Current sync calls `listActiveOrders` with `orderStatusList: [8, 'APPEAL', 'DISPUTE']`.
- This was not validated against the actual Binance proxy action contract in the implementation.
- Per project rule, Binance API-dependent functionality must not invent unsupported request params/status values.
- Fix: inspect `binance-ads` edge function/proxy mapping and official Binance status handling already used in project. Only keep sync if supported. If not supported, label it as “Not available from Binance API/proxy” and remove/disable that button.

5. Internal appeal request from Payer queue is manual/shadow data
- The Payer queue “Appeal” button creates a manual ERP appeal request from visible order data.
- This is acceptable only as an internal request workflow, not as “filing appeal on Binance.”
- The UI copy should explicitly say “Request Appeal” / “internal request,” not imply Binance appeal filing.

6. Timer requirement is not fully enforced
- Requirement: for orders under appeal, response timer selection is mandatory; if not selected, flashing tag should show.
- Current UI flashes “Select timer,” but database does not enforce this before case handling/check-in/status changes.
- A manager can check in or resolve without ever selecting a timer.
- Fix: enforce timer requirement in RPCs for `under_appeal` cases before check-in/management actions, except for closing/cancelling/resolving where explicitly allowed.

7. “No timer” handling is ambiguous
- Requirement includes “No timer” as a dropdown option, but selection is mandatory.
- Current database stores `response_timer_minutes = null`, `response_due_at = null`, and `response_timer_set_at = now()` for No Timer.
- This is workable, but the UI should show “No timer selected by [user] at [time]” instead of only “No timer,” otherwise it is indistinguishable from missing timer in some contexts.

8. Check-in audit is incomplete for display
- Database stores `last_checked_in_by` and event actor UUIDs.
- UI resolves usernames for cases/events, but only via `users` table. If user row is missing or inaccessible, audit displays `—`.
- Fix: add resilient fallback display and ensure event history visibly records actor username/name.

9. Notes are overwritten, not appended
- `add_terminal_appeal_note` sets `notes = p_note`, replacing previous handover note.
- Event history preserves old notes, but the current “shift note” field loses previous context.
- Fix: either rename to “Current handover note” or append notes with timestamp/actor in `notes`; I recommend keeping `notes` as latest note but adding clear event history and showing last 3 notes.

10. RLS has no direct insert/update policies, only security-definer RPCs
- This is good for controlled writes, but only if all UI writes use RPCs. Current Appeal UI does use RPCs.
- Need to keep direct table writes disabled and add explicit comments/migration hardening if needed.

11. Status lifecycle is too loose
- Current statuses can be moved freely to `under_appeal`, `resolved`, `closed`, `cancelled`.
- No guard prevents going from closed back to active via status RPC? The RPC permits any listed status; upsert prevents reopening, but update status does not.
- Fix: prevent reopening terminal states unless Super Admin performs a special reopen RPC/audit action.

12. Auto-closure/sync with Binance final state is missing
- If Binance appeal/order later completes or cancels, ERP appeal case remains active unless manually closed.
- This can create stale appeal queues.
- Fix: if proxy supports order detail/status check, add a safe “Refresh Status” action per case and optionally a manager-only bulk refresh. Do not auto-close unless Binance status is definitively final.

13. Build/runtime validation was only TypeScript-level
- Previous implementation reported TypeScript pass, but no RLS permission scenario testing, no function behavior test, no browser/network verification.
- Fix: add targeted verification: Super Admin toggle, appeal handler view, small-payment request, payer request, timer enforcement, no-permission denial.

Implementation plan after approval

1. Permission and role migration
- Seed `terminal_appeals_view/manage/request` to the correct existing roles:
  - Super Admin/Admin/Operations Manager/Assistant Manager: view/manage/request
  - Small Payments Manager: request only, and optionally view if they are also appeal handlers
  - Payer: request only if intended; otherwise no direct appeal request from payer queue
- Do not grant `terminal_appeals_toggle` to non-Super Admin roles, or remove it from operational templates to avoid confusion.

2. Binance/proxy validation
- Inspect the `binance-ads` edge function action list and existing order status mapping.
- Confirm whether `listActiveOrders` supports appeal/dispute filters.
- If unsupported, disable/remove “Sync Binance Appeals” and replace with a compliant message.
- If supported, correct the request payload/status mapping and handle pagination safely.

3. Harden database RPC lifecycle
- Add status transition guards:
  - terminal statuses cannot be reopened casually
  - timer must be explicitly selected for `under_appeal` cases before check-in/action work
  - “No Timer” remains a valid explicit selection using `response_timer_set_at`
- Add stronger audit event details for timer, check-in, status changes, and notes.

4. Improve Appeal UI clarity
- Rename Payer button to “Request Appeal” and add tooltip/text that it creates an internal request only.
- In Appeal tab, distinguish:
  - Binance detected appeal
  - Internal appeal request from Small Payments
  - Internal request from Payer queue
- Show “Timer not selected” vs “No timer selected by [user]” clearly.
- Show actor names/timestamps more prominently in check-in and note history.

5. Add status refresh workflow
- Add per-case “Refresh Binance Status” if `getOrderDetail`/proxy supports it.
- When Binance returns final statuses (`COMPLETED`, `CANCELLED`, `EXPIRED`), prompt/allow manager to resolve/close with audit.
- Do not infer finality if Binance returns null/empty/restricted data.

6. Verification pass
- Run TypeScript checks.
- Verify database permissions and RLS with read-only queries.
- Test main flows in preview:
  - module off shows blank/disabled state
  - Super Admin can toggle
  - appeal handler can see all active appeals
  - requester can request but not manage
  - timer selection and expired blinking behavior
  - check-in creates visible audit event

Expected outcome

The Appeal tab will become a controlled, audit-safe operations module rather than a partial manual board:
- Correct users can access it.
- Super Admin remains the only toggle authority.
- Internal appeal requests are clearly separated from Binance-detected appeals.
- Unsupported Binance automation is not faked.
- Timers and check-ins are enforceable and auditable.
- Stale or closed cases cannot distort workload visibility.