-- RPC function to handle wallet change on sales order edit
-- This reverses transaction from old wallet and deducts from new wallet idempotently

CREATE OR REPLACE FUNCTION public.handle_sales_order_wallet_change(
  p_order_id UUID,
  p_old_wallet_id UUID,
  p_new_wallet_id UUID,
  p_quantity NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guard_key TEXT;
  v_old_wallet_balance NUMERIC;
  v_new_wallet_balance NUMERIC;
  v_existing_transaction RECORD;
BEGIN
  -- Create idempotency guard key
  v_guard_key := 'sales_wallet_change_' || p_order_id::TEXT || '_' || p_old_wallet_id::TEXT || '_' || p_new_wallet_id::TEXT;
  
  -- Check if this change was already processed
  INSERT INTO public.reversal_guards (guard_key)
  VALUES (v_guard_key)
  ON CONFLICT (guard_key) DO NOTHING;
  
  IF NOT FOUND THEN
    -- Already processed, skip
    RAISE NOTICE 'Wallet change already processed for order %, skipping', p_order_id;
    RETURN TRUE;
  END IF;

  -- Get current balances
  SELECT current_balance INTO v_old_wallet_balance FROM public.wallets WHERE id = p_old_wallet_id;
  SELECT current_balance INTO v_new_wallet_balance FROM public.wallets WHERE id = p_new_wallet_id;
  
  -- Find and delete existing wallet transactions for this order from old wallet
  -- The trigger will automatically reverse the balance
  FOR v_existing_transaction IN
    SELECT id FROM public.wallet_transactions 
    WHERE reference_id = p_order_id 
    AND wallet_id = p_old_wallet_id
    AND reference_type IN ('SALES_ORDER', 'SALES_ORDER_FEE')
  LOOP
    DELETE FROM public.wallet_transactions WHERE id = v_existing_transaction.id;
  END LOOP;
  
  -- Get updated new wallet balance after potential changes
  SELECT current_balance INTO v_new_wallet_balance FROM public.wallets WHERE id = p_new_wallet_id;
  
  -- Create new debit transaction on new wallet
  INSERT INTO public.wallet_transactions (
    wallet_id,
    transaction_type,
    amount,
    reference_type,
    reference_id,
    description,
    balance_before,
    balance_after
  ) VALUES (
    p_new_wallet_id,
    'DEBIT',
    p_quantity,
    'SALES_ORDER',
    p_order_id,
    'USDT sold via sales order (wallet changed)',
    v_new_wallet_balance,
    v_new_wallet_balance - p_quantity
  );
  
  RETURN TRUE;
END;
$$;

-- RPC function to handle quantity change on same wallet
CREATE OR REPLACE FUNCTION public.handle_sales_order_quantity_change(
  p_order_id UUID,
  p_wallet_id UUID,
  p_old_quantity NUMERIC,
  p_new_quantity NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_difference NUMERIC;
  v_wallet_balance NUMERIC;
  v_existing_transaction RECORD;
BEGIN
  v_difference := p_new_quantity - p_old_quantity;
  
  -- If no difference, nothing to do
  IF v_difference = 0 THEN
    RETURN TRUE;
  END IF;
  
  -- Get current wallet balance
  SELECT current_balance INTO v_wallet_balance FROM public.wallets WHERE id = p_wallet_id;
  
  -- Find existing transaction and update it, or create adjustment
  SELECT * INTO v_existing_transaction 
  FROM public.wallet_transactions 
  WHERE reference_id = p_order_id 
  AND wallet_id = p_wallet_id
  AND reference_type = 'SALES_ORDER'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_existing_transaction.id IS NOT NULL THEN
    -- Delete old transaction (trigger reverses balance)
    DELETE FROM public.wallet_transactions WHERE id = v_existing_transaction.id;
    
    -- Get updated balance
    SELECT current_balance INTO v_wallet_balance FROM public.wallets WHERE id = p_wallet_id;
    
    -- Create new transaction with new quantity
    INSERT INTO public.wallet_transactions (
      wallet_id,
      transaction_type,
      amount,
      reference_type,
      reference_id,
      description,
      balance_before,
      balance_after
    ) VALUES (
      p_wallet_id,
      'DEBIT',
      p_new_quantity,
      'SALES_ORDER',
      p_order_id,
      'USDT sold via sales order (quantity adjusted)',
      v_wallet_balance,
      v_wallet_balance - p_new_quantity
    );
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.handle_sales_order_wallet_change(UUID, UUID, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_sales_order_quantity_change(UUID, UUID, NUMERIC, NUMERIC) TO authenticated;