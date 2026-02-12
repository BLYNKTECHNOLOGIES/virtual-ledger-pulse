
-- Fix the SHIB purchase transaction that was incorrectly coded as USDT
-- Transaction: fb7cc2aa-0525-4b71-af17-88fba442d588
-- Purchase Order: 1fd66952-bf77-4bf4-a183-4c0fbc34510f (69,927,288.85 SHIB credited as USDT)

-- 1. Update the transaction's asset_code from USDT to SHIB
UPDATE public.wallet_transactions 
SET asset_code = 'SHIB' 
WHERE id = 'fb7cc2aa-0525-4b71-af17-88fba442d588';

-- 2. Fix USDT wallet_asset_balances: subtract the wrongly credited amount
UPDATE public.wallet_asset_balances 
SET balance = balance - 69927288.85,
    total_received = total_received - 69927288.85,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT';

-- 3. Create SHIB wallet_asset_balances with the correct amount
INSERT INTO public.wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
VALUES ('6d9114f1-357b-41ee-8e5a-0dea754d5b4f', 'SHIB', 69927288.85, 69927288.85, 0)
ON CONFLICT (wallet_id, asset_code) 
DO UPDATE SET 
  balance = wallet_asset_balances.balance + 69927288.85,
  total_received = wallet_asset_balances.total_received + 69927288.85,
  updated_at = now();
