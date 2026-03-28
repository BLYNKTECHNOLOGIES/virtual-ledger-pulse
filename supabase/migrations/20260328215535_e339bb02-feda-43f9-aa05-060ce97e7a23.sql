-- A9: Add related_transaction_id to wallet_transactions for transfer pair linking
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS related_transaction_id uuid REFERENCES wallet_transactions(id);

-- A10: Composite index for the most common query pattern
CREATE INDEX IF NOT EXISTS idx_binance_orders_status_type_time 
ON binance_order_history(order_status, trade_type, create_time DESC);