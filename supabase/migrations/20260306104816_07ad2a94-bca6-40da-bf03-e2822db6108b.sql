
-- ============================================================
-- Fix handle_sales_order_payment_method_change to also handle:
-- 1. Pending settlements (delete old, create new if gateway)
-- 2. Sales payment method usage adjustments
-- ============================================================

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
  v_order_date DATE;
  v_existing_transaction_id UUID;
  v_new_pm RECORD;
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
    INTO v_new_bank_id, v_new_is_gateway, v_new_pm.settlement_cycle, v_new_pm.settlement_days
    FROM public.sales_payment_methods spm
    WHERE spm.id = p_new_payment_method_id;
  END IF;

  -- ============ BANK TRANSACTION RECONCILIATION ============
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
    -- No existing bank transaction exists, but we need one for the new non-gateway method
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
  -- Always delete existing pending settlements for this order when payment method changes
  DELETE FROM public.pending_settlements
  WHERE sales_order_id = p_order_id;

  -- If new payment method is a gateway, create a new pending settlement
  IF COALESCE(v_new_is_gateway, false) THEN
    INSERT INTO public.pending_settlements (
      sales_order_id, order_number, client_name, total_amount,
      settlement_amount, order_date, payment_method_id, bank_account_id,
      settlement_cycle, settlement_days, expected_settlement_date, status
    ) VALUES (
      p_order_id, v_order_number, v_client_name, p_total_amount,
      p_total_amount, v_order_date, p_new_payment_method_id, v_new_bank_id,
      COALESCE(v_new_pm.settlement_cycle, 'T+1 Day'),
      COALESCE(v_new_pm.settlement_days, 1),
      (COALESCE(v_order_date, CURRENT_DATE) + INTERVAL '1 day' * COALESCE(v_new_pm.settlement_days, 1))::date,
      'PENDING'
    );
  END IF;

  -- ============ SALES PAYMENT METHOD USAGE ADJUSTMENT ============
  -- Decrease usage on old payment method
  IF p_old_payment_method_id IS NOT NULL THEN
    UPDATE public.sales_payment_methods
    SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - p_total_amount)
    WHERE id = p_old_payment_method_id;
  END IF;

  -- Increase usage on new payment method
  IF p_new_payment_method_id IS NOT NULL AND p_old_payment_method_id IS DISTINCT FROM p_new_payment_method_id THEN
    UPDATE public.sales_payment_methods
    SET current_usage = COALESCE(current_usage, 0) + p_total_amount
    WHERE id = p_new_payment_method_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment method change processed with pending settlements',
    'old_bank_id', v_old_bank_id,
    'new_bank_id', v_new_bank_id,
    'old_is_gateway', v_old_is_gateway,
    'new_is_gateway', v_new_is_gateway
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Also update create_pending_settlement trigger to properly handle
-- switching AWAY from a gateway (delete old pending settlement)
CREATE OR REPLACE FUNCTION public.create_pending_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  payment_method_data RECORD;
  v_old_is_gateway BOOLEAN := false;
BEGIN
  -- Check if old payment method was a gateway (on UPDATE)
  IF TG_OP = 'UPDATE' AND OLD.sales_payment_method_id IS NOT NULL 
     AND OLD.sales_payment_method_id IS DISTINCT FROM NEW.sales_payment_method_id THEN
    SELECT COALESCE(payment_gateway, false)
    INTO v_old_is_gateway
    FROM sales_payment_methods
    WHERE id = OLD.sales_payment_method_id;
    
    -- If old was a gateway, delete its pending settlement
    IF v_old_is_gateway THEN
      DELETE FROM public.pending_settlements WHERE sales_order_id = NEW.id;
    END IF;
  END IF;

  -- Only create pending settlement for payment gateway orders that are completed
  IF NEW.payment_status = 'COMPLETED' AND NEW.settlement_status = 'PENDING' 
     AND NEW.sales_payment_method_id IS NOT NULL THEN
    
    SELECT 
      spm.id,
      spm.payment_gateway,
      spm.settlement_cycle,
      spm.settlement_days,
      spm.bank_account_id,
      ba.account_name,
      ba.bank_name
    INTO payment_method_data
    FROM sales_payment_methods spm
    LEFT JOIN bank_accounts ba ON spm.bank_account_id = ba.id
    WHERE spm.id = NEW.sales_payment_method_id;
    
    IF payment_method_data.payment_gateway = true THEN
      INSERT INTO public.pending_settlements (
        sales_order_id, order_number, client_name, total_amount,
        settlement_amount, order_date, payment_method_id, bank_account_id,
        settlement_cycle, settlement_days, expected_settlement_date, status, created_at
      ) VALUES (
        NEW.id, NEW.order_number, NEW.client_name, NEW.total_amount,
        NEW.total_amount, NEW.order_date::date, NEW.sales_payment_method_id,
        payment_method_data.bank_account_id,
        COALESCE(payment_method_data.settlement_cycle, 'T+1 Day'),
        payment_method_data.settlement_days,
        CASE 
          WHEN payment_method_data.settlement_days > 0 THEN 
            (NEW.order_date::date + INTERVAL '1 day' * payment_method_data.settlement_days)::date
          ELSE 
            (NEW.order_date::date + INTERVAL '1 day')::date
        END,
        'PENDING', now()
      )
      ON CONFLICT (sales_order_id) DO UPDATE SET
        payment_method_id = EXCLUDED.payment_method_id,
        bank_account_id = EXCLUDED.bank_account_id,
        total_amount = EXCLUDED.total_amount,
        settlement_amount = EXCLUDED.settlement_amount,
        settlement_cycle = EXCLUDED.settlement_cycle,
        settlement_days = EXCLUDED.settlement_days,
        expected_settlement_date = EXCLUDED.expected_settlement_date,
        updated_at = now();
    ELSE
      -- New method is NOT a gateway - ensure no pending settlement exists
      DELETE FROM public.pending_settlements WHERE sales_order_id = NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;
