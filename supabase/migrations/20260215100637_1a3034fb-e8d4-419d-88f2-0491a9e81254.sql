-- Corrective debit: zero out the 0.380486 SOL drift caused by duplicate credit
-- The same P2P BUY order 22856233414713843712 was credited twice:
-- 1) Via manual purchase credit flow
-- 2) Via conversion BUY approval
-- This reconciliation corrects the balance.

INSERT INTO public.wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, description, balance_before, balance_after, created_by)
VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  'SOL',
  'DEBIT',
  0.380486,
  'RECONCILIATION',
  'Corrective debit: duplicate SOL credit from P2P order 22856233414713843712',
  0, 0, NULL
);

-- Also sync the wallet_asset_positions to match
UPDATE public.wallet_asset_positions
SET qty_on_hand = 0, cost_pool_usdt = 0, avg_cost_usdt = 0, updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'SOL';