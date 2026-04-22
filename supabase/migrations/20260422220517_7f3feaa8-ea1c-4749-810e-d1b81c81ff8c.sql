-- Drop and recreate (return signature changes)
DROP FUNCTION IF EXISTS public.get_transactions_with_closing_balance(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_transactions_with_closing_balance(
  p_bank_account_id uuid DEFAULT NULL,
  p_transaction_type text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  transaction_date date,
  created_at timestamp with time zone,
  bank_account_id uuid,
  account_name text,
  bank_name text,
  transaction_type text,
  amount numeric,
  description text,
  category text,
  reference_number text,
  related_account_name text,
  closing_balance numeric,
  balance_before numeric,
  sequence_no bigint,
  is_reversed boolean,
  reverses_transaction_id uuid,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_count BIGINT;
BEGIN
  -- Count rows matching the same filter set
  SELECT COUNT(*) INTO v_total_count
  FROM public.bank_transactions bt
  WHERE (p_bank_account_id IS NULL OR bt.bank_account_id = p_bank_account_id)
    AND (
      p_transaction_type IS NULL
      OR (p_transaction_type = 'EXPENSE_ONLY' AND bt.transaction_type = 'EXPENSE' AND COALESCE(bt.category, '') NOT IN ('Purchase', 'Stock Purchase'))
      OR (p_transaction_type = 'INCOME_ONLY' AND bt.transaction_type = 'INCOME' AND COALESCE(bt.category, '') NOT IN ('Sales', 'Settlement', 'Stock Sale', 'Payment Gateway Settlement'))
      OR (p_transaction_type = 'PURCHASE' AND bt.transaction_type = 'EXPENSE' AND COALESCE(bt.category, '') IN ('Purchase', 'Stock Purchase'))
      OR (p_transaction_type = 'SALES' AND bt.transaction_type = 'INCOME' AND COALESCE(bt.category, '') IN ('Sales', 'Settlement', 'Stock Sale', 'Payment Gateway Settlement'))
      OR (p_transaction_type NOT IN ('EXPENSE_ONLY', 'INCOME_ONLY', 'PURCHASE', 'SALES') AND bt.transaction_type = p_transaction_type)
    );

  RETURN QUERY
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
    bt.balance_after  AS closing_balance,   -- stamped, immutable
    bt.balance_before AS balance_before,    -- stamped, immutable
    bt.sequence_no    AS sequence_no,
    bt.is_reversed    AS is_reversed,
    bt.reverses_transaction_id AS reverses_transaction_id,
    v_total_count
  FROM public.bank_transactions bt
  JOIN public.bank_accounts ba ON ba.id = bt.bank_account_id
  WHERE (p_bank_account_id IS NULL OR bt.bank_account_id = p_bank_account_id)
    AND (
      p_transaction_type IS NULL
      OR (p_transaction_type = 'EXPENSE_ONLY' AND bt.transaction_type = 'EXPENSE' AND COALESCE(bt.category, '') NOT IN ('Purchase', 'Stock Purchase'))
      OR (p_transaction_type = 'INCOME_ONLY' AND bt.transaction_type = 'INCOME' AND COALESCE(bt.category, '') NOT IN ('Sales', 'Settlement', 'Stock Sale', 'Payment Gateway Settlement'))
      OR (p_transaction_type = 'PURCHASE' AND bt.transaction_type = 'EXPENSE' AND COALESCE(bt.category, '') IN ('Purchase', 'Stock Purchase'))
      OR (p_transaction_type = 'SALES' AND bt.transaction_type = 'INCOME' AND COALESCE(bt.category, '') IN ('Sales', 'Settlement', 'Stock Sale', 'Payment Gateway Settlement'))
      OR (p_transaction_type NOT IN ('EXPENSE_ONLY', 'INCOME_ONLY', 'PURCHASE', 'SALES') AND bt.transaction_type = p_transaction_type)
    )
  ORDER BY
    CASE WHEN p_bank_account_id IS NOT NULL THEN bt.sequence_no END DESC NULLS LAST,
    bt.created_at DESC,
    bt.sequence_no DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;