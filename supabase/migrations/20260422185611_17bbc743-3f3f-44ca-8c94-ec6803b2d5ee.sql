
-- =============================================================
-- MIGRATION A — Fix legacy mutation paths on wallet_transactions
-- =============================================================

-- 1) Drop the obsolete delete-with-reversal RPC (callers migrated)
DROP FUNCTION IF EXISTS public.delete_wallet_transaction_with_reversal(uuid, uuid);

-- 2) Replace cleanup trigger function: reverse instead of delete
CREATE OR REPLACE FUNCTION public.cleanup_wallet_transactions_on_sales_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.wallet_transactions
    WHERE reference_type IN ('SALES_ORDER','SALES_ORDER_FEE')
      AND reference_id = OLD.id
      AND COALESCE(is_reversed, false) = false
      AND reverses_transaction_id IS NULL
  LOOP
    PERFORM public.reverse_wallet_transaction(
      r.id,
      'Auto-reversal: parent sales order ' || OLD.id::text || ' deleted',
      NULL
    );
  END LOOP;
  RETURN OLD;
END;
$$;

-- 3) delete_purchase_order_with_reversal — reverse wallet rows instead of deleting
CREATE OR REPLACE FUNCTION public.delete_purchase_order_with_reversal(order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  FOR bank_transaction_record IN
    SELECT bt.* FROM public.bank_transactions bt
    WHERE (bt.reference_number = order_record.order_number
           OR bt.description LIKE '%' || order_record.order_number || '%')
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.order_number = order_record.order_number
          AND po.id != delete_purchase_order_with_reversal.order_id
      )
  LOOP
    DELETE FROM public.bank_transactions WHERE id = bank_transaction_record.id;
  END LOOP;

  -- IMMUTABLE LEDGER: reverse instead of delete
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
$$;

-- 4) delete_sales_order_with_reversal — reverse wallet rows instead of deleting
CREATE OR REPLACE FUNCTION public.delete_sales_order_with_reversal(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order RECORD; v_payment_method RECORD; v_product RECORD;
  v_client_name TEXT; v_guard_inserted int := 0; v_is_gateway BOOLEAN := false;
  r RECORD;
BEGIN
  PERFORM public.require_permission(auth.uid(), 'sales_manage', 'delete_sales_order');
  PERFORM public.require_permission(auth.uid(), 'erp_destructive', 'delete_sales_order');

  DELETE FROM public.reversal_guards WHERE entity_type = 'SALES_ORDER' AND entity_id = p_order_id AND action = 'DELETE_WITH_REVERSAL';
  INSERT INTO public.reversal_guards(entity_type, entity_id, action) VALUES ('SALES_ORDER', p_order_id, 'DELETE_WITH_REVERSAL') ON CONFLICT DO NOTHING;
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
    INTO v_payment_method FROM public.sales_payment_methods WHERE id = v_order.sales_payment_method_id;
    IF FOUND THEN
      v_is_gateway := v_payment_method.payment_gateway;
      IF NOT v_is_gateway THEN
        UPDATE public.sales_payment_methods
        SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(v_order.total_amount, 0)), updated_at = now()
        WHERE id = v_order.sales_payment_method_id;
      END IF;
    END IF;
  END IF;

  DELETE FROM public.bank_transactions WHERE reference_number = v_order.order_number;
  IF v_client_name IS NOT NULL THEN
    UPDATE public.clients SET current_month_used = GREATEST(0, COALESCE(current_month_used, 0) - COALESCE(v_order.total_amount, 0)), updated_at = now()
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_client_name));
  END IF;

  DELETE FROM public.stock_transactions WHERE reference_number = v_order.order_number;
  IF v_order.product_id IS NOT NULL THEN
    SELECT current_stock_quantity, total_sales INTO v_product FROM public.products WHERE id = v_order.product_id;
    IF FOUND THEN
      UPDATE public.products SET current_stock_quantity = COALESCE(current_stock_quantity, 0) + COALESCE(v_order.quantity, 0),
        total_sales = GREATEST(0, COALESCE(total_sales, 0) - COALESCE(v_order.quantity, 0)), updated_at = now()
      WHERE id = v_order.product_id;
    END IF;
  END IF;

  -- IMMUTABLE LEDGER: reverse-by-id instead of delete
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

  IF v_client_name IS NOT NULL THEN PERFORM public.maybe_delete_orphan_client(v_client_name); END IF;
EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.reversal_guards WHERE entity_type = 'SALES_ORDER' AND entity_id = p_order_id AND action = 'DELETE_WITH_REVERSAL';
  RAISE;
END;
$$;

-- 5) handle_sales_order_quantity_change — reverse + post new
CREATE OR REPLACE FUNCTION public.handle_sales_order_quantity_change(
  p_order_id uuid, p_wallet_id uuid, p_old_quantity numeric, p_new_quantity numeric
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_difference NUMERIC;
  v_existing_transaction RECORD;
BEGIN
  v_difference := p_new_quantity - p_old_quantity;
  IF v_difference = 0 THEN RETURN TRUE; END IF;

  SELECT * INTO v_existing_transaction
  FROM public.wallet_transactions
  WHERE reference_id = p_order_id
    AND wallet_id = p_wallet_id
    AND reference_type = 'SALES_ORDER'
    AND COALESCE(is_reversed, false) = false
    AND reverses_transaction_id IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_transaction.id IS NOT NULL THEN
    PERFORM public.reverse_wallet_transaction(
      v_existing_transaction.id,
      'Sales order quantity change ' || p_old_quantity || ' → ' || p_new_quantity,
      auth.uid()
    );

    INSERT INTO public.wallet_transactions (
      wallet_id, transaction_type, amount, asset_code,
      reference_type, reference_id, description,
      balance_before, balance_after
    ) VALUES (
      p_wallet_id, 'DEBIT', p_new_quantity, COALESCE(v_existing_transaction.asset_code, 'USDT'),
      'SALES_ORDER', p_order_id,
      'USDT sold via sales order (quantity adjusted)',
      0, 0
    );
  END IF;

  RETURN TRUE;
END;
$$;

-- 6) handle_sales_order_wallet_change — reverse + repost on new wallet
CREATE OR REPLACE FUNCTION public.handle_sales_order_wallet_change(
  p_order_id uuid, p_old_wallet_id uuid, p_new_wallet_id uuid, p_quantity numeric
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_guard_key TEXT;
  v_existing_transaction RECORD;
BEGIN
  v_guard_key := 'sales_wallet_change_' || p_order_id::TEXT || '_' || p_old_wallet_id::TEXT || '_' || p_new_wallet_id::TEXT;

  INSERT INTO public.reversal_guards (guard_key)
  VALUES (v_guard_key)
  ON CONFLICT (guard_key) DO NOTHING;

  IF NOT FOUND THEN
    RAISE NOTICE 'Wallet change already processed for order %, skipping', p_order_id;
    RETURN TRUE;
  END IF;

  -- Reverse all existing postings on the OLD wallet for this order
  FOR v_existing_transaction IN
    SELECT id, asset_code FROM public.wallet_transactions
    WHERE reference_id = p_order_id
      AND wallet_id = p_old_wallet_id
      AND reference_type IN ('SALES_ORDER', 'SALES_ORDER_FEE')
      AND COALESCE(is_reversed, false) = false
      AND reverses_transaction_id IS NULL
  LOOP
    PERFORM public.reverse_wallet_transaction(
      v_existing_transaction.id,
      'Wallet change for order ' || p_order_id::text,
      auth.uid()
    );
  END LOOP;

  -- Post new debit on new wallet
  INSERT INTO public.wallet_transactions (
    wallet_id, transaction_type, amount, asset_code,
    reference_type, reference_id, description,
    balance_before, balance_after
  ) VALUES (
    p_new_wallet_id, 'DEBIT', p_quantity, 'USDT',
    'SALES_ORDER', p_order_id,
    'USDT sold via sales order (wallet changed)',
    0, 0
  );

  RETURN TRUE;
END;
$$;

-- 7) reconcile_purchase_order_edit — reverse-by-id instead of mass delete
CREATE OR REPLACE FUNCTION public.reconcile_purchase_order_edit(
  p_order_id uuid, p_order_number text, p_order_date date DEFAULT NULL,
  p_supplier_name text DEFAULT NULL, p_old_bank_account_id uuid DEFAULT NULL,
  p_new_bank_account_id uuid DEFAULT NULL, p_old_net_payable numeric DEFAULT 0,
  p_new_net_payable numeric DEFAULT 0, p_old_wallet_id uuid DEFAULT NULL,
  p_new_wallet_id uuid DEFAULT NULL, p_old_quantity numeric DEFAULT 0,
  p_new_quantity numeric DEFAULT 0, p_is_off_market boolean DEFAULT false,
  p_fee_percentage numeric DEFAULT 0, p_product_code text DEFAULT 'USDT',
  p_payment_splits jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bank_changed BOOLEAN;
  v_amount_changed BOOLEAN;
  v_wallet_changed BOOLEAN;
  v_quantity_changed BOOLEAN;
  v_deleted_bank INT := 0;
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
    DELETE FROM public.bank_transactions
    WHERE reference_number IN (v_existing_order_number, p_order_number)
      AND transaction_type = 'EXPENSE' AND category = 'Purchase';
    GET DIAGNOSTICS v_deleted_bank = ROW_COUNT;

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
    -- IMMUTABLE LEDGER: reverse instead of delete
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
    'deleted_bank_txns', v_deleted_bank,
    'reversed_wallet_txns', v_reversed_wallet,
    'has_splits', v_has_splits,
    'old_order_number_reversed', v_existing_order_number
  );
