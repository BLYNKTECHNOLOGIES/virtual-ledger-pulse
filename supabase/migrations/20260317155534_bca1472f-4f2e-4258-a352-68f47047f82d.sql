-- Fix the specific sync record with correct data from binance_order_history
UPDATE public.terminal_purchase_sync 
SET order_data = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(order_data::jsonb, '{amount}', '"104.91000000"'),
        '{total_price}', '"9998.87000000"'
      ),
      '{unit_price}', '"95.3"'
    ),
    '{commission}', '"0.11"'
  ),
  '{pay_method}', '"IMPS"'
)
WHERE binance_order_number = '22867213028553203712';