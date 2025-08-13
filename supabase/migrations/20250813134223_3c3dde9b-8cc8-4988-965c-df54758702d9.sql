-- Fix the balance validation to properly respect the bypass flag
-- The issue is the validate_balance_edit function is still blocking even with bypass flag

CREATE OR REPLACE FUNCTION validate_balance_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if bypass flag is set (for trusted admin operations)
  IF current_setting('app.bypass_balance_lock', true) = 'on' THEN
    RETURN NEW;
  END IF;

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

-- Also fix the create_manual_purchase_secure function to use the correct session setting
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
  
  -- Start transaction with bypass enabled
  PERFORM set_config('app.bypass_balance_lock', 'on', false); -- session-wide setting
  
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
    PERFORM set_config('app.bypass_balance_lock', 'off', false);
    
    RETURN v_purchase_order_id;
    
  EXCEPTION WHEN OTHERS THEN
    -- Reset bypass flag on error
    PERFORM set_config('app.bypass_balance_lock', 'off', false);
    RAISE;
  END;
END;
$$ LANGUAGE plpgsql;