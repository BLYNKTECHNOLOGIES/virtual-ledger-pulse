-- Create a function that completely bypasses bank transaction creation for manual entries
CREATE OR REPLACE FUNCTION public.create_manual_purchase_bypass(
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
  -- Create the purchase order WITHOUT status=COMPLETED to avoid triggers
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
    'PENDING', -- Always use PENDING to avoid bank transaction triggers
    NULL       -- No bank account ID to avoid triggers
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
      'USDT purchased via manual purchase order ' || p_order_number,
      0, -- Will be updated by trigger
      0  -- Will be updated by trigger
    );
  ELSE
    -- Update product stock for non-USDT products
    UPDATE public.products 
    SET current_stock_quantity = current_stock_quantity + p_quantity,
        updated_at = now()
    WHERE id = p_product_id;
  END IF;
  
  -- Now update the purchase order with the desired status and bank account
  -- This happens after stock/wallet updates to record the transaction properly
  UPDATE public.purchase_orders 
  SET 
    status = p_status,
    bank_account_id = p_bank_account_id,
    updated_at = now()
  WHERE id = purchase_order_id;
  
  RETURN purchase_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;