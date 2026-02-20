
-- FIX: Update ETH conversion to actual Binance-executed values
-- Actual USDT received = 230.74934465 (from Binance Spot→Funding transfer tr-351626772006)
-- Booked USDT = 230.980325 | Delta = -0.23098035

-- Step 1: Update erp_product_conversions
UPDATE erp_product_conversions SET
  actual_usdt_received = 230.74934465,
  net_usdt_change = 230.74934465,
  gross_usd_value = 230.74934465,
  price_usd = ROUND((230.74934465 / 0.1175)::numeric, 8),
  execution_rate_usdt = ROUND((230.74934465 / 0.1175)::numeric, 8),
  realized_pnl_usdt = ROUND((230.74934465 - 230.453585600)::numeric, 9),
  binance_transfer_id = 'tr-351626772006',
  rate_reconciled_at = NOW(),
  rate_reconciled_by = 'manual-auto-reconcile',
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{original_booked_usdt}', '"230.980325"'
  )
WHERE id = 'a7f3b313-9d22-4c5d-8578-e68fde02430a';

-- Step 2: Update conversion_journal_entries USDT_IN line
UPDATE conversion_journal_entries SET
  usdt_delta = 230.74934465,
  notes = 'USDT received from SELL (reconciled against Binance transfer tr-351626772006, original: 230.980325)'
WHERE id = 'de05be8e-b7a7-4c35-90fa-31e9caf91f0b';

-- Step 3: Update REALIZED_PNL journal line
UPDATE conversion_journal_entries SET
  usdt_delta = ROUND((230.74934465 - 230.453585600)::numeric, 9),
  notes = 'Realized P&L (reconciled)'
WHERE id = '07fdc64a-faff-426f-bbda-37e532d50b53';

-- Step 4: Fix the wallet_transaction CREDIT amount (delta = -0.23098035)
UPDATE wallet_transactions SET
  amount = 230.74934465,
  balance_after = balance_before + 230.74934465,
  description = 'Conversion SELL: received USDT (reconciled: actual Binance amount, original 230.980325)'
WHERE id = '175347bb-65b6-4dfa-962a-9773c5f9d0ea';

-- Step 5: Cascade the balance correction (-0.23098035) to ALL subsequent BINANCE BLYNK USDT transactions
-- These are the 7 transactions after the conversion credit
UPDATE wallet_transactions SET
  balance_before = balance_before - 0.23098035,
  balance_after  = balance_after  - 0.23098035
WHERE id IN (
  '439cae35-6eb4-4288-9ca9-d72bcd7a86d2',
  '231a52f1-7423-4553-841f-b0fe5293b1d3',
  'f9c32ae6-3dbc-410a-bfcc-cdd7b3d0d461',
  '79c8ff13-058d-4906-8227-812f1156f302',
  '8d1ec2f7-7815-406f-bbfd-870681e65639',
  'c96bff76-1e4f-4ea9-b6ca-8316bbbb4adf',
  '8a045491-105c-43c9-8a95-4ec01fccf166'
);

-- Step 6: Update the wallet current_balance
UPDATE wallets SET
  current_balance = current_balance - 0.23098035
WHERE id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f';
