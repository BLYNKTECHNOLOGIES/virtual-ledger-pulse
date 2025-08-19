-- Fix double balance update in manual purchase functions
-- Remove direct balance updates and let triggers handle it

CREATE OR REPLACE FUNCTION public.create_manual_purchase_simple(
  p_order_number text, 
  p_supplier_name text, 
  p_order_date date, 
  p_description text, 
  p_total_amount numeric, 
  p_contact_number text, 
  p_status text, 
  p_bank_account_id uuid, 
  p_product_id uuid, 
  p_quantity numeric, 
  p_unit_price numeric, 
  p_credit_wallet_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  purchase_order_id UUID;
BEGIN
  -- Create the purchase order WITHOUT bank_account_id to avoid triggers
  INSERT INTO public.purchase_orders (
    order_number,
    supplier_name, 
    order_date,
    description,
    total_amount,
    contact_number,
    status
  ) VALUES (
    p_order_number,
    p_supplier_name,
    p_order_date,
    p_description,
    p_total_amount,
    p_contact_number,
    p_status
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
  
  -- Only create bank transaction if COMPLETED
  IF p_status = 'COMPLETED' THEN
    -- Create bank transaction - let trigger handle balance update
    INSERT INTO public.bank_transactions (
      bank_account_id,
      transaction_type,
      amount,
      description,
      reference_number,
      transaction_date
    ) VALUES (
      p_bank_account_id,
      'EXPENSE',
      p_total_amount,
      'Manual Purchase Order - ' || p_order_number || ' - ' || p_supplier_name,
      p_order_number,
      p_order_date
    );
    
    -- REMOVED: Manual balance update - let trigger handle it
    -- This was causing double balance updates
    
    -- Now update the purchase order with bank_account_id
    UPDATE public.purchase_orders 
    SET bank_account_id = p_bank_account_id
    WHERE id = purchase_order_id;
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
    -- Update product stock for non-USDT products
    UPDATE public.products 
    SET current_stock_quantity = current_stock_quantity + p_quantity
    WHERE id = p_product_id;
  END IF;
  
  RETURN purchase_order_id;
END;
$function$;