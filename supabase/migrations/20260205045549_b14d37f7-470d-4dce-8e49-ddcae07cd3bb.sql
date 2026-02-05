-- Recalculate all wallet balances from transactions to fix the double-credit issue
-- This will correct the current_balance, total_received, and total_sent for all wallets

DO $$
DECLARE
  wallet_record RECORD;
  v_total_credits NUMERIC;
  v_total_debits NUMERIC;
  v_current_balance NUMERIC;
BEGIN
  FOR wallet_record IN SELECT id FROM wallets LOOP
    -- Calculate total credits (CREDIT, TRANSFER_IN)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_credits
    FROM wallet_transactions 
    WHERE wallet_id = wallet_record.id 
      AND transaction_type IN ('CREDIT', 'TRANSFER_IN');
    
    -- Calculate total debits (DEBIT, TRANSFER_OUT, FEE)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_debits
    FROM wallet_transactions 
    WHERE wallet_id = wallet_record.id 
      AND transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE');
    
    -- Calculate current balance
    v_current_balance := v_total_credits - v_total_debits;
    
    -- Update wallet with calculated values
    UPDATE wallets 
    SET 
      current_balance = v_current_balance,
      total_received = v_total_credits,
      total_sent = v_total_debits,
      updated_at = now()
    WHERE id = wallet_record.id;
    
    RAISE NOTICE 'Wallet % recalculated: Credits=%, Debits=%, Balance=%', 
      wallet_record.id, v_total_credits, v_total_debits, v_current_balance;
  END LOOP;
END $$;