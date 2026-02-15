
-- RECONCILIATION: Fix SOL balance drift
-- ERP shows 0.89 SOL, Binance API confirms only 0.00033317 SOL
-- Root cause: 7.183 SOL spot SELL on Binance (order 16436795939) at 12:09 UTC not recorded in ERP
-- The 0.89 SOL Conversion BUY was approved before the SELL happened on Binance

-- 1. Insert reconciliation wallet transaction to debit excess SOL
INSERT INTO wallet_transactions (
  wallet_id, asset_code, transaction_type, amount, 
  reference_type, description, created_by, balance_before, balance_after
)
VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  'SOL',
  'DEBIT',
  0.889666830,
  'RECONCILIATION',
  'Reconciliation: SOL sold on Binance (spot order 16436795939, 7.183 SOL SELL at 89.78) not captured in ERP. Adjusting balance from 0.89 to 0.00033317 to match Binance.',
  NULL,
  0, 0  -- trigger will compute actual values
);

-- 2. Fix wallet_asset_positions (WAC) to reflect actual holdings
UPDATE wallet_asset_positions
SET qty_on_hand = 0.000333170,
    cost_pool_usdt = 0.000333170 * avg_cost_usdt,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' 
  AND asset_code = 'SOL';
