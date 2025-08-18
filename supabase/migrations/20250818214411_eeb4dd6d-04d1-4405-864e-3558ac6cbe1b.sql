-- Fix double stock transaction creation in complete_sales_order_with_banking function
-- Remove manual stock transaction creation since triggers handle it

CREATE OR REPLACE FUNCTION public.complete_sales_order_with_banking(
  p_order_number text, 
  p_client_name text, 
  p_total_amount numeric, 
  p_quantity numeric, 
  p_price_per_unit numeric, 
  p_bank_account_id uuid, 
  p_phone text DEFAULT NULL::text, 
  p_platform text DEFAULT 'BINANCE'::text, 
  p_product_id uuid DEFAULT NULL::uuid, 
  p_order_date date DEFAULT CURRENT_DATE, 
  p_description text DEFAULT ''::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_sales_order_id UUID;
  v_bank_account_name TEXT;
BEGIN
  -- Get bank account name for transaction description
  SELECT account_name INTO v_bank_account_name 
  FROM bank_accounts 
  WHERE id = p_bank_account_id;
  
  IF v_bank_account_name IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;
  
  -- Create the sales order (triggers will handle stock transactions automatically)
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
  
  -- Create bank transaction (this will automatically update bank balance via trigger)
  INSERT INTO bank_transactions (
    bank_account_id,
    transaction_type,
    amount,
    transaction_date,
    description,
    reference_number,
    category,
    related_account_name
  ) VALUES (
    p_bank_account_id,
    'INCOME',
    p_total_amount,
    p_order_date,
    'Sales Order Payment - ' || p_order_number || ' - ' || p_client_name,
    p_order_number,
    'Sales',
    p_client_name
  );
  
  -- REMOVED: Manual stock transaction creation
  -- The create_sales_stock_transaction trigger will handle this automatically
  -- when the sales order is inserted with payment_status = 'COMPLETED'
  
  RETURN v_sales_order_id;
END;
$function$;