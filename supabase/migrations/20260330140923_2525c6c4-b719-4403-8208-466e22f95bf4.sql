-- Temporarily disable the validation trigger for backfill
ALTER TABLE erp_product_conversions DISABLE TRIGGER trg_validate_conversion_approval;

-- Fix 77 APPROVED rows missing approved_by/approved_at
UPDATE erp_product_conversions
SET approved_by = COALESCE(approved_by, created_by),
    approved_at = COALESCE(approved_at, created_at)
WHERE status = 'APPROVED' AND (approved_by IS NULL OR approved_at IS NULL);

-- Backfill zero-cost P&L events with correct WAC from purchase orders
DO $$
DECLARE
  v_rec RECORD;
  v_wac NUMERIC;
  v_new_cost_out NUMERIC;
  v_new_pnl NUMERIC;
  v_updated_count INT := 0;
BEGIN
  FOR v_rec IN 
    SELECT rpe.id, rpe.asset_code, rpe.sell_qty, rpe.proceeds_usdt_net, rpe.conversion_id
    FROM realized_pnl_events rpe
    WHERE rpe.avg_cost_at_sale = 0 AND rpe.cost_out_usdt = 0
  LOOP
    SELECT SUM(poi.quantity * po.market_rate_usdt) / NULLIF(SUM(poi.quantity), 0)
    INTO v_wac
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.purchase_order_id
    JOIN products p ON p.id = poi.product_id
    WHERE po.status = 'COMPLETED' AND p.code = v_rec.asset_code;

    IF v_wac IS NULL OR v_wac <= 0 THEN
      CONTINUE;
    END IF;

    v_new_cost_out := v_rec.sell_qty * v_wac;
    v_new_pnl := v_rec.proceeds_usdt_net - v_new_cost_out;

    UPDATE realized_pnl_events
    SET avg_cost_at_sale = v_wac,
        cost_out_usdt = v_new_cost_out,
        realized_pnl_usdt = v_new_pnl
    WHERE id = v_rec.id;

    UPDATE erp_product_conversions
    SET cost_out_usdt = v_new_cost_out,
        realized_pnl_usdt = v_new_pnl
    WHERE id = v_rec.conversion_id;

    UPDATE conversion_journal_entries
    SET usdt_delta = -v_new_cost_out
    WHERE conversion_id = v_rec.conversion_id AND line_type = 'COGS';

    UPDATE conversion_journal_entries
    SET usdt_delta = v_new_pnl
    WHERE conversion_id = v_rec.conversion_id AND line_type = 'REALIZED_PNL';

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfilled % zero-cost P&L events', v_updated_count;
END $$;

-- Re-enable the validation trigger
ALTER TABLE erp_product_conversions ENABLE TRIGGER trg_validate_conversion_approval;