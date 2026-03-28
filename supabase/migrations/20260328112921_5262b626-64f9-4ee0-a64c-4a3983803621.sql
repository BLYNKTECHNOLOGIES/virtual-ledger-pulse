-- Fix: Gateway payment methods should NEVER have current_usage modified
-- Their usage is computed live from pending_settlements table

-- 1. Reset corrupted current_usage for ALL gateway methods
UPDATE public.sales_payment_methods
SET current_usage = 0, updated_at = now()
WHERE payment_gateway = true AND current_usage != 0;

-- 2. Fix delete_sales_order_with_reversal: skip current_usage for gateways
CREATE OR REPLACE FUNCTION public.delete_sales_order_with_reversal(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order              RECORD;
    v_payment_method     RECORD;
    v_product            RECORD;
    v_client_name        TEXT;
    v_guard_inserted     int := 0;
    v_is_gateway         BOOLEAN := false;
BEGIN
    DELETE FROM public.reversal_guards
    WHERE entity_type = 'SALES_ORDER'
      AND entity_id   = p_order_id
      AND action      = 'DELETE_WITH_REVERSAL';

    INSERT INTO public.reversal_guards(entity_type, entity_id, action)
    VALUES ('SALES_ORDER', p_order_id, 'DELETE_WITH_REVERSAL')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_guard_inserted = ROW_COUNT;
    IF v_guard_inserted = 0 THEN
        RETURN;
    END IF;

    SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_client_name := v_order.client_name;

    UPDATE public.sales_orders
    SET terminal_sync_id = NULL
    WHERE id = p_order_id;

    DELETE FROM public.terminal_sales_sync WHERE sales_order_id = p_order_id;
    DELETE FROM public.payment_gateway_settlement_items WHERE sales_order_id = p_order_id;
    DELETE FROM public.client_onboarding_approvals WHERE sales_order_id = p_order_id;
    DELETE FROM public.pending_settlements WHERE sales_order_id = p_order_id;
    DELETE FROM public.wallet_fee_deductions WHERE order_id = p_order_id OR order_number = v_order.order_number;
    DELETE FROM public.sales_order_items WHERE sales_order_id = p_order_id;

    IF v_order.sales_payment_method_id IS NOT NULL THEN
        SELECT bank_account_id, current_usage, COALESCE(payment_gateway, false)
        INTO v_payment_method
        FROM public.sales_payment_methods
        WHERE id = v_order.sales_payment_method_id;

        IF FOUND THEN
            v_is_gateway := COALESCE(v_payment_method.payment_gateway, false);
            -- Only update current_usage for non-gateway methods
            IF NOT v_is_gateway THEN
                UPDATE public.sales_payment_methods
                SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(v_order.total_amount, 0)),
                    updated_at    = now()
                WHERE id = v_order.sales_payment_method_id;
            END IF;
        END IF;
    END IF;

    DELETE FROM public.bank_transactions WHERE reference_number = v_order.order_number;

    IF v_client_name IS NOT NULL THEN
        UPDATE public.clients
        SET current_month_used = GREATEST(0, COALESCE(current_month_used, 0) - COALESCE(v_order.total_amount, 0)),
            updated_at         = now()
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_client_name));
    END IF;

    DELETE FROM public.stock_transactions WHERE reference_number = v_order.order_number;

    IF v_order.product_id IS NOT NULL THEN
        SELECT current_stock_quantity, total_sales INTO v_product
        FROM public.products
        WHERE id = v_order.product_id;

        IF FOUND THEN
            UPDATE public.products
            SET current_stock_quantity = COALESCE(current_stock_quantity, 0) + COALESCE(v_order.quantity, 0),
                total_sales            = GREATEST(0, COALESCE(total_sales, 0) - COALESCE(v_order.quantity, 0)),
                updated_at             = now()
            WHERE id = v_order.product_id;
        END IF;
    END IF;

    DELETE FROM public.wallet_transactions
    WHERE reference_id = p_order_id
      AND reference_type IN ('SALES_ORDER', 'SALES_ORDER_FEE');

    DELETE FROM public.wallet_transactions
    WHERE reference_type = 'SALES_ORDER_FEE'
      AND description ILIKE '%' || v_order.order_number || '%';

    DELETE FROM public.sales_orders WHERE id = p_order_id;

    IF v_client_name IS NOT NULL THEN
        PERFORM public.maybe_delete_orphan_client(v_client_name);
    END IF;

EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.reversal_guards
    WHERE entity_type = 'SALES_ORDER'
      AND entity_id   = p_order_id
      AND action      = 'DELETE_WITH_REVERSAL';
    RAISE;
END;
$function$;

