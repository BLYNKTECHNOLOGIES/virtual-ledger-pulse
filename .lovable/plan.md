## Plan: Rebuild Terminal MPI as a decision-grade performance analytics module

### Current root-cause findings

The current MPI screen is inconsistent because it is measuring the wrong/partial sources:

1. **Operator assignment data is almost empty**
   - `terminal_order_assignments`: only 15 rows, last activity around March 10.
   - This is why the screen shows many users with `0 orders`, `₹0K volume`, but still displays scores like 10/30.

2. **Actual payer work exists elsewhere**
   - `terminal_payer_order_log`: 451 rows, all `marked_paid`, current through April 25.
   - `terminal_payer_order_locks`: 396 rows, current through April 25.
   - The current overview mostly scores assignment rows, so payer performance is under-counted or misrepresented.

3. **Terminal action logs are not populated for MPI**
   - `system_action_logs where module='terminal'`: 0 rows.
   - So cards like chat count, releases, action breakdown, escalation count are currently low-value/noise unless action logging is fixed.

4. **Snapshot table is stale/misleading**
   - `terminal_mpi_snapshots` shows 16 users daily, `0 orders`, `0 volume`, average score `30` for recent days.
   - This comes from snapshot logic still relying on assignment/order-record joins that are not the actual source of terminal payer activity.

5. **Current score is not appraisal-safe**
   - Existing scoring gives score even with no work.
   - It mixes payer/operator/admin roles under one score formula.
   - It does not clearly separate productivity, speed, reliability, quality/risk, and data confidence.

---

## What will be removed or downgraded as useless/noisy

1. **Remove the current generic “Action Breakdown” pie chart**
   - It is based on empty/missing `system_action_logs` and currently shows only fragments like payments.

2. **Remove ranking users with no measurable work as “Top Performers”**
   - Users with no orders/payments/locks should be shown as “No activity”, not ranked.

3. **Stop using one blended score for all roles**
   - Payers, operators, and admins need different measurable responsibilities.

4. **Stop using `terminal_order_assignments` as the primary truth for payer performance**
   - Keep it only for operator assignment analysis where applicable.

5. **Hide/label metrics with missing source data**
   - Chat, release, escalation, and admin action metrics should show “Not tracked” or be omitted until the relevant logs exist.

---

## Features worth adding

### 1. Role-specific performance views

Add tabs/segments inside MPI:

```text
Overview | Payers | Operators | Data Quality | User Detail
```

For each user, show role-specific analytics:

**Payer metrics**
- Orders/payments handled from `terminal_payer_order_log` and `terminal_payer_order_locks`.
- Payment volume enriched from `binance_order_history`.
- Lock-to-pay time: `locked_at -> completed_at` or `locked_at -> marked_paid` fallback.
- Completion ratio: completed locks / total locks.
- Active/stale locks.
- Cancelled-after-lock count using Binance order status.
- Average, median, fastest, slowest payment time.
- Peak working hour and hourly throughput.
- Data confidence badge.

**Operator metrics**
- Assigned orders from `terminal_order_assignments`.
- Completion/cancellation using `binance_order_history` as authoritative order status.
- Assignment-to-close time.
- Active workload and stale active assignments.
- Volume handled.
- Buy/sell split.
- Data confidence badge.

**Admin/supervisor metrics**
- Only if real action logs exist.
- Until then, display “Admin actions are not currently tracked” instead of fake/empty analytics.

### 2. Decision-grade scorecard, not incentive logic

No incentive model will be added. Instead MPI will provide clear decision inputs:

```text
Productivity     how much measurable work was completed
Speed            how quickly assigned/locked orders were handled
Reliability      completion vs stale/cancelled/abandoned work
Quality/Risk     cancelled-after-action, stale locks, disputed/appeal status if available
Consistency      work distribution over selected period
Data Confidence  how complete the underlying tracking data is
```

Scores should be role-specific and explainable. Example:

**Payer score**
- 35% payment completion rate
- 25% lock-to-pay speed
- 20% volume/order throughput
- 15% reliability penalty for stale/abandoned locks
- 5% consistency

**Operator score**
- 35% completion rate
- 25% assignment handling speed
- 20% order/volume throughput
- 15% cancellation/stale assignment penalty
- 5% consistency

Important: if a user has no measurable work, score should be `N/A`, not 10/30/100.

### 3. Data confidence and audit warnings

Add a “Data Quality” section to explain why numbers can or cannot be trusted:

- Assignment coverage: how many Binance orders are linked to assignments.
- Payer coverage: how many marked-paid logs have matching Binance history.
- Missing action logs count.
- Snapshot freshness.
- Users with roles but no activity.
- Active locks older than threshold.
- Orders with payment logs but no completed lock.

This directly supports appraisal decisions by showing whether the score is backed by enough data.

### 4. Server-side MPI calculation RPC

Move the heavy and sensitive aggregation into Supabase RPCs instead of computing everything in the browser.

Create/replace functions such as:

```text
get_terminal_mpi_v2(p_from timestamptz, p_to timestamptz, p_scope text)
get_terminal_user_mpi_detail_v2(p_user_id uuid, p_from timestamptz, p_to timestamptz)
generate_terminal_mpi_snapshots_v2(p_date date)
```

These will aggregate from:

- `terminal_payer_order_log`
- `terminal_payer_order_locks`
- `terminal_order_assignments`
- `binance_order_history`
- `p2p_terminal_user_roles`
- `p2p_terminal_roles`
- `terminal_user_profiles`

### 5. Fix snapshot generation

Replace current snapshot logic so daily snapshots no longer show meaningless `0 orders / 30 score` rows.

New snapshot rules:
- Generate snapshots only for active terminal users.
- Use payer logs/locks for payer work.
- Use assignments plus Binance status for operator work.
- Store `score = null` when activity is zero.
- Store data confidence fields.
- Use Asia/Kolkata date attribution consistently.

### 6. Rebuild the MPI UI

Update `src/pages/terminal/TerminalMPI.tsx`:

- Replace current cards with meaningful summary cards:
  - Active users with measurable work
  - Total handled orders/payments
  - Total volume
  - Median payment/handle time
  - Completion rate
  - Stale work count
  - Data confidence
- Replace Top Performers with leaderboard rows that show:
  - Score
  - Work count
  - Volume
  - Speed
  - Reliability flags
  - Confidence badge
- Add filters:
  - Today / Yesterday / 7D / Month / custom-ready structure
  - All / Payers / Operators
  - Sort by score, volume, completion, speed, stale risk
- Show “No measurable activity” clearly instead of ranking inactive users.

Update `src/pages/terminal/TerminalOperatorDetail.tsx`:

- Use the same server-side detail RPC.
- Show per-user evidence:
  - Recent handled orders
  - Payments/locks timeline
  - Speed distribution
  - stale/cancelled/appeal flags
  - data quality warnings
- Keep decision analytics only; no incentive amount calculations.

---

## Technical implementation steps

1. **Database migration**
   - Add/adjust MPI snapshot columns for role type, payer metrics, operator metrics, data confidence, stale counts, and nullable score.
   - Add indexes for fast date/user/order lookups:
     - `terminal_payer_order_log(payer_id, created_at)`
     - `terminal_payer_order_locks(payer_user_id, locked_at, status)`
     - `terminal_order_assignments(assigned_to, created_at, is_active)`
     - `binance_order_history(order_number, create_time, order_status, trade_type)` if not already sufficient.

2. **Create MPI v2 RPCs**
   - Build consolidated per-user metrics from the real terminal sources.
   - Use Binance order history as order-status/volume enrichment source.
   - Return data confidence and source coverage indicators.

3. **Backfill/fix snapshots**
   - Recompute recent snapshot rows using the new source logic.
   - Prevent no-activity users from getting artificial scores.

4. **Refactor MPI overview UI**
   - Replace the current client-side aggregation with RPC-backed data.
   - Remove useless/noisy widgets.
   - Add role-specific cards and decision-focused leaderboard.

5. **Refactor user detail UI**
   - Align detail page with the same scoring and evidence model.
   - Remove unsupported/empty action metrics unless logs exist.

6. **Verification**
   - Query sample output for Today/7D to ensure payer logs and locks are counted.
   - Confirm users with zero activity show `N/A` score.
   - Confirm payment volume comes from matched Binance order history only.
   - Confirm stale locks and missing data warnings are visible.

---

## Expected result

The MPI module will become a reliable performance evidence system for appraisal/incentive decisions:

- Payers are measured by payment execution, speed, reliability, and volume.
- Operators are measured by assigned order handling, completion, speed, and stale workload.
- Empty or missing data is not converted into fake scores.
- Every score is explainable and backed by source coverage.
- Management can clearly see who performed, who did not, and where the underlying data is incomplete.