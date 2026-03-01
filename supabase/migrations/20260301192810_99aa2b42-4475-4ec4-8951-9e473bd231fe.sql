-- Backfill: mark the configured credit ledger bank account with proper account_type
-- so CREDIT-negative-balance rules apply consistently in purchase/sales/expense flows.
UPDATE public.bank_accounts
SET account_type = 'CREDIT',
    updated_at = NOW()
WHERE UPPER(TRIM(account_name)) = 'CREDIT ACCOUNT'
  AND COALESCE(account_type, '') <> 'CREDIT';