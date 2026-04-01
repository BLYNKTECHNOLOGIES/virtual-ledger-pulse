-- Backfill non-stablecoin wallet_transactions using related order rates
UPDATE public.wallet_transactions wt
SET market_rate_usdt = COALESCE(po.market_rate_usdt, so.market_rate_usdt, 1.0),
    effective_usdt_qty = wt.amount * COALESCE(po.market_rate_usdt, so.market_rate_usdt, 1.0)
FROM public.wallet_transactions sub
LEFT JOIN public.purchase_orders po ON sub.reference_type = 'PURCHASE_ORDER' AND sub.reference_id = po.id
LEFT JOIN public.sales_orders so ON sub.reference_type = 'SALES_ORDER' AND sub.reference_id = so.id
WHERE wt.id = sub.id
  AND wt.effective_usdt_qty IS NULL
  AND wt.asset_code NOT IN ('USDT', 'USDC', 'FDUSD');

-- Backfill stablecoin wallet_transactions
UPDATE public.wallet_transactions
SET market_rate_usdt = 1.0,
    effective_usdt_qty = amount
WHERE effective_usdt_qty IS NULL
  AND asset_code IN ('USDT', 'USDC', 'FDUSD');

-- Remaining NULL entries (no linked order) - default rate 1.0
UPDATE public.wallet_transactions
SET market_rate_usdt = 1.0,
    effective_usdt_qty = amount
WHERE effective_usdt_qty IS NULL;