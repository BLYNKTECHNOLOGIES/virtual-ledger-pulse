-- Fix double deduction by removing manual balance update
-- The trigger update_bank_account_balance() already handles balance updates automatically

CREATE OR REPLACE FUNCTION create_manual_purchase_secure(
  p_order_number TEXT,
  p_supplier_name TEXT,
  p_order_date DATE,
  p_total_amount NUMERIC,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_bank_account_id UUID,
  p_description TEXT DEFAULT '',
  p_contact_number TEXT DEFAULT NULL,
  p_credit_wallet_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_purchase_order_id UUID;
  v_current_balance NUMERIC;
BEGIN
  -- Check bank account balance first
  SELECT balance INTO v_current_balance 
  FROM bank_accounts 
  WHERE id = p_bank_account_id;
  
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  
  IF v_current_balance < p_total_amount THEN
    RAISE EXCEPTION 'Insufficient funds in bank account. Current balance: %, Required: %', v_current_balance, p_total_amount;
  END IF;
  
  -- Create purchase order
  INSERT INTO purchase_orders (
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
  ) RETURNING id INTO v_purchase_order_id;
  
  -- Create purchase order item
  INSERT INTO purchase_order_items (
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
  
  -- Create bank transaction (trigger will automatically update bank balance)
  INSERT INTO bank_transactions (
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
  
  -- DO NOT manually update bank balance - let the trigger handle it automatically
  
  -- Update product stock
  UPDATE products 
  SET current_stock_quantity = current_stock_quantity + p_quantity,
      total_purchases = total_purchases + p_total_amount,
      updated_at = now()
  WHERE id = p_product_id;
  
  -- Handle USDT wallet credit if specified
  IF p_credit_wallet_id IS NOT NULL THEN
    UPDATE wallets 
    SET current_balance = current_balance + p_quantity,
        total_received = total_received + p_quantity,
        updated_at = now()
    WHERE id = p_credit_wallet_id;
  END IF;
  
  RETURN v_purchase_order_id;
END;
$$ LANGUAGE plpgsql;