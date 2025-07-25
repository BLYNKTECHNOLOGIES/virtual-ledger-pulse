-- Manually update USDT stock and call sync function
UPDATE products 
SET current_stock_quantity = 760.37999559,
    updated_at = now()
WHERE code = 'USDT';

-- Call the sync function to ensure it works
SELECT public.sync_usdt_stock();