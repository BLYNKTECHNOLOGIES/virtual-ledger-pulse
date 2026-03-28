
-- B41 FIX 1: Drop the OLD overload of create_manual_purchase_bypass_locks (OID 84836)
-- This is the version with (product_id before bank_account_id) that has double-deduction
DROP FUNCTION IF EXISTS public.create_manual_purchase_bypass_locks(
  text, text, date, text, numeric, text, uuid, numeric, numeric, uuid, uuid
);

-- B41 FIX 2: Fix create_manual_purchase_secure — replace direct wallet UPDATE with proper wallet_transaction INSERT
CREATE OR REPLACE FUNCTION public.create_manual_purchase_secure(
  p_order_number text, p_supplier_name text, p_order_date date, p_total_amount numeric,
  p_product_id uuid, p_quantity numeric, p_unit_price numeric, p_bank_account_id uuid,
  p_description text DEFAULT ''::text, p_contact_number text DEFAULT NULL::text,
  p_credit_wallet_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase_order_id UUID;
  v_current_balance NUMERIC;
BEGIN
  SELECT balance INTO v_current_balance 
  FROM bank_accounts 
  WHERE id = p_bank_account_id;
  
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  
  IF v_current_balance < p_total_amount THEN
    RAISE EXCEPTION 'Insufficient funds in bank account. Current balance: %, Required: %', v_current_balance, p_total_amount;
  END IF;
  
  INSERT INTO purchase_orders (
    order_number, supplier_name, order_date, description, total_amount,
    contact_number, status, bank_account_id
  ) VALUES (
    p_order_number, p_supplier_name, p_order_date, p_description, p_total_amount,
    p_contact_number, 'COMPLETED', p_bank_account_id
  ) RETURNING id INTO v_purchase_order_id;
  
  INSERT INTO purchase_order_items (
    purchase_order_id, product_id, quantity, unit_price, total_price
  ) VALUES (
    v_purchase_order_id, p_product_id, p_quantity, p_unit_price, p_total_amount
  );
  
  -- Bank transaction (trigger handles balance deduction)
  INSERT INTO bank_transactions (
    bank_account_id, transaction_type, amount, description, reference_number,
    transaction_date, category, related_account_name
  ) VALUES (
    p_bank_account_id, 'EXPENSE', p_total_amount,
    'Manual Purchase Order - ' || p_order_number || ' - ' || p_supplier_name,
    p_order_number, p_order_date, 'Purchase', p_supplier_name
  );
  
  -- Update product stock
  UPDATE products 
  SET current_stock_quantity = current_stock_quantity + p_quantity,
      total_purchases = total_purchases + p_total_amount,
      updated_at = now()
  WHERE id = p_product_id;
  
  -- Wallet credit via wallet_transactions (trigger handles balance), NOT direct UPDATE
  IF p_credit_wallet_id IS NOT NULL THEN
    INSERT INTO wallet_transactions (
      wallet_id, transaction_type, amount,
      reference_type, reference_id, description,
      balance_before, balance_after
    ) VALUES (
      p_credit_wallet_id, 'CREDIT', p_quantity,
      'PURCHASE_ORDER', v_purchase_order_id,
      'Purchased via manual purchase order ' || p_order_number,
      0, 0  -- trigger will compute actual values
    );
  END IF;
  
  RETURN v_purchase_order_id;
END;
$function$;
