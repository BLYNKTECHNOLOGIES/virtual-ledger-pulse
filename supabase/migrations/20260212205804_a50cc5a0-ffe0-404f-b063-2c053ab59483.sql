-- Fix zero snapshots for Feb 8 and Feb 9 by computing actual values

-- Feb 8
WITH sales AS (
  SELECT COALESCE(SUM(quantity), 0) as total_qty,
         CASE WHEN COALESCE(SUM(quantity), 0) > 0 
              THEN COALESCE(SUM(quantity * price_per_unit), 0) / COALESCE(SUM(quantity), 0) 
              ELSE 0 END as avg_rate
  FROM sales_orders WHERE status = 'COMPLETED' AND order_date = '2026-02-08'
),
purchases AS (
  SELECT COALESCE(SUM(poi.quantity), 0) as total_qty,
         COALESCE(SUM(poi.quantity * poi.unit_price), 0) as total_value
  FROM purchase_order_items poi
  JOIN purchase_orders po ON po.id = poi.purchase_order_id
  WHERE po.status = 'COMPLETED' AND po.order_date = '2026-02-08'
),
fees AS (
  SELECT COALESCE(SUM(amount), 0) as total_fees
  FROM wallet_transactions
  WHERE transaction_type = 'DEBIT' 
    AND reference_type IN ('PLATFORM_FEE','TRANSFER_FEE','SALES_ORDER_FEE','PURCHASE_ORDER_FEE')
    AND created_at >= '2026-02-08T00:00:00' AND created_at <= '2026-02-08T23:59:59'
)
UPDATE daily_gross_profit_history SET
  total_sales_qty = s.total_qty,
  avg_sales_rate = s.avg_rate,
  effective_purchase_rate = CASE WHEN (p.total_qty - f.total_fees) > 0 THEN p.total_value / (p.total_qty - f.total_fees) ELSE 0 END,
  gross_profit = (s.avg_rate - CASE WHEN (p.total_qty - f.total_fees) > 0 THEN p.total_value / (p.total_qty - f.total_fees) ELSE 0 END) * s.total_qty
FROM sales s, purchases p, fees f
WHERE snapshot_date = '2026-02-08';

-- Feb 9
WITH sales AS (
  SELECT COALESCE(SUM(quantity), 0) as total_qty,
         CASE WHEN COALESCE(SUM(quantity), 0) > 0 
              THEN COALESCE(SUM(quantity * price_per_unit), 0) / COALESCE(SUM(quantity), 0) 
              ELSE 0 END as avg_rate
  FROM sales_orders WHERE status = 'COMPLETED' AND order_date = '2026-02-09'
),
purchases AS (
  SELECT COALESCE(SUM(poi.quantity), 0) as total_qty,
         COALESCE(SUM(poi.quantity * poi.unit_price), 0) as total_value
  FROM purchase_order_items poi
  JOIN purchase_orders po ON po.id = poi.purchase_order_id
  WHERE po.status = 'COMPLETED' AND po.order_date = '2026-02-09'
),
fees AS (
  SELECT COALESCE(SUM(amount), 0) as total_fees
  FROM wallet_transactions
  WHERE transaction_type = 'DEBIT' 
    AND reference_type IN ('PLATFORM_FEE','TRANSFER_FEE','SALES_ORDER_FEE','PURCHASE_ORDER_FEE')
    AND created_at >= '2026-02-09T00:00:00' AND created_at <= '2026-02-09T23:59:59'
)
UPDATE daily_gross_profit_history SET
  total_sales_qty = s.total_qty,
  avg_sales_rate = s.avg_rate,
  effective_purchase_rate = CASE WHEN (p.total_qty - f.total_fees) > 0 THEN p.total_value / (p.total_qty - f.total_fees) ELSE 0 END,
  gross_profit = (s.avg_rate - CASE WHEN (p.total_qty - f.total_fees) > 0 THEN p.total_value / (p.total_qty - f.total_fees) ELSE 0 END) * s.total_qty
FROM sales s, purchases p, fees f
WHERE snapshot_date = '2026-02-09';