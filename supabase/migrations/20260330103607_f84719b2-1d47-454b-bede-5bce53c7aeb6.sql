
-- T-BUG-01: One-time data correction for corrupted counterparty stats
UPDATE p2p_counterparties pc SET
  total_buy_orders = COALESCE(sub.actual_buys, 0),
  total_sell_orders = COALESCE(sub.actual_sells, 0),
  total_volume_inr = COALESCE(sub.actual_volume, 0)
FROM (
  SELECT counterparty_id,
    COUNT(*) FILTER (WHERE trade_type = 'BUY' AND order_status ILIKE '%COMPLETED%') as actual_buys,
    COUNT(*) FILTER (WHERE trade_type = 'SELL' AND order_status ILIKE '%COMPLETED%') as actual_sells,
    COALESCE(SUM(total_price) FILTER (WHERE order_status ILIKE '%COMPLETED%'), 0) as actual_volume
  FROM p2p_order_records
  GROUP BY counterparty_id
) sub
WHERE pc.id = sub.counterparty_id;

-- For counterparties with no orders at all, zero out
UPDATE p2p_counterparties
SET total_buy_orders = 0, total_sell_orders = 0, total_volume_inr = 0
WHERE id NOT IN (SELECT DISTINCT counterparty_id FROM p2p_order_records WHERE counterparty_id IS NOT NULL);
