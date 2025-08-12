-- Create a computed-balance view for bank accounts
DROP VIEW IF EXISTS public.bank_accounts_with_balance;
CREATE VIEW public.bank_accounts_with_balance AS
SELECT 
  b.*,
  COALESCE(SUM(
    CASE 
      WHEN t.transaction_type IN ('INCOME','TRANSFER_IN') THEN t.amount
      WHEN t.transaction_type IN ('EXPENSE','TRANSFER_OUT') THEN -t.amount
      ELSE 0
    END
  ), 0) AS computed_balance
FROM public.bank_accounts b
LEFT JOIN public.bank_transactions t ON t.bank_account_id = b.id
GROUP BY b.id;