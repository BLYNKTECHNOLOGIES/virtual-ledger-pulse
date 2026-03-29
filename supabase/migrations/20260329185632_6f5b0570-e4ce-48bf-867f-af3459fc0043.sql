-- ================================================================
-- PHASE: Data Fixes + Role Hierarchy + RPC Enforcement
-- ================================================================

-- 1. Add hierarchy columns to roles table
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS hierarchy_level INT DEFAULT 100;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS can_manage_roles_below BOOLEAN DEFAULT false;

-- Set hierarchy levels for existing roles
UPDATE public.roles SET hierarchy_level = -1, can_manage_roles_below = true WHERE name = 'Super Admin';
UPDATE public.roles SET hierarchy_level = 0, can_manage_roles_below = true WHERE name = 'Admin';
UPDATE public.roles SET hierarchy_level = 1, can_manage_roles_below = true WHERE name = 'COO';
UPDATE public.roles SET hierarchy_level = 5, can_manage_roles_below = false WHERE name = 'operation';
UPDATE public.roles SET hierarchy_level = 10, can_manage_roles_below = false WHERE name = 'Auditor';
UPDATE public.roles SET hierarchy_level = 10, can_manage_roles_below = false WHERE name = 'Finance';
UPDATE public.roles SET hierarchy_level = 8, can_manage_roles_below = false WHERE name = 'HR Manager';
UPDATE public.roles SET hierarchy_level = 999, can_manage_roles_below = false WHERE name = 'Standby';

-- 2. Sync users.role_id → user_roles for any users missing from junction table
INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, u.role_id
FROM public.users u
WHERE u.role_id IS NOT NULL
AND u.status = 'ACTIVE'
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id
)
ON CONFLICT DO NOTHING;

-- 3. For users where users.role_id conflicts with user_roles, sync user_roles → users.role_id
-- (user_roles is the source of truth for permissions)
UPDATE public.users u
SET role_id = ur.role_id
FROM public.user_roles ur
WHERE ur.user_id = u.id
AND u.role_id IS NOT NULL
AND u.role_id != ur.role_id;

-- 4. For users with NULL role_id but valid user_roles, populate role_id
UPDATE public.users u
SET role_id = ur.role_id
FROM public.user_roles ur
WHERE ur.user_id = u.id
AND u.role_id IS NULL;

-- ================================================================
-- 5. Update require_permission to support audit/enforce mode properly
-- ================================================================
CREATE OR REPLACE FUNCTION public.require_permission(
  _user_id uuid,
  _permission text,
  _action_name text DEFAULT 'unknown'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_perm boolean;
  _is_super_admin boolean;
  _mode text;
  _username text;
BEGIN
  -- Super Admin bypass
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = _user_id
    AND rp.permission::text = 'super_admin_access'
  ) INTO _is_super_admin;

  IF _is_super_admin THEN
    RETURN true;
  END IF;

  -- Check if user has the permission
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = _user_id
    AND rp.permission::text = _permission
  ) INTO _has_perm;

  -- Get enforcement mode
  SELECT mode INTO _mode FROM public.permission_enforcement_config WHERE id = 'default';
  _mode := COALESCE(_mode, 'audit');

  IF NOT _has_perm THEN
    SELECT username INTO _username FROM public.users WHERE id = _user_id;

    INSERT INTO public.permission_enforcement_log 
      (user_id, username, attempted_action, required_permission, had_permission, enforcement_mode, blocked)
    VALUES 
      (_user_id, COALESCE(_username, 'unknown'), _action_name, _permission, false, _mode, _mode = 'enforce');

    IF _mode = 'enforce' THEN
      RAISE EXCEPTION 'Permission denied: % requires % permission', _action_name, _permission
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN _has_perm;
END;
$$;

-- ================================================================
-- 6. INJECT require_permission INTO ALL 13 CRITICAL RPCs
-- ================================================================

