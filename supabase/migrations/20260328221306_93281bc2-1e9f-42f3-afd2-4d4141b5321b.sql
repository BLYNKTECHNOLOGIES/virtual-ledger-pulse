-- B33 FIX: Resync all bank account balances from transaction history
ALTER TABLE bank_transactions DISABLE TRIGGER trigger_update_bank_account_balance;

UPDATE bank_accounts ba
SET balance = COALESCE(calc.calculated_balance, 0),
    updated_at = now()
FROM (
  SELECT 
    bank_account_id,
    SUM(CASE 
      WHEN transaction_type IN ('INCOME','CREDIT','TRANSFER_IN') THEN amount
      WHEN transaction_type IN ('EXPENSE','DEBIT','TRANSFER_OUT') THEN -amount
      ELSE 0
    END) as calculated_balance
  FROM bank_transactions
  GROUP BY bank_account_id
) calc
WHERE calc.bank_account_id = ba.id
  AND ABS(calc.calculated_balance - ba.balance) > 1;

ALTER TABLE bank_transactions ENABLE TRIGGER trigger_update_bank_account_balance;