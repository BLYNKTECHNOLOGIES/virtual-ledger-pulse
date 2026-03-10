
-- Fix the two stuck sync records that already have completed sales orders
UPDATE terminal_sales_sync 
SET sync_status = 'approved',
    sales_order_id = '7749add2-af93-480d-a39a-8ded6c5a5dda',
    reviewed_at = now()
WHERE id = 'f3535330-bec1-4426-92ab-c9888228d829' 
  AND binance_order_number = '22864581958662721536';

UPDATE terminal_sales_sync 
SET sync_status = 'approved',
    sales_order_id = '900672ab-bf85-43bb-a0ff-c8721bf3a98b',
    reviewed_at = now()
WHERE id = '836e36c4-6e0e-4972-bbaa-a775f68c6932'
  AND binance_order_number = '22864572629628084224';
