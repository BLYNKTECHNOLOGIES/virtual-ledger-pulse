-- Backfill all snapshots with USDT-only purchase rate logic
DO $$
DECLARE
  rec RECORD;
  v_total_sales_qty NUMERIC;
  v_total_sales_value NUMERIC;
  v_avg_sales_rate NUMERIC;
  v_total_purchase_qty NUMERIC;
  v_total_purchase_value NUMERIC;
  v_total_fees NUMERIC;
  v_net_purchase_qty NUMERIC;
  v_effective_purchase_rate NUMERIC;
  v_npm NUMERIC;
  v_gross_profit NUMERIC;
  v_day_start TIMESTAMPTZ;
  v_day_end TIMESTAMPTZ;
BEGIN
  FOR rec IN SELECT snapshot_date FROM daily_gross_profit_history ORDER BY snapshot_date LOOP
    v_day_start := rec.snapshot_date::date;
    v_day_end := (rec.snapshot_date::date + INTERVAL '1 day' - INTERVAL '1 second');

    SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(quantity * price_per_unit), 0)
    INTO v_total_sales_qty, v_total_sales_value
    FROM sales_orders WHERE status = 'COMPLETED' AND order_date = rec.snapshot_date;

    IF v_total_sales_qty > 0 THEN
      v_avg_sales_rate := v_total_sales_value / v_total_sales_qty;
    ELSE
      v_avg_sales_rate := 0;
    END IF;

    SELECT COALESCE(SUM(poi.quantity), 0), COALESCE(SUM(poi.quantity * poi.unit_price), 0)
    INTO v_total_purchase_qty, v_total_purchase_value
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.purchase_order_id
    JOIN products p ON p.id = poi.product_id
    WHERE po.status = 'COMPLETED' AND po.order_date = rec.snapshot_date AND p.code = 'USDT';

    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_fees
    FROM wallet_transactions
    WHERE transaction_type = 'DEBIT'
      AND reference_type IN ('PLATFORM_FEE','TRANSFER_FEE','SALES_ORDER_FEE','PURCHASE_ORDER_FEE')
      AND created_at >= v_day_start AND created_at <= v_day_end;

    v_net_purchase_qty := v_total_purchase_qty - v_total_fees;
    IF v_total_purchase_qty > 0 AND v_net_purchase_qty > 0 THEN
      v_effective_purchase_rate := v_total_purchase_value / v_net_purchase_qty;
    ELSIF v_total_purchase_qty > 0 THEN
      v_effective_purchase_rate := v_total_purchase_value / v_total_purchase_qty;
    ELSE
      v_effective_purchase_rate := 0;
    END IF;

    v_npm := v_avg_sales_rate - v_effective_purchase_rate;
    v_gross_profit := v_npm * v_total_sales_qty;

    UPDATE daily_gross_profit_history SET
      total_sales_qty = v_total_sales_qty,
      avg_sales_rate = v_avg_sales_rate,
      effective_purchase_rate = v_effective_purchase_rate,
      gross_profit = v_gross_profit
    WHERE snapshot_date = rec.snapshot_date;
  END LOOP;
END $$;