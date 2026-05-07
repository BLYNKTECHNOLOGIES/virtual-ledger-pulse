## Audit findings — what's actually wrong

I cross-checked the dashboard code (`computeOrderStats` in `src/hooks/useBinanceOrders.tsx`, `MetricCards`, `OrderStatusBreakdown`, `OperationalAlerts`) against the live `binance_order_history` table. Confirmed bugs:

### 1. "Completed Today" ignores the selected filter (high impact)
`computeOrderStats` builds `todayStart` from the **browser's local midnight** and counts only orders with `createTime >= local-midnight` AND `status COMPLETED`. It does this even when the user has selected a different date, a shift (S1/S2/S3), or a 7D/30D/1Y range. Result:
- Selecting any past date or shift shows "0 Completed Today" even when the filter window contains hundreds of completed orders (DB confirms 122 SELL + 5 BUY completed today alone).
- Browsers on non-IST timezones get a different "today" than the IST-based filter window.

**Fix:** Rename to "Completed (period)" and count completed orders **within the active filter window** (`startTimestamp`–`endTimestamp` from `getTimestampsForFilter`). Pass the filter bounds into `computeOrderStats`.

### 2. "Appeals" undercounts — only reads `orderStatus` string
The metric checks `status.includes('APPEAL')` only. Binance returns a separate `complaintStatus` / `complainStatus` field that stays active on orders whose `orderStatus` is already `COMPLETED` or `CANCELLED`. The codebase already has `hasActiveBinanceComplaint()` in `src/lib/orderStatusMapper.ts` but the dashboard never uses it.

Also: cached `binance_order_history` rows do not store `complaintStatus`. Appeals on completed orders are invisible to the dashboard.

**Fix:**
- Add `complaint_status` (text/int) and `has_active_complaint` (bool) columns to `binance_order_history`.
- Populate them in `orderToDbRow` (`useBinanceOrderSync.tsx`) using the raw payload.
- Count appeals as `status APPEAL/DISPUTE/COMPLAINT` **OR** `has_active_complaint = true`. Apply the same in `OperationalAlerts`.

### 3. "Pending Payments" is inconsistent with "Active Orders"
- `activeOrders` counts `TRADING | BUYER_PAYED | PENDING`.
- `pendingPayments` counts `PENDING | TRADING` but **excludes `BUYER_PAYED`**.

For SELL orders, `BUYER_PAYED` means the buyer paid and we owe coin release — that is the most operationally urgent "pending action", yet it shows as zero. The card label "Pending Payments" is also ambiguous.

**Fix:** Split into two clean metrics:
- **Awaiting Payment** = SELL or BUY with status `TRADING` (no payment yet).
- **Awaiting Release** = SELL with status `BUYER_PAYED` (we must release coin).
Update `MetricCards` labels accordingly. `activeOrders` = sum of both + any other non-final states.

### 4. Stale "active" orders from incremental sync
`syncOrderHistoryFromBinance` uses a 24h status-overlap window. Orders older than 24h that transitioned out of `TRADING`/`BUYER_PAYED` between gap-fill runs (every 24h) keep their stale active status in the DB, inflating "Active Orders" and "Pending Payments" for the 7D/30D/1Y views.

**Fix:** When computing dashboard stats, exclude any "active" order whose `create_time` is older than 24 hours (Binance auto-cancels unpaid P2P orders within minutes, so any older active row is almost certainly stale). Optionally also trigger a targeted re-fetch of those specific order numbers via `getOrderDetail` to repair the cached status.

### 5. "Completion Rate" denominator is misleading
`completedCount / orders.length` includes still-active orders in the denominator, so the rate dips artificially while orders are open.

**Fix:** Denominator = completed + cancelled + expired (final-state orders only). Active orders excluded.

### 6. `OrderStatusBreakdown` lumps `CANCELLED_BY_SYSTEM` into `Cancelled`
Acceptable but hides operator vs. system cancellations. Add a separate "Auto-Cancelled" slice using `s.includes('CANCELLED_BY_SYSTEM')` checked **before** the generic CANCELLED branch.

### 7. `OperationalAlerts` mirrors the same defects
Reuses the same `APPEAL` string match and the same TRADING/BUYER_PAYED logic. Same fixes apply once `has_active_complaint` exists and the buckets are split.

---

## Implementation steps

1. **DB migration** — add columns to `binance_order_history`:
   ```
   complaint_status text
   has_active_complaint boolean default false
   ```
   Backfill from existing `raw_data` payload via a one-shot SQL update.

2. **`src/hooks/useBinanceOrderSync.tsx`** — extend `orderToDbRow` to set `complaint_status` and `has_active_complaint` from the raw order using `hasActiveBinanceComplaint`. Add the two fields to `useCachedOrderHistory` SELECT and `dbRowToOrder`.

3. **`src/hooks/useBinanceOrders.tsx`** — extend `C2COrderHistoryItem` with `hasActiveComplaint`. Refactor `computeOrderStats(orders, { startTs, endTs })`:
   - `completedInPeriod` replaces `completedToday`.
   - `awaitingPayment`, `awaitingRelease` replace `pendingPayments`.
   - `appeals` uses `hasActiveComplaint || status APPEAL/DISPUTE/COMPLAINT`.
   - `activeOrders` skips rows older than 24h still in active state.
   - `completionRate` denominator = final states only.

4. **`src/components/terminal/dashboard/MetricCards.tsx`** — update props/labels: "Completed (period)", "Awaiting Payment", "Awaiting Release", keep "Appeals" / "Active Orders" / volumes / completion rate.

5. **`src/pages/terminal/TerminalDashboard.tsx`** — pass filter bounds into `computeOrderStats`; wire new metric props.

6. **`src/components/terminal/dashboard/OperationalAlerts.tsx`** — use `hasActiveComplaint` for appeal alerts; separate "Awaiting Release" alert for SELL+BUYER_PAYED.

7. **`src/components/terminal/dashboard/OrderStatusBreakdown.tsx`** — add `Auto-Cancelled` bucket; ensure `IN_APPEAL` maps to `Appeal`.

8. **Verification** — after deploy: run a SQL spot-check (`SELECT order_status, COUNT(*)`) for the active filter window and confirm card numbers match.

No change to Binance API calls — all fixes are computation/storage; the source of truth (`binance_order_history` + raw payloads already cached) stays intact.