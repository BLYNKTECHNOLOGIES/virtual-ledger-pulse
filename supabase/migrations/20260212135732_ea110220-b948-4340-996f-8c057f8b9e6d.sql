
-- Step 1: Delete the 3 wallet transactions for this conversion
DELETE FROM wallet_transactions WHERE reference_id = '21a43c27-bcde-4941-9e03-de5d2612b45a' AND reference_type = 'ERP_CONVERSION';

-- Step 2: Manually fix wallet_asset_balances (trigger is INSERT-only, won't fire on DELETE)
-- Reverse SHIB DEBIT: add back 168991
UPDATE wallet_asset_balances
SET balance = balance + 168991,
    total_sent = total_sent - 168991,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'SHIB';

-- Reverse USDT CREDIT of 1.02915519 and DEBIT of 0.00102916
-- Net USDT change to reverse: +1.02915519 - 0.00102916 = +1.02812603 (was added, now remove)
UPDATE wallet_asset_balances
SET balance = balance - 1.02812603,
    total_received = total_received - 1.02915519,
    total_sent = total_sent - 0.00102916,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT';

-- Step 3: Fix wallets.current_balance (USDT)
UPDATE wallets
SET current_balance = current_balance - 1.02812603
WHERE id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f';

-- Step 4: Delete reversal guard so it can be re-approved
DELETE FROM reversal_guards WHERE entity_id = '21a43c27-bcde-4941-9e03-de5d2612b45a' AND entity_type = 'erp_conversion';

-- Step 5: Delete audit log entry
DELETE FROM system_action_logs WHERE entity_id = '21a43c27-bcde-4941-9e03-de5d2612b45a' AND action_type = 'stock.conversion_approved';

-- Step 6: Update conversion record with CORRECT values from API
-- qty = 69,853,865  price = 0.00000609  gross = 69853865 * 0.00000609 = 425.41003685
-- fee% = 0.1%  fee = 0.42541004 USDT  net_usdt = 424.98462681
-- net_asset_change = -69853865 (selling removes asset)
UPDATE erp_product_conversions
SET quantity = 69853865,
    price_usd = 0.00000609,
    gross_usd_value = 425.41003685,
    fee_percentage = 0.1,
    fee_amount = 0.42541004,
    fee_asset = 'USDT',
    net_asset_change = -69853865,
    net_usdt_change = 424.98462681,
    status = 'PENDING_APPROVAL',
    approved_by = NULL,
    approved_at = NULL
WHERE id = '21a43c27-bcde-4941-9e03-de5d2612b45a';
