
User wants to disable all remaining auto-task generators: P2P counterparty volume breach trigger and the stale pending settlements daily cron job. Also purge their existing auto-generated entries.

## Plan: Disable All Remaining Auto-Task Generators

### DB Migration
1. **Drop P2P volume breach trigger + function**
   - Drop trigger on `p2p_order_records` that calls `check_counterparty_volume_threshold()`
   - Drop function `check_counterparty_volume_threshold()`

2. **Unschedule stale settlements cron + drop function**
   - `cron.unschedule('flag-stale-settlements-daily')`
   - Drop function `flag_stale_pending_settlements()`

3. **Drop dormant TDS function** (cleanup, since it's unused)
   - Drop function `check_tds_overdue_and_alert()`

### Data Cleanup (insert tool)
Purge existing auto-generated tasks:
```sql
DELETE FROM public.erp_tasks
WHERE 'auto-flagged' = ANY(tags)
  AND ('volume-breach' = ANY(tags) OR 'stale' = ANY(tags));
```

### Result
No automatic task generation remains in the system. All tasks going forward will be manually created only. Existing noise from these generators is purged.

### Memory update
Update `mem://features/erp/task-management-system-v2` to note that all automated task generators (spot-trade-failed, P2P volume breach, stale settlements) have been removed — task creation is now strictly manual.
