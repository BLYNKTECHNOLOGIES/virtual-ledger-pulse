Root cause found:

The auto-pay engine is running every minute and the setting is active at 3 minutes. The scheduler itself is not the primary failure.

For the three cancelled orders shown in the screenshot, there are no rows in `p2p_auto_pay_log`, which means auto-pay never attempted them. The important finding is that those orders had `create_time` around 12:53:33–12:54:19 UTC, but the automation did not see them as payable candidates before cancellation.

The likely cause is a combination of these flaws:

1. The auto-pay engine only acts on orders returned by Binance `listOrders` at the cron tick.
   - If an order is not returned by that endpoint at the exact minute it enters the 3-minute window, it is skipped silently.
   - There is no secondary safety pass against locally cached active orders.

2. The engine skips silently when it cannot determine expiry time.
   - In the affected DB rows, `raw_data` had no `notifyPayEndTime`, `notifyPayedExpireMinute`, `payEndTime`, or `paymentEndTime`.
   - Current logic says “refuse to guess” and just continues, without logging this as a failed/risky skipped order.
   - This makes escaped orders invisible in the Auto-Pay Log.

3. Binance detail parameter handling is inconsistent across functions.
   - `auto-pay-engine` calls `getUserOrderDetail` with `{ orderNo }`.
   - `binance-ads` comments say orderNo is required, but code sends `{ adOrderNo }`.
   - This inconsistency can cause detail fetches to return no `data`, which explains repeated `Warning: post-verify status null` logs and can prevent expiry lookup.

4. Current status mapping differs between modules.
   - Some code maps numeric `1` as `TRADING`; `src/lib/orderStatusMapper.ts` maps numeric `1` as `PENDING` and `2` as `TRADING`.
   - Auto-pay currently treats only `1`/`TRADING` as payable. If Binance/proxy returns a different payable numeric code/string, the order can be excluded.

5. Observability is too weak for a money-risk automation.
   - When a candidate is skipped due to missing expiry, being outside the window, missing from live fetch, or unverified post-payment status, there is no strong audit/alert row.
   - The UI currently shows “success” even when post-verification is null, which is misleading.

Plan to fix so orders do not escape auto-pay:

1. Build a fail-safe candidate collector in `auto-pay-engine`
   - Fetch active BUY orders from Binance `listOrders` with pagination as today.
   - Also include recently cached local active BUY orders from `binance_order_history` and/or `p2p_order_records` from the last 30 minutes.
   - Deduplicate by order number.
   - For cached orders, re-check Binance detail before acting so Binance remains the source of truth.

2. Make expiry resolution robust and auditable
   - Try expiry fields from `listOrders` first.
   - Then fetch `getUserOrderDetail` using both supported parameter shapes if needed: `{ orderNo }` and fallback `{ adOrderNo }`, depending on proxy behavior.
   - Extract expiry/payment window from multiple known fields.
   - If exact expiry is still unavailable, do not silently ignore the order. Insert a `failed` or `risk_skipped` auto-pay log with reason `expiry_unavailable` and order details.
   - Add a conservative emergency mode: if the order is older than a safe threshold near the known P2P payment window and still payable, attempt mark-paid rather than letting it expire. This will be based only on Binance-provided create time/status, not dummy data.

3. Correct and centralize Binance status mapping
   - Align backend and frontend status mappings into one consistent rule set.
   - Treat payable states explicitly: `TRADING`, `PENDING_PAYMENT`, and confirmed Binance numeric payable codes.
   - Treat already-paid/release states explicitly: `BUYER_PAYED`, `BUYER_PAID`, `PAYING`.
   - Treat final states explicitly: `COMPLETED`, `CANCELLED`, `CANCELLED_BY_SYSTEM`, `EXPIRED`, `APPEAL`.
   - Update `auto-pay-engine`, `capture-beneficiaries`, `useBinanceOrderSync`, and `orderStatusMapper` so they do not disagree.

4. Fix Binance detail request consistency
   - Update `supabase/functions/binance-ads/index.ts` `getOrderDetail` to use the correct documented/proxy-compatible parameter.
   - Add fallback handling where needed so the proxy response is parsed consistently.
   - Update `auto-pay-engine` detail verification to log the raw response code/message when detail is missing.

5. Change auto-pay logging from “attempt-only” to “decision audit”
   - Log every candidate decision: paid, already paid, skipped outside window, skipped missing expiry, failed API call, final-state ignored.
   - Do not mark status as `success` when Binance returns mark-paid success but post-verification is null. Use `warning`/`unverified_success` or `failed_verification` so the UI clearly shows risk.
   - Include metadata such as source (`live`, `cached_history`, `p2p_records`), raw status, resolved expiry, and decision reason.

6. Add UI safety indicators in Auto-Pay screen
   - Show unverified/warning logs with amber warning icon instead of green success.
   - Add a small “last engine run / candidates / risky skips” summary so failures are visible immediately.
   - Show full order number or copy button for risky rows to trace quickly.

7. Add a database safety migration
   - Add missing columns to `p2p_auto_pay_log` if needed: `decision_reason`, `raw_status`, `source`, `metadata jsonb`.
   - Add useful indexes for `executed_at`, `status`, and `order_number`.
   - Optionally add a lightweight `p2p_auto_pay_engine_runs` table to track each cron execution, candidates seen, attempted, skipped, and errors.

8. Validate with live-safe testing
   - Run the deployed edge function manually after changes and confirm it records candidate decisions.
   - Check recent affected orders against `binance_order_history`, `p2p_order_records`, and `p2p_auto_pay_log`.
   - Confirm no silent skip path remains in code.
   - Deploy the updated edge function and migration.

Expected result:

- If an order is payable and near expiry, auto-pay will either mark it paid or create a visible high-risk failure log with the exact reason.
- Orders will no longer silently disappear because Binance did not return them in one `listOrders` poll.
- The Auto-Pay Log will stop showing misleading green success rows for unverified payments.
- Any future escaped order will be traceable from the engine run audit instead of being invisible.