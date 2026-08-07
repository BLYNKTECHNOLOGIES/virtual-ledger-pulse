SELECT cron.schedule('cleanup-old-balance-snapshots','30 3 * * *', $j$
    DELETE FROM erp_balance_snapshot_lines WHERE snapshot_id IN (SELECT id FROM erp_balance_snapshots WHERE snapshot_at < NOW() - INTERVAL '30 days');
    DELETE FROM erp_drift_alerts WHERE snapshot_id IN (SELECT id FROM erp_balance_snapshots WHERE snapshot_at < NOW() - INTERVAL '30 days');
    DELETE FROM erp_balance_snapshots WHERE snapshot_at < NOW() - INTERVAL '30 days';
$j$);
SELECT cron.schedule('flag-stale-settlements-daily','0 9 * * *', $j$SELECT flag_stale_pending_settlements();$j$);