
CREATE OR REPLACE FUNCTION public.debug_trace_order(p_order_number text)
RETURNS TABLE(
  layer text,
  record_id text,
  record_type text,
  amount numeric,
  details jsonb,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT 'SALES_ORDER'::text, so.id::text, so.status, so.total_amount,
    jsonb_build_object('client', so.client_name, 'product', so.product_id, 'wallet', so.wallet_id, 'payment_status', so.payment_status),
    so.created_at
  FROM sales_orders so WHERE so.order_number = p_order_number
  UNION ALL
  SELECT 'BANK_TX', bt.id::text, bt.transaction_type, bt.amount,
    jsonb_build_object('bank_account_id', bt.bank_account_id, 'category', bt.category, 'description', bt.description),
    bt.created_at
  FROM bank_transactions bt WHERE bt.reference_number = p_order_number
  UNION ALL
  SELECT 'WALLET_TX', wt.id::text, wt.transaction_type, wt.amount,
    jsonb_build_object('wallet_id', wt.wallet_id, 'asset_code', wt.asset_code, 'reference_type', wt.reference_type),
    wt.created_at
  FROM wallet_transactions wt WHERE wt.reference_id = (SELECT id FROM sales_orders WHERE order_number = p_order_number LIMIT 1)
  UNION ALL
  SELECT 'STOCK_TX', st.id::text, st.transaction_type, st.quantity,
    jsonb_build_object('product_id', st.product_id, 'unit_price', st.unit_price),
    st.created_at
  FROM stock_transactions st WHERE st.reference_number = p_order_number
  UNION ALL
  SELECT 'PURCHASE_ORDER', po.id::text, po.status, po.total_amount,
    jsonb_build_object('supplier', po.supplier_name, 'wallet', po.wallet_id),
    po.created_at
  FROM purchase_orders po WHERE po.order_number = p_order_number
  ORDER BY created_at;
$$;

CREATE OR REPLACE FUNCTION public.debug_erp_health_check()
RETURNS TABLE(
  check_name text,
  status text,
  count bigint,
  details text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT 'duplicate_bank_txns'::text,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ALERT' END,
    COUNT(*),
    'Bank transactions with duplicate reference_numbers'::text
  FROM (SELECT reference_number FROM bank_transactions WHERE reference_number IS NOT NULL GROUP BY reference_number, category HAVING COUNT(*) > 1) d
  UNION ALL
  SELECT 'orphaned_bank_txns',
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ALERT' END,
    COUNT(*),
    'Bank txns referencing deleted sales orders'
  FROM bank_transactions bt
  WHERE bt.reference_number LIKE 'SO-TRM-%'
  AND NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.order_number = bt.reference_number)
  UNION ALL
  SELECT 'negative_bank_balances',
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
    COUNT(*),
    'Bank accounts with negative balance'
  FROM bank_accounts WHERE balance < 0
  UNION ALL
  SELECT 'wallet_drift',
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ALERT' END,
    COUNT(*),
    'Wallets with balance != SUM(transactions)'
  FROM (SELECT w.id FROM wallets w
    LEFT JOIN wallet_transactions wt ON wt.wallet_id = w.id
    GROUP BY w.id, w.current_balance
    HAVING ABS(w.current_balance - COALESCE(SUM(
      CASE WHEN wt.transaction_type IN ('CREDIT','TRANSFER_IN') THEN wt.amount
           WHEN wt.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN -wt.amount ELSE 0 END
    ), 0)) > 0.01) x
  UNION ALL
  SELECT 'client_usage_drift',
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
    COUNT(*),
    'Clients with usage != SUM(completed sales this month)'
  FROM (SELECT c.id FROM clients c
    LEFT JOIN sales_orders so ON (so.client_id = c.id OR so.client_name = c.name)
      AND so.status = 'COMPLETED' AND date_trunc('month', so.created_at) = date_trunc('month', now())
    WHERE c.is_deleted = false AND c.monthly_limit > 0
    GROUP BY c.id, c.current_month_used
    HAVING ABS(COALESCE(c.current_month_used, 0) - COALESCE(SUM(so.total_amount), 0)) > 1) x;
$$;
