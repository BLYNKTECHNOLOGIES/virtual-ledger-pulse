-- Backfill average_buying_price and usdt_rate_used for records where they were 0
-- Using the USDT product's current average buying price as best approximation
UPDATE wallet_fee_deductions
SET 
  average_buying_price = (SELECT average_buying_price FROM products WHERE code = 'USDT' LIMIT 1),
  usdt_rate_used = CASE WHEN gross_amount > 0 AND fee_usdt_amount > 0 
    THEN (gross_amount * fee_percentage / 100) / fee_usdt_amount 
    ELSE 0 END,
  fee_inr_value_at_buying_price = fee_usdt_amount * COALESCE((SELECT average_buying_price FROM products WHERE code = 'USDT' LIMIT 1), 0)
WHERE average_buying_price = 0 AND fee_usdt_amount > 0;