
-- Fix the trigger: only update qty_on_hand, preserve cost_pool and avg_cost
-- The conversion RPC manages cost_pool_usdt and avg_cost_usdt separately
CREATE OR REPLACE FUNCTION sync_asset_position_on_balance_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip USDT — positions only track non-USDT assets
  IF NEW.asset_code = 'USDT' THEN
    RETURN NEW;
  END IF;

  -- Upsert: create if not exists, always sync qty_on_hand to match actual balance
  INSERT INTO wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt)
  VALUES (NEW.wallet_id, NEW.asset_code, NEW.balance, 0, 0)
  ON CONFLICT (wallet_id, asset_code) DO UPDATE
  SET qty_on_hand = NEW.balance,
      updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Now update the approve_product_conversion function to NOT manually update qty_on_hand
-- since the trigger will handle it. Only update cost_pool and avg_cost.
CREATE OR REPLACE FUNCTION approve_product_conversion(p_conversion_id UUID, p_approved_by UUID)
RETURNS JSONB
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

    -- Update WAC position (qty_on_hand will be synced by trigger, but we need cost pool)
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

    -- Validate using wallet_asset_balances (actual balance, not position qty)
    SELECT COALESCE(balance, 0) INTO v_actual_balance
    FROM wallet_asset_balances
    WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code;

    IF COALESCE(v_actual_balance, 0) < v_qty_net THEN
      DELETE FROM reversal_guards WHERE entity_type = 'erp_conversion' AND entity_id = p_conversion_id AND action = 'approve';
      RETURN jsonb_build_object('success', false, 'error',
        'Insufficient balance. Available: ' || COALESCE(v_actual_balance, 0) || ', Required: ' || v_qty_net);
    END IF;

    -- Calculate COGS and realized P&L
    v_cost_out := v_qty_net * v_pos.avg_cost_usdt;

    v_fee_usdt_equiv := CASE
      WHEN v_conv.fee_asset = 'USDT' THEN COALESCE(v_conv.fee_amount, 0)
      ELSE COALESCE(v_conv.fee_amount, 0) * v_exec_rate
    END;

    v_realized_pnl := (v_gross_usdt - v_fee_usdt_equiv) - v_cost_out;

    -- Post wallet transactions (triggers handle balance + position sync)
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'DEBIT', v_qty_net, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL: sold ' || v_conv.asset_code, p_approved_by);

    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'CREDIT', v_gross_usdt, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL: received USDT', p_approved_by);

    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL fee', p_approved_by);
    END IF;

    -- Update WAC position (qty_on_hand synced by trigger, only update cost fields)
    v_new_qty := v_pos.qty_on_hand - v_qty_net;
    v_new_pool := CASE WHEN v_new_qty > 0 THEN v_pos.cost_pool_usdt - v_cost_out ELSE 0 END;
    v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;

    UPDATE wallet_asset_positions
    SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now()
    WHERE id = v_pos.id;

    -- Journal entries
    INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
    VALUES
      (p_conversion_id, 'ASSET_OUT', v_conv.asset_code, -v_qty_net, 0, 'Asset sold'),
      (p_conversion_id, 'USDT_IN', 'USDT', 0, v_gross_usdt, 'USDT received from SELL'),
      (p_conversion_id, 'COGS', v_conv.asset_code, 0, -v_cost_out, 'Cost of goods sold (WAC)'),
      (p_conversion_id, 'REALIZED_PNL', v_conv.asset_code, 0, v_realized_pnl, 'Realized P&L');

    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO conversion_journal_entries (conversion_id, line_type, asset_code, qty_delta, usdt_delta, notes)
      VALUES (p_conversion_id, 'FEE', COALESCE(v_conv.fee_asset, 'USDT'), 0, -v_fee_usdt_equiv, 'Fee on SELL');
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
      'qty_net', v_qty_net, 'exec_rate', v_exec_rate));

  RETURN jsonb_build_object('success', true);
END;
$$;
