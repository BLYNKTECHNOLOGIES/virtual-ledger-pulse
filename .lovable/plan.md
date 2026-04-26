Plan: Build Terminal Appeal tab with controlled appeal workflow

Goal

Create a dedicated Terminal Appeal module for orders that are either:

1. Already under appeal/dispute according to Binance order status, or
2. Internally requested for appeal by ERP users from the Small Payments Manager module.

Important Binance API boundary

Based on existing Binance proxy capabilities in this project, Binance supports reading order status/details through endpoints such as:

- listOrders
- listUserOrderHistory
- getUserOrderDetail

Existing code already detects APPEAL/DISPUTE statuses from these sources.

I did not find an existing Binance endpoint/proxy action for actually filing/creating an appeal. Therefore this implementation will not pretend to file an appeal on Binance. The “Request Appeal” action will create an internal ERP appeal request and surface it to appeal handlers. Actual appeal filing, if required, remains a manual Binance-side action unless a supported Binance appeal endpoint is later verified and added.

Workflow

```text
Small Payments Manager case
  -> Request Appeal
  -> terminal_appeal_cases row created as requested
  -> Appeal tab shows it to all appeal handlers

Binance order status becomes APPEAL/DISPUTE
  -> Appeal sync/upsert records order as under_appeal
  -> Appeal timer starts from detected appeal time
  -> Appeal handlers manage notes, response timer, and check-ins

Super Admin turns Appeal system OFF
  -> tab remains accessible only as disabled/blank state
  -> request buttons disabled/hidden
  -> sync/upsert/status-change RPCs refuse automation work
```

Database changes

Add a separate appeal system instead of overloading small payment cases:

1. `terminal_appeal_config`
   - singleton config row
   - `is_enabled boolean`
   - `updated_by uuid`
   - `updated_at timestamptz`
   - only Super Admin can toggle through RPC

2. `terminal_appeal_cases`
   - `order_number text`
   - `source text`: `binance_status`, `small_payment_request`, `manual_request`
   - `status text`: `requested`, `under_appeal`, `respond_by_set`, `checked_in`, `resolved`, `closed`, `cancelled`
   - `appeal_started_at timestamptz`
   - `requested_by uuid`
   - `requested_from_case_id uuid` nullable reference to small payment case
   - `request_reason text`
   - Binance enrichment fields: `adv_no`, `trade_type`, `asset`, `fiat_unit`, `total_price`, `counterparty_nickname`, `binance_status`
   - required response timer fields:
     - `response_timer_minutes integer null`
     - `response_due_at timestamptz null`
     - `response_timer_set_by uuid null`
     - `response_timer_set_at timestamptz null`
   - latest check-in fields:
     - `last_checked_in_at timestamptz`
     - `last_checked_in_by uuid`
   - `notes text` optional latest summary
   - audit fields: `created_by`, `updated_by`, `created_at`, `updated_at`

3. `terminal_appeal_case_events`
   - append-only audit/event history
   - event types: `created`, `requested`, `binance_appeal_detected`, `timer_set`, `timer_expired_seen`, `checked_in`, `note_added`, `status_changed`, `resolved`, `closed`
   - actor user id, previous/new values, note, created_at

4. Permissions
   - Add enum permissions:
     - `terminal_appeals_view`
     - `terminal_appeals_manage`
     - `terminal_appeals_request`
     - `terminal_appeals_toggle`
   - Add to role editor UI.
   - Seed sensible defaults:
     - Super Admin/Admin: all appeal permissions
     - Supervisor/Manager: view/manage/request
     - Small Payments Manager: request, and optionally view/manage if role is intended to handle appeals
     - Payer: no direct appeal access unless explicitly assigned later

Security/RLS

1. Appeal cases are not assignment-based.
   - Anyone with `terminal_appeals_view` can read all appeal cases.
   - Anyone with `terminal_appeals_manage` can update notes, timers, check-ins, and statuses.
   - Anyone with `terminal_appeals_request` can create internal appeal requests.
   - Only Super Admin or `terminal_appeals_toggle` plus Super Admin validation can toggle the module.

2. All writes go through SECURITY DEFINER RPCs with explicit permission checks:
   - `get_terminal_appeal_config()`
   - `set_terminal_appeal_enabled(p_enabled boolean)`
   - `upsert_terminal_appeal_case(...)`
   - `request_terminal_appeal_from_small_payment(p_case_id uuid, p_reason text)`
   - `set_terminal_appeal_response_timer(p_case_id uuid, p_minutes integer)`
   - `check_in_terminal_appeal_case(p_case_id uuid, p_note text)`
   - `add_terminal_appeal_note(p_case_id uuid, p_note text)`
   - `update_terminal_appeal_status(p_case_id uuid, p_status text, p_note text)`

