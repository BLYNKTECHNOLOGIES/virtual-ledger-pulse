-- Fix the bank_accounts_with_balance view that's causing double counting
-- The view was adding balance + transaction_sum, but balance already contains transaction effects

DROP VIEW IF EXISTS bank_accounts_with_balance;

CREATE OR REPLACE VIEW bank_accounts_with_balance AS 
SELECT 
  id,
  account_name,
  account_number,
  bank_name,
  branch,
  balance,
  status,
  created_at,
  updated_at,
  "IFSC",
  bank_account_holder_name,
  account_status,
  account_type,
  -- The balance field already contains the cumulative effect of all transactions
  -- No need to add them again - this was causing double counting!
  balance AS computed_balance
FROM bank_accounts;