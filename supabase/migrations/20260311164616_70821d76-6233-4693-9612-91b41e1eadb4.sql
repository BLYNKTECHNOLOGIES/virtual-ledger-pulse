
-- Delete all duplicate small_sales_sync records except the latest one (ff2ff396)
-- The CASCADE FK on small_sales_order_map will auto-delete orphaned map entries
DELETE FROM small_sales_sync
WHERE '22864944236492644352' = ANY(order_numbers)
  AND sync_status = 'pending_approval'
  AND id != 'ff2ff396-344d-4b5b-9727-8d79ea461606';

-- Also delete the map entry from the rejected sync (43e1b80c) that was blocking new inserts
DELETE FROM small_sales_order_map
WHERE small_sales_sync_id = '43e1b80c-15a8-4447-8e00-fbf4c295f691';

-- Now insert proper map entries for the remaining sync record
INSERT INTO small_sales_order_map (small_sales_sync_id, binance_order_number, order_data)
VALUES 
  ('ff2ff396-344d-4b5b-9727-8d79ea461606', '22864944236492644352', 
   '{"order_number":"22864944236492644352","asset":"USDT","amount":"20.20000000","total_price":"2000.00000000","unit_price":"99","commission":"0","counter_part_nick_name":"Dip***","create_time":1773212780230,"pay_method_name":"UPI"}'::jsonb),
  ('ff2ff396-344d-4b5b-9727-8d79ea461606', '22862766696633114624',
   '{"order_number":"22862766696633114624","asset":"USDT","amount":"3.96000000","total_price":"401.94000000","unit_price":"101.5","commission":"0","counter_part_nick_name":"fib***","create_time":1772693614202,"pay_method_name":"UPI"}'::jsonb)
ON CONFLICT (binance_order_number) DO UPDATE SET
  small_sales_sync_id = EXCLUDED.small_sales_sync_id,
  order_data = EXCLUDED.order_data;

-- Update the remaining sync record to use actual order timestamps
UPDATE small_sales_sync
SET time_window_start = to_timestamp(1772693614202 / 1000.0),
    time_window_end = to_timestamp(1773212780230 / 1000.0)
WHERE id = 'ff2ff396-344d-4b5b-9727-8d79ea461606';
