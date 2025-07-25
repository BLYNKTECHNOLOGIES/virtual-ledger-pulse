-- Direct fix: Update USDT stock to match wallet total
UPDATE products 
SET current_stock_quantity = (
  SELECT COALESCE(SUM(current_balance), 0) 
  FROM wallets 
  WHERE is_active = true AND wallet_type = 'USDT'
),
updated_at = now()
WHERE code = 'USDT';

-- Check the result
SELECT current_stock_quantity FROM products WHERE code = 'USDT';