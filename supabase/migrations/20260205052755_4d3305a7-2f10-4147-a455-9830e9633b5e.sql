-- Fix double-reversal: wallet balance is already maintained by trigger update_wallet_balance_trigger (AFTER INSERT OR DELETE)
-- So this RPC must NOT update wallets directly; it should only delete the transaction(s).

CREATE OR REPLACE FUNCTION public.delete_wallet_transaction_with_reversal(
  p_transaction_id uuid,
  p_deleted_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx record;
  v_wallet_id uuid;
  v_reversal_amount numeric;
  v_ref_id uuid;
  v_deleted_count int := 0;
BEGIN
  SELECT * INTO v_tx
  FROM public.wallet_transactions
  WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  IF v_tx.reference_type NOT IN ('MANUAL_ADJUSTMENT', 'MANUAL_TRANSFER', 'TRANSFER_FEE') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only manual adjustments and transfers can be deleted');
  END IF;

  v_wallet_id := v_tx.wallet_id;
  v_ref_id := v_tx.reference_id;

  -- For UI messaging only: positive means "we add back"; negative means "we subtract".
  IF v_tx.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN
    v_reversal_amount := -v_tx.amount;
  ELSE
    v_reversal_amount := v_tx.amount;
  END IF;

  -- IMPORTANT: Do NOT update wallets here.
  -- The trigger update_wallet_balance_trigger will reverse balances on DELETE.

  IF v_tx.reference_type = 'MANUAL_TRANSFER' AND v_ref_id IS NOT NULL THEN
    DELETE FROM public.wallet_transactions
    WHERE reference_id = v_ref_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  ELSE
    DELETE FROM public.wallet_transactions
    WHERE id = p_transaction_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  END IF;

  IF v_deleted_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delete failed');
  END IF;

  -- p_deleted_by currently unused (kept for API compatibility)
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Transaction deleted and balance reversed',
    'reversed_amount', v_reversal_amount,
    'wallet_id', v_wallet_id,
    'deleted_count', v_deleted_count
  );
END;
$$;