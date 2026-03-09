
-- Deploy remaining debug functions that failed in first migration

CREATE OR REPLACE FUNCTION public.debug_duplicate_bank_transactions()
RETURNS TABLE(
  reference_number text,
  category text,
  duplicate_count bigint,
  total_amount numeric,
  per_entry_amount numeric,
  bank_account_id uuid,
  earliest timestamptz,
  latest timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT bt.reference_number, bt.category, COUNT(*),
    SUM(bt.amount), MIN(bt.amount),
    bt.bank_account_id, MIN(bt.created_at), MAX(bt.created_at)
  FROM bank_transactions bt
  WHERE bt.reference_number IS NOT NULL
  GROUP BY bt.reference_number, bt.category, bt.bank_account_id
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC;
$$;

CREATE OR REPLACE FUNCTION public.debug_orphaned_bank_transactions()
RETURNS TABLE(
  id uuid, reference_number text, category text, transaction_type text,
  amount numeric, bank_account_id uuid, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT bt.id, bt.reference_number, bt.category, bt.transaction_type,
    bt.amount, bt.bank_account_id, bt.created_at
  FROM bank_transactions bt
  WHERE (bt.reference_number LIKE 'SO-TRM-%'
    AND NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.order_number = bt.reference_number))
  OR (bt.reference_number LIKE 'PO-%'
    AND NOT EXISTS (SELECT 1 FROM purchase_orders po WHERE po.order_number = bt.reference_number))
  ORDER BY bt.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.debug_full_reconciliation()
RETURNS TABLE(
  entity_type text, entity_id text, entity_name text,
  asset_code text, tracked_balance numeric, calculated_balance numeric, drift numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 'BANK'::text, ba.id::text, ba.account_name, NULL::text,
    ba.balance,
    COALESCE(SUM(CASE WHEN bt.transaction_type IN ('INCOME','OPENING_BALANCE') THEN bt.amount
         WHEN bt.transaction_type IN ('EXPENSE','TRANSFER') THEN -bt.amount ELSE 0 END), 0),
    ba.balance - COALESCE(SUM(CASE WHEN bt.transaction_type IN ('INCOME','OPENING_BALANCE') THEN bt.amount
         WHEN bt.transaction_type IN ('EXPENSE','TRANSFER') THEN -bt.amount ELSE 0 END), 0)
  FROM bank_accounts ba
  LEFT JOIN bank_transactions bt ON bt.bank_account_id = ba.id
  GROUP BY ba.id, ba.account_name, ba.balance
  HAVING ABS(ba.balance - COALESCE(SUM(CASE WHEN bt.transaction_type IN ('INCOME','OPENING_BALANCE') THEN bt.amount
         WHEN bt.transaction_type IN ('EXPENSE','TRANSFER') THEN -bt.amount ELSE 0 END), 0)) > 0.01;

  RETURN QUERY
  SELECT 'WALLET'::text, w.id::text, w.wallet_name, NULL::text,
    w.current_balance,
    COALESCE(SUM(CASE WHEN wt.transaction_type IN ('CREDIT','TRANSFER_IN') THEN wt.amount
         WHEN wt.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN -wt.amount ELSE 0 END), 0),
    w.current_balance - COALESCE(SUM(CASE WHEN wt.transaction_type IN ('CREDIT','TRANSFER_IN') THEN wt.amount
         WHEN wt.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN -wt.amount ELSE 0 END), 0)
  FROM wallets w
  LEFT JOIN wallet_transactions wt ON wt.wallet_id = w.id
  GROUP BY w.id, w.wallet_name, w.current_balance
  HAVING ABS(w.current_balance - COALESCE(SUM(CASE WHEN wt.transaction_type IN ('CREDIT','TRANSFER_IN') THEN wt.amount
         WHEN wt.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN -wt.amount ELSE 0 END), 0)) > 0.01;

  RETURN QUERY
  SELECT 'WALLET_ASSET'::text, wab.wallet_id::text, wl.wallet_name, wab.asset_code,
    wab.balance,
    COALESCE(SUM(CASE WHEN wt.transaction_type IN ('CREDIT','TRANSFER_IN') THEN wt.amount
         WHEN wt.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN -wt.amount ELSE 0 END), 0),
    wab.balance - COALESCE(SUM(CASE WHEN wt.transaction_type IN ('CREDIT','TRANSFER_IN') THEN wt.amount
         WHEN wt.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN -wt.amount ELSE 0 END), 0)
  FROM wallet_asset_balances wab
  JOIN wallets wl ON wl.id = wab.wallet_id
  LEFT JOIN wallet_transactions wt ON wt.wallet_id = wab.wallet_id AND wt.asset_code = wab.asset_code
  GROUP BY wab.wallet_id, wl.wallet_name, wab.asset_code, wab.balance
  HAVING ABS(wab.balance - COALESCE(SUM(CASE WHEN wt.transaction_type IN ('CREDIT','TRANSFER_IN') THEN wt.amount
         WHEN wt.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN -wt.amount ELSE 0 END), 0)) > 0.01;
END;
$$;

CREATE OR REPLACE FUNCTION public.debug_client_usage_drift()
RETURNS TABLE(
  client_id uuid, client_name text, tracked_usage numeric,
  calculated_usage numeric, drift numeric, monthly_limit numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id, c.name, COALESCE(c.current_month_used, 0),
    COALESCE(SUM(so.total_amount), 0),
    COALESCE(c.current_month_used, 0) - COALESCE(SUM(so.total_amount), 0),
    c.monthly_limit
  FROM clients c
  LEFT JOIN sales_orders so ON (so.client_id = c.id OR so.client_name = c.name)
    AND so.status = 'COMPLETED'
    AND date_trunc('month', so.created_at) = date_trunc('month', now())
  WHERE c.is_deleted = false AND c.monthly_limit > 0
  GROUP BY c.id, c.name, c.current_month_used, c.monthly_limit
  HAVING ABS(COALESCE(c.current_month_used, 0) - COALESCE(SUM(so.total_amount), 0)) > 1
  ORDER BY ABS(COALESCE(c.current_month_used, 0) - COALESCE(SUM(so.total_amount), 0)) DESC;
$$;

CREATE OR REPLACE FUNCTION public.debug_payment_method_drift()
RETURNS TABLE(
  pm_id uuid, pm_name text, tracked_usage numeric,
  calculated_usage numeric, drift numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT spm.id, COALESCE(spm.nickname, spm.type),
    COALESCE(spm.current_usage, 0),
    COALESCE(SUM(so.total_amount), 0),
    COALESCE(spm.current_usage, 0) - COALESCE(SUM(so.total_amount), 0)
  FROM sales_payment_methods spm
  LEFT JOIN sales_orders so ON so.sales_payment_method_id = spm.id
    AND so.status = 'COMPLETED'
    AND so.created_at::date = CURRENT_DATE
  WHERE spm.is_active = true AND spm.payment_limit > 0
  GROUP BY spm.id, spm.nickname, spm.type, spm.current_usage
  HAVING ABS(COALESCE(spm.current_usage, 0) - COALESCE(SUM(so.total_amount), 0)) > 1
  ORDER BY ABS(COALESCE(spm.current_usage, 0) - COALESCE(SUM(so.total_amount), 0)) DESC;
$$;
