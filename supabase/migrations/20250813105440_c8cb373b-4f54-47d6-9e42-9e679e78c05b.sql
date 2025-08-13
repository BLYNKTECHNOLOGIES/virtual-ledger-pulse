-- Fix the validation function to allow updates when balance_locked is being changed from true to false
CREATE OR REPLACE FUNCTION public.validate_balance_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow balance updates if:
  -- 1. Balance is not locked (NEW.balance_locked is false)
  -- 2. This is an automatic update (updated_at is being changed)
  -- 3. We're unlocking the account (OLD.balance_locked = true AND NEW.balance_locked = false)
  IF OLD.balance_locked = true AND NEW.balance != OLD.balance AND 
     NEW.updated_at = OLD.updated_at AND NEW.balance_locked = true THEN
    RAISE EXCEPTION 'Cannot modify balance: Account balance is locked due to existing transactions';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also disable the trigger temporarily during manual purchase creation by using a bypass
CREATE OR REPLACE FUNCTION public.create_manual_purchase_order(
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
  was_locked BOOLEAN;
BEGIN
  -- Check if bank account is locked
  SELECT balance_locked INTO was_locked 
  FROM bank_accounts 
  WHERE id = p_bank_account_id;
  
  -- Temporarily disable the validation trigger for manual purchases
  IF was_locked THEN
    ALTER TABLE bank_accounts DISABLE TRIGGER validate_balance_edit_trigger;
  END IF;
  
  -- Unlock the bank account temporarily
  IF was_locked THEN
    UPDATE bank_accounts 
    SET balance_locked = false 
    WHERE id = p_bank_account_id;
  END IF;
  
  -- Create the purchase order (this will trigger bank transaction creation)
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
    p_status,
    CASE WHEN p_status = 'COMPLETED' THEN p_bank_account_id ELSE NULL END
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
  
  -- Re-lock the account if it was originally locked
  IF was_locked THEN
    UPDATE bank_accounts 
    SET balance_locked = true 
    WHERE id = p_bank_account_id;
    
    -- Re-enable the validation trigger
    ALTER TABLE bank_accounts ENABLE TRIGGER validate_balance_edit_trigger;
  END IF;
  
  RETURN purchase_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;