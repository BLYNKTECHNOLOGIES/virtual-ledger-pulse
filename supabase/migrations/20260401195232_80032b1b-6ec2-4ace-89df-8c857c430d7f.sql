CREATE OR REPLACE FUNCTION public.approve_product_conversion(p_conversion_id uuid, p_approved_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_conv RECORD; v_pos RECORD; v_qty_net NUMERIC; v_gross_usdt NUMERIC;
  v_exec_rate NUMERIC;
  v_new_qty NUMERIC; v_new_pool NUMERIC; v_new_avg NUMERIC;
  v_actual_balance NUMERIC; v_original_qty NUMERIC; v_adjusted BOOLEAN := false;
  v_dust_swept BOOLEAN := false; v_dust_amount NUMERIC := 0;
  v_remaining_balance NUMERIC; v_dust_threshold NUMERIC; v_original_gross_usdt NUMERIC;
  v_cost_out NUMERIC;
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
    -- Wallet transactions
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'DEBIT', v_gross_usdt, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: spent USDT', p_approved_by);
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'CREDIT', v_conv.quantity, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: received ' || v_conv.asset_code, p_approved_by);
    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY fee', p_approved_by);
    END IF;

    -- WAC update
    v_new_qty := v_pos.qty_on_hand + v_qty_net;
    v_new_pool := v_pos.cost_pool_usdt + v_gross_usdt;
    v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;
    UPDATE wallet_asset_positions SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now() WHERE id = v_pos.id;

    UPDATE erp_product_conversions SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(),
      execution_rate_usdt = v_exec_rate, quantity_gross = v_conv.quantity, quantity_net = v_qty_net WHERE id = p_conversion_id;

  ELSIF v_conv.side = 'SELL' THEN
    -- Balance check
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

    -- Cost out for WAC update (still needed for pool reduction)
    v_cost_out := v_qty_net * GREATEST(v_pos.avg_cost_usdt, 0);

    -- Wallet transactions
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

    -- WAC update — snap tiny remainders to zero to prevent numeric overflow
    -- Precision mismatch: qty_on_hand is numeric(20,9) but ledger sum is unconstrained,
    -- so (qty_on_hand - ledger_qty) can be a near-zero value like 1.5e-13
    -- that causes division overflow in avg_cost calculation.
    v_new_qty := v_pos.qty_on_hand - v_qty_net;
    IF ABS(v_new_qty) < 0.000001 THEN
      v_new_qty := 0;
    END IF;
    v_new_pool := CASE WHEN v_new_qty > 0 THEN GREATEST(v_pos.cost_pool_usdt - v_cost_out, 0) ELSE 0 END;
    v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;
    UPDATE wallet_asset_positions SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now() WHERE id = v_pos.id;

    -- No P&L tracking — set columns to NULL
    UPDATE erp_product_conversions SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(),
      execution_rate_usdt = v_exec_rate, quantity_gross = v_conv.quantity, quantity_net = v_qty_net,
      cost_out_usdt = NULL, realized_pnl_usdt = NULL WHERE id = p_conversion_id;
  END IF;

  INSERT INTO system_action_logs (user_id, action_type, entity_type, entity_id, module, metadata)
  VALUES (p_approved_by, 'stock.conversion_approved', 'erp_conversion', p_conversion_id, 'stock',
    jsonb_build_object('reference_no', v_conv.reference_no, 'side', v_conv.side, 'asset_code', v_conv.asset_code,
      'qty_net', v_qty_net, 'exec_rate', v_exec_rate, 'auto_capped', v_adjusted, 
      'dust_swept', v_dust_swept, 'dust_amount', v_dust_amount, 'original_qty', v_original_qty));

  RETURN jsonb_build_object('success', true, 'auto_capped', v_adjusted, 
    'dust_swept', v_dust_swept, 'dust_amount', v_dust_amount,
    'quantity_net', v_qty_net, 'original_qty', v_original_qty);
END;
$$;