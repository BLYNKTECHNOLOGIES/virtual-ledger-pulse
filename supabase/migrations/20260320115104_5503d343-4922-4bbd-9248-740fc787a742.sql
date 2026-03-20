-- Fix: Remove redundant bank_transaction INSERT from complete_sales_order_with_banking RPC
-- The trigger 'create_sales_bank_transaction' on sales_orders already handles this.
-- Having both creates a DOUBLE bank credit (double balance increment).

CREATE OR REPLACE FUNCTION public.complete_sales_order_with_banking(
  p_order_number TEXT,
  p_client_name TEXT,
  p_phone TEXT,
  p_platform TEXT,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_price_per_unit NUMERIC,
  p_total_amount NUMERIC,
  p_order_date DATE,
  p_description TEXT,
  p_bank_account_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_order_id UUID;
  v_bank_account_name TEXT;
BEGIN
  -- Validate bank account exists
  SELECT account_name INTO v_bank_account_name 
  FROM bank_accounts 
  WHERE id = p_bank_account_id;
  
  IF v_bank_account_name IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  
  -- Create the sales order
  -- The trigger 'create_sales_bank_transaction' will automatically create
  -- the bank transaction when payment_status = 'COMPLETED'
  INSERT INTO sales_orders (
    order_number,
    client_name,
    client_phone,
    platform,
    product_id,
    quantity,
    price_per_unit,
    total_amount,
    order_date,
    payment_status,
    status,
    description
  ) VALUES (
    p_order_number,
    p_client_name,
    p_phone,
    p_platform,
    p_product_id,
    p_quantity,
    p_price_per_unit,
    p_total_amount,
    p_order_date,
    'COMPLETED',
    'COMPLETED',
    p_description
  ) RETURNING id INTO v_sales_order_id;
  
  -- REMOVED: Manual bank_transaction INSERT
  -- Previously this RPC inserted a bank_transaction here, but the trigger
  -- 'create_sales_bank_transaction' already does this on sales_order INSERT.
  -- Having both caused DOUBLE bank credits (balance incremented twice).
  
  RETURN v_sales_order_id;
END;
$$;