
-- Create RPC function to delete wallet transaction and reverse the balance
CREATE OR REPLACE FUNCTION public.delete_wallet_transaction_with_reversal(
  p_transaction_id UUID,
  p_deleted_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction RECORD;
  v_wallet RECORD;
  v_reversal_amount NUMERIC;
  v_related_transactions UUID[];
BEGIN
  -- Get the transaction details
  SELECT * INTO v_transaction
  FROM wallet_transactions
  WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;
  
  -- Only allow deletion of manual adjustments and transfers
  IF v_transaction.reference_type NOT IN ('MANUAL_ADJUSTMENT', 'MANUAL_TRANSFER', 'TRANSFER_FEE') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only manual adjustments and transfers can be deleted');
  END IF;
  
  -- Get the wallet
  SELECT * INTO v_wallet
  FROM wallets
  WHERE id = v_transaction.wallet_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;
  
  -- Calculate reversal: if it was a CREDIT, we subtract; if DEBIT/TRANSFER_OUT, we add back
  IF v_transaction.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
    v_reversal_amount := -v_transaction.amount;
  ELSE
    v_reversal_amount := v_transaction.amount;
  END IF;
  
  -- For MANUAL_TRANSFER, find and delete related transactions (same reference_id)
  IF v_transaction.reference_type = 'MANUAL_TRANSFER' AND v_transaction.reference_id IS NOT NULL THEN
    -- Get all related transaction IDs
    SELECT array_agg(id) INTO v_related_transactions
    FROM wallet_transactions
    WHERE reference_id = v_transaction.reference_id;
    
    -- Reverse each related transaction
    FOR v_transaction IN 
      SELECT * FROM wallet_transactions WHERE reference_id = v_transaction.reference_id
    LOOP
      -- Calculate reversal for each
      IF v_transaction.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
        UPDATE wallets 
        SET current_balance = current_balance - v_transaction.amount,
            total_received = GREATEST(0, total_received - v_transaction.amount),
            updated_at = NOW()
        WHERE id = v_transaction.wallet_id;
      ELSE
        UPDATE wallets 
        SET current_balance = current_balance + v_transaction.amount,
            total_sent = GREATEST(0, total_sent - v_transaction.amount),
            updated_at = NOW()
        WHERE id = v_transaction.wallet_id;
      END IF;
    END LOOP;
    
    -- Delete all related transactions
    DELETE FROM wallet_transactions 
    WHERE reference_id = (SELECT reference_id FROM wallet_transactions WHERE id = p_transaction_id);
    
  ELSE
    -- Single transaction deletion (MANUAL_ADJUSTMENT or TRANSFER_FEE)
    -- Update wallet balance (reverse the transaction effect)
    IF v_transaction.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
      UPDATE wallets 
      SET current_balance = current_balance - v_transaction.amount,
          total_received = GREATEST(0, total_received - v_transaction.amount),
          updated_at = NOW()
      WHERE id = v_transaction.wallet_id;
    ELSE
      UPDATE wallets 
      SET current_balance = current_balance + v_transaction.amount,
          total_sent = GREATEST(0, total_sent - v_transaction.amount),
          updated_at = NOW()
      WHERE id = v_transaction.wallet_id;
    END IF;
    
    -- Delete the transaction
    DELETE FROM wallet_transactions WHERE id = p_transaction_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Transaction deleted and balance reversed',
    'reversed_amount', v_reversal_amount,
    'wallet_id', v_wallet.id
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.delete_wallet_transaction_with_reversal(UUID, UUID) TO anon, authenticated;
