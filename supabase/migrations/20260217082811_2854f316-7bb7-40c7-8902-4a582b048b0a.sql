
CREATE OR REPLACE FUNCTION public.approve_product_conversion(p_conversion_id uuid, p_approved_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv RECORD;
  v_pos RECORD;
  v_qty_net NUMERIC(20,9);
  v_gross_usdt NUMERIC(20,9);
  v_exec_rate NUMERIC(20,9);
  v_cost_out NUMERIC(20,9);
  v_realized_pnl NUMERIC(20,9);
  v_new_qty NUMERIC(20,9);
  v_new_pool NUMERIC(20,9);
  v_new_avg NUMERIC(20,9);
  v_fee_usdt_equiv NUMERIC(20,9);
  v_actual_balance NUMERIC(20,9);
  v_original_qty NUMERIC(20,9);
  v_adjusted BOOLEAN := false;
  v_dust_swept BOOLEAN := false;
  v_dust_amount NUMERIC(20,9) := 0;
  v_remaining_balance NUMERIC(20,9);
  -- Dust threshold per asset: if remaining < threshold after SELL, auto-sweep to zero
  v_dust_threshold NUMERIC(20,9);
BEGIN
  -- 1. Lock and fetch conversion
  SELECT * INTO v_conv
  FROM erp_product_conversions
  WHERE id = p_conversion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversion not found.');
  END IF;

  IF v_conv.status <> 'PENDING_APPROVAL' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not pending approval. Status: ' || v_conv.status);
  END IF;

  -- 2. Idempotency guard
  BEGIN
    INSERT INTO reversal_guards (entity_type, entity_id, action) VALUES ('erp_conversion', p_conversion_id, 'approve');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed (idempotency guard).');
  END;

  -- 3. Derive values
  v_exec_rate := COALESCE(v_conv.execution_rate_usdt, v_conv.price_usd);
  v_gross_usdt := v_conv.gross_usd_value;

  IF v_conv.side = 'BUY' THEN
    IF v_conv.fee_asset = v_conv.asset_code AND COALESCE(v_conv.fee_amount, 0) > 0 THEN
      v_qty_net := v_conv.quantity - v_conv.fee_amount;
    ELSE
      v_qty_net := v_conv.quantity;
    END IF;
  ELSE
    v_qty_net := v_conv.quantity;
  END IF;

  v_original_qty := v_qty_net;

  -- Set dust threshold based on asset type (accounts for different price scales)
  v_dust_threshold := CASE 
    WHEN v_conv.asset_code IN ('BTC') THEN 0.0001       -- ~$7 at $70k
    WHEN v_conv.asset_code IN ('ETH', 'BNB') THEN 0.001 -- ~$2-3
    WHEN v_conv.asset_code IN ('SHIB', 'PEPE', 'DOGE') THEN 1000  -- low-value coins
    ELSE 0.01  -- default for mid-range coins like TRX, SOL
  END;

  -- 4. Get or create position (with row lock)
  INSERT INTO wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt)
  VALUES (v_conv.wallet_id, v_conv.asset_code, 0, 0, 0)
  ON CONFLICT (wallet_id, asset_code) DO NOTHING;

  SELECT * INTO v_pos
  FROM wallet_asset_positions
  WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code
  FOR UPDATE;

  -- 5. Process by side
  IF v_conv.side = 'BUY' THEN
    -- === BUY: Acquire asset, spend USDT ===
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'DEBIT', v_gross_usdt, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: spent USDT', p_approved_by);

    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'CREDIT', v_conv.quantity, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: received ' || v_conv.asset_code, p_approved_by);

    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY fee', p_approved_by);
    END IF;

    -- Update WAC position
    v_new_qty := v_pos.qty_on_hand + v_qty_net;
    v_new_pool := v_pos.cost_pool_usdt + v_gross_usdt;
    v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;

    UPDATE wallet_asset_positions
    SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now()
    WHERE id = v_pos.id;

    -- Journal entries
    INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
    VALUES
      (p_conversion_id, 'USDT_OUT', 'USDT', 0, -v_gross_usdt, 'USDT spent for BUY'),
      (p_conversion_id, 'ASSET_IN', v_conv.asset_code, v_qty_net, 0, 'Asset received (net of fee)');

    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
      VALUES (p_conversion_id, 'FEE', COALESCE(v_conv.fee_asset, v_conv.asset_code), -v_conv.fee_amount, 0, 'Fee charged on BUY');
    END IF;

    UPDATE erp_product_conversions
    SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(),
        execution_rate_usdt = v_exec_rate, quantity_gross = v_conv.quantity, quantity_net = v_qty_net
    WHERE id = p_conversion_id;

  ELSIF v_conv.side = 'SELL' THEN
    -- === SELL: Dispose asset, receive USDT ===

    -- Validate using wallet_asset_balances (actual balance)
    SELECT COALESCE(balance, 0) INTO v_actual_balance
    FROM wallet_asset_balances
    WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code;

    -- AUTO-CAP: if balance is within 2% of required, use all available balance
    -- This handles micro-gaps from P2P fee rounding vs spot trade quantities
    IF COALESCE(v_actual_balance, 0) < v_qty_net THEN
      IF COALESCE(v_actual_balance, 0) >= v_qty_net * 0.98 AND COALESCE(v_actual_balance, 0) > 0 THEN
        v_qty_net := v_actual_balance;
        v_adjusted := true;
        v_gross_usdt := ROUND(v_gross_usdt * (v_qty_net / v_original_qty), 9);
      ELSE
        DELETE FROM reversal_guards WHERE entity_type = 'erp_conversion' AND entity_id = p_conversion_id AND action = 'approve';
        RETURN jsonb_build_object('success', false, 'error',
          'Insufficient balance. Available: ' || COALESCE(v_actual_balance, 0) || ', Required: ' || v_qty_net);
      END IF;
    -- AUTO-INCLUDE DUST: if balance exceeds required by a tiny amount (dust), sell ALL available
    -- This prevents tiny leftover balances from accumulating
    ELSIF COALESCE(v_actual_balance, 0) > v_qty_net 
      AND (COALESCE(v_actual_balance, 0) - v_qty_net) <= v_dust_threshold THEN
      v_dust_amount := v_actual_balance - v_qty_net;
      v_qty_net := v_actual_balance;  -- sell everything including dust
      v_adjusted := true;
      v_dust_swept := true;
      -- Keep original gross_usdt (the dust value is negligible)
    END IF;

    -- Calculate COGS and realized P&L
    v_cost_out := v_qty_net * v_pos.avg_cost_usdt;

    v_fee_usdt_equiv := CASE
      WHEN v_conv.fee_asset = 'USDT' THEN COALESCE(v_conv.fee_amount, 0)
      ELSE COALESCE(v_conv.fee_amount, 0) * v_exec_rate
    END;

    v_realized_pnl := (v_gross_usdt - v_fee_usdt_equiv) - v_cost_out;

    -- Post wallet transactions
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'DEBIT', v_qty_net, 'ERP_CONVERSION', p_conversion_id, 
      CASE 
        WHEN v_dust_swept THEN 'Conversion SELL: sold ' || v_conv.asset_code || ' (incl. dust ' || v_dust_amount || ')'
        WHEN v_adjusted THEN 'Conversion SELL: sold ' || v_conv.asset_code || ' (capped from ' || v_original_qty || ')'
        ELSE 'Conversion SELL: sold ' || v_conv.asset_code 
      END, p_approved_by);

    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'CREDIT', v_gross_usdt, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL: received USDT', p_approved_by);

    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL fee', p_approved_by);
    END IF;

    -- Update WAC position
    v_new_qty := v_pos.qty_on_hand - v_qty_net;
    v_new_pool := CASE WHEN v_new_qty > 0 THEN v_pos.cost_pool_usdt - v_cost_out ELSE 0 END;
    v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;

    UPDATE wallet_asset_positions
    SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now()
    WHERE id = v_pos.id;

    -- Journal entries
    INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
    VALUES
      (p_conversion_id, 'ASSET_OUT', v_conv.asset_code, -v_qty_net, 0, 
        CASE WHEN v_dust_swept THEN 'Asset sold (incl. dust: ' || v_dust_amount || ')' ELSE 'Asset sold' END),
      (p_conversion_id, 'USDT_IN', 'USDT', 0, v_gross_usdt, 'USDT received from SELL'),
      (p_conversion_id, 'COGS', v_conv.asset_code, 0, -v_cost_out, 'Cost of goods sold (WAC)'),
      (p_conversion_id, 'REALIZED_PNL', v_conv.asset_code, 0, v_realized_pnl, 'Realized P&L');

    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
      VALUES (p_conversion_id, 'FEE', COALESCE(v_conv.fee_asset, 'USDT'), 0, -v_fee_usdt_equiv, 'Fee on SELL');
    END IF;

    IF v_dust_swept THEN
      INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
      VALUES (p_conversion_id, 'DUST_SWEEP', v_conv.asset_code, -v_dust_amount, 0, 
        'Auto-swept dust remainder (' || v_dust_amount || ' ' || v_conv.asset_code || ')');
    END IF;

    -- Realized P&L event
    INSERT INTO realized_pnl_events (conversion_id, wallet_id, asset_code, sell_qty, proceeds_usdt_gross, proceeds_usdt_net, cost_out_usdt, realized_pnl_usdt, avg_cost_at_sale)
    VALUES (p_conversion_id, v_conv.wallet_id, v_conv.asset_code, v_qty_net, v_gross_usdt, v_gross_usdt - v_fee_usdt_equiv, v_cost_out, v_realized_pnl, v_pos.avg_cost_usdt);

    UPDATE erp_product_conversions
    SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(),
        execution_rate_usdt = v_exec_rate, quantity_gross = v_conv.quantity, quantity_net = v_qty_net,
        cost_out_usdt = v_cost_out, realized_pnl_usdt = v_realized_pnl
    WHERE id = p_conversion_id;

  END IF;

  -- Audit log
  INSERT INTO system_action_logs (user_id, action_type, entity_type, entity_id, module, metadata)
  VALUES (p_approved_by, 'stock.conversion_approved', 'erp_conversion', p_conversion_id, 'stock',
    jsonb_build_object('reference_no', v_conv.reference_no, 'side', v_conv.side, 'asset_code', v_conv.asset_code,
      'qty_net', v_qty_net, 'exec_rate', v_exec_rate, 'auto_capped', v_adjusted, 
      'dust_swept', v_dust_swept, 'dust_amount', v_dust_amount, 'original_qty', v_original_qty));

  RETURN jsonb_build_object('success', true, 'auto_capped', v_adjusted, 
    'dust_swept', v_dust_swept, 'dust_amount', v_dust_amount,
    'original_qty', v_original_qty, 'adjusted_qty', v_qty_net);
END;
$$;
