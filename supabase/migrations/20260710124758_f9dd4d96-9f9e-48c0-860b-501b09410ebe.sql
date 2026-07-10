DO $$
DECLARE
  v_conv_id uuid := '348841e4-d324-4538-b7f2-b79afca27219';
  v_wallet uuid := '6d9114f1-357b-41ee-8e5a-0dea754d5b4f';
  v_user uuid := '4a70de87-7107-48a1-8d4c-b276faf5f246';
  v_delta_trx numeric := 2339.7;          -- 2504.4 - 164.7
  v_delta_usdt numeric := 772.80291;      -- 827.20332 - 54.40041
BEGIN
  -- Idempotency: skip if a corrective row already exists for this conversion
  IF EXISTS (
    SELECT 1 FROM wallet_transactions
    WHERE reference_id = v_conv_id AND description LIKE '%partial-fill correction%'
  ) THEN
    RAISE NOTICE 'Correction already applied; skipping.';
    RETURN;
  END IF;

  -- Append missing TRX deduction (sold on Binance but never booked)
  INSERT INTO wallet_transactions
    (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
  VALUES
    (v_wallet, 'TRX', 'DEBIT', v_delta_trx, 'ERP_CONVERSION', v_conv_id,
     'Conversion SELL: sold TRX (partial-fill correction vs Binance order 3545416232)', v_user);

  -- Append missing USDT proceeds
  INSERT INTO wallet_transactions
    (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
  VALUES
    (v_wallet, 'USDT', 'CREDIT', v_delta_usdt, 'ERP_CONVERSION', v_conv_id,
     'Conversion SELL: received USDT (partial-fill correction vs Binance order 3545416232)', v_user);

  -- Update the conversion record to reflect the complete Binance order
  UPDATE erp_product_conversions SET
    quantity              = 2504.4,
    net_asset_change      = 2504.4,
    gross_usd_value       = 827.20332,
    net_usdt_change       = 826.37611668,   -- gross - USDT commission 0.82720332
    fee_amount            = 0.82720332,
    fee_asset             = 'USDT',
    price_usd             = 0.3303,
    execution_rate_usdt   = 0.3303,
    quantity_gross        = 2504.4,
    quantity_net          = 2504.4,
    actual_quantity_filled= 2504.4,
    actual_usdt_received  = 827.20332,
    actual_fee_amount     = 0.82720332,
    actual_fee_asset      = 'USDT',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'partial_fill_corrected_at', now(),
      'partial_fill_corrected_reason', 'Approved mid-fill; only 2 of 5 fills present at approval time',
      'fill_ids', (SELECT jsonb_agg(id) FROM spot_trade_history WHERE binance_order_id='3545416232')
    )
  WHERE id = v_conv_id;

  -- Realign legacy position quantity to match the ledger (asset is now dust)
  UPDATE wallet_asset_positions
    SET qty_on_hand = GREATEST(qty_on_hand - v_delta_trx, 0),
        cost_pool_usdt = 0,
        avg_cost_usdt = 0,
        updated_at = now()
  WHERE wallet_id = v_wallet AND asset_code = 'TRX';
END $$;