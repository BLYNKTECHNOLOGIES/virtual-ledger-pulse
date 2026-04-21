
UPDATE public.erp_product_conversions c
   SET actual_quantity_filled  = s.quantity,
       actual_usdt_received    = s.quote_quantity,
       actual_fee_amount       = COALESCE(s.commission, 0),
       actual_fee_asset        = COALESCE(s.commission_asset, c.fee_asset),
       expected_usdt_value     = c.gross_usd_value,
       rate_reconciled_at      = now(),
       rate_reconciled_by      = 'backfill_2026_04_21'
  FROM public.spot_trade_history s
 WHERE c.spot_trade_id = s.id
   AND c.actual_usdt_received IS NULL
   AND c.created_at >= now() - interval '30 days'
   AND s.quote_quantity IS NOT NULL;
