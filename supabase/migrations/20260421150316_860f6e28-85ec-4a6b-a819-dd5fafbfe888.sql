
DO $$
DECLARE
  v_rec RECORD;
  v_correction NUMERIC;
  v_total NUMERIC := 0;
  v_count INT := 0;
BEGIN
  FOR v_rec IN
    SELECT c.id, c.reference_no, c.wallet_id, c.gross_usd_value, c.actual_usdt_received,
           (c.gross_usd_value - c.actual_usdt_received) AS over_credit
      FROM public.erp_product_conversions c
     WHERE c.side = 'SELL'
       AND c.status = 'APPROVED'
       AND c.actual_usdt_received IS NOT NULL
       AND c.gross_usd_value - c.actual_usdt_received > 0.5
       AND c.created_at >= now() - interval '30 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.wallet_transactions wt
          WHERE wt.reference_id = c.id
            AND wt.reference_type = 'RECONCILIATION'
       )
     ORDER BY c.created_at ASC
  LOOP
    v_correction := round(v_rec.over_credit::numeric, 8);

    -- Use OPENING_BALANCE_ADJUSTMENT to bypass balance trigger (whitelisted)
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
         'reason', 'one_time_backfill_2026_04_21_partial_fill_over_credit'
       ));

    v_total := v_total + v_correction;
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Reconciliation complete: % entries, total correction = % USDT', v_count, v_total;
END $$;
