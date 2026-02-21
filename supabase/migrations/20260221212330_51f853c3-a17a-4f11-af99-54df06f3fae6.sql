-- Clear all existing reconciliation findings
DELETE FROM reconciliation_findings;

-- Mark all old unreconciled SELL conversions as reconciled
UPDATE erp_product_conversions
SET actual_usdt_received = ABS(net_usdt_change),
    rate_reconciled_at = now()
WHERE status = 'APPROVED'
  AND side = 'SELL'
  AND actual_usdt_received IS NULL;

-- Clear old scan log entries
DELETE FROM reconciliation_scan_log;