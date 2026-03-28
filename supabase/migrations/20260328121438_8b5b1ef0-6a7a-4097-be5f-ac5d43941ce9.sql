-- Atomic bank-to-bank transfer RPC: creates both TRANSFER_OUT and TRANSFER_IN in one transaction
CREATE OR REPLACE FUNCTION public.create_bank_transfer(
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount NUMERIC,
  p_date DATE,
  p_description TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from_account RECORD;
  v_to_account RECORD;
  v_transfer_out RECORD;
  v_transfer_in RECORD;
BEGIN
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Source and destination accounts must be different';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be positive';
  END IF;

  -- Lock both accounts to prevent races
  SELECT * INTO v_from_account FROM bank_accounts WHERE id = p_from_account_id FOR UPDATE;
  SELECT * INTO v_to_account FROM bank_accounts WHERE id = p_to_account_id FOR UPDATE;

  IF v_from_account IS NULL OR v_to_account IS NULL THEN
    RAISE EXCEPTION 'One or both bank accounts not found';
  END IF;

  -- Insert TRANSFER_OUT
  INSERT INTO bank_transactions (
    bank_account_id, transaction_type, amount, description,
    transaction_date, reference_number, related_account_name, created_by
  ) VALUES (
    p_from_account_id, 'TRANSFER_OUT', p_amount,
    COALESCE(p_description, 'Transfer to ' || v_to_account.account_name),
    p_date, 'TRF-OUT-' || extract(epoch from now())::bigint,
    v_to_account.account_name, p_created_by
  ) RETURNING * INTO v_transfer_out;

  -- Insert TRANSFER_IN linked to the OUT
  INSERT INTO bank_transactions (
    bank_account_id, transaction_type, amount, description,
    transaction_date, reference_number, related_account_name,
    related_transaction_id, created_by
  ) VALUES (
    p_to_account_id, 'TRANSFER_IN', p_amount,
    COALESCE(p_description, 'Transfer from ' || v_from_account.account_name),
    p_date, 'TRF-IN-' || extract(epoch from now())::bigint,
    v_from_account.account_name, v_transfer_out.id, p_created_by
  ) RETURNING * INTO v_transfer_in;

  -- Link TRANSFER_OUT back to TRANSFER_IN
  UPDATE bank_transactions SET related_transaction_id = v_transfer_in.id
  WHERE id = v_transfer_out.id;

  RETURN jsonb_build_object(
    'success', true,
    'transfer_out_id', v_transfer_out.id,
    'transfer_in_id', v_transfer_in.id
  );
END;
$$;