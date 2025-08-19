-- Fix the remaining functions that are causing double balance updates
-- Remove ALL direct balance updates and let triggers handle everything

-- Fix create_manual_purchase_complete - remove direct balance update
CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete(
  p_order_number text, 
  p_supplier_name text, 
  p_order_date date, 
  p_description text, 
  p_total_amount numeric, 
  p_contact_number text, 
  p_product_id uuid, 
  p_quantity numeric, 
  p_unit_price numeric, 
  p_bank_account_id uuid, 
  p_credit_wallet_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  purchase_order_id UUID;
  current_balance NUMERIC;
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
  
  -- REMOVED: Manual balance update - this was causing double counting!
  -- The trigger_update_bank_account_balance will handle it automatically
  
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