-- 3. Fix process_payment_gateway_settlement: remove current_usage update (gateways only)
CREATE OR REPLACE FUNCTION public.process_payment_gateway_settlement(p_pending_settlement_ids uuid[], p_bank_account_id uuid, p_mdr_amount numeric DEFAULT 0, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total_amount numeric := 0;
  v_net_amount numeric;
  v_mdr_rate numeric;
  v_settlement_batch_id text;
  v_settlement_id uuid;
  v_pending_record record;
  v_valid_ids uuid[] := '{}';
  v_settled_order_ids uuid[] := '{}';
  v_settlement_items jsonb[] := '{}';
  v_skipped_count int := 0;
BEGIN
  FOR v_pending_record IN
    SELECT id, sales_order_id, total_amount, payment_method_id
    FROM pending_settlements
    WHERE id = ANY(p_pending_settlement_ids)
      AND status = 'PENDING'
    FOR UPDATE SKIP LOCKED
  LOOP
    IF EXISTS (
      SELECT 1
      FROM payment_gateway_settlement_items pgsi
      JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
      WHERE pgsi.sales_order_id = v_pending_record.sales_order_id
        AND pgs.status = 'COMPLETED'
    ) THEN
      DELETE FROM pending_settlements WHERE id = v_pending_record.id;
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    v_valid_ids := array_append(v_valid_ids, v_pending_record.id);
    v_settled_order_ids := array_append(v_settled_order_ids, v_pending_record.sales_order_id);
    v_total_amount := v_total_amount + v_pending_record.total_amount;
    v_settlement_items := array_append(v_settlement_items, jsonb_build_object(
      'sales_order_id', v_pending_record.sales_order_id,
      'amount', v_pending_record.total_amount
    ));
  END LOOP;

  IF array_length(v_valid_ids, 1) IS NULL OR array_length(v_valid_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', CASE WHEN v_skipped_count > 0
        THEN v_skipped_count || ' order(s) were already settled in other batches and have been cleaned up. Please refresh and try again.'
        ELSE 'No valid pending settlements found. They may have already been settled.'
      END
    );
  END IF;

  v_net_amount := v_total_amount - p_mdr_amount;
  v_mdr_rate := CASE WHEN v_total_amount > 0 THEN (p_mdr_amount / v_total_amount) * 100 ELSE 0 END;
  v_settlement_batch_id := 'PGS-' || (EXTRACT(EPOCH FROM now()) * 1000)::bigint::text;

  INSERT INTO payment_gateway_settlements (
    settlement_batch_id, bank_account_id, total_amount, mdr_amount, net_amount, mdr_rate, settlement_date, settled_by
  ) VALUES (
    v_settlement_batch_id, p_bank_account_id, v_total_amount, p_mdr_amount, v_net_amount, v_mdr_rate, CURRENT_DATE, p_created_by
  ) RETURNING id INTO v_settlement_id;

  INSERT INTO payment_gateway_settlement_items (settlement_id, sales_order_id, amount)
  SELECT v_settlement_id, (item->>'sales_order_id')::uuid, (item->>'amount')::numeric
  FROM unnest(v_settlement_items) AS item;

  INSERT INTO bank_transactions (
    bank_account_id, transaction_type, amount, description, transaction_date, category, reference_number, created_by
  ) VALUES (
    p_bank_account_id, 'INCOME', v_net_amount,
    'Payment Gateway Settlement - ' || array_length(v_valid_ids, 1) || ' sale(s)' ||
      CASE WHEN p_mdr_amount > 0 THEN ' (Net after MDR: ₹' || p_mdr_amount::text || ')' ELSE '' END,
    CURRENT_DATE, 'Settlement', v_settlement_batch_id, p_created_by
  );

  IF p_mdr_amount > 0 THEN
    INSERT INTO bank_transactions (
      bank_account_id, transaction_type, amount, description, transaction_date, category, reference_number, created_by
    ) VALUES (
      p_bank_account_id, 'EXPENSE', p_mdr_amount,
      'MDR / Payment Gateway Fees - Settlement ' || v_settlement_batch_id || ' (' || array_length(v_valid_ids, 1) || ' transactions)',
      CURRENT_DATE, 'MDR / payment gateway fees', 'MDR-' || v_settlement_batch_id, p_created_by
    );
  END IF;

  -- REMOVED: Do NOT update current_usage for gateway methods
  -- Gateway usage is computed live from pending_settlements table

  DELETE FROM pending_settlements WHERE id = ANY(v_valid_ids);

  UPDATE sales_orders
  SET settlement_status = 'SETTLED',
      settled_at = now()
  WHERE id = ANY(v_settled_order_ids);

  RETURN jsonb_build_object(
    'success', true,
    'settlement_batch_id', v_settlement_batch_id,
    'settlement_id', v_settlement_id,
    'total_amount', v_total_amount,
    'mdr_amount', p_mdr_amount,
    'net_amount', v_net_amount,
    'settled_count', array_length(v_valid_ids, 1),
    'skipped_duplicates', v_skipped_count
  );
END;
$function$;

-- 4. Fix reverse_payment_gateway_settlement: remove current_usage update
CREATE OR REPLACE FUNCTION public.reverse_payment_gateway_settlement(p_settlement_id uuid, p_reversed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_settlement record;
  v_item record;
  v_guard_inserted boolean;
  v_restored_count int := 0;
BEGIN
  INSERT INTO reversal_guards (entity_type, entity_id, action)
  VALUES ('payment_gateway_settlement', p_settlement_id, 'reverse')
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_guard_inserted;

  IF v_guard_inserted IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This settlement has already been reversed or is currently being reversed.'
    );
  END IF;

  SELECT * INTO v_settlement
  FROM payment_gateway_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF v_settlement IS NULL THEN
    DELETE FROM reversal_guards WHERE entity_type = 'payment_gateway_settlement' AND entity_id = p_settlement_id AND action = 'reverse';
    RETURN jsonb_build_object('success', false, 'error', 'Settlement not found.');
  END IF;

  IF v_settlement.status = 'REVERSED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement is already reversed.');
  END IF;

  FOR v_item IN
    SELECT si.sales_order_id, si.amount,
           so.order_number, so.client_name, so.order_date,
           so.sales_payment_method_id
    FROM payment_gateway_settlement_items si
    JOIN sales_orders so ON so.id = si.sales_order_id
    WHERE si.settlement_id = p_settlement_id
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM payment_gateway_settlement_items other_si
      JOIN payment_gateway_settlements other_pgs ON other_pgs.id = other_si.settlement_id
      WHERE other_si.sales_order_id = v_item.sales_order_id
        AND other_pgs.id != p_settlement_id
        AND other_pgs.status = 'COMPLETED'
    ) THEN
      INSERT INTO pending_settlements (
        sales_order_id, order_number, client_name, total_amount, settlement_amount,
        order_date, payment_method_id, bank_account_id, status
      )
      SELECT
        v_item.sales_order_id, v_item.order_number, v_item.client_name,
        v_item.amount, v_item.amount, v_item.order_date,
        v_item.sales_payment_method_id, v_settlement.bank_account_id, 'PENDING'
      WHERE NOT EXISTS (
        SELECT 1 FROM pending_settlements WHERE sales_order_id = v_item.sales_order_id AND status = 'PENDING'
      );

      UPDATE sales_orders
      SET settlement_status = 'PENDING'
      WHERE id = v_item.sales_order_id AND settlement_status = 'SETTLED';
    END IF;

    v_restored_count := v_restored_count + 1;
  END LOOP;

  DELETE FROM bank_transactions
  WHERE reference_number = v_settlement.settlement_batch_id
    AND transaction_type = 'INCOME';

  DELETE FROM bank_transactions
  WHERE reference_number = 'MDR-' || v_settlement.settlement_batch_id
    AND transaction_type = 'EXPENSE';

  -- REMOVED: Do NOT update current_usage for gateway methods
  -- Gateway usage is computed live from pending_settlements table

  DELETE FROM payment_gateway_settlement_items WHERE settlement_id = p_settlement_id;

  UPDATE payment_gateway_settlements
  SET status = 'REVERSED', updated_at = now(), reversed_by = p_reversed_by
  WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_batch_id', v_settlement.settlement_batch_id,
    'reversed_amount', v_settlement.net_amount,
    'restored_count', v_restored_count
  );
