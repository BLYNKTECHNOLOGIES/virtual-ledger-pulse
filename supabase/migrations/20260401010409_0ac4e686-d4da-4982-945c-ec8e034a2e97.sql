-- Fix purchase order item: change product from USDT to ETH for order 22872057213350932480
UPDATE purchase_order_items 
SET product_id = '591ff3bc-3e34-4a48-a586-a032d07b1ad3'
WHERE purchase_order_id = '469c0eef-afa1-45fe-bdf2-d02cec8c92e9';
