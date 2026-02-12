
-- Reverse SHIB conversion CONV-20260212-006 (id: 21a43c27-bcde-4941-9e03-de5d2612b45a)

-- Step 1: Delete the 3 wallet transactions created by this conversion
DELETE FROM public.wallet_transactions WHERE reference_id = '21a43c27-bcde-4941-9e03-de5d2612b45a';

-- Step 2: Reverse SHIB wallet_asset_balances
UPDATE public.wallet_asset_balances 
SET balance = balance + 168991,
    total_sent = total_sent - 168991,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'SHIB';

-- Step 3: Reverse USDT wallet_asset_balances
UPDATE public.wallet_asset_balances 
SET balance = balance - 1.02812603,
    total_received = total_received - 1.02915519,
    total_sent = total_sent - 0.00102916,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT';

-- Step 4: Fix wallets.current_balance
UPDATE public.wallets 
SET current_balance = 4557.572108019999900000000000
WHERE id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f';

-- Step 5: Reset conversion to PENDING_APPROVAL
UPDATE public.erp_product_conversions 
SET status = 'PENDING_APPROVAL',
    approved_at = NULL,
    approved_by = NULL
WHERE id = '21a43c27-bcde-4941-9e03-de5d2612b45a';

-- Step 6: Clear any reversal guard if present
DELETE FROM public.reversal_guards WHERE entity_id = '21a43c27-bcde-4941-9e03-de5d2612b45a';
