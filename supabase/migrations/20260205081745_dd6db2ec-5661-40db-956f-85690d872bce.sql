-- Update the process_platform_fee_deduction function to also insert into wallet_fee_deductions
-- This ensures fee tracking is visible in the Financials page

CREATE OR REPLACE FUNCTION public.process_platform_fee_deduction(
  p_order_id UUID,
  p_order_type TEXT, -- 'SALES_ORDER' or 'PURCHASE_ORDER'
  p_wallet_id UUID,
  p_fee_amount NUMERIC,
  p_order_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_balance NUMERIC;
  v_wallet_name TEXT;
  v_wallet_fee_percentage NUMERIC;
  v_existing_fee_tx UUID;
  v_fee_tx_id UUID;
  v_result JSONB;
  v_order_type_short TEXT;
  v_gross_amount NUMERIC;
BEGIN
  -- Validate inputs
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;
  
  IF p_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet ID is required';
  END IF;
  
  IF p_fee_amount IS NULL OR p_fee_amount <= 0 THEN
    -- No fee to process, return success
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No fee to process',
      'fee_amount', 0
    );
  END IF;
  
  IF p_order_type NOT IN ('SALES_ORDER', 'PURCHASE_ORDER') THEN
    RAISE EXCEPTION 'Invalid order type. Must be SALES_ORDER or PURCHASE_ORDER';
  END IF;
  
  -- IDEMPOTENCY CHECK: Check if fee transaction already exists for this order
  SELECT id INTO v_existing_fee_tx
  FROM public.wallet_transactions
  WHERE reference_id = p_order_id
    AND reference_type = p_order_type || '_FEE'
  LIMIT 1;
  
  IF v_existing_fee_tx IS NOT NULL THEN
    -- Fee already processed, return success without double-deducting
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Fee already processed for this order',
      'fee_transaction_id', v_existing_fee_tx,
      'already_processed', true
    );
  END IF;
  
  -- Validate wallet exists and is active
  SELECT current_balance, wallet_name, fee_percentage 
  INTO v_wallet_balance, v_wallet_name, v_wallet_fee_percentage
  FROM public.wallets
  WHERE id = p_wallet_id AND is_active = true;
  
  IF v_wallet_name IS NULL THEN
    RAISE EXCEPTION 'Wallet not found or inactive';
  END IF;
  
  -- Get order gross amount based on order type
  v_order_type_short := CASE WHEN p_order_type = 'SALES_ORDER' THEN 'SALES' ELSE 'PURCHASE' END;
  
  IF p_order_type = 'SALES_ORDER' THEN
    SELECT total_amount INTO v_gross_amount
    FROM public.sales_orders
    WHERE id = p_order_id;
  ELSE
    SELECT total_amount INTO v_gross_amount
    FROM public.purchase_orders
    WHERE id = p_order_id;
  END IF;
  
  -- Create FEE wallet transaction with proper audit trail
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
    p_fee_amount,
    p_order_type || '_FEE',  -- 'SALES_ORDER_FEE' or 'PURCHASE_ORDER_FEE'
    p_order_id,
    'Platform fee for ' || 
      CASE WHEN p_order_type = 'SALES_ORDER' THEN 'sales' ELSE 'purchase' END ||
      ' order' || 
      COALESCE(' #' || p_order_number, ''),
    v_wallet_balance,
    v_wallet_balance - p_fee_amount
  ) RETURNING id INTO v_fee_tx_id;
  
  -- Also insert into wallet_fee_deductions for the Financials page tracking
  INSERT INTO public.wallet_fee_deductions (
    wallet_id,
    order_id,
    order_type,
    order_number,
    gross_amount,
    fee_percentage,
    fee_amount,
    net_amount,
    fee_usdt_amount,
    fee_inr_value_at_buying_price
  ) VALUES (
    p_wallet_id,
    p_order_id,
    v_order_type_short,
    p_order_number,
    COALESCE(v_gross_amount, 0),
    COALESCE(v_wallet_fee_percentage, 0),
    0, -- INR fee amount (deprecated, using USDT now)
    COALESCE(v_gross_amount, 0), -- net is same since we deduct from wallet
    p_fee_amount, -- Fee in USDT
    0 -- Will be calculated in reporting using average cost
  );
  
  -- Note: Wallet balance is updated by the update_wallet_balance trigger
  
  -- Return success with details
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Platform fee deducted successfully',
    'fee_transaction_id', v_fee_tx_id,
    'wallet_id', p_wallet_id,
    'wallet_name', v_wallet_name,
    'fee_amount', p_fee_amount,
    'balance_before', v_wallet_balance,
    'balance_after', v_wallet_balance - p_fee_amount,
    'already_processed', false
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.process_platform_fee_deduction TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_platform_fee_deduction TO anon;