-- Fix the wallet balance for BINANCE VERTEX wallet by recalculating from transactions
-- Since there are no transactions, all balances should be 0

UPDATE wallets 
SET 
  current_balance = 0,
  total_received = 0,
  total_sent = 0,
  updated_at = now()
WHERE wallet_name = 'BINANCE VERTEX';

-- Verify the trigger exists and is working correctly
-- Let's also add a function to recalculate wallet balances from transactions

CREATE OR REPLACE FUNCTION recalculate_wallet_balance(wallet_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_credits NUMERIC := 0;
  total_debits NUMERIC := 0;
  current_balance_calc NUMERIC := 0;
BEGIN
  -- Calculate total credits (CREDIT, TRANSFER_IN)
  SELECT COALESCE(SUM(amount), 0) INTO total_credits
  FROM wallet_transactions 
  WHERE wallet_id = wallet_id_param 
    AND transaction_type IN ('CREDIT', 'TRANSFER_IN');
  
  -- Calculate total debits (DEBIT, TRANSFER_OUT)
  SELECT COALESCE(SUM(amount), 0) INTO total_debits
  FROM wallet_transactions 
  WHERE wallet_id = wallet_id_param 
    AND transaction_type IN ('DEBIT', 'TRANSFER_OUT');
  
  -- Calculate current balance
  current_balance_calc := total_credits - total_debits;
  
  -- Update wallet with calculated values
  UPDATE wallets 
  SET 
    current_balance = current_balance_calc,
    total_received = total_credits,
    total_sent = total_debits,
    updated_at = now()
  WHERE id = wallet_id_param;
  
  RAISE NOTICE 'Wallet % balance recalculated: Credits=%, Debits=%, Balance=%', 
    wallet_id_param, total_credits, total_debits, current_balance_calc;
END;
$$;