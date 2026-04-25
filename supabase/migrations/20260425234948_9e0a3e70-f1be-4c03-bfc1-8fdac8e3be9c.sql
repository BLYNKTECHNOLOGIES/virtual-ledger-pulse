UPDATE public.bank_transactions
SET category = 'Finance, Banking & Compliance > Payout Gateway Fee'
WHERE transaction_type = 'EXPENSE'
  AND description ILIKE '%Payout gateway fee%'
  AND category IS DISTINCT FROM 'Finance, Banking & Compliance > Payout Gateway Fee';