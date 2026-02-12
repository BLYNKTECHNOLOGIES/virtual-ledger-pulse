CREATE OR REPLACE FUNCTION public.approve_product_conversion(p_conversion_id uuid, p_approved_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv RECORD;
BEGIN
  SELECT * INTO v_conv
  FROM erp_product_conversions
  WHERE id = p_conversion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversion not found.');
  END IF;

  IF v_conv.status <> 'PENDING_APPROVAL' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversion is not pending approval. Current status: ' || v_conv.status);
  END IF;

  -- Idempotency guard (entity_id is UUID type)
  BEGIN
    INSERT INTO reversal_guards (entity_type, entity_id, action) VALUES ('erp_conversion', p_conversion_id, 'approve');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'This conversion has already been processed (idempotency guard).');
  END;

  IF v_conv.side = 'BUY' THEN
    IF (SELECT COALESCE(balance, 0) FROM wallet_asset_balances WHERE wallet_id = v_conv.wallet_id AND asset_code = 'USDT') < v_conv.gross_usd_value THEN
      DELETE FROM reversal_guards WHERE entity_type = 'erp_conversion' AND entity_id = p_conversion_id AND action = 'approve';
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient USDT balance. Required: ' || v_conv.gross_usd_value);
    END IF;

    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, notes, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'DEBIT', v_conv.gross_usd_value, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: spent USDT', p_approved_by);

    UPDATE wallet_asset_balances SET balance = balance - v_conv.gross_usd_value, updated_at = now()
    WHERE wallet_id = v_conv.wallet_id AND asset_code = 'USDT';

    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, notes, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'CREDIT', v_conv.quantity, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: received ' || v_conv.asset_code, p_approved_by);

    INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance)
    VALUES (v_conv.wallet_id, v_conv.asset_code, v_conv.quantity)
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET balance = wallet_asset_balances.balance + v_conv.quantity, updated_at = now();

    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, notes, created_by)
      VALUES (v_conv.wallet_id, v_conv.asset_code, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY fee', p_approved_by);

      UPDATE wallet_asset_balances SET balance = balance - v_conv.fee_amount, updated_at = now()
      WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code;
    END IF;

  ELSIF v_conv.side = 'SELL' THEN
    IF (SELECT COALESCE(balance, 0) FROM wallet_asset_balances WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code) < v_conv.quantity THEN
      DELETE FROM reversal_guards WHERE entity_type = 'erp_conversion' AND entity_id = p_conversion_id AND action = 'approve';
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient ' || v_conv.asset_code || ' balance. Required: ' || v_conv.quantity);
    END IF;

    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, notes, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'DEBIT', v_conv.quantity, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL: sold ' || v_conv.asset_code, p_approved_by);

    UPDATE wallet_asset_balances SET balance = balance - v_conv.quantity, updated_at = now()
    WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code;

    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, notes, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'CREDIT', v_conv.gross_usd_value, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL: received USDT', p_approved_by);

    INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance)
    VALUES (v_conv.wallet_id, 'USDT', v_conv.gross_usd_value)
    ON CONFLICT (wallet_id, asset_code) DO UPDATE SET balance = wallet_asset_balances.balance + v_conv.gross_usd_value, updated_at = now();

    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, notes, created_by)
      VALUES (v_conv.wallet_id, 'USDT', 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL fee', p_approved_by);

      UPDATE wallet_asset_balances SET balance = balance - v_conv.fee_amount, updated_at = now()
      WHERE wallet_id = v_conv.wallet_id AND asset_code = 'USDT';
    END IF;
  END IF;

  UPDATE erp_product_conversions
  SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now()
  WHERE id = p_conversion_id;

  INSERT INTO system_action_logs (user_id, action_type, entity_type, entity_id, module, metadata)
  VALUES (p_approved_by, 'stock.conversion_approved', 'erp_conversion', p_conversion_id, 'stock',
    jsonb_build_object('reference_no', v_conv.reference_no, 'side', v_conv.side, 'asset_code', v_conv.asset_code));

  RETURN jsonb_build_object('success', true);
END;
$$;