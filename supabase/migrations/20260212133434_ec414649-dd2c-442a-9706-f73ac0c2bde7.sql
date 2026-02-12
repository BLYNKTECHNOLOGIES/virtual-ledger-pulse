
-- Fix the wallets.current_balance which was inflated by the SHIB transaction being treated as USDT
-- The SHIB transaction (fb7cc2aa) added 69,927,288.85 to current_balance as if it were USDT

-- Step 1: Fix the SHIB transaction's balance_before/after to reflect SHIB balances (not USDT)
-- SHIB balance_before should be 0 (first SHIB entry), balance_after should be 69927288.85
UPDATE public.wallet_transactions 
SET balance_before = 0, 
    balance_after = 69927288.85
WHERE id = 'fb7cc2aa-0525-4b71-af17-88fba442d588';

-- Step 2: Fix all subsequent USDT transactions that had inflated balance_before/after
-- The transaction right after the SHIB one is 92fd0e85 (DEBIT 443.3498 USDT)
-- Its balance_before should be what USDT was before: 5000.921908...
-- Its balance_after should be 5000.921908 - 443.3498 = 4557.572108...
UPDATE public.wallet_transactions 
SET balance_before = 5000.921908019999900000000000,
    balance_after = 4557.572108019999900000000000
WHERE id = '92fd0e85-cdd6-419b-9da7-1353a06d6ef2';

-- Step 3: Fix the wallets.current_balance to match the actual last USDT balance_after
UPDATE public.wallets 
SET current_balance = 4557.572108019999900000000000
WHERE id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f';