END;
$$;

-- 8) reconcile_sales_order_edit — reverse-by-id instead of delete
CREATE OR REPLACE FUNCTION public.reconcile_sales_order_edit(
  p_order_id uuid, p_order_number text, p_old_total_amount numeric,
  p_new_total_amount numeric, p_old_quantity numeric, p_new_quantity numeric,
  p_old_wallet_id uuid, p_new_wallet_id uuid, p_payment_method_id uuid,
  p_client_name text, p_order_date text, p_is_off_market boolean,
  p_fee_percentage numeric, p_product_code text DEFAULT 'USDT'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_amount_changed BOOLEAN;
  v_quantity_changed BOOLEAN;
  v_wallet_changed BOOLEAN;
  v_bank_id UUID;
  v_is_gateway BOOLEAN;
  v_deleted_bank INT := 0;
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
      DELETE FROM bank_transactions
      WHERE reference_number = p_order_number AND transaction_type = 'INCOME';
      GET DIAGNOSTICS v_deleted_bank = ROW_COUNT;

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
    -- IMMUTABLE LEDGER: reverse instead of delete
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
    'deleted_bank_txs', v_deleted_bank,
    'reversed_wallet_txs', v_reversed_wallet,
    'deleted_stock_txs', v_deleted_stock,
    'new_fee', v_new_fee
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 9) Simplify update_wallet_balance trigger function to INSERT-only
CREATE OR REPLACE FUNCTION public.update_wallet_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset TEXT;
  v_wallet_id UUID;
  v_amount NUMERIC;
  v_tx_type TEXT;
BEGIN
  -- The wallet_transactions table is append-only (immutable ledger).
  -- UPDATE/DELETE are blocked by trg_wallet_tx_block_mutation, so this
  -- trigger only ever needs to handle INSERT. Reversals are themselves
  -- inserted as new opposite-sign rows and naturally re-balance here.

  IF TG_OP <> 'INSERT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_asset := COALESCE(NEW.asset_code, 'USDT');
  v_wallet_id := NEW.wallet_id;
  v_amount := NEW.amount;
  v_tx_type := NEW.transaction_type;

  IF v_tx_type IN ('CREDIT', 'TRANSFER_IN') THEN
    IF v_asset = 'USDT' THEN
      UPDATE wallets
      SET current_balance = current_balance + v_amount,
          total_received = total_received + v_amount,
          updated_at = now()
      WHERE id = v_wallet_id;
    END IF;
    INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
    VALUES (v_wallet_id, v_asset, v_amount, v_amount, 0)
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
      balance = wallet_asset_balances.balance + EXCLUDED.balance,
      total_received = wallet_asset_balances.total_received + EXCLUDED.total_received,
      updated_at = now();

  ELSIF v_tx_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
    IF v_asset = 'USDT' THEN
      UPDATE wallets
      SET current_balance = current_balance - v_amount,
          total_sent = total_sent + v_amount,
          updated_at = now()
      WHERE id = v_wallet_id;
    END IF;
    INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
    VALUES (v_wallet_id, v_asset, -v_amount, 0, v_amount)
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
      balance = wallet_asset_balances.balance + EXCLUDED.balance,
      total_sent = wallet_asset_balances.total_sent + EXCLUDED.total_sent,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

-- 10) Convert wallet_id FK to NO ACTION so wallet hard-delete cannot silently drop ledger
ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_wallet_id_fkey;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_wallet_id_fkey
  FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE NO ACTION;
