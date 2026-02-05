-- Create a function to fetch transactions with running closing balance
-- This calculates the closing balance after each transaction, per account

CREATE OR REPLACE FUNCTION public.get_transactions_with_closing_balance(
  p_bank_account_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  transaction_date TIMESTAMPTZ,
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
  -- Get total count first
  IF p_bank_account_id IS NULL THEN
    SELECT COUNT(*) INTO v_total_count FROM public.bank_transactions;
  ELSE
    SELECT COUNT(*) INTO v_total_count FROM public.bank_transactions WHERE bank_transactions.bank_account_id = p_bank_account_id;
  END IF;

  RETURN QUERY
  WITH ordered_transactions AS (
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
      ba.balance AS current_account_balance,
      ROW_NUMBER() OVER (
        PARTITION BY bt.bank_account_id 
        ORDER BY bt.transaction_date DESC, bt.created_at DESC
      ) AS rn
    FROM public.bank_transactions bt
    JOIN public.bank_accounts ba ON ba.id = bt.bank_account_id
    WHERE (p_bank_account_id IS NULL OR bt.bank_account_id = p_bank_account_id)
  ),
  with_closing_balance AS (
    SELECT 
      ot.*,
      -- Calculate closing balance: current balance - sum of all transactions BEFORE this one in time (reversed)
      ot.current_account_balance - COALESCE(
        SUM(
          CASE 
            WHEN ot2.rn < ot.rn THEN
              CASE 
                WHEN ot2.transaction_type IN ('INCOME', 'CREDIT') THEN ot2.amount
                ELSE -ot2.amount
              END
            ELSE 0
          END
        ) OVER (PARTITION BY ot.bank_account_id ORDER BY ot.rn),
        0
      ) AS closing_balance
    FROM ordered_transactions ot
    LEFT JOIN ordered_transactions ot2 ON ot.bank_account_id = ot2.bank_account_id
  )
  SELECT DISTINCT
    wcb.id,
    wcb.transaction_date,
    wcb.created_at,
    wcb.bank_account_id,
    wcb.account_name,
    wcb.bank_name,
    wcb.transaction_type,
    wcb.amount,
    wcb.description,
    wcb.category,
    wcb.reference_number,
    wcb.related_account_name,
    wcb.closing_balance,
    v_total_count AS total_count
  FROM with_closing_balance wcb
  ORDER BY wcb.transaction_date DESC, wcb.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;