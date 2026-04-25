# Gap 4 Audit: markOrderAsPaid timestamps

## Verdict

Claude's finding is useful in principle, but it is already mostly implemented in this project.

The system currently captures the three Binance `markOrderAsPaid` response timestamps:

- `notifyPayTime`
- `confirmPayEndTime`
- `complainFreezeTime`

They are stored in `p2p_auto_pay_log` as:

- `notify_pay_time`
- `confirm_pay_end_time`
- `complain_freeze_time`

This is implemented in both flows:

- Automated mark-paid flow: `supabase/functions/auto-pay-engine/index.ts`
- Manual mark-paid proxy flow: `supabase/functions/binance-ads/index.ts`

There is also an existing `p2p_release_deadline_monitor_log` table and `monitorReleaseDeadlines()` logic that checks orders after `confirm_pay_end_time`, fetches live Binance order detail, and logs whether the seller release is overdue, resolved, already in appeal, unavailable, or errored.

So the core concern, “these timestamps are thrown away,” is no longer true in the current implementation.

## What is still useful / missing

The remaining value is not basic capture. The remaining gaps are hardening and operational completeness:

1. Manual and automated mark-paid both store the fields, but the monitor appears tied to `auto-pay-engine` execution. If auto-pay is disabled or not running frequently, seller-overdue detection may not happen reliably.
2. `complainFreezeTime` is stored, but there is no visible deadline monitoring for appeal/complaint cutoff. Since automated appeal filing is intentionally exempted, this should only become an operator warning, not an auto-appeal action.
3. `notifyPayTime` is stored, but UI currently focuses mostly on release deadline. It should be visible as Binance authoritative payment-marked time so operators can distinguish ERP execution time from Binance processing time.
4. `p2p_release_deadline_monitor_log` RLS is currently broad authenticated read in the migration. This should be restricted to terminal permissions, consistent with the recent Binance chat audit hardening.
5. The release monitor logs are visible in Auto-Pay settings, but overdue seller alerts should also appear where operators actually work: Terminal Orders / active order workspace.

## Implementation Plan

### 1. Confirm Binance API scope before expanding behavior

Validate against the already-used Binance endpoints only:

- `POST /sapi/v1/c2c/orderMatch/markOrderAsPaid`
- `POST /sapi/v1/c2c/orderMatch/getUserOrderDetail`

Allowed behavior:

- Persist timestamps returned by Binance.
- Compare `confirmPayEndTime` and `complainFreezeTime` against current time.
- Re-check live Binance order status before showing overdue/escalation state.

Not allowed in this phase:

- Auto-file appeal.
- Simulate missing timestamps.
- Infer deadlines if Binance does not return them.
- Create manual shadow deadline fields.

If Binance returns null/missing timestamps, UI should show “Not returned by Binance,” not estimated values.

### 2. Harden database access for release monitoring logs

Add a migration to replace broad authenticated read on `p2p_release_deadline_monitor_log` with terminal permission checks.

Recommended permissions:

- `terminal_orders_view`
- `terminal_orders_manage`
- `terminal_audit_logs_view`
- `terminal_automation_manage` if this permission exists

Keep service-role insert/update ability for the edge function.

### 3. Add complaint-freeze warning monitoring without auto-appeal

Extend the release monitoring logic to classify complaint cutoff risk:

- `release_overdue`: `now > confirm_pay_end_time` and Binance order still not final.
- `complaint_window_closing`: `complain_freeze_time` exists, order still not final/appeal, and current time is within a configured warning window before freeze.
- `complaint_window_expired`: `now > complain_freeze_time` and order still not final/appeal.

This is only an operator warning/audit signal. No automated appeal filing will be implemented.

### 4. Decouple monitoring from auto-pay availability

Create a dedicated edge function action or separate function for deadline monitoring, for example:

- `release-deadline-monitor`

It should:

- Read recent successful mark-paid logs from `p2p_auto_pay_log`.
- Use only rows with Binance-provided `confirm_pay_end_time` and/or `complain_freeze_time`.
- Fetch live Binance order detail before marking an order overdue.
- Insert idempotent/low-noise monitor records.
- Avoid re-checking the same unresolved order more often than the current cooldown, e.g. 5 minutes.

This prevents monitoring from depending on whether the auto-pay engine happens to be active.

### 5. Add scheduled execution if missing

Set up a safe Supabase cron invocation for the monitor if no active schedule exists.

Recommended cadence:

- Every 2 to 5 minutes for active deadline monitoring.

The cron must call the edge function using the project function URL and anon key, following the existing Supabase scheduled function pattern. The function itself should validate and use service-role internally.

### 6. Surface deadlines in operator UI

Update terminal UI to show Binance authoritative timing:

In Auto-Pay Log:

- Show `notify_pay_time` as “Binance marked paid at.”
- Show `confirm_pay_end_time` as “Seller release deadline.”
- Show `complain_freeze_time` as “Complaint cutoff.”

In Release Deadline Monitoring:

- Highlight `release_overdue` in amber/destructive styling.
- Highlight `complaint_window_closing` and `complaint_window_expired` distinctly.
- Show the last live Binance status checked.

In active order/operator workspace:

- Add a compact “Seller overdue” / “Complaint window closing” badge when a matching unresolved monitor log exists.
- Do not block operator workflow; this should be an alert, not an automated action.

### 7. Preserve exempted items

Do not implement these in this phase:

- Automated fraud scoring from these timestamps.
- Appeal evidence export.
- Compliance-only audit page.
- Auto-filing complaints/appeals.

### 8. Verification plan

After implementation:

- Run a code audit for all `markOrderAsPaid` paths to ensure timestamps are captured consistently.
- Verify `extractMarkPaidData()` handles nested Binance/proxy response shapes.
- Confirm `p2p_auto_pay_log` rows have timestamp columns populated when Binance returns them.
- Confirm monitor does not create duplicate/noisy alerts on repeated runs.
- Confirm RLS blocks unrelated authenticated users while allowing terminal-authorized users.
- Confirm UI shows “Not returned by Binance” for missing timestamps rather than inferred values.

## Expected benefit

This turns the already-captured Binance timestamps into an operational SLA layer:

- Operators can see when Binance officially accepted payment marking.
- The terminal can detect seller release delays automatically.
- Complaint cutoff risk becomes visible before the window closes.
- The system remains Binance-source-of-truth compliant and avoids fake/inferred automation.