END;
$function$;

-- 5. Fix handle_sales_order_payment_method_change: skip current_usage for gateways
CREATE OR REPLACE FUNCTION public.handle_sales_order_payment_method_change(p_order_id uuid, p_old_payment_method_id uuid, p_new_payment_method_id uuid, p_total_amount numeric)
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
  v_existing_transaction_id UUID;
  v_new_settlement_cycle TEXT;
  v_new_settlement_days INT;
BEGIN
  SELECT order_number, client_name, order_date::date
  INTO v_order_number, v_client_name, v_order_date
  FROM public.sales_orders 
  WHERE id = p_order_id;

  IF v_order_number IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF p_old_payment_method_id IS NOT NULL THEN
    SELECT bank_account_id, COALESCE(payment_gateway, false)
    INTO v_old_bank_id, v_old_is_gateway
    FROM public.sales_payment_methods
    WHERE id = p_old_payment_method_id;
  END IF;

  IF p_new_payment_method_id IS NOT NULL THEN
    SELECT spm.bank_account_id, COALESCE(spm.payment_gateway, false),
           spm.settlement_cycle, spm.settlement_days
    INTO v_new_bank_id, v_new_is_gateway, v_new_settlement_cycle, v_new_settlement_days
    FROM public.sales_payment_methods spm
    WHERE spm.id = p_new_payment_method_id;
  END IF;

  -- BANK TRANSACTION RECONCILIATION
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

  -- PENDING SETTLEMENTS RECONCILIATION
  DELETE FROM public.pending_settlements WHERE sales_order_id = p_order_id;

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

  -- SALES PAYMENT METHOD USAGE ADJUSTMENT — only for non-gateway methods
  IF p_old_payment_method_id IS NOT NULL AND NOT COALESCE(v_old_is_gateway, false) THEN
    UPDATE public.sales_payment_methods
    SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - p_total_amount)
    WHERE id = p_old_payment_method_id;
  END IF;

  IF p_new_payment_method_id IS NOT NULL AND NOT COALESCE(v_new_is_gateway, false) THEN
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
$function$;
