-- Recreate the bank account balance update trigger
CREATE TRIGGER trg_update_bank_account_balance
AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_bank_account_balance();

-- Recalculate all bank account balances from transactions
UPDATE public.bank_accounts 
SET balance = (
  SELECT COALESCE(SUM(
    CASE 
      WHEN bt.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN bt.amount
      WHEN bt.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN -bt.amount
      ELSE 0
    END
  ), 0)
  FROM public.bank_transactions bt 
  WHERE bt.bank_account_id = bank_accounts.id
)
WHERE account_status = 'ACTIVE';