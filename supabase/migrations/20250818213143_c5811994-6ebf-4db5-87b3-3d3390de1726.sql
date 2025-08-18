-- Fix the double addition by removing manual product stock updates 
-- from functions that also create stock transactions
CREATE OR REPLACE FUNCTION public.complete_sales_order_with_banking(p_order_number text, p_client_name text, p_total_amount numeric, p_quantity numeric, p_price_per_unit numeric, p_bank_account_id uuid, p_phone text DEFAULT NULL::text, p_platform text DEFAULT 'BINANCE'::text, p_product_id uuid DEFAULT NULL::uuid, p_order_date date DEFAULT CURRENT_DATE, p_description text DEFAULT ''::text)
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
  
  -- Create the sales order (using correct column name: client_phone)
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
  
  -- If product is specified, create stock transaction (outgoing)
  -- The trigger will automatically update the product stock, so we don't do it manually
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
    
    -- REMOVED: Manual product stock update - let the trigger handle it
    -- The update_product_stock_from_transaction trigger will handle the stock update
  END IF;
  
  RETURN v_sales_order_id;
END;
$function$;

-- Also fix any other functions that might have similar issues
CREATE OR REPLACE FUNCTION public.create_manual_purchase_bypass(p_order_number text, p_supplier_name text, p_order_date date, p_description text, p_total_amount numeric, p_contact_number text, p_status text, p_bank_account_id uuid, p_product_id uuid, p_quantity numeric, p_unit_price numeric, p_credit_wallet_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    -- Create stock transaction instead of direct update - let trigger handle product stock update
    INSERT INTO public.stock_transactions (
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
      'Purchase',
      p_quantity, -- Positive for incoming stock
      p_unit_price,
      p_total_amount,
      p_order_date,
      p_supplier_name,
      p_order_number,
      'Manual Purchase Order Transaction'
    );
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
$function$;