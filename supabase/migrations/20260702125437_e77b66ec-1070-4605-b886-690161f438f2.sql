CREATE OR REPLACE FUNCTION public.reverse_bank_transaction(p_original_id uuid, p_reason text, p_reversed_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_orig public.bank_transactions%ROWTYPE;
  v_new_id uuid := gen_random_uuid();
  v_new_type text;
  v_existing uuid;
  v_actor uuid;
  v_short_orig text;
BEGIN
  IF p_original_id IS NULL THEN
    RAISE EXCEPTION 'reverse_bank_transaction: p_original_id is required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reverse_bank_transaction: a reason is required';
  END IF;

  v_actor := COALESCE(p_reversed_by, auth.uid());

  INSERT INTO public.reversal_guards (entity_type, entity_id, action)
  VALUES ('bank_transaction', p_original_id, 'reverse')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_existing
    FROM public.bank_transactions
   WHERE reverses_transaction_id = p_original_id;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT * INTO v_orig FROM public.bank_transactions WHERE id = p_original_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reverse_bank_transaction: transaction % not found', p_original_id;
  END IF;
  IF v_orig.reverses_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'reverse_bank_transaction: cannot reverse a reversal entry (%)', p_original_id;
  END IF;
  IF v_orig.is_reversed THEN
    RAISE EXCEPTION 'reverse_bank_transaction: transaction % is already reversed', p_original_id;
  END IF;

  v_new_type := CASE v_orig.transaction_type
    WHEN 'INCOME'       THEN 'EXPENSE'
    WHEN 'EXPENSE'      THEN 'INCOME'
    WHEN 'TRANSFER_IN'  THEN 'TRANSFER_OUT'
    WHEN 'TRANSFER_OUT' THEN 'TRANSFER_IN'
    ELSE v_orig.transaction_type
  END;

  v_short_orig := substr(v_orig.id::text, 1, 8);

  INSERT INTO public.bank_transactions (
    id, bank_account_id, transaction_type, amount,
    transaction_date, description, reference_number, category,
    related_account_name, related_transaction_id, client_id,
    created_by, reverses_transaction_id, reversal_reason, sub_ledger_id
  ) VALUES (
    v_new_id, v_orig.bank_account_id, v_new_type, v_orig.amount,
    CURRENT_DATE,
    'Reversal of ' || v_orig.id::text || ' — ' || p_reason || ' [REV:' || v_short_orig || ']',
    'REV-' || COALESCE(v_orig.reference_number, v_short_orig),
    COALESCE(v_orig.category, 'Reversal'),
    v_orig.related_account_name, v_orig.id, v_orig.client_id,
    v_actor, p_original_id, p_reason, v_orig.sub_ledger_id
  );

  UPDATE public.bank_transactions SET is_reversed = true WHERE id = p_original_id;

  RETURN v_new_id;
END;
$function$;