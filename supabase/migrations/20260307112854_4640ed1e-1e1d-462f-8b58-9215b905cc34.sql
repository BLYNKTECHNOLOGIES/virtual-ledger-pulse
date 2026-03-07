CREATE OR REPLACE FUNCTION public.handle_sales_order_payment_method_change(
  p_order_id UUID,
  p_old_payment_method_id UUID,
  p_new_payment_method_id UUID,
  p_total_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_bank_id UUID;
  v_new_bank_id UUID;
  v_old_is_gateway BOOLEAN;
  v_new_is_gateway BOOLEAN;
  v_order_number TEXT;
  v_client_name TEXT;
  v_order_date DATE;
  v_existing_transaction_id UUID;
  v_new_settlement_cycle TEXT;
  v_new_settlement_days INT;
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
  END IF;

  -- Get new payment method details
  IF p_new_payment_method_id IS NOT NULL THEN
    SELECT spm.bank_account_id, COALESCE(spm.payment_gateway, false),
           spm.settlement_cycle, spm.settlement_days
    INTO v_new_bank_id, v_new_is_gateway, v_new_settlement_cycle, v_new_settlement_days
    FROM public.sales_payment_methods spm
    WHERE spm.id = p_new_payment_method_id;
  END IF;

  -- ============ BANK TRANSACTION RECONCILIATION ============
  SELECT id INTO v_existing_transaction_id
  FROM public.bank_transactions
  WHERE reference_number = v_order_number
    AND transaction_type = 'INCOME'
  LIMIT 1;

  IF v_existing_transaction_id IS NOT NULL AND v_old_bank_id IS DISTINCT FROM v_new_bank_id THEN
    DELETE FROM public.bank_transactions WHERE id = v_existing_transaction_id;
    
    IF v_new_bank_id IS NOT NULL AND NOT COALESCE(v_new_is_gateway, false) THEN
      INSERT INTO public.bank_transactions (
        bank_account_id, transaction_type, amount, description,
        reference_number, transaction_date, category, related_account_name
      ) VALUES (
        v_new_bank_id, 'INCOME', p_total_amount,
        'Sales Order (Updated) - ' || v_order_number,
        v_order_number, COALESCE(v_order_date, CURRENT_DATE),
        'Sales', v_client_name
      );
    END IF;
  ELSIF v_existing_transaction_id IS NULL AND v_new_bank_id IS NOT NULL AND NOT COALESCE(v_new_is_gateway, false) THEN
    INSERT INTO public.bank_transactions (
      bank_account_id, transaction_type, amount, description,
      reference_number, transaction_date, category, related_account_name
    ) VALUES (
      v_new_bank_id, 'INCOME', p_total_amount,
      'Sales Order (Updated) - ' || v_order_number,
      v_order_number, COALESCE(v_order_date, CURRENT_DATE),
      'Sales', v_client_name
    );
  END IF;

  -- ============ PENDING SETTLEMENTS RECONCILIATION ============
  DELETE FROM public.pending_settlements
  WHERE sales_order_id = p_order_id;

  IF COALESCE(v_new_is_gateway, false) THEN
    INSERT INTO public.pending_settlements (
      sales_order_id, order_number, client_name, total_amount,
      settlement_amount, order_date, payment_method_id, bank_account_id,
      settlement_cycle, settlement_days, expected_settlement_date, status
    ) VALUES (
      p_order_id, v_order_number, v_client_name, p_total_amount,
      p_total_amount, v_order_date, p_new_payment_method_id, v_new_bank_id,
      COALESCE(v_new_settlement_cycle, 'T+1 Day'),
      COALESCE(v_new_settlement_days, 1),
      (COALESCE(v_order_date, CURRENT_DATE) + INTERVAL '1 day' * COALESCE(v_new_settlement_days, 1))::date,
      'PENDING'
    );
  END IF;

  -- ============ SALES PAYMENT METHOD USAGE ADJUSTMENT ============
  IF p_old_payment_method_id IS NOT NULL THEN
    UPDATE public.sales_payment_methods
    SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - p_total_amount)
    WHERE id = p_old_payment_method_id;
  END IF;

  IF p_new_payment_method_id IS NOT NULL THEN
    UPDATE public.sales_payment_methods
    SET current_usage = COALESCE(current_usage, 0) + p_total_amount
    WHERE id = p_new_payment_method_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'old_bank_id', v_old_bank_id,
    'new_bank_id', v_new_bank_id,
    'old_is_gateway', COALESCE(v_old_is_gateway, false),
    'new_is_gateway', COALESCE(v_new_is_gateway, false)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;