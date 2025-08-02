-- Remove duplicate stock transactions while keeping the latest one based on created_at
WITH RankedTransactions AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY 
        transaction_type, 
        supplier_customer_name, 
        quantity, 
        unit_price, 
        total_amount, 
        reference_number, 
        transaction_date
      ORDER BY created_at DESC
    ) as rn
  FROM stock_transactions
)
DELETE FROM stock_transactions 
WHERE id IN (
  SELECT id 
  FROM RankedTransactions 
  WHERE rn > 1
);