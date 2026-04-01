
ALTER TABLE purchase_orders DISABLE TRIGGER trg_validate_pan_purchase_orders;
ALTER TABLE purchase_orders DISABLE TRIGGER trg_validate_po_amount;
ALTER TABLE purchase_orders DISABLE TRIGGER purchase_order_status_change_trigger;

UPDATE purchase_orders
SET effective_usdt_qty  = quantity * COALESCE(market_rate_usdt, 1),
    effective_usdt_rate = CASE
      WHEN quantity * COALESCE(market_rate_usdt, 1) > 0
      THEN total_amount / (quantity * COALESCE(market_rate_usdt, 1))
      ELSE NULL END
WHERE effective_usdt_qty IS NULL;

ALTER TABLE purchase_orders ENABLE TRIGGER trg_validate_pan_purchase_orders;
ALTER TABLE purchase_orders ENABLE TRIGGER trg_validate_po_amount;
ALTER TABLE purchase_orders ENABLE TRIGGER purchase_order_status_change_trigger;

ALTER TABLE sales_orders DISABLE TRIGGER create_pending_settlement_trigger;
ALTER TABLE sales_orders DISABLE TRIGGER set_settlement_status_trigger;
ALTER TABLE sales_orders DISABLE TRIGGER trg_auto_fill_client_id;
ALTER TABLE sales_orders DISABLE TRIGGER trg_compute_sales_net_amount;
ALTER TABLE sales_orders DISABLE TRIGGER trg_reject_blocked_phone_sales;
ALTER TABLE sales_orders DISABLE TRIGGER trg_update_client_monthly_usage;
ALTER TABLE sales_orders DISABLE TRIGGER trg_update_client_monthly_usage_on_update;
ALTER TABLE sales_orders DISABLE TRIGGER trigger_cleanup_orphan_client_on_sales_order_delete;
ALTER TABLE sales_orders DISABLE TRIGGER trigger_cleanup_wallet_transactions_on_sales_order_delete;
ALTER TABLE sales_orders DISABLE TRIGGER trigger_create_client_onboarding_approval;
ALTER TABLE sales_orders DISABLE TRIGGER trigger_create_sales_bank_transaction;
ALTER TABLE sales_orders DISABLE TRIGGER trigger_create_sales_stock_transaction;
ALTER TABLE sales_orders DISABLE TRIGGER validate_sales_order_stock_trigger;

UPDATE sales_orders
SET effective_usdt_qty  = quantity * COALESCE(market_rate_usdt, 1),
    effective_usdt_rate = CASE
      WHEN quantity * COALESCE(market_rate_usdt, 1) > 0
      THEN total_amount / (quantity * COALESCE(market_rate_usdt, 1))
      ELSE NULL END
WHERE effective_usdt_qty IS NULL;

ALTER TABLE sales_orders ENABLE TRIGGER create_pending_settlement_trigger;
ALTER TABLE sales_orders ENABLE TRIGGER set_settlement_status_trigger;
ALTER TABLE sales_orders ENABLE TRIGGER trg_auto_fill_client_id;
ALTER TABLE sales_orders ENABLE TRIGGER trg_compute_sales_net_amount;
ALTER TABLE sales_orders ENABLE TRIGGER trg_reject_blocked_phone_sales;
ALTER TABLE sales_orders ENABLE TRIGGER trg_update_client_monthly_usage;
ALTER TABLE sales_orders ENABLE TRIGGER trg_update_client_monthly_usage_on_update;
ALTER TABLE sales_orders ENABLE TRIGGER trigger_cleanup_orphan_client_on_sales_order_delete;
ALTER TABLE sales_orders ENABLE TRIGGER trigger_cleanup_wallet_transactions_on_sales_order_delete;
ALTER TABLE sales_orders ENABLE TRIGGER trigger_create_client_onboarding_approval;
ALTER TABLE sales_orders ENABLE TRIGGER trigger_create_sales_bank_transaction;
ALTER TABLE sales_orders ENABLE TRIGGER trigger_create_sales_stock_transaction;
ALTER TABLE sales_orders ENABLE TRIGGER validate_sales_order_stock_trigger;