-- 6a. delete_purchase_order_with_reversal
CREATE OR REPLACE FUNCTION public.delete_purchase_order_with_reversal(order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  order_record RECORD;
  bank_transaction_record RECORD;
  wallet_transaction_record RECORD;
  stock_transaction_record RECORD;
  supplier_name_to_check text;
BEGIN
  -- PERMISSION CHECK
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

  DELETE FROM public.wallet_fee_deductions WHERE wallet_fee_deductions.order_id = delete_purchase_order_with_reversal.order_id AND order_type = 'PURCHASE';

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

  FOR wallet_transaction_record IN
    SELECT wt.* FROM public.wallet_transactions wt
    WHERE wt.reference_id = delete_purchase_order_with_reversal.order_id
      AND wt.reference_type IN ('PURCHASE_ORDER', 'PURCHASE')
  LOOP
    DELETE FROM public.wallet_transactions WHERE id = wallet_transaction_record.id;
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

-- 6b. create_manual_purchase_with_split_payments_rpc
CREATE OR REPLACE FUNCTION public.create_manual_purchase_with_split_payments_rpc(
  p_order_number text, p_supplier_name text, p_order_date date, p_total_amount numeric,
  p_product_id uuid, p_quantity numeric, p_unit_price numeric, p_description text DEFAULT '',
  p_contact_number text DEFAULT NULL, p_credit_wallet_id uuid DEFAULT NULL,
  p_tds_option text DEFAULT 'NO_TDS', p_pan_number text DEFAULT NULL,
  p_fee_percentage numeric DEFAULT NULL, p_is_off_market boolean DEFAULT false,
  p_created_by uuid DEFAULT NULL, p_payment_splits jsonb DEFAULT '[]'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  -- PERMISSION CHECK
  PERFORM public.require_permission(auth.uid(), 'purchase_manage', 'create_purchase_order');

  SELECT public.create_manual_purchase_with_split_payments(
    p_order_number := p_order_number, p_supplier_name := p_supplier_name,
    p_order_date := p_order_date, p_total_amount := p_total_amount,
    p_product_id := p_product_id, p_quantity := p_quantity,
    p_unit_price := p_unit_price, p_description := p_description,
    p_credit_wallet_id := p_credit_wallet_id, p_tds_option := p_tds_option,
    p_pan_number := p_pan_number, p_fee_percentage := p_fee_percentage,
    p_is_off_market := p_is_off_market, p_created_by := p_created_by,
    p_contact_number := p_contact_number, p_payment_splits := p_payment_splits
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

-- 6c. approve_product_conversion - add permission check at start
CREATE OR REPLACE FUNCTION public.approve_product_conversion(p_conversion_id uuid, p_approved_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conv RECORD; v_pos RECORD; v_qty_net NUMERIC; v_gross_usdt NUMERIC;
  v_exec_rate NUMERIC; v_cost_out NUMERIC; v_realized_pnl NUMERIC;
  v_new_qty NUMERIC; v_new_pool NUMERIC; v_new_avg NUMERIC; v_fee_usdt_equiv NUMERIC;
  v_actual_balance NUMERIC; v_original_qty NUMERIC; v_adjusted BOOLEAN := false;
  v_dust_swept BOOLEAN := false; v_dust_amount NUMERIC := 0;
  v_remaining_balance NUMERIC; v_dust_threshold NUMERIC; v_original_gross_usdt NUMERIC;
BEGIN
  -- PERMISSION CHECK
  PERFORM public.require_permission(p_approved_by, 'stock_manage', 'approve_product_conversion');
  PERFORM public.require_permission(p_approved_by, 'stock_conversion_approve', 'approve_product_conversion');

  SELECT * INTO v_conv FROM erp_product_conversions WHERE id = p_conversion_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Conversion not found.'); END IF;
  IF v_conv.status <> 'PENDING_APPROVAL' THEN RETURN jsonb_build_object('success', false, 'error', 'Not pending approval. Status: ' || v_conv.status); END IF;

  BEGIN
    INSERT INTO reversal_guards (entity_type, entity_id, action) VALUES ('erp_conversion', p_conversion_id, 'approve');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed (idempotency guard).');
  END;

  v_exec_rate := COALESCE(v_conv.execution_rate_usdt, v_conv.price_usd);
  v_gross_usdt := v_conv.gross_usd_value;
  v_original_gross_usdt := v_gross_usdt;

  IF v_conv.side = 'BUY' THEN
    IF v_conv.fee_asset = v_conv.asset_code AND COALESCE(v_conv.fee_amount, 0) > 0 THEN
      v_qty_net := v_conv.quantity - v_conv.fee_amount;
    ELSE v_qty_net := v_conv.quantity; END IF;
  ELSE v_qty_net := v_conv.quantity; END IF;

  v_original_qty := v_qty_net;
  v_dust_threshold := CASE 
    WHEN v_conv.asset_code IN ('BTC') THEN 0.0001
    WHEN v_conv.asset_code IN ('ETH', 'BNB') THEN 0.001
    WHEN v_conv.asset_code IN ('SHIB', 'PEPE', 'DOGE') THEN 1000
    ELSE 0.01 END;

  INSERT INTO wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt)
  VALUES (v_conv.wallet_id, v_conv.asset_code, 0, 0, 0) ON CONFLICT (wallet_id, asset_code) DO NOTHING;

  SELECT * INTO v_pos FROM wallet_asset_positions
  WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code FOR UPDATE;

  IF v_pos.avg_cost_usdt < 0 OR v_pos.avg_cost_usdt > 999999 OR v_pos.cost_pool_usdt < -1 THEN
    UPDATE wallet_asset_positions 
    SET avg_cost_usdt = GREATEST(v_exec_rate, 0),
        cost_pool_usdt = GREATEST(v_pos.qty_on_hand * v_exec_rate, 0),
        updated_at = now()
    WHERE id = v_pos.id;
    SELECT * INTO v_pos FROM wallet_asset_positions WHERE id = v_pos.id;
  END IF;

  IF v_conv.side = 'BUY' THEN
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'DEBIT', v_gross_usdt, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: spent USDT', p_approved_by);
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'CREDIT', v_conv.quantity, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: received ' || v_conv.asset_code, p_approved_by);
    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY fee', p_approved_by);
    END IF;

    v_new_qty := v_pos.qty_on_hand + v_qty_net;
    v_new_pool := v_pos.cost_pool_usdt + v_gross_usdt;
    v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;
    UPDATE wallet_asset_positions SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now() WHERE id = v_pos.id;

    INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes) VALUES
      (p_conversion_id, 'USDT_OUT', 'USDT', 0, -v_gross_usdt, 'USDT spent for BUY'),
      (p_conversion_id, 'ASSET_IN', v_conv.asset_code, v_qty_net, 0, 'Asset received (net of fee)');
    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
      VALUES (p_conversion_id, 'FEE', COALESCE(v_conv.fee_asset, v_conv.asset_code), -v_conv.fee_amount, 0, 'Fee charged on BUY');
    END IF;
    UPDATE erp_product_conversions SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(),
      execution_rate_usdt = v_exec_rate, quantity_gross = v_conv.quantity, quantity_net = v_qty_net WHERE id = p_conversion_id;

  ELSIF v_conv.side = 'SELL' THEN
    SELECT COALESCE(SUM(
      CASE WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount 
           WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -amount 
           ELSE 0 END
    ), 0) INTO v_actual_balance
    FROM wallet_transactions WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code;

    IF COALESCE(v_actual_balance, 0) < v_qty_net THEN
      IF COALESCE(v_actual_balance, 0) >= v_qty_net * 0.98 AND COALESCE(v_actual_balance, 0) > 0 THEN
        v_qty_net := v_actual_balance; v_adjusted := true;
      ELSE
        DELETE FROM reversal_guards WHERE entity_type = 'erp_conversion' AND entity_id = p_conversion_id AND action = 'approve';
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance. Available (ledger): ' || COALESCE(v_actual_balance, 0) || ', Required: ' || v_qty_net);
      END IF;
    ELSIF COALESCE(v_actual_balance, 0) > v_qty_net AND (COALESCE(v_actual_balance, 0) - v_qty_net) <= v_dust_threshold THEN
      v_dust_amount := v_actual_balance - v_qty_net; v_qty_net := v_actual_balance; v_adjusted := true; v_dust_swept := true;
    END IF;

    IF v_actual_balance - v_qty_net < -0.000000001 THEN
      DELETE FROM reversal_guards WHERE entity_type = 'erp_conversion' AND entity_id = p_conversion_id AND action = 'approve';
      RETURN jsonb_build_object('success', false, 'error', 'Safety check failed: negative balance. Available: ' || v_actual_balance || ', Selling: ' || v_qty_net);
    END IF;

    v_cost_out := v_qty_net * GREATEST(v_pos.avg_cost_usdt, 0);
    v_fee_usdt_equiv := CASE WHEN v_conv.fee_asset = 'USDT' THEN COALESCE(v_conv.fee_amount, 0) ELSE COALESCE(v_conv.fee_amount, 0) * v_exec_rate END;
    v_realized_pnl := (v_gross_usdt - v_fee_usdt_equiv) - v_cost_out;

    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'DEBIT', v_qty_net, 'ERP_CONVERSION', p_conversion_id, 
      CASE WHEN v_dust_swept THEN 'Conversion SELL: sold ' || v_conv.asset_code || ' (incl. dust ' || v_dust_amount || ')'
           WHEN v_adjusted THEN 'Conversion SELL: sold ' || v_conv.asset_code || ' (capped from ' || v_original_qty || ')'
           ELSE 'Conversion SELL: sold ' || v_conv.asset_code END, p_approved_by);
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'CREDIT', v_gross_usdt, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL: received USDT', p_approved_by);
    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL fee', p_approved_by);
    END IF;

    v_new_qty := v_pos.qty_on_hand - v_qty_net;
    v_new_pool := CASE WHEN v_new_qty > 0 THEN GREATEST(v_pos.cost_pool_usdt - v_cost_out, 0) ELSE 0 END;
    v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;
    UPDATE wallet_asset_positions SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now() WHERE id = v_pos.id;

    INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes) VALUES
      (p_conversion_id, 'ASSET_OUT', v_conv.asset_code, -v_qty_net, 0, CASE WHEN v_dust_swept THEN 'Asset sold (incl. dust: ' || v_dust_amount || ')' ELSE 'Asset sold' END),
      (p_conversion_id, 'USDT_IN', 'USDT', 0, v_gross_usdt, 'USDT received from SELL'),
      (p_conversion_id, 'COGS', v_conv.asset_code, 0, -v_cost_out, 'Cost of goods sold (WAC)'),
      (p_conversion_id, 'REALIZED_PNL', v_conv.asset_code, 0, v_realized_pnl, 'Realized P&L');
    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
      VALUES (p_conversion_id, 'FEE', COALESCE(v_conv.fee_asset, 'USDT'), 0, -v_fee_usdt_equiv, 'Fee on SELL');
    END IF;
    IF v_dust_swept THEN
      INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
      VALUES (p_conversion_id, 'DUST_SWEEP', v_conv.asset_code, -v_dust_amount, 0, 'Auto-swept dust remainder (' || v_dust_amount || ' ' || v_conv.asset_code || ')');
    END IF;

    INSERT INTO realized_pnl_events (conversion_id, wallet_id, asset_code, sell_qty, proceeds_usdt_gross, proceeds_usdt_net, cost_out_usdt, realized_pnl_usdt, avg_cost_at_sale)
    VALUES (p_conversion_id, v_conv.wallet_id, v_conv.asset_code, v_qty_net, v_gross_usdt, v_gross_usdt - v_fee_usdt_equiv, v_cost_out, v_realized_pnl, GREATEST(v_pos.avg_cost_usdt, 0));

    UPDATE erp_product_conversions SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(),
      execution_rate_usdt = v_exec_rate, quantity_gross = v_conv.quantity, quantity_net = v_qty_net,
      cost_out_usdt = v_cost_out, realized_pnl_usdt = v_realized_pnl WHERE id = p_conversion_id;
  END IF;

  INSERT INTO system_action_logs (user_id, action_type, entity_type, entity_id, module, metadata)
  VALUES (p_approved_by, 'stock.conversion_approved', 'erp_conversion', p_conversion_id, 'stock',
    jsonb_build_object('reference_no', v_conv.reference_no, 'side', v_conv.side, 'asset_code', v_conv.asset_code,
      'qty_net', v_qty_net, 'exec_rate', v_exec_rate, 'auto_capped', v_adjusted, 
      'dust_swept', v_dust_swept, 'dust_amount', v_dust_amount, 'original_qty', v_original_qty));

  RETURN jsonb_build_object('success', true, 'auto_capped', v_adjusted, 
    'dust_swept', v_dust_swept, 'dust_amount', v_dust_amount,
    'original_qty', v_original_qty, 'adjusted_qty', v_qty_net);
