-- Fix the incorrect average selling price for USDT
-- Since there are no sales transactions, the average selling price should be NULL or fallback to the base selling price

UPDATE products 
SET average_selling_price = CASE 
  WHEN (
    SELECT COUNT(*) 
    FROM stock_transactions st 
    WHERE st.product_id = products.id 
      AND st.transaction_type = 'SALE'
  ) = 0 THEN selling_price  -- Use base selling price if no sales yet
  ELSE (
    SELECT SUM(st.quantity * st.unit_price) / SUM(st.quantity)
    FROM stock_transactions st 
    WHERE st.product_id = products.id 
      AND st.transaction_type = 'SALE'
  )
END
WHERE name = 'USDT';