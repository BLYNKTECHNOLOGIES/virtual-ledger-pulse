ALTER TABLE public.erp_product_conversions DISABLE TRIGGER trg_validate_conversion_approval;

-- Backfill approved_by for any remaining null rows
UPDATE public.erp_product_conversions c
SET approved_by = sal.user_id,
    approved_at = COALESCE(c.approved_at, sal.created_at)
FROM public.system_action_logs sal
WHERE c.approved_by IS NULL
  AND c.status = 'APPROVED'
  AND c.spot_trade_id IS NOT NULL
  AND sal.entity_type = 'erp_conversion'
  AND sal.entity_id = c.id
  AND sal.action_type IN ('stock.conversion_approved', 'stock.conversion_created')
  AND sal.user_id IS NOT NULL;

UPDATE public.erp_product_conversions
SET approved_by = created_by,
    approved_at = COALESCE(approved_at, created_at)
WHERE approved_by IS NULL
  AND status = 'APPROVED'
  AND spot_trade_id IS NOT NULL
  AND created_by IS NOT NULL;

UPDATE public.erp_product_conversions c
SET actual_quantity_filled = sth.quantity,
    actual_fee_amount = sth.commission,
    actual_fee_asset = sth.commission_asset
FROM public.spot_trade_history sth
WHERE c.spot_trade_id = sth.id
  AND c.actual_quantity_filled IS NULL
  AND c.status = 'APPROVED';

ALTER TABLE public.erp_product_conversions ENABLE TRIGGER trg_validate_conversion_approval;

-- Post compensating entries for remaining variances (both BUY and SELL, both directions)
WITH variance_rows AS (
  SELECT
    c.id AS conversion_id,
    c.reference_no,
    c.wallet_id,
    c.side,
    c.net_usdt_change AS intended_usdt,
    sth.quote_quantity AS actual_usdt,
    (c.net_usdt_change - sth.quote_quantity) AS variance_usdt,
    c.approved_by
  FROM public.erp_product_conversions c
  JOIN public.spot_trade_history sth ON sth.id = c.spot_trade_id
  WHERE c.status = 'APPROVED'
    AND ABS(c.net_usdt_change - sth.quote_quantity) > 1
    AND NOT EXISTS (
      SELECT 1 FROM public.wallet_transactions wt
      WHERE wt.reference_type = 'OPENING_BALANCE_ADJUSTMENT'
        AND wt.reference_id = c.id
    )
)
INSERT INTO public.wallet_transactions (
  wallet_id, asset_code, transaction_type, amount,
  reference_type, reference_id, description, created_by, created_at
)
SELECT
  wallet_id, 'USDT',
  CASE WHEN variance_usdt > 0 THEN 'DEBIT' ELSE 'CREDIT' END,
  ROUND(ABS(variance_usdt)::numeric, 8),
  'OPENING_BALANCE_ADJUSTMENT', conversion_id,
  'Reconciliation v2: ' || side || ' variance vs Binance actual fill for ' || reference_no
    || ' (intended=' || ROUND(intended_usdt::numeric,4) || ' actual=' || ROUND(actual_usdt::numeric,4) || ')',
  approved_by, now()
FROM variance_rows;

-- Mirror BNB-paid commissions as separate USDT fee deductions (the BNB cost wasn't accounted for)
WITH bnb_fees AS (
  SELECT
    c.id AS conversion_id,
    c.reference_no,
    c.wallet_id,
    sth.commission AS bnb_amount,
    sth.executed_price,
    c.approved_by
  FROM public.erp_product_conversions c
  JOIN public.spot_trade_history sth ON sth.id = c.spot_trade_id
  WHERE c.status = 'APPROVED'
    AND sth.commission_asset = 'BNB'
    AND sth.commission > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.wallet_transactions wt
      WHERE wt.reference_type = 'OPENING_BALANCE_ADJUSTMENT'
        AND wt.reference_id = c.id
        AND wt.description LIKE 'BNB fee mirror%'
    )
)
INSERT INTO public.wallet_transactions (
  wallet_id, asset_code, transaction_type, amount,
  reference_type, reference_id, description, created_by, created_at
)
SELECT
  wallet_id, 'BNB', 'DEBIT',
  ROUND(bnb_amount::numeric, 8),
  'OPENING_BALANCE_ADJUSTMENT', conversion_id,
  'BNB fee mirror for conversion ' || reference_no,
  approved_by, now()
FROM bnb_fees;

-- Recalculate affected wallet balances from ledger
UPDATE public.wallet_asset_balances wab
SET balance = (
  SELECT COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE -amount END), 0)
  FROM public.wallet_transactions
  WHERE wallet_id = wab.wallet_id AND asset_code = wab.asset_code
),
updated_at = now()
WHERE wab.asset_code IN ('USDT','BNB')
  AND wab.wallet_id IN (
    SELECT DISTINCT wallet_id FROM public.wallet_transactions
    WHERE reference_type = 'OPENING_BALANCE_ADJUSTMENT'
      AND created_at > now() - interval '5 minutes'
  );