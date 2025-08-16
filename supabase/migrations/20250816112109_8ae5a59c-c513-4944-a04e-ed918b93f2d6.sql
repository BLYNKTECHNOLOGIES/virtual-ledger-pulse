-- Drop the dependent view first
DROP VIEW IF EXISTS bank_accounts_with_balance;

-- Remove the balance_locked column from bank_accounts table
ALTER TABLE public.bank_accounts DROP COLUMN balance_locked;

-- Recreate the view without the balance_locked column
CREATE VIEW bank_accounts_with_balance AS
SELECT 
  ba.*,
  COALESCE(ba.balance + 
    COALESCE((
      SELECT SUM(
        CASE 
          WHEN bt.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN bt.amount
          WHEN bt.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN -bt.amount
          ELSE 0
        END
      )
      FROM bank_transactions bt 
      WHERE bt.bank_account_id = ba.id
    ), 0), ba.balance
  ) as computed_balance
FROM bank_accounts ba;