
-- 1. Delete stale audit log from previous (now-reversed) SHIB approval
DELETE FROM public.system_action_logs 
WHERE entity_id = '21a43c27-bcde-4941-9e03-de5d2612b45a' 
AND action_type = 'stock.conversion_approved';

-- Also delete the BTC one if it had a previous failed attempt
DELETE FROM public.system_action_logs 
WHERE entity_id = '51f34959-339d-4ece-b088-1367a1a7305d' 
AND action_type = 'stock.conversion_approved';

-- 2. Fix the approve_product_conversion RPC to NOT manually update wallet_asset_balances
-- since the update_wallet_balance trigger handles it automatically on INSERT
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
    -- Debit USDT (trigger handles wallet_asset_balances + wallets.current_balance)
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'DEBIT', v_conv.gross_usd_value, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: spent USDT', p_approved_by);

    -- Credit asset (trigger handles wallet_asset_balances)
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'CREDIT', v_conv.quantity, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: received ' || v_conv.asset_code, p_approved_by);

    -- Fee debit from asset (trigger handles wallet_asset_balances)
    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY fee', p_approved_by);
    END IF;

  ELSIF v_conv.side = 'SELL' THEN
    -- Debit asset (trigger handles wallet_asset_balances)
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'DEBIT', v_conv.quantity, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL: sold ' || v_conv.asset_code, p_approved_by);

    -- Credit USDT (trigger handles wallet_asset_balances + wallets.current_balance)
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'CREDIT', v_conv.gross_usd_value, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL: received USDT', p_approved_by);

    -- Fee debit from USDT (trigger handles wallet_asset_balances + wallets.current_balance)
    IF COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL fee', p_approved_by);
    END IF;
  END IF;

  UPDATE erp_product_conversions
  SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now()
  WHERE id = p_conversion_id;

  -- Use upsert for audit log to avoid unique constraint violations on re-approval
  INSERT INTO system_action_logs (user_id, action_type, entity_type, entity_id, module, metadata)
  VALUES (p_approved_by, 'stock.conversion_approved', 'erp_conversion', p_conversion_id, 'stock',
    jsonb_build_object('reference_no', v_conv.reference_no, 'side', v_conv.side, 'asset_code', v_conv.asset_code))
  ON CONFLICT ON CONSTRAINT idx_system_action_logs_entity_action DO UPDATE SET
    recorded_at = now(),
    user_id = p_approved_by;

  RETURN jsonb_build_object('success', true);
END;
$$;
