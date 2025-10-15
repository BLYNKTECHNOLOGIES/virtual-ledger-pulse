-- Drop and recreate bank_accounts_with_balance view to include lien_amount
DROP VIEW IF EXISTS public.bank_accounts_with_balance;

CREATE VIEW public.bank_accounts_with_balance AS
SELECT 
  ba.id,
  ba.account_name,
  ba.account_number,
  ba.bank_name,
  ba.branch,
  ba.balance,
  ba.lien_amount,
  ba.status,
  ba.created_at,
  ba.updated_at,
  ba."IFSC",
  ba.bank_account_holder_name,
  ba.account_status,
  ba.account_type,
  COALESCE(
    ba.balance + COALESCE(SUM(
      CASE 
        WHEN bt.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN bt.amount
        WHEN bt.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN -bt.amount
        ELSE 0
      END
    ), 0),
    ba.balance
  ) as computed_balance
FROM public.bank_accounts ba
LEFT JOIN public.bank_transactions bt ON ba.id = bt.bank_account_id
GROUP BY ba.id, ba.account_name, ba.account_number, ba.bank_name, ba.branch, 
         ba.balance, ba.lien_amount, ba.status, ba.created_at, ba.updated_at, 
         ba."IFSC", ba.bank_account_holder_name, ba.account_status, ba.account_type;