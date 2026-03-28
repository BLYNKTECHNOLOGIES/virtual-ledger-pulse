-- B38 FIX: Remove manual balance deduction from create_manual_purchase_bypass_locks
-- The INSERT into bank_transactions already triggers balance update via trigger_update_bank_account_balance
-- The manual UPDATE was causing double-deduction
CREATE OR REPLACE FUNCTION create_manual_purchase_bypass_locks(
  p_order_number TEXT,
  p_supplier_name TEXT,
  p_order_date DATE,
  p_description TEXT,
  p_total_amount NUMERIC,
  p_contact_number TEXT,
  p_bank_account_id UUID,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_credit_wallet_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  purchase_order_id UUID;
  current_balance NUMERIC;
  was_locked BOOLEAN;
BEGIN
  SELECT balance, balance_locked INTO current_balance, was_locked
  FROM public.bank_accounts 
  WHERE id = p_bank_account_id AND status = 'ACTIVE';
  
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'Bank account not found or inactive';
  END IF;
  
  IF current_balance < p_total_amount THEN
    RAISE EXCEPTION 'Insufficient bank balance. Available: %, Required: %', current_balance, p_total_amount;
  END IF;
  
  UPDATE public.bank_accounts 
  SET balance_locked = false 
  WHERE id = p_bank_account_id;
  
  INSERT INTO public.purchase_orders (
    order_number, supplier_name, order_date, description,
    total_amount, contact_number, status, bank_account_id
  ) VALUES (
    p_order_number, p_supplier_name, p_order_date, p_description,
    p_total_amount, p_contact_number, 'COMPLETED', p_bank_account_id
  ) RETURNING id INTO purchase_order_id;
  
  INSERT INTO public.purchase_order_items (
    purchase_order_id, product_id, quantity, unit_price, total_price
  ) VALUES (
    purchase_order_id, p_product_id, p_quantity, p_unit_price, p_total_amount
  );
  
  -- Bank transaction insert — trigger handles balance deduction automatically
  INSERT INTO public.bank_transactions (
    bank_account_id, transaction_type, amount, description,
    reference_number, transaction_date, category, related_account_name
  ) VALUES (
    p_bank_account_id, 'EXPENSE', p_total_amount,
    'Manual Purchase Order - ' || p_order_number || ' - ' || p_supplier_name,
    p_order_number, p_order_date, 'Purchase', p_supplier_name
  );
  
  -- REMOVED: Manual balance deduction (was causing double-deduction with trigger)
  
  -- Restore original lock status
  UPDATE public.bank_accounts 
  SET balance_locked = was_locked 
  WHERE id = p_bank_account_id;
  
  IF p_credit_wallet_id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (
      wallet_id, transaction_type, amount, reference_type,
      reference_id, description, balance_before, balance_after
    ) VALUES (
      p_credit_wallet_id, 'CREDIT', p_quantity, 'PURCHASE_ORDER',
      purchase_order_id,
      'USDT purchased via manual purchase order ' || p_order_number,
      0, 0
    );
  ELSE
    UPDATE public.products 
    SET current_stock_quantity = current_stock_quantity + p_quantity,
        updated_at = now()
    WHERE id = p_product_id;
  END IF;
  
  RETURN purchase_order_id;
END;
$$;