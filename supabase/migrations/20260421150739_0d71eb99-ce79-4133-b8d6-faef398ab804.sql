
DO $$
DECLARE
  v_rec RECORD;
  v_correction NUMERIC;
  v_total NUMERIC := 0;
  v_count INT := 0;
  v_bnb_count INT := 0;
  v_bnb_total NUMERIC := 0;
  v_backfilled INT;
BEGIN
  -- 1. Backfill (skip rows that would fail validate_conversion_approval trigger)
  WITH upd AS (
    UPDATE public.erp_product_conversions c
       SET actual_quantity_filled  = s.quantity,
           actual_usdt_received    = s.quote_quantity,
           actual_fee_amount       = COALESCE(s.commission, 0),
           actual_fee_asset        = COALESCE(s.commission_asset, c.fee_asset),
           expected_usdt_value     = c.gross_usd_value,
           rate_reconciled_at      = now(),
           rate_reconciled_by      = 'backfill_2026_04_21_full_history'
      FROM public.spot_trade_history s
     WHERE c.spot_trade_id = s.id
       AND c.actual_usdt_received IS NULL
       AND c.status = 'APPROVED'
       AND c.approved_by IS NOT NULL
       AND c.approved_at IS NOT NULL
       AND s.quote_quantity IS NOT NULL
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_backfilled FROM upd;
  RAISE NOTICE 'Backfilled % conversions', v_backfilled;

  -- 2. Corrective DEBIT for over-credited SELLs across all history (no double-post)
  FOR v_rec IN
    SELECT c.id, c.reference_no, c.wallet_id, c.gross_usd_value, c.actual_usdt_received,
           (c.gross_usd_value - c.actual_usdt_received) AS over_credit
      FROM public.erp_product_conversions c
     WHERE c.side = 'SELL'
       AND c.status = 'APPROVED'
       AND c.actual_usdt_received IS NOT NULL
       AND c.gross_usd_value - c.actual_usdt_received > 0.5
       AND NOT EXISTS (
         SELECT 1 FROM public.wallet_transactions wt
          WHERE wt.reference_id = c.id
            AND wt.reference_type = 'OPENING_BALANCE_ADJUSTMENT'
            AND wt.description LIKE 'RECONCILIATION:%'
       )
     ORDER BY c.created_at ASC
  LOOP
    v_correction := round(v_rec.over_credit::numeric, 8);

    INSERT INTO public.wallet_transactions
      (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description)
    VALUES
      (v_rec.wallet_id, 'USDT', 'DEBIT', v_correction, 'OPENING_BALANCE_ADJUSTMENT', v_rec.id,
       'RECONCILIATION: over-credited USDT on partial-fill SELL ' || v_rec.reference_no
         || ' | expected=' || v_rec.gross_usd_value
         || ' actual=' || v_rec.actual_usdt_received
         || ' correction=' || v_correction);

    INSERT INTO public.system_action_logs
      (user_id, action_type, entity_type, entity_id, module, metadata)
    VALUES
      (NULL, 'stock.conversion_reconciled', 'erp_conversion', v_rec.id, 'stock',
       jsonb_build_object(
         'reference_no', v_rec.reference_no,
         'correction_amount_usdt', v_correction,
         'expected_usdt', v_rec.gross_usd_value,
         'actual_usdt', v_rec.actual_usdt_received,
         'reason', 'full_history_backfill_2026_04_21_partial_fill_over_credit'
       ));

    v_total := v_total + v_correction;
    v_count := v_count + 1;
  END LOOP;

  -- 3. Mirror missing non-USDT/non-asset commissions
  FOR v_rec IN
    SELECT c.id, c.reference_no, c.wallet_id, c.actual_fee_amount, c.actual_fee_asset, c.asset_code
      FROM public.erp_product_conversions c
     WHERE c.status = 'APPROVED'
       AND c.actual_fee_amount IS NOT NULL
       AND c.actual_fee_amount > 0
       AND c.actual_fee_asset NOT IN ('USDT')
       AND c.actual_fee_asset <> c.asset_code
       AND NOT EXISTS (
         SELECT 1 FROM public.wallet_transactions wt
          WHERE wt.reference_id = c.id
            AND wt.asset_code = c.actual_fee_asset
            AND wt.transaction_type = 'DEBIT'
       )
  LOOP
    INSERT INTO public.wallet_transactions
      (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description)
    VALUES
      (v_rec.wallet_id, v_rec.actual_fee_asset, 'DEBIT', v_rec.actual_fee_amount,
       'OPENING_BALANCE_ADJUSTMENT', v_rec.id,
       'RECONCILIATION: missing Binance commission (' || v_rec.actual_fee_asset
         || ') on conversion ' || v_rec.reference_no);

    INSERT INTO public.system_action_logs
      (user_id, action_type, entity_type, entity_id, module, metadata)
    VALUES
      (NULL, 'stock.conversion_fee_mirrored', 'erp_conversion', v_rec.id, 'stock',
       jsonb_build_object(
         'reference_no', v_rec.reference_no,
         'fee_asset', v_rec.actual_fee_asset,
         'fee_amount', v_rec.actual_fee_amount,
         'reason', 'full_history_backfill_2026_04_21_unmirrored_commission'
       ));

    v_bnb_count := v_bnb_count + 1;
    v_bnb_total := v_bnb_total + v_rec.actual_fee_amount;
  END LOOP;

  RAISE NOTICE 'Reconciliation complete: % USDT corrections totalling %, % commission mirrors totalling %',
    v_count, v_total, v_bnb_count, v_bnb_total;
END $$;
