CREATE INDEX IF NOT EXISTS idx_purchase_order_items_purchase_order_id ON public.purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_payment_splits_order_id ON public.purchase_order_payment_splits (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_reference_number ON public.bank_transactions (reference_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at ON public.purchase_orders (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_sales_order_payment_splits_order_id ON public.sales_order_payment_splits (sales_order_id);
ANALYZE public.purchase_order_items;
ANALYZE public.purchase_order_payment_splits;
ANALYZE public.bank_transactions;
ANALYZE public.purchase_orders;