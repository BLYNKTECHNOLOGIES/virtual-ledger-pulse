

# Terminal Audit V2 — Implementation Plan

## Scope
- **Phase 0**: 4 crash fixes (all verified critical)
- **Phase 1**: 5 logic fixes (items 5-8 + 10, excluding #9 sync integration)
- **Phase 2**: Full MPI production-ready (5 items)
- **Phase 3-4**: Skipped

Total: 14 fixes in a single database migration. No frontend changes required.

---

## Phase 0 — Emergency Crash Fixes

### 1. T2-CRASH-01: Add `metadata` column to `terminal_notifications`
Add `metadata jsonb DEFAULT '{}'`. Fixes 4 crashing functions + SLA cron.

### 2. T2-CRASH-02: Rewrite `generate_terminal_mpi_snapshots`
- Fix join: `por.binance_order_number` (not `por.order_number`)
- Fix status values: remove `'5'`, `'8'`, `'9'` — use `'COMPLETED'`, `'CANCELLED'`, `'CANCELLED_BY_SYSTEM'`
- Include `idle_time_minutes` in UPSERT's ON CONFLICT UPDATE
- Add `completion_rate` column computation (combines with T2-MPI-01)
- Change `terminal_mpi_snapshots.user_id` from `text` to `uuid`

### 3. T2-CRASH-03: Make `terminal_auto_assignment_log.assigned_to` nullable
`ALTER COLUMN assigned_to DROP NOT NULL`. No-match path works gracefully.

### 4. T2-CRASH-04: Fix payer lock unique index
Drop `idx_payer_order_locks_unique_active` (WHERE status='active'), recreate as `WHERE (status = 'locked')` to match actual INSERT value.

---

## Phase 1 — Logic Fixes (5 of 6)

### 5. T2-BUG-05: Drop old auto_assign overload
`DROP FUNCTION IF EXISTS auto_assign_order_by_scope(text, text, numeric, text, text)` — the old signature without presence/cap checks.

### 6. T2-BUG-06: Add `is_enabled` check
At top of remaining `auto_assign_order_by_scope`, check `terminal_auto_assignment_config.is_enabled`. Return `'disabled'` status if false.

### 7. T2-BUG-07: Add break status filter
Add `AND tpr.status = 'active'` to all operator selection queries in auto-assign. Operators on break excluded.

### 8. T2-BUG-08: Create `set_terminal_user_status` RPC
New SECURITY DEFINER function accepting `(p_user_id uuid, p_status text)`. Validates against `'active'`, `'on_break'`, `'busy'`. Updates `terminal_user_presence.status` and logs to `terminal_activity_log`.

### 10. T2-AUTO-01: Auto-deactivate assignments on complete/cancel
In `sync_p2p_order`, after UPSERT — when `v_effective_status` is COMPLETED or CANCELLED: set `terminal_order_assignments.is_active = false` and release payer locks (`status = 'auto_released'`).

---

## Phase 2 — MPI Production-Ready

### 11. T2-MPI-01: Add `completion_rate` column
`ALTER TABLE terminal_mpi_snapshots ADD COLUMN completion_rate numeric DEFAULT 0`. Computed in rewritten MPI function.

### 12. T2-MPI-02: Response time tracking
- Add `first_action_at timestamptz` to `terminal_order_assignments`
- Add `avg_response_time_minutes numeric` to `terminal_mpi_snapshots`
- Add `avg_order_size numeric DEFAULT 0` and `mpi_score numeric DEFAULT 0` (combines T2-MPI-03)
- Compute in MPI function from assignment → first action delta

### 13. T2-MPI-04: Aggregation + leaderboard RPCs
- `get_terminal_mpi_summary(p_user_id, p_from, p_to)` — date-range aggregation per user
- `get_terminal_mpi_leaderboard(p_from, p_to, p_limit)` — ranked operator list with completion rate, volume, response time

### 14. T2-MPI-05: Backfill historical data
After MPI function is fixed, run backfill loop from 2026-02-14 to yesterday.

### 15. T2-BUG-10: Auto-assign fallback to `terminal_user_size_range_mappings`
Add Priority 3 in auto-assign: when `terminal_operator_assignments` yields no match, fall back to `terminal_user_size_range_mappings` with same presence/cap/break checks. Match type logged as `'size_range_fallback'`.

---

## Technical Details

### Files Changed
| File | Action |
|------|--------|
| `supabase/migrations/xxx.sql` | Single migration with all 14 fixes |

### No Frontend Changes
All fixes are database-level (columns, functions, triggers, indexes). No React/TS changes needed. Frontend can later integrate `set_terminal_user_status` for break toggle UI.

### Risk Assessment
- Phase 0: Zero risk — all tables have 0 rows or additive-only changes
- Phase 1 item 5 (drop overload): Verified frontend uses named params matching new signature
- Phase 1 item 10 (auto-deactivate in sync): Wrapped in safe conditional, only fires on terminal statuses
- Phase 2 MPI: Table has 0 rows, schema changes are safe. Backfill is read-only aggregation

