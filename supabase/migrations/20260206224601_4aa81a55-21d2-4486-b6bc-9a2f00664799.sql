
DROP FUNCTION IF EXISTS public.get_transactions_with_closing_balance(uuid, int, int);
DROP FUNCTION IF EXISTS public.get_transactions_with_closing_balance(uuid, text, int, int);

CREATE OR REPLACE FUNCTION public.get_transactions_with_closing_balance(
  p_bank_account_id UUID DEFAULT NULL,
  p_transaction_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  transaction_date DATE,
  created_at TIMESTAMPTZ,
  bank_account_id UUID,
  account_name TEXT,
  bank_name TEXT,
  transaction_type TEXT,
  amount NUMERIC,
  description TEXT,
  category TEXT,
  reference_number TEXT,
  related_account_name TEXT,
  closing_balance NUMERIC,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  -- Get total count with filters
  SELECT COUNT(*) INTO v_total_count 
  FROM public.bank_transactions bt
  WHERE (p_bank_account_id IS NULL OR bt.bank_account_id = p_bank_account_id)
    AND (p_transaction_type IS NULL OR bt.transaction_type = p_transaction_type);

  RETURN QUERY
  WITH all_tx AS (
    SELECT 
      bt.id,
      bt.transaction_date,
      bt.created_at,
      bt.bank_account_id,
      ba.account_name,
      ba.bank_name,
      bt.transaction_type,
      bt.amount,
      bt.description,
      bt.category,
      bt.reference_number,
      bt.related_account_name,
      ba.balance AS current_balance,
      COALESCE(
        SUM(
          CASE 
            WHEN bt.transaction_type IN ('INCOME', 'CREDIT') THEN bt.amount
            ELSE -bt.amount
          END
        ) OVER (
          PARTITION BY bt.bank_account_id 
          ORDER BY bt.transaction_date DESC, bt.created_at DESC
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),
        0
      ) AS sum_after
    FROM public.bank_transactions bt
    JOIN public.bank_accounts ba ON ba.id = bt.bank_account_id
    WHERE (p_bank_account_id IS NULL OR bt.bank_account_id = p_bank_account_id)
  )
  SELECT 
    ot.id,
    ot.transaction_date,
    ot.created_at,
    ot.bank_account_id,
    ot.account_name,
    ot.bank_name,
    ot.transaction_type,
    ot.amount,
    ot.description,
    ot.category,
    ot.reference_number,
    ot.related_account_name,
    (ot.current_balance - ot.sum_after)::NUMERIC AS closing_balance,
    v_total_count
  FROM all_tx ot
  WHERE (p_transaction_type IS NULL OR ot.transaction_type = p_transaction_type)
  ORDER BY ot.transaction_date DESC, ot.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