3. RPCs check the global config first.
   - If appeal system is off, request/sync/update RPCs reject changes.
   - Read RPC/UI returns empty/disabled state.

Appeal detection logic

1. Internal requests
   - Add “Request Appeal” action inside Small Payments Manager case detail.
   - It creates/updates an appeal case with source `small_payment_request` and status `requested`.
   - It logs requester user id and username for display: “Appeal requested by [username]”.
   - It can also mark the small payment case status as `appeal` and add an event for cross-reference.

2. Binance appeal status
   - Build frontend/server logic to upsert appeal cases when existing active order/history/detail data contains status including `APPEAL` or `DISPUTE`.
   - Use Binance status as source of truth for “under appeal”.
   - `appeal_started_at` is set to the first ERP detection time unless Binance provides a reliable appeal timestamp in the order detail payload. If Binance returns no appeal-start timestamp, UI will label it as “Detected at” rather than pretending it is the true Binance appeal start time.

Appeal tab UI

Create `src/pages/terminal/TerminalAppeals.tsx` and route `/terminal/appeals`.

Main page:

1. Permission gate: `terminal_appeals_view`.
2. If global appeal system is off:
   - show blank/disabled state: “Appeal module is turned off by Super Admin.”
   - no automation/sync/request controls visible.
3. If enabled:
   - summary cards:
     - Under Appeal
     - Appeal Requests
     - Response Timer Missing
     - Response Overdue
     - Checked In Today
   - table columns:
     - Appeal age timer, very visible
     - Response due timer, blinking when expired
     - Order number
     - Amount/asset
     - Counterparty
     - Binance status
     - Source/tag: Binance Appeal, Dispute, Appeal Requested
     - Requested by
     - Last note/check-in
     - Actions

Case detail dialog:

- Order evidence and Binance status
- Full event history
- Add shift note
- Required response timer selector:
  - 10 minutes
  - 30 minutes
  - 1 hour
  - 2 hours
  - 4 hours
  - 8 hours
  - 1 day
  - No timer
- For under-appeal cases, show flashing “Select response timer” until one is selected.
- If timer expires, response timer badge blinks/destructive color.
- Check-in button records current user and timestamp for audit.
- Status actions: Under Appeal, Resolved, Closed, Cancelled.

Small Payments Manager integration

Update `TerminalSmallPayments.tsx` case actions:

- Add “Request Appeal” button.
- Requires `terminal_appeals_request` or `terminal_appeals_manage`.
- Button disabled when Appeal system is off.
- On click, ask for a short reason/note.
- Create appeal case via RPC.
- Show visual tag on small payment case if an appeal case already exists.

Navigation and permissions UI

1. Add sidebar item:
   - title: `Appeals`
   - route: `/terminal/appeals`
   - permission: `terminal_appeals_view`

2. Update Terminal auth permission union and Super Admin all-permissions list.

3. Update role permissions editor:
   - New module: “Appeals”
   - Permissions: View, Manage, Request Appeal, Toggle System

4. Route protection through existing `TerminalPermissionGate`.

Technical notes

- Do not edit `src/integrations/supabase/types.ts` manually.
- Use migrations for schema/RLS/RPC changes.
- Use data-operation tooling for permission seeding if needed, not schema-only migrations where inappropriate.
- Use `@tanstack/react-query` hooks for appeal data and mutations.
- Avoid hardcoding usernames; resolve user UUIDs through existing `users` table for display.
- Keep timers based on persisted timestamps, not browser-local state.
- Use `AlertDialog`/dialogs for confirmation and notes, not `confirm()`.

Verification

After implementation:

1. TypeScript validation.
2. Verify Super Admin can toggle Appeal system.
3. Verify disabled state blocks request/sync/update RPCs.
4. Verify Small Payments Manager can request appeal only with permission.
5. Verify appeal handlers see all appeal cases, not assigned-only cases.
6. Verify under-appeal rows show appeal age timer.
7. Verify response timer is mandatory/flagged until selected.
8. Verify expired response timers blink clearly.
9. Verify check-in records actual user UUID and visible username.
10. Verify all events are present in audit history.