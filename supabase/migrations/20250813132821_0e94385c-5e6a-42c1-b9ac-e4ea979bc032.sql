-- Fix the create_manual_purchase_secure function to handle insufficient funds gracefully
CREATE OR REPLACE FUNCTION create_manual_purchase_secure(
  p_order_number TEXT,
  p_supplier_name TEXT,
  p_order_date DATE,
  p_description TEXT DEFAULT '',
  p_total_amount NUMERIC,
  p_contact_number TEXT DEFAULT NULL,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_bank_account_id UUID,
  p_credit_wallet_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_purchase_order_id UUID;
  v_purchase_item_id UUID;
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  -- Check bank account balance first
  SELECT balance INTO v_current_balance 
  FROM bank_accounts 
  WHERE id = p_bank_account_id;
  
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  
  v_new_balance := v_current_balance - p_total_amount;
  
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient funds in bank account. Current balance: %, Required: %', v_current_balance, p_total_amount;
  END IF;
  
  -- Set bypass flag to skip balance lock validation
  PERFORM set_config('app.bypass_balance_lock', 'on', true);
  
  BEGIN
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
    ) RETURNING id INTO v_purchase_item_id;
    
    -- Create bank transaction record
    INSERT INTO bank_transactions (
      bank_account_id,
      transaction_type,
      amount,
      description,
      reference_id,
      reference_type
    ) VALUES (
      p_bank_account_id,
      'DEBIT',
      p_total_amount,
      'Purchase order: ' || p_order_number,
      v_purchase_order_id,
      'PURCHASE_ORDER'
    );
    
    -- Update bank account balance
    UPDATE bank_accounts 
    SET balance = v_new_balance,
        updated_at = NOW()
    WHERE id = p_bank_account_id;
    
    -- Update product stock
    UPDATE products 
    SET current_stock_quantity = current_stock_quantity + p_quantity,
        total_purchases = total_purchases + p_total_amount,
        updated_at = NOW()
    WHERE id = p_product_id;
    
    -- If USDT product and wallet specified, credit the wallet
    IF p_credit_wallet_id IS NOT NULL THEN
      UPDATE wallets 
      SET current_balance = current_balance + p_quantity,
          total_received = total_received + p_quantity,
          updated_at = NOW()
      WHERE id = p_credit_wallet_id;
    END IF;
    
    -- Reset bypass flag
    PERFORM set_config('app.bypass_balance_lock', 'off', true);
    
    RETURN v_purchase_order_id;
    
  EXCEPTION WHEN OTHERS THEN
    -- Reset bypass flag on error
    PERFORM set_config('app.bypass_balance_lock', 'off', true);
    RAISE;
  END;
END;
$$ LANGUAGE plpgsql;