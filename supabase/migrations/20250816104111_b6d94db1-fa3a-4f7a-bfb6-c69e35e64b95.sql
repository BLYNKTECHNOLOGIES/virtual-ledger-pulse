-- Update the bank_accounts_with_balance view to include account_type column
DROP VIEW IF EXISTS bank_accounts_with_balance;

CREATE VIEW bank_accounts_with_balance AS
SELECT 
  ba.*,
  COALESCE(
    ba.balance + COALESCE(
      (SELECT SUM(
        CASE 
          WHEN bt.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN bt.amount
          WHEN bt.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN -bt.amount
          ELSE 0
        END
      ) FROM bank_transactions bt WHERE bt.bank_account_id = ba.id),
      0
    ),
    ba.balance
  ) as computed_balance
FROM bank_accounts ba;