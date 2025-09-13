-- Create enhanced manual purchase function with platform fees support
CREATE OR REPLACE FUNCTION public.create_manual_purchase_with_fees(
  p_order_number text, 
  p_supplier_name text, 
  p_order_date date, 
  p_total_amount numeric, 
  p_product_id uuid, 
  p_quantity numeric, 
  p_unit_price numeric, 
  p_bank_account_id uuid, 
  p_description text, 
  p_contact_number text DEFAULT NULL, 
  p_credit_wallet_id uuid DEFAULT NULL,
  p_platform_fees numeric DEFAULT NULL,
  p_platform_fees_wallet_id uuid DEFAULT NULL
) 
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  purchase_order_id UUID;
  current_balance NUMERIC;
  platform_fees_wallet_balance NUMERIC;
BEGIN
  -- Check bank account balance first
  SELECT balance INTO current_balance 
  FROM public.bank_accounts 
  WHERE id = p_bank_account_id AND status = 'ACTIVE';
  
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'Bank account not found or inactive';
  END IF;
  
  IF current_balance < p_total_amount THEN
    RAISE EXCEPTION 'Insufficient bank balance. Available: %, Required: %', current_balance, p_total_amount;
  END IF;

  -- Check platform fees wallet balance if fees are specified
  IF p_platform_fees IS NOT NULL AND p_platform_fees > 0 THEN
    IF p_platform_fees_wallet_id IS NULL THEN
      RAISE EXCEPTION 'Platform fees wallet is required when platform fees are specified';
    END IF;

    SELECT current_balance INTO platform_fees_wallet_balance
    FROM public.wallets 
    WHERE id = p_platform_fees_wallet_id AND is_active = true;
    
    IF platform_fees_wallet_balance IS NULL THEN
      RAISE EXCEPTION 'Platform fees wallet not found or inactive';
    END IF;
    
    IF platform_fees_wallet_balance < p_platform_fees THEN
      RAISE EXCEPTION 'Insufficient wallet balance for platform fees. Available: %, Required: %', platform_fees_wallet_balance, p_platform_fees;
    END IF;
  END IF;
  
  -- Create the purchase order
  INSERT INTO public.purchase_orders (
    order_number,
    supplier_name, 
    order_date,
    description,
    total_amount,
    contact_number,
    status,
    bank_account_id
  ) VALUES (
    p_order_number,
    p_supplier_name,
    p_order_date,
    p_description,
    p_total_amount,
    p_contact_number,
    'COMPLETED',
    p_bank_account_id
  ) RETURNING id INTO purchase_order_id;
  
  -- Create purchase order item
  INSERT INTO public.purchase_order_items (
    purchase_order_id,
    product_id,
    quantity,
    unit_price,
    total_price
  ) VALUES (
    purchase_order_id,
    p_product_id,
    p_quantity,
    p_unit_price,
    p_total_amount
  );
  
  -- Create bank transaction - let trigger handle balance update automatically
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
    p_total_amount,
    'Manual Purchase Order - ' || p_order_number || ' - ' || p_supplier_name,
    p_order_number,
    p_order_date,
    'Purchase',
    p_supplier_name
  );
  
  -- Handle platform fees deduction if specified
  IF p_platform_fees IS NOT NULL AND p_platform_fees > 0 AND p_platform_fees_wallet_id IS NOT NULL THEN
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
      p_platform_fees_wallet_id,
      'DEBIT',
      p_platform_fees,
      'PURCHASE_ORDER',
      purchase_order_id,
      'Platform fees for purchase order ' || p_order_number,
      0, -- Will be updated by trigger
      0  -- Will be updated by trigger
    );
  END IF;

  -- Handle USDT wallet credit if specified
  IF p_credit_wallet_id IS NOT NULL THEN
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
      p_credit_wallet_id,
      'CREDIT',
      p_quantity,
      'PURCHASE_ORDER',
      purchase_order_id,
      'USDT purchased via purchase order ' || p_order_number,
      0, -- Will be updated by trigger
      0  -- Will be updated by trigger
    );
  ELSE
    -- Create stock transaction to update product stock
    INSERT INTO public.stock_transactions (
      product_id,
      transaction_type,
      quantity,
      unit_price,
      total_amount,
      transaction_date,
      supplier_customer_name,
      reference_number,
      reason
    ) VALUES (
      p_product_id,
      'Purchase',
      p_quantity,
      p_unit_price,
      p_total_amount,
      p_order_date,
      p_supplier_name,
      p_order_number,
      'Manual Purchase Order Transaction'
    );
  END IF;
  
  RETURN purchase_order_id;
END;
$function$;