-- Recalculate BTC wallet_asset_balance from transactions
UPDATE public.wallet_asset_balances 
SET balance = (
  SELECT COALESCE(SUM(
    CASE WHEN transaction_type = 'CREDIT' THEN amount 
         WHEN transaction_type = 'DEBIT' THEN -amount 
         ELSE 0 END
  ), 0)
  FROM public.wallet_transactions 
  WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'BTC'
)
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'BTC';