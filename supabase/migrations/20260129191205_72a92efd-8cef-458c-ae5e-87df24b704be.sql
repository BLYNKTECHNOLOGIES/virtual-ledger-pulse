-- Reset all wallet balances to zero
UPDATE public.wallets SET current_balance = 0;

-- Reset all bank account balances to zero
UPDATE public.bank_accounts SET balance = 0;