END;
$function$;

-- 6d. reject_product_conversion
CREATE OR REPLACE FUNCTION public.reject_product_conversion(p_conversion_id uuid, p_rejected_by uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_conv RECORD;
BEGIN
  -- PERMISSION CHECK
  PERFORM public.require_permission(p_rejected_by, 'stock_manage', 'reject_product_conversion');

  SELECT * INTO v_conv FROM erp_product_conversions WHERE id = p_conversion_id FOR UPDATE;
  IF v_conv IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Conversion not found.'); END IF;
  IF v_conv.status != 'PENDING_APPROVAL' THEN RETURN jsonb_build_object('success', false, 'error', 'Conversion is not pending approval.'); END IF;

  UPDATE erp_product_conversions SET status = 'REJECTED', rejected_by = p_rejected_by, rejected_at = now(), rejection_reason = p_reason WHERE id = p_conversion_id;

  INSERT INTO system_action_logs (action_type, entity_type, entity_id, module, user_id, metadata)
  VALUES ('stock.conversion_rejected', 'erp_conversion', p_conversion_id, 'stock', p_rejected_by,
    jsonb_build_object('reference_no', v_conv.reference_no, 'reason', p_reason));

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 6e. update_settlement_status_safe
CREATE OR REPLACE FUNCTION public.update_settlement_status_safe(order_ids uuid[], batch_id text, settled_timestamp timestamptz)
RETURNS TABLE(updated_id uuid, success boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE order_id UUID;
BEGIN
  -- PERMISSION CHECK
  PERFORM public.require_permission(auth.uid(), 'sales_manage', 'update_settlement_status');

  FOREACH order_id IN ARRAY order_ids LOOP
    BEGIN
      UPDATE sales_orders SET settlement_status = 'SETTLED', settlement_batch_id = batch_id,
        settled_at = settled_timestamp, updated_at = NOW()
      WHERE id = order_id AND settlement_status = 'PENDING';
      IF FOUND THEN RETURN QUERY SELECT order_id, TRUE, NULL::TEXT;
      ELSE RETURN QUERY SELECT order_id, FALSE, 'Order not found or already settled'::TEXT; END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT order_id, FALSE, SQLERRM::TEXT;
    END;
  END LOOP;
END;
$function$;

-- 6f. delete_sales_order_with_reversal
CREATE OR REPLACE FUNCTION public.delete_sales_order_with_reversal(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_order RECORD; v_payment_method RECORD; v_product RECORD;
    v_client_name TEXT; v_guard_inserted int := 0; v_is_gateway BOOLEAN := false;
BEGIN
    -- PERMISSION CHECK
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
        SELECT bank_account_id, current_usage, COALESCE(payment_gateway, false)
        INTO v_payment_method FROM public.sales_payment_methods WHERE id = v_order.sales_payment_method_id;
        IF FOUND THEN
            v_is_gateway := COALESCE(v_payment_method.payment_gateway, false);
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

    DELETE FROM public.wallet_transactions WHERE reference_id = p_order_id AND reference_type IN ('SALES_ORDER', 'SALES_ORDER_FEE');
    DELETE FROM public.wallet_transactions WHERE reference_type = 'SALES_ORDER_FEE' AND description ILIKE '%' || v_order.order_number || '%';
    DELETE FROM public.sales_orders WHERE id = p_order_id;

    IF v_client_name IS NOT NULL THEN PERFORM public.maybe_delete_orphan_client(v_client_name); END IF;
EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.reversal_guards WHERE entity_type = 'SALES_ORDER' AND entity_id = p_order_id AND action = 'DELETE_WITH_REVERSAL';
    RAISE;
END;
$function$;

-- 6g. create_bank_transfer
CREATE OR REPLACE FUNCTION public.create_bank_transfer(p_from_account_id uuid, p_to_account_id uuid, p_amount numeric, p_date date, p_description text DEFAULT NULL, p_created_by uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_from_account RECORD; v_to_account RECORD; v_transfer_out RECORD; v_transfer_in RECORD;
BEGIN
  -- PERMISSION CHECK
  PERFORM public.require_permission(auth.uid(), 'bams_manage', 'create_bank_transfer');

  IF p_from_account_id = p_to_account_id THEN RAISE EXCEPTION 'Source and destination accounts must be different'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Transfer amount must be positive'; END IF;

  SELECT * INTO v_from_account FROM bank_accounts WHERE id = p_from_account_id FOR UPDATE;
  SELECT * INTO v_to_account FROM bank_accounts WHERE id = p_to_account_id FOR UPDATE;
  IF v_from_account IS NULL OR v_to_account IS NULL THEN RAISE EXCEPTION 'One or both bank accounts not found'; END IF;

  INSERT INTO bank_transactions (bank_account_id, transaction_type, amount, description, transaction_date, reference_number, related_account_name, created_by)
  VALUES (p_from_account_id, 'TRANSFER_OUT', p_amount, COALESCE(p_description, 'Transfer to ' || v_to_account.account_name), p_date, 'TRF-OUT-' || extract(epoch from now())::bigint, v_to_account.account_name, p_created_by)
  RETURNING * INTO v_transfer_out;

  INSERT INTO bank_transactions (bank_account_id, transaction_type, amount, description, transaction_date, reference_number, related_account_name, related_transaction_id, created_by)
  VALUES (p_to_account_id, 'TRANSFER_IN', p_amount, COALESCE(p_description, 'Transfer from ' || v_from_account.account_name), p_date, 'TRF-IN-' || extract(epoch from now())::bigint, v_from_account.account_name, v_transfer_out.id, p_created_by)
  RETURNING * INTO v_transfer_in;

  UPDATE bank_transactions SET related_transaction_id = v_transfer_in.id WHERE id = v_transfer_out.id;
  RETURN jsonb_build_object('success', true, 'transfer_out_id', v_transfer_out.id, 'transfer_in_id', v_transfer_in.id);
END;
$function$;

-- 6h. delete_contra_entry
CREATE OR REPLACE FUNCTION public.delete_contra_entry(p_transfer_out_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_transfer_out RECORD; v_transfer_in RECORD; v_guard_id TEXT;
BEGIN
  -- PERMISSION CHECK
  PERFORM public.require_permission(auth.uid(), 'bams_manage', 'delete_contra_entry');
  PERFORM public.require_permission(auth.uid(), 'bams_destructive', 'delete_contra_entry');

  v_guard_id := p_transfer_out_id::TEXT;
  SELECT * INTO v_transfer_out FROM bank_transactions WHERE id = p_transfer_out_id AND transaction_type = 'TRANSFER_OUT' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer OUT transaction not found or already deleted'; END IF;

  DELETE FROM reversal_guards WHERE entity_type = 'contra_entry' AND entity_id = v_guard_id AND action = 'delete';
  INSERT INTO reversal_guards (entity_type, entity_id, action) VALUES ('contra_entry', v_guard_id, 'delete');

  IF v_transfer_out.related_transaction_id IS NOT NULL THEN
    SELECT * INTO v_transfer_in FROM bank_transactions WHERE id = v_transfer_out.related_transaction_id AND transaction_type = 'TRANSFER_IN' FOR UPDATE;
  END IF;
  IF v_transfer_in IS NULL THEN
    SELECT * INTO v_transfer_in FROM bank_transactions WHERE related_transaction_id = p_transfer_out_id AND transaction_type = 'TRANSFER_IN' FOR UPDATE;
  END IF;

  IF v_transfer_in.id IS NOT NULL THEN DELETE FROM bank_transactions WHERE id = v_transfer_in.id; END IF;
  DELETE FROM bank_transactions WHERE id = p_transfer_out_id;
END;
$function$;

-- 6i. create_user_with_password
CREATE OR REPLACE FUNCTION public.create_user_with_password(_username text, _email text, _password text, _first_name text DEFAULT NULL, _last_name text DEFAULT NULL, _phone text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE new_user_id uuid;
BEGIN
  -- PERMISSION CHECK
  PERFORM public.require_permission(auth.uid(), 'user_management_manage', 'create_user');

  INSERT INTO users (username, email, password_hash, first_name, last_name, phone, status)
  VALUES (_username, _email, crypt(_password, gen_salt('bf')), _first_name, _last_name, _phone, 'ACTIVE')
  RETURNING id INTO new_user_id;
  RETURN new_user_id;
END;
$function$;

-- 6j. update_user_password
CREATE OR REPLACE FUNCTION public.update_user_password(user_id uuid, new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- PERMISSION CHECK
  PERFORM public.require_permission(auth.uid(), 'user_management_manage', 'update_user_password');

  UPDATE public.users SET password_hash = crypt(new_password, gen_salt('bf')), updated_at = NOW() WHERE id = user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
END;
$function$;

-- 6k. delete_user_with_cleanup
CREATE OR REPLACE FUNCTION public.delete_user_with_cleanup(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tid text := p_user_id::text;
  _user_name text;
  _full_name text;
BEGIN
  -- PERMISSION CHECK
  PERFORM public.require_permission(auth.uid(), 'user_management_manage', 'delete_user');
  PERFORM public.require_permission(auth.uid(), 'erp_destructive', 'delete_user');

  SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), username, email) INTO _full_name FROM public.users WHERE id = p_user_id;
  IF _full_name IS NULL THEN RETURN json_build_object('success', false, 'error', 'User not found'); END IF;
  _user_name := _full_name || ' [deleted]';

  DELETE FROM public.terminal_webauthn_credentials WHERE user_id = p_user_id;
  DELETE FROM public.terminal_webauthn_challenges WHERE user_id = p_user_id;
  DELETE FROM public.terminal_biometric_sessions WHERE user_id = p_user_id;
  DELETE FROM public.terminal_user_exchange_mappings WHERE user_id = p_user_id;
  DELETE FROM public.terminal_user_size_range_mappings WHERE user_id = p_user_id;
  DELETE FROM public.terminal_auto_reply_exclusions WHERE excluded_by = p_user_id;
  DELETE FROM public.p2p_terminal_user_roles WHERE user_id = p_user_id;
  DELETE FROM public.terminal_user_profiles WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.user_preferences WHERE user_id = p_user_id;
  DELETE FROM public.email_verification_tokens WHERE user_id = p_user_id;
  DELETE FROM public.password_reset_tokens WHERE user_id = p_user_id;
  DELETE FROM public.terminal_order_assignments WHERE assigned_to = p_user_id;
  DELETE FROM public.terminal_payer_assignments WHERE payer_user_id = p_user_id OR assigned_by = p_user_id;
  DELETE FROM public.terminal_assignment_audit_logs WHERE performed_by = p_user_id OR target_user_id = p_user_id;

  UPDATE public.erp_product_conversions SET created_by_name = _user_name, created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.erp_product_conversions SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE public.erp_product_conversions SET rejected_by = NULL WHERE rejected_by = p_user_id;
  UPDATE public.system_action_logs SET user_name = _user_name, user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.ad_action_logs SET user_name = _user_name, user_id = _tid WHERE user_id = _tid AND (user_name IS NULL OR user_name = '');
  UPDATE public.ad_action_logs SET user_id = 'DELETED' WHERE user_id = _tid;
  UPDATE public.chat_message_senders SET username = _user_name WHERE user_id = _tid AND (username IS NULL OR username = '');
  UPDATE public.chat_message_senders SET user_id = 'DELETED' WHERE user_id = _tid;
  UPDATE public.terminal_auto_assignment_log SET assigned_to = 'DELETED:' || _user_name WHERE assigned_to = _tid;
  UPDATE public.terminal_mpi_snapshots SET user_id = 'DELETED' WHERE user_id = _tid;
  DELETE FROM public.terminal_payer_order_log WHERE payer_id = p_user_id;

  UPDATE public.terminal_order_assignments SET assigned_by = NULL WHERE assigned_by = p_user_id;
  UPDATE public.terminal_user_profiles SET reports_to = NULL WHERE reports_to = p_user_id;
  UPDATE public.wallet_transactions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.bank_transactions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.purchase_orders SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.purchase_order_payments SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.purchase_order_payment_splits SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.purchase_order_reviews SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.purchase_order_reviews SET read_by = NULL WHERE read_by = p_user_id;
  UPDATE public.purchase_order_status_history SET changed_by = NULL WHERE changed_by = p_user_id;
  UPDATE public.purchase_action_timings SET actor_user_id = NULL WHERE actor_user_id = p_user_id;
  UPDATE public.sales_orders SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.stock_transactions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.journal_entries SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.kyc_approval_requests SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.kyc_queries SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.rekyc_requests SET reviewed_by = NULL WHERE reviewed_by = p_user_id;
  UPDATE public.rekyc_requests SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.client_onboarding_approvals SET reviewed_by = NULL WHERE reviewed_by = p_user_id;
  UPDATE public.risk_detection_logs SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.risk_flags SET resolved_by = NULL WHERE resolved_by = p_user_id;
  UPDATE public.risk_flags SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.payment_gateway_settlements SET settled_by = NULL WHERE settled_by = p_user_id;
  UPDATE public.payment_gateway_settlements SET reversed_by = NULL WHERE reversed_by = p_user_id;
  UPDATE public.tds_records SET paid_by = NULL WHERE paid_by = p_user_id;
  UPDATE public.compliance_documents SET uploaded_by = NULL WHERE uploaded_by = p_user_id;
  UPDATE public.documents SET uploaded_by = NULL WHERE uploaded_by = p_user_id;
  UPDATE public.hr_employees SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.employees SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.bank_accounts SET dormant_by = NULL WHERE dormant_by = p_user_id;
  UPDATE public.user_activity_log SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.users SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.p2p_terminal_user_roles SET assigned_by = NULL WHERE assigned_by = p_user_id;

  UPDATE public.ad_rest_timer SET started_by = NULL WHERE started_by = _tid;
  UPDATE public.closed_bank_accounts SET closed_by = NULL WHERE closed_by = _tid;
  UPDATE public.employee_offboarding SET initiated_by = NULL WHERE initiated_by = _tid;
  UPDATE public.account_investigations SET assigned_to = NULL WHERE assigned_to = _tid;
  UPDATE public.bank_cases SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.bank_cases SET assigned_to = NULL WHERE assigned_to = _tid;
  UPDATE public.bank_cases SET resolved_by = NULL WHERE resolved_by = _tid;
  UPDATE public.hr_announcements SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.hr_asset_assignments SET assigned_by = NULL WHERE assigned_by = _tid;
  UPDATE public.hr_leave_allocation_requests SET approved_by = NULL WHERE approved_by = _tid;
  UPDATE public.hr_leave_allocation_requests SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.hr_offer_letters SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.hr_penalties SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.investigation_approvals SET approved_by = NULL WHERE approved_by = _tid;
  UPDATE public.investigation_updates SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.lien_updates SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.p2p_auto_reply_rules SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.p2p_merchant_schedules SET created_by = NULL WHERE created_by = _tid;
  UPDATE public.purchase_orders SET assigned_to = NULL WHERE assigned_to = _tid;
  UPDATE public.small_buys_sync SET reviewed_by = 'DELETED:' || _user_name WHERE reviewed_by = _tid;
  UPDATE public.small_sales_sync SET reviewed_by = 'DELETED:' || _user_name WHERE reviewed_by = _tid;
  UPDATE public.terminal_sales_sync SET reviewed_by = 'DELETED:' || _user_name WHERE reviewed_by = _tid;
  UPDATE public.user_roles SET assigned_by = NULL WHERE assigned_by = _tid;

  DELETE FROM public.users WHERE id = p_user_id;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- 6l. delete_wallet_transaction_with_reversal
CREATE OR REPLACE FUNCTION public.delete_wallet_transaction_with_reversal(p_transaction_id uuid, p_deleted_by uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_tx record; v_wallet_id uuid; v_reversal_amount numeric; v_ref_id uuid; v_deleted_count int := 0;
BEGIN
  -- PERMISSION CHECK
  PERFORM public.require_permission(auth.uid(), 'stock_manage', 'delete_wallet_transaction');
  PERFORM public.require_permission(auth.uid(), 'stock_destructive', 'delete_wallet_transaction');

  SELECT * INTO v_tx FROM public.wallet_transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Transaction not found'); END IF;
  IF v_tx.reference_type NOT IN ('MANUAL_ADJUSTMENT', 'MANUAL_TRANSFER', 'TRANSFER_FEE') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only manual adjustments and transfers can be deleted');
  END IF;

  v_wallet_id := v_tx.wallet_id; v_ref_id := v_tx.reference_id;
  IF v_tx.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN v_reversal_amount := -v_tx.amount;
  ELSE v_reversal_amount := v_tx.amount; END IF;

  IF v_tx.reference_type = 'MANUAL_TRANSFER' AND v_ref_id IS NOT NULL THEN
    DELETE FROM public.wallet_transactions WHERE reference_id = v_ref_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  ELSE
    DELETE FROM public.wallet_transactions WHERE id = p_transaction_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  END IF;

  IF v_deleted_count = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Delete failed'); END IF;
  RETURN jsonb_build_object('success', true, 'message', 'Transaction deleted and balance reversed', 'reversed_amount', v_reversal_amount, 'wallet_id', v_wallet_id, 'deleted_count', v_deleted_count);
END;
$function$;

-- 6m. update_risk_flag_status
CREATE OR REPLACE FUNCTION public.update_risk_flag_status(flag_id uuid, new_status text, admin_id uuid DEFAULT NULL, notes text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- PERMISSION CHECK
  PERFORM public.require_permission(COALESCE(admin_id, auth.uid()), 'compliance_manage', 'update_risk_flag_status');

  UPDATE public.risk_flags SET status = new_status,
    resolved_on = CASE WHEN new_status IN ('CLEARED', 'BLACKLISTED') THEN now() ELSE NULL END,
    resolved_by = admin_id, admin_notes = COALESCE(notes, admin_notes), updated_at = now()
  WHERE id = flag_id;
  RETURN FOUND;
END;
$function$;

-- 7. Drop old helper check functions (no longer needed, enforcement is directly in RPCs)
DROP FUNCTION IF EXISTS public.check_delete_purchase_permission(uuid);
DROP FUNCTION IF EXISTS public.check_delete_sales_permission(uuid);
DROP FUNCTION IF EXISTS public.check_user_management_permission(uuid);