
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
    RETURN jsonb_build_object('success', false, 'error', 'Not pending approval. Status: ' || v_conv.status);
  END IF;

  -- Idempotency guard
  BEGIN
    INSERT INTO reversal_guards (entity_type, entity_id, action) VALUES ('erp_conversion', p_conversion_id, 'approve');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed (idempotency guard).');
  END;

  IF v_conv.side = 'BUY' THEN
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'DEBIT', v_conv.gross_usd_value, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: spent USDT', p_approved_by);

    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'CREDIT', v_conv.quantity, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: received ' || v_conv.asset_code, p_approved_by);

    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY fee', p_approved_by);
    END IF;

  ELSIF v_conv.side = 'SELL' THEN
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'DEBIT', v_conv.quantity, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL: sold ' || v_conv.asset_code, p_approved_by);

    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'CREDIT', v_conv.gross_usd_value, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL: received USDT', p_approved_by);

    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL fee', p_approved_by);
    END IF;
  END IF;

  UPDATE erp_product_conversions
  SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now()
  WHERE id = p_conversion_id;

  -- Simple insert for audit log (no ON CONFLICT needed)
  INSERT INTO system_action_logs (user_id, action_type, entity_type, entity_id, module, metadata)
  VALUES (p_approved_by, 'stock.conversion_approved', 'erp_conversion', p_conversion_id, 'stock',
    jsonb_build_object('reference_no', v_conv.reference_no, 'side', v_conv.side, 'asset_code', v_conv.asset_code));

  RETURN jsonb_build_object('success', true);
END;
$$;
