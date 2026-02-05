-- Create RPC to handle sales order payment method changes
-- This handles the bank transaction reversal/creation when switching payment methods

CREATE OR REPLACE FUNCTION public.handle_sales_order_payment_method_change(
  p_order_id UUID,
  p_old_payment_method_id UUID,
  p_new_payment_method_id UUID,
  p_total_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_bank_id UUID;
  v_new_bank_id UUID;
  v_old_is_gateway BOOLEAN;
  v_new_is_gateway BOOLEAN;
  v_order_number TEXT;
  v_client_name TEXT;
  v_existing_transaction_id UUID;
  v_bank_balance NUMERIC;
BEGIN
  -- Get order info
  SELECT order_number, client_name 
  INTO v_order_number, v_client_name
  FROM public.sales_orders 
  WHERE id = p_order_id;

  IF v_order_number IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Get old payment method details
  IF p_old_payment_method_id IS NOT NULL THEN
    SELECT bank_account_id, COALESCE(payment_gateway, false)
    INTO v_old_bank_id, v_old_is_gateway
    FROM public.sales_payment_methods
    WHERE id = p_old_payment_method_id;
  END IF;

  -- Get new payment method details
  IF p_new_payment_method_id IS NOT NULL THEN
    SELECT bank_account_id, COALESCE(payment_gateway, false)
    INTO v_new_bank_id, v_new_is_gateway
    FROM public.sales_payment_methods
    WHERE id = p_new_payment_method_id;
  END IF;

  -- If switching between different bank accounts for completed orders:
  -- 1. Reverse the old bank transaction (if exists)
  -- 2. Create new bank transaction for the new bank

  -- Find existing INCOME transaction for this order
  SELECT id INTO v_existing_transaction_id
  FROM public.bank_transactions
  WHERE reference_number = v_order_number
    AND transaction_type = 'INCOME'
  LIMIT 1;

  -- If we found an existing transaction and the bank is changing
  IF v_existing_transaction_id IS NOT NULL AND v_old_bank_id IS DISTINCT FROM v_new_bank_id THEN
    -- Delete the old transaction (trigger will handle balance reversal)
    DELETE FROM public.bank_transactions WHERE id = v_existing_transaction_id;
    
    -- Create new transaction on the new bank (if not a gateway with pending settlement)
    IF v_new_bank_id IS NOT NULL AND NOT COALESCE(v_new_is_gateway, false) THEN
      INSERT INTO public.bank_transactions (
        bank_account_id,
        transaction_type,
        amount,
        description,
        reference_number,
        transaction_date,
        category,
        related_account_name
      ) VALUES (
        v_new_bank_id,
        'INCOME',
        p_total_amount,
        'Sales Order (Updated) - ' || v_order_number,
        v_order_number,
        CURRENT_DATE,
        'Sales',
        v_client_name
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment method change processed',
    'old_bank_id', v_old_bank_id,
    'new_bank_id', v_new_bank_id,
    'old_is_gateway', v_old_is_gateway,
    'new_is_gateway', v_new_is_gateway
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;