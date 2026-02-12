-- Fix BITGET wallet current_balance to match actual ledger sum
-- Ledger: CREDIT 17190.91 - DEBIT 3906.44 - TRANSFER_OUT 13101.18 - FEE 12.98 = 170.31
UPDATE public.wallets 
SET current_balance = (
  SELECT COALESCE(
    SUM(CASE WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount ELSE -amount END),
    0
  )
  FROM public.wallet_transactions 
  WHERE wallet_id = '144bc2d2-ba4b-4d99-8a47-5f45ee0045d5' 
    AND asset_code = 'USDT'
)
WHERE id = '144bc2d2-ba4b-4d99-8a47-5f45ee0045d5';