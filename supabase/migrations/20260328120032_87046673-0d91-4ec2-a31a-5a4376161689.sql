
-- =====================================================
-- Fix Bug L14: Repair BTC conversions with negative/zero/null cost basis
-- Use execution_rate_usdt as cost basis since no proper cost pool existed
-- =====================================================

-- Fix conversions with negative cost_out_usdt
UPDATE public.erp_product_conversions
SET cost_out_usdt = quantity * execution_rate_usdt,
    realized_pnl_usdt = gross_usd_value - (quantity * execution_rate_usdt)
WHERE asset_code = 'BTC'
  AND side = 'SELL'
  AND status = 'APPROVED'
  AND cost_out_usdt < 0;

-- Fix conversions with NULL cost_out_usdt (early ones before cost tracking)
UPDATE public.erp_product_conversions
SET cost_out_usdt = quantity * execution_rate_usdt,
    realized_pnl_usdt = gross_usd_value - (quantity * execution_rate_usdt)
WHERE asset_code = 'BTC'
  AND side = 'SELL'
  AND status = 'APPROVED'
  AND cost_out_usdt IS NULL;

-- Fix conversions with zero cost_out_usdt (depleted pool)
UPDATE public.erp_product_conversions
SET cost_out_usdt = quantity * execution_rate_usdt,
    realized_pnl_usdt = gross_usd_value - (quantity * execution_rate_usdt)
WHERE asset_code = 'BTC'
  AND side = 'SELL'
  AND status = 'APPROVED'
  AND cost_out_usdt = 0
  AND quantity > 0;

-- Sync journal entries for corrected conversions
UPDATE public.conversion_journal_entries cje
SET usdt_delta = -epc.cost_out_usdt
FROM public.erp_product_conversions epc
WHERE cje.conversion_id = epc.id
  AND cje.line_type = 'COGS'
  AND epc.asset_code = 'BTC'
  AND epc.side = 'SELL'
  AND epc.status = 'APPROVED';

UPDATE public.conversion_journal_entries cje
SET usdt_delta = epc.realized_pnl_usdt
FROM public.erp_product_conversions epc
WHERE cje.conversion_id = epc.id
  AND cje.line_type = 'REALIZED_PNL'
  AND epc.asset_code = 'BTC'
  AND epc.side = 'SELL'
  AND epc.status = 'APPROVED';
