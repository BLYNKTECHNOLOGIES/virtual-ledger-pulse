
-- Add missing FK indexes on high-traffic tables
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON public.wallet_transactions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_wallet_id ON public.sales_orders (wallet_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_payment_method_id ON public.sales_orders (sales_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_bank_account_id ON public.purchase_orders (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_terminal_sync_id ON public.purchase_orders (terminal_sync_id);
CREATE INDEX IF NOT EXISTS idx_p2p_auto_reply_log_rule_id ON public.p2p_auto_reply_log (rule_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sales_sync_client_id ON public.terminal_sales_sync (client_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sales_sync_sales_order_id ON public.terminal_sales_sync (sales_order_id);
