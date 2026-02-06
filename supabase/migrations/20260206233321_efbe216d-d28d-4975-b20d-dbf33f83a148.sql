
-- Drop existing function completely
DROP FUNCTION IF EXISTS public.delete_contra_entry(UUID);

-- Recreate from scratch
CREATE FUNCTION public.delete_contra_entry(p_transfer_out_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_out RECORD;
  v_transfer_in RECORD;
  v_guard_id TEXT;
BEGIN
  v_guard_id := p_transfer_out_id::TEXT;

  -- Lock and fetch the TRANSFER_OUT transaction
  SELECT * INTO v_transfer_out
  FROM bank_transactions
  WHERE id = p_transfer_out_id
    AND transaction_type = 'TRANSFER_OUT'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer OUT transaction not found or already deleted';
  END IF;

  -- Clear any stale guard for this ID first
  DELETE FROM reversal_guards WHERE entity_type = 'contra_entry' AND entity_id = v_guard_id AND action = 'delete';
  
  -- Insert fresh guard to prevent double-reversal
  INSERT INTO reversal_guards (entity_type, entity_id, action) VALUES ('contra_entry', v_guard_id, 'delete');

  -- Find the paired TRANSFER_IN transaction
  IF v_transfer_out.related_transaction_id IS NOT NULL THEN
    SELECT * INTO v_transfer_in
    FROM bank_transactions
    WHERE id = v_transfer_out.related_transaction_id
      AND transaction_type = 'TRANSFER_IN'
    FOR UPDATE;
  END IF;

  -- Also check reverse linkage
  IF v_transfer_in IS NULL THEN
    SELECT * INTO v_transfer_in
    FROM bank_transactions
    WHERE related_transaction_id = p_transfer_out_id
      AND transaction_type = 'TRANSFER_IN'
    FOR UPDATE;
  END IF;

  -- Delete TRANSFER_IN first (trigger reverses destination balance)
  IF v_transfer_in.id IS NOT NULL THEN
    DELETE FROM bank_transactions WHERE id = v_transfer_in.id;
  END IF;

  -- Delete TRANSFER_OUT (trigger reverses source balance)
  DELETE FROM bank_transactions WHERE id = p_transfer_out_id;
END;
$$;

-- Explicitly grant access
GRANT EXECUTE ON FUNCTION public.delete_contra_entry(UUID) TO anon, authenticated, service_role;

-- Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';
