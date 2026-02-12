CREATE OR REPLACE FUNCTION public.approve_product_conversion(p_conversion_id UUID, p_approved_by UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv RECORD;
  v_usdt_balance NUMERIC;
  v_asset_balance NUMERIC;
  v_guard_key TEXT;
BEGIN
  -- Idempotent guard
  v_guard_key := 'ERP_CONVERSION_APPROVE_' || p_conversion_id::TEXT;
  
  INSERT INTO reversal_guards (entity_type, entity_id, action)
  VALUES ('ERP_CONVERSION', p_conversion_id, 'approve')
  ON CONFLICT DO NOTHING;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversion already processed (idempotent guard).');
  END IF;

  -- Lock and fetch conversion
  SELECT * INTO v_conv
  FROM erp_product_conversions
  WHERE id = p_conversion_id
  FOR UPDATE;

  IF v_conv IS NULL THEN
    DELETE FROM reversal_guards WHERE entity_type = 'ERP_CONVERSION' AND entity_id = p_conversion_id AND action = 'approve';
    RETURN jsonb_build_object('success', false, 'error', 'Conversion not found.');
  END IF;

  IF v_conv.status != 'PENDING_APPROVAL' THEN
    DELETE FROM reversal_guards WHERE entity_type = 'ERP_CONVERSION' AND entity_id = p_conversion_id AND action = 'approve';
    RETURN jsonb_build_object('success', false, 'error', 'Conversion is not pending approval. Current status: ' || v_conv.status);
  END IF;

  -- Maker-checker: creator cannot approve own conversion
  IF v_conv.created_by = p_approved_by THEN
    DELETE FROM reversal_guards WHERE entity_type = 'ERP_CONVERSION' AND entity_id = p_conversion_id AND action = 'approve';
    RETURN jsonb_build_object('success', false, 'error', 'Creator cannot approve their own conversion.');
  END IF;

  -- BUY: check USDT balance
  IF v_conv.side = 'BUY' THEN
    SELECT COALESCE(balance, 0) INTO v_usdt_balance
    FROM wallet_asset_balances
    WHERE wallet_id = v_conv.wallet_id AND asset_code = 'USDT';

    IF v_usdt_balance < v_conv.gross_usd_value THEN
      DELETE FROM reversal_guards WHERE entity_type = 'ERP_CONVERSION' AND entity_id = p_conversion_id AND action = 'approve';
      RETURN jsonb_build_object('success', false, 'error', 
        'Insufficient USDT balance. Required: ' || v_conv.gross_usd_value || ', Available: ' || v_usdt_balance);
    END IF;

    -- 1. DEBIT USDT by gross_usd_value
    INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, balance_before, balance_after, description, reference_id, reference_type, created_by)
    VALUES (v_conv.wallet_id, 'DEBIT', v_conv.gross_usd_value, 'USDT', 0, 0, 
      'Conversion ' || v_conv.reference_no || ': Buy ' || v_conv.asset_code || ' - USDT debit',
      p_conversion_id::TEXT, 'ERP_CONVERSION', p_approved_by);

    -- 2. CREDIT asset by quantity (gross)
    INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, balance_before, balance_after, description, reference_id, reference_type, created_by)
    VALUES (v_conv.wallet_id, 'CREDIT', v_conv.quantity, v_conv.asset_code, 0, 0,
      'Conversion ' || v_conv.reference_no || ': Buy ' || v_conv.asset_code || ' - asset credit',
      p_conversion_id::TEXT, 'ERP_CONVERSION', p_approved_by);

    -- 3. If fee > 0, DEBIT asset by fee_amount
    IF v_conv.fee_amount > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, balance_before, balance_after, description, reference_id, reference_type, created_by)
      VALUES (v_conv.wallet_id, 'DEBIT', v_conv.fee_amount, v_conv.asset_code, 0, 0,
        'Conversion ' || v_conv.reference_no || ': Buy ' || v_conv.asset_code || ' - fee debit',
        p_conversion_id::TEXT, 'ERP_CONVERSION', p_approved_by);
    END IF;

  -- SELL: check asset balance
  ELSIF v_conv.side = 'SELL' THEN
    SELECT COALESCE(balance, 0) INTO v_asset_balance
    FROM wallet_asset_balances
    WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code;

    IF v_asset_balance < v_conv.quantity THEN
      DELETE FROM reversal_guards WHERE entity_type = 'ERP_CONVERSION' AND entity_id = p_conversion_id AND action = 'approve';
      RETURN jsonb_build_object('success', false, 'error', 
        'Insufficient ' || v_conv.asset_code || ' balance. Required: ' || v_conv.quantity || ', Available: ' || v_asset_balance);
    END IF;

    -- 1. DEBIT asset by quantity
    INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, balance_before, balance_after, description, reference_id, reference_type, created_by)
    VALUES (v_conv.wallet_id, 'DEBIT', v_conv.quantity, v_conv.asset_code, 0, 0,
      'Conversion ' || v_conv.reference_no || ': Sell ' || v_conv.asset_code || ' - asset debit',
      p_conversion_id::TEXT, 'ERP_CONVERSION', p_approved_by);

    -- 2. CREDIT USDT by gross value
    INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, balance_before, balance_after, description, reference_id, reference_type, created_by)
    VALUES (v_conv.wallet_id, 'CREDIT', v_conv.gross_usd_value, 'USDT', 0, 0,
      'Conversion ' || v_conv.reference_no || ': Sell ' || v_conv.asset_code || ' - USDT credit',
      p_conversion_id::TEXT, 'ERP_CONVERSION', p_approved_by);

    -- 3. If fee > 0, DEBIT USDT by fee_amount
    IF v_conv.fee_amount > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, balance_before, balance_after, description, reference_id, reference_type, created_by)
      VALUES (v_conv.wallet_id, 'DEBIT', v_conv.fee_amount, 'USDT', 0, 0,
        'Conversion ' || v_conv.reference_no || ': Sell ' || v_conv.asset_code || ' - fee debit',
        p_conversion_id::TEXT, 'ERP_CONVERSION', p_approved_by);
    END IF;
  END IF;

  -- Mark conversion as APPROVED
  UPDATE erp_product_conversions
  SET status = 'APPROVED',
      approved_by = p_approved_by,
      approved_at = now()
  WHERE id = p_conversion_id;

  -- Log action
  INSERT INTO system_action_log (action_type, entity_type, entity_id, module, performed_by, metadata)
  VALUES ('stock.conversion_approved', 'erp_conversion', p_conversion_id, 'stock', p_approved_by,
    jsonb_build_object('reference_no', v_conv.reference_no, 'side', v_conv.side, 'asset_code', v_conv.asset_code));

  RETURN jsonb_build_object('success', true, 'reference_no', v_conv.reference_no);
END;
$$;