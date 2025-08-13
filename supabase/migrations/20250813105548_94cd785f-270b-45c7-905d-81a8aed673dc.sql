-- Use a simple approach: create a manual purchase helper that bypasses triggers entirely
CREATE OR REPLACE FUNCTION public.create_manual_purchase_simple(
  p_order_number TEXT,
  p_supplier_name TEXT,
  p_order_date DATE,
  p_description TEXT,
  p_total_amount NUMERIC,
  p_contact_number TEXT,
  p_status TEXT,
  p_bank_account_id UUID,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_credit_wallet_id UUID DEFAULT NULL
) RETURNS UUID AS $$
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
    -- Manually create bank transaction
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
    
    -- Update bank balance manually (avoiding the trigger)
    UPDATE public.bank_accounts 
    SET balance = balance - p_total_amount,
        updated_at = now()
    WHERE id = p_bank_account_id;
    
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
$$ LANGUAGE plpgsql SECURITY DEFINER;