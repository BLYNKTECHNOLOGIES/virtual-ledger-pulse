-- Fix: Set order_status to 'completed' instead of status column
-- Manual purchase entries must be created directly in completed state
CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_v2(
  p_order_number TEXT,
  p_supplier_name TEXT,
  p_order_date DATE,
  p_description TEXT DEFAULT NULL,
  p_quantity NUMERIC DEFAULT 0,
  p_unit_price NUMERIC DEFAULT 0,
  p_total_amount NUMERIC DEFAULT 0,
  p_product_id UUID DEFAULT NULL,
  p_bank_account_id UUID DEFAULT NULL,
  p_contact_number TEXT DEFAULT NULL,
  p_credit_wallet_id UUID DEFAULT NULL,
  p_tds_option TEXT DEFAULT 'none',
  p_pan_number TEXT DEFAULT NULL,
  p_fee_percentage NUMERIC DEFAULT NULL,
  p_is_off_market BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purchase_order_id UUID;
  v_bank_balance NUMERIC;
  v_tds_rate NUMERIC := 0;
  v_tds_amount NUMERIC := 0;
  v_net_payable_amount NUMERIC;
  v_fee_amount NUMERIC := 0;
  v_net_credit_quantity NUMERIC;
  v_wallet_balance NUMERIC;
  v_financial_year TEXT;
BEGIN
  -- Determine TDS rate based on option
  IF p_tds_option = '1%' THEN
    v_tds_rate := 1;
    IF p_pan_number IS NULL OR p_pan_number = '' THEN
      RAISE EXCEPTION 'PAN number is required for 1%% TDS';
    END IF;
  ELSIF p_tds_option = '20%' THEN
    v_tds_rate := 20;
  END IF;
  
  -- Calculate TDS amount
  v_tds_amount := p_total_amount * (v_tds_rate / 100);
  v_net_payable_amount := p_total_amount - v_tds_amount;
  
  -- Calculate platform fee if not off-market
  IF NOT p_is_off_market AND p_fee_percentage IS NOT NULL AND p_fee_percentage > 0 THEN
    v_fee_amount := p_quantity * (p_fee_percentage / 100);
  END IF;
  
  -- Calculate net credit quantity
  v_net_credit_quantity := p_quantity - v_fee_amount;
  
  -- Check bank account balance
  SELECT ba.balance INTO v_bank_balance 
  FROM public.bank_accounts ba
  WHERE ba.id = p_bank_account_id AND ba.status = 'ACTIVE';
  
  IF v_bank_balance IS NULL THEN
    RAISE EXCEPTION 'Bank account not found or inactive';
  END IF;
  
  IF v_bank_balance < v_net_payable_amount THEN
    RAISE EXCEPTION 'Insufficient bank balance. Available: %, Required: %', v_bank_balance, v_net_payable_amount;
  END IF;
  
  -- Determine financial year for TDS
  SELECT CASE 
    WHEN EXTRACT(MONTH FROM p_order_date) >= 4 THEN 
      EXTRACT(YEAR FROM p_order_date)::TEXT || '-' || (EXTRACT(YEAR FROM p_order_date) + 1)::TEXT
    ELSE 
      (EXTRACT(YEAR FROM p_order_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM p_order_date)::TEXT
  END INTO v_financial_year;
  
  -- Create the purchase order with order_status = 'completed' (bypasses workflow)
  INSERT INTO public.purchase_orders (
    order_number,
    supplier_name, 
    order_date,
    description,
    total_amount,
    contact_number,
    status,
    order_status,
    total_paid,
    bank_account_id,
    tds_applied,
    pan_number,
    tds_amount,
    net_payable_amount,
    quantity,
    price_per_unit,
    is_off_market,
    fee_percentage,
    fee_amount,
    net_amount
  ) VALUES (
    p_order_number,
    p_supplier_name,
    p_order_date,
    p_description,
    p_total_amount,
    p_contact_number,
    'COMPLETED',
    'completed',
    v_net_payable_amount,
    p_bank_account_id,
    v_tds_rate > 0,
    CASE WHEN v_tds_rate > 0 THEN p_pan_number ELSE NULL END,
    v_tds_amount,
    v_net_payable_amount,
    p_quantity,
    p_unit_price,
    p_is_off_market,
    COALESCE(p_fee_percentage, 0),
    v_fee_amount,
    v_net_credit_quantity
  ) RETURNING id INTO v_purchase_order_id;
  
  -- Create purchase order item
  INSERT INTO public.purchase_order_items (
    purchase_order_id,
    product_id,
    quantity,
    unit_price,
    total_price
  ) VALUES (
    v_purchase_order_id,
    p_product_id,
    p_quantity,
    p_unit_price,
    p_total_amount
  );
  
  -- Create bank transaction for net payable amount
  INSERT INTO public.bank_transactions (
    bank_account_id,
    transaction_type,
    amount,
    description,
    reference_number,
    transaction_date,
    category,
    related_account_name
  ) VALUES (
    p_bank_account_id,
    'EXPENSE',
    v_net_payable_amount,
    'Manual Purchase Order - ' || p_order_number || ' - ' || p_supplier_name || 
    CASE WHEN v_tds_rate > 0 THEN ' (TDS: ' || v_tds_rate || '%)' ELSE '' END,
    p_order_number,
    p_order_date,
    'Purchase',
    p_supplier_name
  );
  
  -- Update bank account balance
  UPDATE public.bank_accounts 
  SET balance = balance - v_net_payable_amount,
      updated_at = NOW()
  WHERE id = p_bank_account_id;
  
  -- Create TDS record if TDS was applied
  IF v_tds_rate > 0 THEN
    INSERT INTO public.tds_records (
      purchase_order_id,
      pan_number,
      total_amount,
      tds_rate,
      tds_amount,
      net_payable_amount,
      deduction_date,
      financial_year
    ) VALUES (
      v_purchase_order_id,
      p_pan_number,
      p_total_amount,
      v_tds_rate,
      v_tds_amount,
      v_net_payable_amount,
      p_order_date,
      v_financial_year
    );
  END IF;

  -- Handle USDT wallet credit if specified
  IF p_credit_wallet_id IS NOT NULL THEN
    -- Get current wallet balance
    SELECT w.current_balance INTO v_wallet_balance 
    FROM public.wallets w
    WHERE w.id = p_credit_wallet_id;
    
    IF v_wallet_balance IS NULL THEN
      RAISE EXCEPTION 'Wallet not found';
    END IF;
    
    -- Create wallet transaction
    INSERT INTO public.wallet_transactions (
      wallet_id,
      transaction_type,
      quantity,
      unit_price,
      total_amount,
      reference_id,
      notes,
      purchase_order_id
    ) VALUES (
      p_credit_wallet_id,
      'CREDIT',
      v_net_credit_quantity,
      p_unit_price,
      p_total_amount,
      p_order_number,
      'Manual Purchase - ' || p_supplier_name || 
      CASE WHEN v_fee_amount > 0 THEN ' (Fee: ' || v_fee_amount || ')' ELSE '' END,
      v_purchase_order_id
    );
    
    -- Update wallet balance
    UPDATE public.wallets 
    SET current_balance = current_balance + v_net_credit_quantity,
        updated_at = NOW()
    WHERE id = p_credit_wallet_id;
  ELSE
    -- Non-wallet stock transaction
    INSERT INTO public.stock_transactions (
      product_id,
      transaction_type,
      quantity,
      unit_price,
      total_amount,
      reference_id,
      notes
    ) VALUES (
      p_product_id,
      'PURCHASE',
      v_net_credit_quantity,
      p_unit_price,
      p_total_amount,
      p_order_number,
      'Manual Purchase - ' || p_supplier_name
    );
  END IF;

  RETURN v_purchase_order_id;
END;
$$;