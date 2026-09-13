# Database memory pressure: speed first, cost second

Priority order kept throughout: (1) Terminal/ERP/HRMS must feel faster, not slower, (2) cost stays controlled. No workflow, permission, automation or figure changes anywhere — every phase below is either waste removal or an index/caching change that makes the same query cheaper.

## What the live database actually shows (verified now)

- Connections are healthy: 32 sessions against a 160 limit. So the commit spikes are **not** a connection storm; they are heavy queries plus write/replication volume.
- `work_mem` is 12 MB per sort/hash node. A few of the full-table chat aggregations below can each claim several multiples of that, which is exactly the "commit spikes with normal memory usage" pattern.
- **Nine cron jobs are registered twice** (`erp-balance-snapshot-hourly`, `invoke-auto-pay-engine`, `daily-asset-value-snapshot`, `daily-gross-profit-snapshot`, `enrich-order-names-hourly`, `task-due-notifications-hourly`, `cleanup-old-balance-snapshots`, `flag-stale-settlements-daily`, `offboarding-account-cleanup`). Every one of those runs twice per schedule — double the memory, double the cost, for identical work.
- Heavy bloat / unbounded growth:
  - `p2p_release_deadline_monitor_log`: 1.66 GB for **129 live rows** (50k dead rows, never vacuumed).
  - `binance_ad_state_snapshots`: 1.83 GB, 785k rows.
  - `cron.job_run_details`: 888 MB.
  - `erp_balance_snapshot_lines`: 1.01 GB, 267k dead rows, never vacuumed.
  - `p2p_auto_pay_engine_runs`: 199 MB, every row dead.
- On `binance_order_chat_messages` (572 MB) there are **six indexes with zero scans ever**, totalling ~214 MB — including a 118 MB index on the raw payload. They are pure write, WAL and memory cost.
- `binance_order_chat_messages` is published to Realtime with `REPLICA IDENTITY FULL`, so every message write ships the entire old+new row through replication. Same for the collector cache (that one is small and intentional).
- The slowest statements are full-table chat aggregations (17 s, 16 s, 2.8 s) — audit/verification style `group by` over all 322k messages — plus the chat inbox function at 1.7–2.3 s.

## Phases

### Phase 1 — Remove pure duplication (no behaviour change, immediate relief)
- Unregister the second copy of each of the nine duplicated cron jobs, keeping one active copy each. Halves the memory footprint and cost of those jobs.
- Confirm from run history that the surviving copy is the one succeeding before removing the other.

### Phase 2 — Reclaim the bloat and cap unbounded logs
- Full vacuum/reclaim on `p2p_release_deadline_monitor_log`, `p2p_auto_pay_engine_runs`, `erp_balance_snapshot_lines` (run one at a time, off-peak IST, all keep their data).
- Add per-table autovacuum settings on the high-churn terminal tables so they never reach this state again.
- Add retention to the log-style tables: engine run logs, release-deadline monitor log, cron run history, and thin out `binance_ad_state_snapshots` beyond the window the ad pricing engine actually reads (verify that window in code first; nothing inside it is touched).

### Phase 3 — Drop dead weight on the chat table
- Drop the six never-used indexes on `binance_order_chat_messages` (~214 MB). Every chat insert currently pays for all of them; the read paths use only the four indexes that do get scanned.
- Re-check the Terminal chat inbox, thread open, counterparty history and compliance search paths after each drop, so nothing silently starts scanning.
- Narrow the Realtime replica identity on `binance_order_chat_messages` from FULL to the primary key, keeping the same live message delivery but cutting replication payload per message sharply.

### Phase 4 — Make the expensive reads cheap (this is the speed win)
- Chat inbox (`get_terminal_chat_inbox`, 1.7–2.3 s): add the missing supporting index / restructure the last-message lookup so the inbox opens in the low hundreds of milliseconds instead of seconds. Same rows, same ordering, same unread rules.
- Counterparty prior-order lookup (1.76 s): index the nickname/verified-name match it currently scans.
- The 17 s duplicate-key aggregations are ad-hoc audit queries, not app queries: replace them with a bounded, indexed integrity check so future audits cost milliseconds and cannot spike commit.

### Phase 5 — Trim client polling without slowing anything down
- The Terminal polls active orders every 2 s while visible; that stays, because release-to-disappear speed depends on it.
- Everything that does not affect perceived speed gets aligned: background-tab intervals, duplicate overlapping queries on the same page, and any poll that fires while its panel is not shown. Each change is verified against the page it belongs to.

### Phase 6 — Verify and only then consider tier
- Re-measure after phases 1–5: committed memory trend, slow-query list, table sizes, cron run counts.
- Compute size upgrade is deliberately last. Based on what is above, a large share of current commit is duplicated jobs, bloat, dead indexes and FULL replica identity — fixing those is free and may remove the need to pay more. If commit still approaches the limit under peak trading afterwards, upgrade compute then, with evidence.

## Technical notes

- Nothing in phases 1–4 changes any figure, rule, permission or automation trigger; they change storage, indexing and scheduling only.
- Index drops and replica-identity changes are done one at a time with an explicit read-path check after each, and are trivially reversible.
- `VACUUM FULL` takes a brief exclusive lock, so those run off-peak IST and only on the three tables named.
- State log gets one dated IST line per phase completed.
