-- Backfill execution_rate_usdt from price_usd where missing
UPDATE erp_product_conversions
SET execution_rate_usdt = price_usd
WHERE execution_rate_usdt IS NULL AND price_usd > 0;