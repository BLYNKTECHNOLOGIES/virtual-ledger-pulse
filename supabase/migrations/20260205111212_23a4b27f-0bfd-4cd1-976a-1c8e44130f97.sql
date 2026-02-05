-- Fix: handle_sales_order_payment_method_change should create a new bank transaction
-- even when there was no prior INCOME transaction (e.g., switching from gateway -> bank).
-- Also ensure idempotency by deleting any existing INCOME tx for that order before inserting.

CREATE OR REPLACE FUNCTION public.handle_sales_order_payment_method_change(
  p_order_id uuid,
  p_old_payment_method_id uuid,
  p_new_payment_method_id uuid,
  p_total_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_bank_id UUID;
  v_new_bank_id UUID;
  v_old_is_gateway BOOLEAN;
  v_new_is_gateway BOOLEAN;
  v_order_number TEXT;
  v_client_name TEXT;
  v_order_date DATE;
  v_deleted_count INT := 0;
  v_inserted_id UUID;
BEGIN
  -- Get order info
  SELECT order_number, client_name, order_date::date
  INTO v_order_number, v_client_name, v_order_date
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
  ELSE
    v_old_is_gateway := false;
  END IF;

  -- Get new payment method details
  IF p_new_payment_method_id IS NOT NULL THEN
    SELECT bank_account_id, COALESCE(payment_gateway, false)
    INTO v_new_bank_id, v_new_is_gateway
    FROM public.sales_payment_methods
    WHERE id = p_new_payment_method_id;
  ELSE
    v_new_is_gateway := false;
  END IF;

  -- Always remove any existing INCOME tx for this order first.
  -- This makes the operation idempotent and prevents double-crediting.
  DELETE FROM public.bank_transactions
  WHERE reference_number = v_order_number
    AND transaction_type = 'INCOME';
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- If the new method is a gateway (or has no bank), we should NOT create a bank transaction.
  IF v_new_bank_id IS NULL OR COALESCE(v_new_is_gateway, false) THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Old INCOME bank tx removed (if any); new method is gateway/no-bank so no new bank tx created',
      'deleted_income_count', v_deleted_count,
      'old_bank_id', v_old_bank_id,
      'new_bank_id', v_new_bank_id,
      'old_is_gateway', v_old_is_gateway,
      'new_is_gateway', v_new_is_gateway
    );
  END IF;

  -- Create the new INCOME transaction on the selected bank account.
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
    'Sales Order (Updated) - ' || v_order_number || ' - ' || COALESCE(v_client_name, ''),
    v_order_number,
    COALESCE(v_order_date, CURRENT_DATE),
    'Sales',
    v_client_name
  )
  RETURNING id INTO v_inserted_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment method change processed',
    'deleted_income_count', v_deleted_count,
    'inserted_income_id', v_inserted_id,
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
$function$;