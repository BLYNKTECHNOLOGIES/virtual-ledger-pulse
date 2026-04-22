
-- ============================================================
-- Phase 1: Refactor 6 hard-delete RPCs to use reverse_bank_transaction
-- ============================================================

-- 1) delete_contra_entry: reverse both legs instead of deleting
CREATE OR REPLACE FUNCTION public.delete_contra_entry(p_transfer_out_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer_out RECORD;
  v_transfer_in RECORD;
  v_guard_id TEXT;
BEGIN
  PERFORM public.require_permission(auth.uid(), 'bams_manage', 'delete_contra_entry');
  PERFORM public.require_permission(auth.uid(), 'bams_destructive', 'delete_contra_entry');

  v_guard_id := p_transfer_out_id::TEXT;

  SELECT * INTO v_transfer_out
    FROM bank_transactions
   WHERE id = p_transfer_out_id AND transaction_type = 'TRANSFER_OUT'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer OUT transaction not found';
  END IF;

  DELETE FROM reversal_guards
   WHERE entity_type = 'contra_entry' AND entity_id = v_guard_id AND action = 'delete';
  INSERT INTO reversal_guards (entity_type, entity_id, action)
  VALUES ('contra_entry', v_guard_id, 'delete');

  -- Locate the paired TRANSFER_IN
  IF v_transfer_out.related_transaction_id IS NOT NULL THEN
    SELECT * INTO v_transfer_in
      FROM bank_transactions
     WHERE id = v_transfer_out.related_transaction_id
       AND transaction_type = 'TRANSFER_IN'
     FOR UPDATE;
  END IF;
  IF v_transfer_in.id IS NULL THEN
    SELECT * INTO v_transfer_in
      FROM bank_transactions
     WHERE related_transaction_id = p_transfer_out_id
       AND transaction_type = 'TRANSFER_IN'
     FOR UPDATE;
  END IF;

  -- Reverse paired leg first (if it exists, not already reversed, and not itself a reversal)
  IF v_transfer_in.id IS NOT NULL
     AND COALESCE(v_transfer_in.is_reversed, false) = false
     AND v_transfer_in.reverses_transaction_id IS NULL THEN
    PERFORM public.reverse_bank_transaction(
      v_transfer_in.id,
      'Contra entry deleted (paired TRANSFER_IN)',
      auth.uid()
    );
  END IF;

  -- Reverse the TRANSFER_OUT
  IF COALESCE(v_transfer_out.is_reversed, false) = false
     AND v_transfer_out.reverses_transaction_id IS NULL THEN
    PERFORM public.reverse_bank_transaction(
      p_transfer_out_id,
      'Contra entry deleted (TRANSFER_OUT)',
      auth.uid()
    );
  END IF;
END;
$function$;


-- 2) delete_sales_order_with_reversal: reverse linked bank rows instead of deleting
CREATE OR REPLACE FUNCTION public.delete_sales_order_with_reversal(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_payment_method RECORD;
  v_product RECORD;
  v_client_name TEXT;
  v_guard_inserted int := 0;
  v_is_gateway BOOLEAN := false;
  r RECORD;
BEGIN
  PERFORM public.require_permission(auth.uid(), 'sales_manage', 'delete_sales_order');
  PERFORM public.require_permission(auth.uid(), 'erp_destructive', 'delete_sales_order');

  DELETE FROM public.reversal_guards
   WHERE entity_type = 'SALES_ORDER' AND entity_id = p_order_id AND action = 'DELETE_WITH_REVERSAL';
  INSERT INTO public.reversal_guards(entity_type, entity_id, action)
  VALUES ('SALES_ORDER', p_order_id, 'DELETE_WITH_REVERSAL')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_guard_inserted = ROW_COUNT;
  IF v_guard_inserted = 0 THEN RETURN; END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_client_name := v_order.client_name;
  UPDATE public.sales_orders SET terminal_sync_id = NULL WHERE id = p_order_id;

  DELETE FROM public.terminal_sales_sync WHERE sales_order_id = p_order_id;
  DELETE FROM public.payment_gateway_settlement_items WHERE sales_order_id = p_order_id;
  DELETE FROM public.client_onboarding_approvals WHERE sales_order_id = p_order_id;
  DELETE FROM public.pending_settlements WHERE sales_order_id = p_order_id;
  DELETE FROM public.wallet_fee_deductions WHERE order_id = p_order_id OR order_number = v_order.order_number;
  DELETE FROM public.sales_order_items WHERE sales_order_id = p_order_id;

  IF v_order.sales_payment_method_id IS NOT NULL THEN
    SELECT bank_account_id, current_usage, COALESCE(payment_gateway, false) AS payment_gateway
    INTO v_payment_method
    FROM public.sales_payment_methods
    WHERE id = v_order.sales_payment_method_id;
    IF FOUND THEN
      v_is_gateway := v_payment_method.payment_gateway;
      IF NOT v_is_gateway THEN
        UPDATE public.sales_payment_methods
           SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(v_order.total_amount, 0)),
               updated_at = now()
         WHERE id = v_order.sales_payment_method_id;
      END IF;
    END IF;
  END IF;

  -- IMMUTABLE BANK LEDGER: reverse instead of delete
  FOR r IN
    SELECT id FROM public.bank_transactions
     WHERE reference_number = v_order.order_number
       AND COALESCE(is_reversed, false) = false
       AND reverses_transaction_id IS NULL
  LOOP
    PERFORM public.reverse_bank_transaction(
      r.id,
      'Sales order deleted: ' || v_order.order_number,
      auth.uid()
    );
  END LOOP;

  IF v_client_name IS NOT NULL THEN
    UPDATE public.clients
       SET current_month_used = GREATEST(0, COALESCE(current_month_used, 0) - COALESCE(v_order.total_amount, 0)),
           updated_at = now()
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_client_name));
  END IF;

  DELETE FROM public.stock_transactions WHERE reference_number = v_order.order_number;
  IF v_order.product_id IS NOT NULL THEN
    SELECT current_stock_quantity, total_sales INTO v_product
    FROM public.products WHERE id = v_order.product_id;
    IF FOUND THEN
      UPDATE public.products
         SET current_stock_quantity = COALESCE(current_stock_quantity, 0) + COALESCE(v_order.quantity, 0),
             total_sales = GREATEST(0, COALESCE(total_sales, 0) - COALESCE(v_order.quantity, 0)),
             updated_at = now()
       WHERE id = v_order.product_id;
    END IF;
  END IF;

  -- IMMUTABLE WALLET LEDGER: reverse-by-id
  FOR r IN
    SELECT id FROM public.wallet_transactions
     WHERE ((reference_id = p_order_id AND reference_type IN ('SALES_ORDER', 'SALES_ORDER_FEE'))
         OR (reference_type = 'SALES_ORDER_FEE' AND description ILIKE '%' || v_order.order_number || '%'))
       AND COALESCE(is_reversed, false) = false
       AND reverses_transaction_id IS NULL
  LOOP
    PERFORM public.reverse_wallet_transaction(
      r.id,
      'Reversal due to sales-order delete: ' || v_order.order_number,
      auth.uid()
    );
  END LOOP;

  DELETE FROM public.sales_orders WHERE id = p_order_id;

  IF v_client_name IS NOT NULL THEN
    PERFORM public.maybe_delete_orphan_client(v_client_name);
  END IF;
EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.reversal_guards
   WHERE entity_type = 'SALES_ORDER' AND entity_id = p_order_id AND action = 'DELETE_WITH_REVERSAL';
  RAISE;
END;
$function$;


-- 3) delete_purchase_order_with_reversal: reverse linked bank rows instead of deleting
CREATE OR REPLACE FUNCTION public.delete_purchase_order_with_reversal(order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  order_record RECORD;
  bank_transaction_record RECORD;
  wallet_transaction_record RECORD;
  stock_transaction_record RECORD;
  supplier_name_to_check text;
BEGIN
  PERFORM public.require_permission(auth.uid(), 'purchase_manage', 'delete_purchase_order');
  PERFORM public.require_permission(auth.uid(), 'erp_destructive', 'delete_purchase_order');

  SELECT * INTO order_record FROM public.purchase_orders WHERE id = order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', true, 'message', 'Order already deleted');
  END IF;

  DELETE FROM public.reversal_guards
   WHERE entity_type = 'PURCHASE_ORDER'
     AND entity_id = order_id
     AND action = 'DELETE_WITH_REVERSAL';

  IF order_record.status != 'COMPLETED' THEN
    RETURN json_build_object('success', false, 'error', 'Can only delete completed purchase orders');
  END IF;

  supplier_name_to_check := order_record.supplier_name;

  DELETE FROM public.wallet_fee_deductions
   WHERE wallet_fee_deductions.order_id = delete_purchase_order_with_reversal.order_id
     AND order_type = 'PURCHASE';

  IF order_record.purchase_payment_method_id IS NOT NULL THEN
    UPDATE public.purchase_payment_methods
       SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(order_record.total_amount, 0)),
           updated_at = now()
     WHERE id = order_record.purchase_payment_method_id;
  END IF;

  -- IMMUTABLE BANK LEDGER: reverse instead of delete
  FOR bank_transaction_record IN
    SELECT bt.id FROM public.bank_transactions bt
     WHERE (bt.reference_number = order_record.order_number
            OR bt.description LIKE '%' || order_record.order_number || '%')
       AND COALESCE(bt.is_reversed, false) = false
       AND bt.reverses_transaction_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.purchase_orders po
          WHERE po.order_number = order_record.order_number
            AND po.id != delete_purchase_order_with_reversal.order_id
       )
  LOOP
    PERFORM public.reverse_bank_transaction(
      bank_transaction_record.id,
      'Purchase order deleted: ' || order_record.order_number,
      auth.uid()
    );
  END LOOP;

  -- IMMUTABLE WALLET LEDGER: reverse instead of delete
  FOR wallet_transaction_record IN
    SELECT wt.id FROM public.wallet_transactions wt
     WHERE wt.reference_id = delete_purchase_order_with_reversal.order_id
       AND wt.reference_type IN ('PURCHASE_ORDER', 'PURCHASE')
       AND COALESCE(wt.is_reversed, false) = false
       AND wt.reverses_transaction_id IS NULL
  LOOP
    PERFORM public.reverse_wallet_transaction(
      wallet_transaction_record.id,
      'Reversal due to purchase-order delete: ' || order_record.order_number,
      auth.uid()
    );
  END LOOP;

  FOR stock_transaction_record IN
    SELECT st.* FROM public.stock_transactions st
     WHERE st.reference_number = order_record.order_number
       AND NOT EXISTS (
         SELECT 1 FROM public.purchase_orders po
          WHERE po.order_number = order_record.order_number
            AND po.id != delete_purchase_order_with_reversal.order_id
       )
  LOOP
    IF stock_transaction_record.transaction_type IN ('PURCHASE','IN','STOCK_IN') THEN
      UPDATE public.products
         SET current_stock_quantity = COALESCE(current_stock_quantity, 0) - COALESCE(stock_transaction_record.quantity, 0),
             updated_at = now()
       WHERE id = stock_transaction_record.product_id;
    ELSIF stock_transaction_record.transaction_type IN ('SALE','OUT','STOCK_OUT') THEN
      UPDATE public.products
         SET current_stock_quantity = COALESCE(current_stock_quantity, 0) + COALESCE(stock_transaction_record.quantity, 0),
             updated_at = now()
       WHERE id = stock_transaction_record.product_id;
    END IF;
    DELETE FROM public.stock_transactions WHERE id = stock_transaction_record.id;
  END LOOP;

  DELETE FROM public.purchase_orders WHERE id = delete_purchase_order_with_reversal.order_id;

  INSERT INTO public.reversal_guards(entity_type, entity_id, action)
  VALUES ('PURCHASE_ORDER', delete_purchase_order_with_reversal.order_id, 'DELETE_WITH_REVERSAL')
  ON CONFLICT DO NOTHING;

  IF supplier_name_to_check IS NOT NULL THEN
    PERFORM public.maybe_delete_orphan_client(supplier_name_to_check);
  END IF;

  RETURN json_build_object('success', true, 'message', 'Purchase order deleted and reversed');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;


