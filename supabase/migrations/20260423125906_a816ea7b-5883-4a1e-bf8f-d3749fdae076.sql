-- Fix: create_bank_transfer was doing a post-insert UPDATE on related_transaction_id,
-- which the immutability trigger blocks. Rewrite to insert both legs with linkage
-- already populated, removing the forbidden UPDATE entirely.

CREATE OR REPLACE FUNCTION public.create_bank_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_date date,
  p_description text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from_account RECORD;
  v_to_account   RECORD;
  v_out_id uuid := gen_random_uuid();
  v_in_id  uuid := gen_random_uuid();
  v_epoch  bigint := extract(epoch from now())::bigint;
BEGIN
  -- PERMISSION CHECK
  PERFORM public.require_permission(auth.uid(), 'bams_manage', 'create_bank_transfer');

  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Source and destination accounts must be different';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be positive';
  END IF;

  SELECT * INTO v_from_account FROM bank_accounts WHERE id = p_from_account_id FOR UPDATE;
  SELECT * INTO v_to_account   FROM bank_accounts WHERE id = p_to_account_id FOR UPDATE;
  IF v_from_account IS NULL OR v_to_account IS NULL THEN
    RAISE EXCEPTION 'One or both bank accounts not found';
  END IF;

  -- Insert OUT leg with pre-known IN id as its related_transaction_id
  INSERT INTO bank_transactions (
    id, bank_account_id, transaction_type, amount, description, transaction_date,
    reference_number, related_account_name, related_transaction_id, created_by
  )
  VALUES (
    v_out_id, p_from_account_id, 'TRANSFER_OUT', p_amount,
    COALESCE(p_description, 'Transfer to ' || v_to_account.account_name),
    p_date,
    'TRF-OUT-' || v_epoch,
    v_to_account.account_name,
    v_in_id,
    p_created_by
  );

  -- Insert IN leg with pre-known OUT id as its related_transaction_id
  INSERT INTO bank_transactions (
    id, bank_account_id, transaction_type, amount, description, transaction_date,
    reference_number, related_account_name, related_transaction_id, created_by
  )
  VALUES (
    v_in_id, p_to_account_id, 'TRANSFER_IN', p_amount,
    COALESCE(p_description, 'Transfer from ' || v_from_account.account_name),
    p_date,
    'TRF-IN-' || v_epoch,
    v_from_account.account_name,
    v_out_id,
    p_created_by
  );

  RETURN jsonb_build_object(
    'success', true,
    'transfer_out_id', v_out_id,
    'transfer_in_id', v_in_id
  );
END;
$function$;