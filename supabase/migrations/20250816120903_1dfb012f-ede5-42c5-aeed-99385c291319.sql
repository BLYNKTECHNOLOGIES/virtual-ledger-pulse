-- Create a function to handle sales order completion with proper bank transaction
CREATE OR REPLACE FUNCTION public.complete_sales_order_with_banking(
  p_order_number text,
  p_client_name text,
  p_phone text DEFAULT NULL,
  p_platform text DEFAULT 'BINANCE',
  p_total_amount numeric,
  p_quantity numeric,
  p_price_per_unit numeric,
  p_product_id uuid DEFAULT NULL,
  p_bank_account_id uuid,
  p_order_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT ''
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
  
  -- Create the sales order
  INSERT INTO sales_orders (
    order_number,
    client_name,
    customer_phone,
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
  
  -- If product is specified, create stock transaction (outgoing)
  IF p_product_id IS NOT NULL THEN
    INSERT INTO stock_transactions (
      product_id,
      transaction_type,
      quantity,
      unit_price,
      total_amount,
      transaction_date,
      supplier_customer_name,
      reference_number,
      reason
    ) VALUES (
      p_product_id,
      'Sales',
      -p_quantity, -- Negative for outgoing stock
      p_price_per_unit,
      p_total_amount,
      p_order_date,
      p_client_name,
      p_order_number,
      'Sales Order Transaction'
    );
    
    -- Update product stock
    UPDATE products 
    SET current_stock_quantity = current_stock_quantity - p_quantity,
        total_sales = COALESCE(total_sales, 0) + p_total_amount,
        updated_at = now()
    WHERE id = p_product_id;
  END IF;
  
  RETURN v_sales_order_id;
END;
$function$;