
-- Backfill verified buyer names in terminal_sales_sync from sales_orders
UPDATE terminal_sales_sync tss
SET counterparty_name = so.client_name,
    order_data = jsonb_set(tss.order_data::jsonb, '{verified_name}', to_jsonb(so.client_name))
FROM sales_orders so
WHERE so.order_number = tss.binance_order_number
AND (tss.counterparty_name LIKE '%***%' OR tss.counterparty_name IS NULL);
