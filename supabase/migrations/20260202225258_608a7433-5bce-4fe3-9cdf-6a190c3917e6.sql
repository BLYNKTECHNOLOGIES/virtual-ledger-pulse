
-- Reset wallet balances to 0
UPDATE wallets SET current_balance = 0, total_received = 0, total_sent = 0, updated_at = NOW();

-- Reset bank account balances to 0 (keeping lien_amount as is)
UPDATE bank_accounts SET balance = 0, updated_at = NOW();

-- Reset ledger account balances to opening balance
UPDATE ledger_accounts SET current_balance = opening_balance, updated_at = NOW();