-- 4) handle_sales_order_payment_method_change: reverse old bank row instead of delete
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

  -- BANK TRANSACTION RECONCILIATION (immutable: reverse, then re-insert)
  SELECT id INTO v_existing_transaction_id
    FROM public.bank_transactions
   WHERE reference_number = v_order_number
     AND transaction_type = 'INCOME'
     AND COALESCE(is_reversed, false) = false
     AND reverses_transaction_id IS NULL
   LIMIT 1;

  IF v_existing_transaction_id IS NOT NULL AND v_old_bank_id IS DISTINCT FROM v_new_bank_id THEN
    PERFORM public.reverse_bank_transaction(
      v_existing_transaction_id,
      'Payment method changed for order ' || v_order_number,
      auth.uid()
    );

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


-- 5) reconcile_purchase_order_edit: reverse old bank rows instead of delete
CREATE OR REPLACE FUNCTION public.reconcile_purchase_order_edit(p_order_id uuid, p_order_number text, p_order_date date DEFAULT NULL::date, p_supplier_name text DEFAULT NULL::text, p_old_bank_account_id uuid DEFAULT NULL::uuid, p_new_bank_account_id uuid DEFAULT NULL::uuid, p_old_net_payable numeric DEFAULT 0, p_new_net_payable numeric DEFAULT 0, p_old_wallet_id uuid DEFAULT NULL::uuid, p_new_wallet_id uuid DEFAULT NULL::uuid, p_old_quantity numeric DEFAULT 0, p_new_quantity numeric DEFAULT 0, p_is_off_market boolean DEFAULT false, p_fee_percentage numeric DEFAULT 0, p_product_code text DEFAULT 'USDT'::text, p_payment_splits jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bank_changed BOOLEAN;
  v_amount_changed BOOLEAN;
  v_wallet_changed BOOLEAN;
  v_quantity_changed BOOLEAN;
  v_reversed_bank INT := 0;
  v_reversed_wallet INT := 0;
  v_new_fee NUMERIC := 0;
  v_new_net_qty NUMERIC;
  v_split JSONB;
  v_bank_id UUID;
  v_split_amount NUMERIC;
  v_bank_balance NUMERIC;
  v_bank_name TEXT;
  v_acct_type TEXT;
  v_has_splits BOOLEAN;
  v_existing_order_number TEXT;
  r RECORD;
BEGIN
  SELECT po.order_number INTO v_existing_order_number
    FROM public.purchase_orders po WHERE po.id = p_order_id;
  v_existing_order_number := COALESCE(v_existing_order_number, p_order_number);

  v_bank_changed := (p_old_bank_account_id IS DISTINCT FROM p_new_bank_account_id);
  v_amount_changed := (p_old_net_payable IS DISTINCT FROM p_new_net_payable);
  v_wallet_changed := (p_old_wallet_id IS DISTINCT FROM p_new_wallet_id);
  v_quantity_changed := (p_old_quantity IS DISTINCT FROM p_new_quantity);
  v_has_splits := (p_payment_splits IS NOT NULL AND jsonb_array_length(p_payment_splits) > 0);

  DELETE FROM public.purchase_order_payment_splits WHERE purchase_order_id = p_order_id;
  IF v_has_splits THEN
    FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
      v_bank_id := (v_split->>'bank_account_id')::UUID;
      v_split_amount := (v_split->>'amount')::NUMERIC;
      INSERT INTO public.purchase_order_payment_splits (purchase_order_id, bank_account_id, amount)
      VALUES (p_order_id, v_bank_id, v_split_amount);
    END LOOP;
  END IF;

  IF v_bank_changed OR v_amount_changed OR v_has_splits THEN
    -- IMMUTABLE BANK LEDGER: reverse instead of delete
    FOR r IN
      SELECT id FROM public.bank_transactions
       WHERE reference_number IN (v_existing_order_number, p_order_number)
         AND transaction_type = 'EXPENSE'
         AND category = 'Purchase'
         AND COALESCE(is_reversed, false) = false
         AND reverses_transaction_id IS NULL
    LOOP
      PERFORM public.reverse_bank_transaction(
        r.id,
        'Purchase order edited: ' || p_order_number,
        auth.uid()
      );
      v_reversed_bank := v_reversed_bank + 1;
    END LOOP;

    IF v_has_splits THEN
      FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
        v_bank_id := (v_split->>'bank_account_id')::UUID;
        v_split_amount := (v_split->>'amount')::NUMERIC;
        SELECT ba.balance, ba.account_name, ba.account_type
          INTO v_bank_balance, v_bank_name, v_acct_type
          FROM public.bank_accounts ba WHERE ba.id = v_bank_id AND ba.status = 'ACTIVE';
        IF v_bank_balance IS NULL THEN RAISE EXCEPTION 'Bank account not found or inactive'; END IF;
        IF UPPER(TRIM(COALESCE(v_acct_type,''))) <> 'CREDIT' AND v_bank_balance < v_split_amount THEN
          RAISE EXCEPTION 'Insufficient balance in %. Available: Rs%, Required: Rs%', v_bank_name, v_bank_balance, v_split_amount;
        END IF;
        INSERT INTO public.bank_transactions (
          bank_account_id, transaction_type, amount, transaction_date,
          category, description, reference_number, related_account_name
        ) VALUES (
          v_bank_id, 'EXPENSE', v_split_amount, COALESCE(p_order_date, CURRENT_DATE), 'Purchase',
          'Stock Purchase - ' || COALESCE(p_supplier_name,'') || ' - Order #' || p_order_number || ' [Split Payment]',
          p_order_number, p_supplier_name
        );
      END LOOP;
    ELSIF p_new_bank_account_id IS NOT NULL THEN
      SELECT ba.balance, ba.account_name, ba.account_type
        INTO v_bank_balance, v_bank_name, v_acct_type
        FROM public.bank_accounts ba WHERE ba.id = p_new_bank_account_id AND ba.status = 'ACTIVE';
      IF v_bank_balance IS NULL THEN RAISE EXCEPTION 'Bank account not found or inactive'; END IF;
      IF UPPER(TRIM(COALESCE(v_acct_type,''))) <> 'CREDIT' AND v_bank_balance < p_new_net_payable THEN
        RAISE EXCEPTION 'Insufficient balance in %. Available: Rs%, Required: Rs%', v_bank_name, v_bank_balance, p_new_net_payable;
      END IF;
      INSERT INTO public.bank_transactions (
        bank_account_id, transaction_type, amount, transaction_date,
        category, description, reference_number, related_account_name
      ) VALUES (
        p_new_bank_account_id, 'EXPENSE', p_new_net_payable, COALESCE(p_order_date, CURRENT_DATE), 'Purchase',
        'Stock Purchase - ' || COALESCE(p_supplier_name,'') || ' - Order #' || p_order_number,
        p_order_number, p_supplier_name
      );
    END IF;
  END IF;

  IF v_wallet_changed OR v_quantity_changed OR v_amount_changed THEN
    FOR r IN
      SELECT id FROM public.wallet_transactions
       WHERE reference_id = p_order_id
         AND reference_type IN ('PURCHASE','PURCHASE_ORDER')
         AND COALESCE(is_reversed,false) = false
         AND reverses_transaction_id IS NULL
    LOOP
      PERFORM public.reverse_wallet_transaction(
        r.id,
        'Reversal due to purchase-order edit: ' || p_order_number,
        auth.uid()
      );
      v_reversed_wallet := v_reversed_wallet + 1;
    END LOOP;

    IF p_new_wallet_id IS NOT NULL AND p_new_quantity > 0 THEN
      IF COALESCE(p_fee_percentage,0) > 0 THEN
        v_new_fee := COALESCE(p_new_quantity * (p_fee_percentage/100), 0);
        v_new_net_qty := p_new_quantity - v_new_fee;
      ELSE
        v_new_net_qty := p_new_quantity;
      END IF;

      INSERT INTO public.wallet_transactions (
        wallet_id, asset_code, transaction_type, amount,
        reference_id, reference_type, description
      ) VALUES (
        p_new_wallet_id, COALESCE(p_product_code,'USDT'), 'CREDIT', v_new_net_qty,
        p_order_id, 'PURCHASE_ORDER',
        'Purchase from ' || COALESCE(p_supplier_name,'Unknown') || ' (edited) - #' || p_order_number
      );
    END IF;
  END IF;

  IF v_quantity_changed OR v_amount_changed THEN
    DELETE FROM public.stock_transactions
     WHERE reference_number IN (v_existing_order_number, p_order_number);

    IF p_new_quantity > 0 THEN
      INSERT INTO public.stock_transactions (
        product_id, transaction_type, quantity, unit_price,
        total_amount, reason, reference_number, supplier_customer_name, transaction_date
      ) VALUES (
        (SELECT id FROM public.products WHERE code = p_product_code LIMIT 1),
        'PURCHASE', p_new_quantity,
        CASE WHEN p_new_quantity > 0 THEN p_new_net_payable / p_new_quantity ELSE 0 END,
        p_new_net_payable,
        'Purchase from ' || COALESCE(p_supplier_name,'Unknown') || ' (edited)',
        p_order_number, p_supplier_name, COALESCE(p_order_date, CURRENT_DATE)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_bank_txns', v_reversed_bank,
    'reversed_wallet_txns', v_reversed_wallet,
    'has_splits', v_has_splits,
    'old_order_number_reversed', v_existing_order_number
  );
END;
$function$;


-- 6) reconcile_sales_order_edit: reverse old bank rows instead of delete
CREATE OR REPLACE FUNCTION public.reconcile_sales_order_edit(p_order_id uuid, p_order_number text, p_old_total_amount numeric, p_new_total_amount numeric, p_old_quantity numeric, p_new_quantity numeric, p_old_wallet_id uuid, p_new_wallet_id uuid, p_payment_method_id uuid, p_client_name text, p_order_date text, p_is_off_market boolean, p_fee_percentage numeric, p_product_code text DEFAULT 'USDT'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_amount_changed BOOLEAN;
  v_quantity_changed BOOLEAN;
  v_wallet_changed BOOLEAN;
  v_bank_id UUID;
  v_is_gateway BOOLEAN;
  v_reversed_bank INT := 0;
  v_reversed_wallet INT := 0;
  v_deleted_stock INT := 0;
  v_new_fee NUMERIC := 0;
  v_product_id UUID;
  v_asset_code TEXT := COALESCE(p_product_code, 'USDT');
  r RECORD;
BEGIN
  v_amount_changed := (p_old_total_amount IS DISTINCT FROM p_new_total_amount);
  v_quantity_changed := (p_old_quantity IS DISTINCT FROM p_new_quantity);
  v_wallet_changed := (p_old_wallet_id IS DISTINCT FROM p_new_wallet_id);

  IF v_amount_changed AND p_payment_method_id IS NOT NULL THEN
    SELECT bank_account_id, COALESCE(payment_gateway,false)
      INTO v_bank_id, v_is_gateway
      FROM sales_payment_methods WHERE id = p_payment_method_id;

    IF v_bank_id IS NOT NULL AND NOT COALESCE(v_is_gateway,false) THEN
      -- IMMUTABLE BANK LEDGER: reverse instead of delete
      FOR r IN
        SELECT id FROM bank_transactions
         WHERE reference_number = p_order_number
           AND transaction_type = 'INCOME'
           AND COALESCE(is_reversed, false) = false
           AND reverses_transaction_id IS NULL
      LOOP
        PERFORM public.reverse_bank_transaction(
          r.id,
          'Sales order edited: ' || p_order_number,
          auth.uid()
        );
        v_reversed_bank := v_reversed_bank + 1;
      END LOOP;

      INSERT INTO bank_transactions (
        bank_account_id, transaction_type, amount, transaction_date,
        category, description, reference_number, related_account_name
      ) VALUES (
        v_bank_id, 'INCOME', p_new_total_amount,
        COALESCE(p_order_date::date, CURRENT_DATE), 'Sales',
        'Sales Order (Updated) - ' || p_order_number || ' - ' || COALESCE(p_client_name,''),
        p_order_number, p_client_name
      );
    END IF;
  END IF;

  IF (v_wallet_changed OR v_quantity_changed) AND (p_old_wallet_id IS NOT NULL OR p_new_wallet_id IS NOT NULL) THEN
    FOR r IN
      SELECT id FROM wallet_transactions
       WHERE reference_id = p_order_id
         AND reference_type IN ('SALES_ORDER','SALES_ORDER_FEE')
         AND COALESCE(is_reversed,false) = false
         AND reverses_transaction_id IS NULL
    LOOP
      PERFORM public.reverse_wallet_transaction(
        r.id,
        'Reversal due to sales-order edit: ' || p_order_number,
        auth.uid()
      );
      v_reversed_wallet := v_reversed_wallet + 1;
    END LOOP;

    DELETE FROM wallet_fee_deductions
     WHERE order_id = p_order_id AND order_type = 'SALES_ORDER';

    DELETE FROM reversal_guards
     WHERE entity_id = p_order_id AND entity_type = 'fee_deduction';

    IF NOT COALESCE(p_is_off_market,false) AND COALESCE(p_fee_percentage,0) > 0 THEN
      v_new_fee := p_new_quantity * (p_fee_percentage / 100);
    END IF;

    IF p_new_wallet_id IS NOT NULL AND p_new_quantity > 0 THEN
      INSERT INTO wallet_transactions (
        wallet_id, transaction_type, amount, asset_code, reference_type, reference_id,
        description, balance_before, balance_after
      ) VALUES (
        p_new_wallet_id, 'DEBIT', p_new_quantity, v_asset_code, 'SALES_ORDER', p_order_id,
        v_asset_code || ' sold via sales order ' || p_order_number || ' (edited)',
        0, 0
      );
      IF v_new_fee > 0 THEN
        INSERT INTO wallet_transactions (
          wallet_id, transaction_type, amount, asset_code, reference_type, reference_id,
          description, balance_before, balance_after
        ) VALUES (
          p_new_wallet_id, 'DEBIT', v_new_fee, v_asset_code, 'SALES_ORDER_FEE', p_order_id,
          'Platform fee (' || v_asset_code || ') for sales order ' || p_order_number,
          0, 0
        );
        INSERT INTO wallet_fee_deductions (
          wallet_id, order_id, order_type, order_number, fee_amount
        ) VALUES (
          p_new_wallet_id, p_order_id, 'SALES_ORDER', p_order_number, v_new_fee
        );
      END IF;
    END IF;
  END IF;

  IF v_quantity_changed OR v_amount_changed THEN
    SELECT id INTO v_product_id FROM products WHERE code = v_asset_code LIMIT 1;
    IF v_product_id IS NOT NULL THEN
      DELETE FROM stock_transactions
       WHERE reference_number = p_order_number
         AND product_id = v_product_id AND transaction_type = 'Sales';
      GET DIAGNOSTICS v_deleted_stock = ROW_COUNT;

      IF p_new_quantity > 0 THEN
        INSERT INTO stock_transactions (
          product_id, transaction_type, quantity, unit_price, total_amount,
          transaction_date, supplier_customer_name, reference_number, reason
        ) VALUES (
          v_product_id, 'Sales', -p_new_quantity,
          CASE WHEN p_new_quantity > 0 THEN p_new_total_amount / p_new_quantity ELSE 0 END,
          p_new_total_amount, COALESCE(p_order_date::date, CURRENT_DATE),
          p_client_name, p_order_number, 'Sales Order Transaction (Updated)'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'amount_changed', v_amount_changed,
    'quantity_changed', v_quantity_changed,
    'wallet_changed', v_wallet_changed,
    'deleted_bank_txs', v_reversed_bank,
    'reversed_wallet_txs', v_reversed_wallet,
    'deleted_stock_txs', v_deleted_stock,
    'new_fee', v_new_fee
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
