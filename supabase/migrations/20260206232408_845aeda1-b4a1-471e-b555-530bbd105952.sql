
CREATE OR REPLACE FUNCTION public.delete_contra_entry(p_transfer_out_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_out RECORD;
  v_transfer_in RECORD;
BEGIN
  -- Lock and fetch the TRANSFER_OUT transaction
  SELECT * INTO v_transfer_out
  FROM bank_transactions
  WHERE id = p_transfer_out_id
    AND transaction_type = 'TRANSFER_OUT'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer OUT transaction not found or already deleted';
  END IF;

  -- Clear any stale guard for this ID first (half-failed previous attempt)
  DELETE FROM reversal_guards WHERE entity_type = 'contra_entry' AND entity_id = p_transfer_out_id::TEXT AND action = 'delete';
  
  -- Insert fresh guard to prevent double-reversal
  INSERT INTO reversal_guards (entity_type, entity_id, action) VALUES ('contra_entry', p_transfer_out_id::TEXT, 'delete');

  -- Find the paired TRANSFER_IN transaction
  IF v_transfer_out.related_transaction_id IS NOT NULL THEN
    SELECT * INTO v_transfer_in
    FROM bank_transactions
    WHERE id = v_transfer_out.related_transaction_id
      AND transaction_type = 'TRANSFER_IN'
    FOR UPDATE;
  END IF;

  -- Also check reverse linkage if not found
  IF v_transfer_in IS NULL THEN
    SELECT * INTO v_transfer_in
    FROM bank_transactions
    WHERE related_transaction_id = p_transfer_out_id
      AND transaction_type = 'TRANSFER_IN'
    FOR UPDATE;
  END IF;

  -- Delete the TRANSFER_IN first (the balance trigger will subtract from destination account)
  IF v_transfer_in.id IS NOT NULL THEN
    DELETE FROM bank_transactions WHERE id = v_transfer_in.id;
  END IF;

  -- Delete the TRANSFER_OUT (the balance trigger will add back to source account)
  DELETE FROM bank_transactions WHERE id = p_transfer_out_id;

END;
$$;
