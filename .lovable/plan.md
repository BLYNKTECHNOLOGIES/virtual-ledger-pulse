## Assessment of Finding 5

This finding is useful, but only partially as Claude stated it.

Confirmed from the current code:
- `auto-pay-engine` calls `POST /sapi/v1/c2c/orderMatch/markOrderAsPaid`.
- It currently treats `code === "000000"` / `success === true` as success, then stores the full response only inside `p2p_auto_pay_log.metadata.markPaidResult`.
- The response fields `notifyPayTime`, `confirmPayEndTime`, and `complainFreezeTime` are not normalized into first-class columns or a monitoring workflow.
- Live data already shows those fields exist in successful auto-pay logs, but only buried in JSON metadata.

Business interpretation for our flow:
- `notifyPayTime`: proof timestamp that Binance accepted the “marked paid” notification.
- `confirmPayEndTime`: operational SLA deadline for the seller to release crypto after we marked a BUY order as paid.
- `complainFreezeTime`: useful compliance/appeal window marker, but less urgent than `confirmPayEndTime`.

Important correction to Claude’s suggestion:
- For BUY orders, once we mark paid, we cannot force the seller to release crypto unless Binance provides a supported endpoint/action. We should not invent an “auto-release” or fake escalation.
- The safe useful automation is: store the deadline, monitor overdue unreleased BUY orders, refresh live Binance order detail, and create internal alerts/tasks/escalation indicators. If a Binance appeal/escalation endpoint is not confirmed in the official docs/proxy, the system should only alert operators and optionally send supported chat reminders if already available.

## Proposed Implementation Plan

### 1. Store mark-paid response timestamps as first-class operational data

Add normalized columns to `p2p_auto_pay_log`:
- `notify_pay_time timestamptz`
- `confirm_pay_end_time timestamptz`
- `complain_freeze_time timestamptz`
- `mark_paid_order_status text`

Also add indexes:
- `confirm_pay_end_time` for overdue monitoring
- partial index for successful mark-paid logs with a non-null `confirm_pay_end_time`

Backfill these columns from existing `metadata->'markPaidResult'->'data'` where present.

Why this table first:
- The timestamp is created by the mark-paid action, so `p2p_auto_pay_log` is the cleanest audit source.
- We avoid polluting `binance_order_history` with action-response data that may not exist for manually marked orders or older imports.

### 2. Update `auto-pay-engine` to parse and persist these fields immediately

When `markOrderAsPaid` succeeds:
- Extract `markPaidResult.data.notifyPayTime`
- Extract `markPaidResult.data.confirmPayEndTime`
- Extract `markPaidResult.data.complainFreezeTime`
- Convert Binance millisecond timestamps into Postgres `timestamptz`
- Save them directly via `logDecision(...)` alongside existing metadata

Keep the raw response in metadata for audit, but use normalized columns for monitoring and UI.

### 3. Capture the same fields for manual mark-paid actions, if applicable

`binance-ads` has a `markOrderAsPaid` action used by the UI/manual flow. I will update it so that when a manual mark-paid response returns these same fields, the response is not discarded.

Two safe options:
- Preferred: insert a corresponding operational log row into `p2p_auto_pay_log` with `action = 'manual_mark_paid'` or similar.
- Alternative: store only in the existing action/audit log if the manual payer module already logs mark-paid actions with order number.

I will follow the existing audit pattern after checking the payer/manual mark-paid flow during implementation.

### 4. Add release-deadline monitoring without unsupported Binance actions

Create a lightweight monitoring workflow that checks successful mark-paid BUY orders whose `confirm_pay_end_time` has passed and are not completed.

The monitor will:
1. Query recent successful mark-paid logs with `confirm_pay_end_time < now()`.
2. For each order, call `getUserOrderDetail` through the existing proxy.
3. If Binance status is completed/final, mark the monitor result as resolved.
4. If still `BUYER_PAYED`, `PAID`, `RELEASING`, or equivalent after deadline, record an overdue release event.
5. If already in `APPEAL`/`DISPUTE`, record it as already escalated externally, not pending release.

No automatic Binance appeal will be implemented unless the official API docs and proxy confirm such an endpoint is available and allowed.

### 5. Persist overdue-release checks separately from auto-pay attempts

Create a new table, for example `p2p_release_deadline_monitor_log`, to avoid mixing “mark paid” action logs with “seller did not release” monitoring logs.

Suggested fields:
- `id`
- `order_number`
- `auto_pay_log_id`
- `confirm_pay_end_time`
- `checked_at`
- `live_order_status`
- `status` (`resolved`, `overdue`, `already_appeal`, `detail_unavailable`, `error`)
- `minutes_overdue`
- `message`
- `metadata jsonb`

This gives operations and compliance a clean audit trail.

### 6. Surface it in Terminal Automation UI

Enhance the Auto-Pay tab with a small “Release deadline monitoring” section:
- Count of orders marked paid and awaiting release.
- Count of overdue releases.
- Table of overdue orders with:
  - order number
  - marked paid time
  - seller release deadline
  - minutes overdue
  - live Binance status
  - last checked time
  - action/status message

Also enhance the existing Auto-Pay Log table to display:
- `notifyPayTime`
- `confirmPayEndTime`
- overdue badge when deadline passed and order is not final

### 7. Optional internal escalation, not Binance escalation

If overdue release is detected:
- Create an internal alert/task only if there is already an established ERP task/alert pattern suitable for terminal operations.
- Otherwise, keep it in the Terminal Automation tab as a visible operational alert.

This respects the rule that Binance-source-of-truth workflows must not be simulated or forced.

### 8. Scheduling

If a scheduled job is already invoking `auto-pay-engine`, I will either:
- extend the same function to run release-deadline monitoring after auto-pay, or
- create a separate `release-deadline-monitor` edge function if separation is cleaner.

Preferred approach:
- Separate function if monitoring has its own cadence and logs.
- Same function only if existing cron/scheduling is already tightly coupled to auto-pay and we want less infrastructure.

Scheduling will use Supabase cron/net only after confirming the existing scheduling pattern in the project.

## Validation Plan

After implementation:
- Verify existing successful mark-paid metadata backfills into timestamp columns.
- Trigger/test `auto-pay-engine` against a safe/current order only if available and authorized.
- Confirm `markOrderAsPaid` success responses persist normalized timestamps.
- Confirm overdue monitor does not act on completed, cancelled, expired, or appeal orders.
- Confirm no Binance escalation/action is attempted unless officially supported.
- Check edge function logs and database rows for parse correctness.

## Expected Benefit

This is worth implementing because it converts the mark-paid response from passive JSON into an operational SLA control:
- Operations can see which BUY orders are paid but not released by the seller.
- Delayed sellers become visible before they become disputes.
- Compliance/audit gets a timestamped trail of payment notification, seller release deadline, and complaint freeze window.
- It strengthens terminal automation without inventing unsupported Binance behavior.