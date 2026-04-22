-- ============================================================================
-- BANK LEDGER IMMUTABILITY — mirrors the wallet ledger pattern
-- ============================================================================

-- Part 1: Schema additions
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS sequence_no              BIGINT,
  ADD COLUMN IF NOT EXISTS balance_before           NUMERIC,
  ADD COLUMN IF NOT EXISTS balance_after            NUMERIC,
  ADD COLUMN IF NOT EXISTS prev_hash                TEXT,
  ADD COLUMN IF NOT EXISTS row_hash                 TEXT,
  ADD COLUMN IF NOT EXISTS is_reversed              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reverses_transaction_id  UUID REFERENCES public.bank_transactions(id) ON DELETE NO ACTION,
  ADD COLUMN IF NOT EXISTS reversal_reason          TEXT;

CREATE INDEX IF NOT EXISTS idx_bank_tx_account_seq
  ON public.bank_transactions (bank_account_id, sequence_no);

CREATE INDEX IF NOT EXISTS idx_bank_tx_reverses
  ON public.bank_transactions (reverses_transaction_id)
  WHERE reverses_transaction_id IS NOT NULL;

-- Part 2: Tamper log
CREATE TABLE IF NOT EXISTS public.bank_ledger_tamper_log (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempted_by    UUID,
  attempted_role  TEXT,
  operation       TEXT NOT NULL,
  target_tx_id    UUID,
  old_payload     JSONB,
  new_payload     JSONB,
  blocked         BOOLEAN NOT NULL DEFAULT true,
  reason          TEXT
);
ALTER TABLE public.bank_ledger_tamper_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins/Auditor can view bank tamper log" ON public.bank_ledger_tamper_log;
CREATE POLICY "Admins/Auditor can view bank tamper log"
  ON public.bank_ledger_tamper_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'auditor')
  );

-- Part 3: Canonical payload + hash helpers
CREATE OR REPLACE FUNCTION public.bank_tx_canonical_payload(
  p_id uuid, p_bank_account_id uuid, p_transaction_type text, p_amount numeric,
  p_balance_before numeric, p_balance_after numeric, p_sequence_no bigint,
  p_transaction_date date, p_reference_number text, p_category text,
  p_description text, p_created_at timestamptz, p_created_by uuid,
  p_reverses_transaction_id uuid
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT concat_ws('|',
    p_id::text, p_bank_account_id::text, p_transaction_type, p_amount::text,
    p_balance_before::text, p_balance_after::text, p_sequence_no::text,
    to_char(p_transaction_date, 'YYYY-MM-DD'),
    COALESCE(p_reference_number, ''), COALESCE(p_category, ''),
    COALESCE(p_description, ''),
    to_char(p_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    COALESCE(p_created_by::text, ''),
    COALESCE(p_reverses_transaction_id::text, '')
  );
$$;

CREATE OR REPLACE FUNCTION public.bank_tx_compute_hash(p_payload text, p_prev_hash text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(p_payload || '|' || COALESCE(p_prev_hash, ''), 'sha256'), 'hex');
$$;

-- Part 4: BEFORE INSERT — stamp balance + hash chain
CREATE OR REPLACE FUNCTION public.fn_bank_tx_stamp_and_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_head_seq  bigint;
  v_head_hash text;
  v_head_after numeric;
  v_signed numeric;
  v_payload text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bank_tx_chain:' || NEW.bank_account_id::text));

  SELECT sequence_no, row_hash, balance_after
    INTO v_head_seq, v_head_hash, v_head_after
    FROM public.bank_transactions
   WHERE bank_account_id = NEW.bank_account_id
   ORDER BY sequence_no DESC NULLS LAST
   LIMIT 1;

  NEW.sequence_no    := COALESCE(v_head_seq, 0) + 1;
  NEW.prev_hash      := v_head_hash;
  NEW.balance_before := COALESCE(v_head_after, 0);

  IF NEW.transaction_type IN ('INCOME','TRANSFER_IN') THEN v_signed := NEW.amount;
  ELSIF NEW.transaction_type IN ('EXPENSE','TRANSFER_OUT') THEN v_signed := -1 * NEW.amount;
  ELSE v_signed := 0;
  END IF;
  NEW.balance_after := NEW.balance_before + v_signed;

  v_payload := public.bank_tx_canonical_payload(
    NEW.id, NEW.bank_account_id, NEW.transaction_type, NEW.amount,
    NEW.balance_before, NEW.balance_after, NEW.sequence_no,
    NEW.transaction_date, NEW.reference_number, NEW.category,
    NEW.description, NEW.created_at, NEW.created_by,
    NEW.reverses_transaction_id
  );
  NEW.row_hash := public.bank_tx_compute_hash(v_payload, NEW.prev_hash);

  RETURN NEW;
END;
$$;

-- Part 5: BEFORE UPDATE/DELETE — block mutations
CREATE OR REPLACE FUNCTION public.fn_bank_tx_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_allowed text;
  v_actor   uuid;
  v_role    text;
  v_only_flag_change boolean;
  v_only_meta_change boolean;
BEGIN
  v_allowed := current_setting('app.allow_bank_ledger_mutation', true);
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  v_role := current_user;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.bank_ledger_tamper_log
      (attempted_by, attempted_role, operation, target_tx_id, old_payload, new_payload, blocked, reason)
    VALUES (v_actor, v_role, 'DELETE', OLD.id, to_jsonb(OLD), NULL,
            v_allowed IS DISTINCT FROM 'on',
            CASE WHEN v_allowed = 'on' THEN 'maintenance escape hatch active' ELSE 'blocked by trigger' END);
    IF v_allowed = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'bank_transactions is append-only. DELETE is forbidden. Use reverse_bank_transaction() instead.';
  END IF;

  v_only_flag_change :=
        OLD.id IS NOT DISTINCT FROM NEW.id
    AND OLD.bank_account_id IS NOT DISTINCT FROM NEW.bank_account_id
    AND OLD.transaction_type IS NOT DISTINCT FROM NEW.transaction_type
    AND OLD.amount IS NOT DISTINCT FROM NEW.amount
    AND OLD.transaction_date IS NOT DISTINCT FROM NEW.transaction_date
    AND OLD.reference_number IS NOT DISTINCT FROM NEW.reference_number
    AND OLD.category IS NOT DISTINCT FROM NEW.category
    AND OLD.description IS NOT DISTINCT FROM NEW.description
    AND OLD.client_id IS NOT DISTINCT FROM NEW.client_id
    AND OLD.related_account_name IS NOT DISTINCT FROM NEW.related_account_name
    AND OLD.related_transaction_id IS NOT DISTINCT FROM NEW.related_transaction_id
    AND OLD.bill_url IS NOT DISTINCT FROM NEW.bill_url
    AND OLD.balance_before IS NOT DISTINCT FROM NEW.balance_before
    AND OLD.balance_after IS NOT DISTINCT FROM NEW.balance_after
    AND OLD.sequence_no IS NOT DISTINCT FROM NEW.sequence_no
    AND OLD.prev_hash IS NOT DISTINCT FROM NEW.prev_hash
    AND OLD.row_hash IS NOT DISTINCT FROM NEW.row_hash
    AND OLD.created_at IS NOT DISTINCT FROM NEW.created_at
    AND OLD.created_by IS NOT DISTINCT FROM NEW.created_by
    AND OLD.reverses_transaction_id IS NOT DISTINCT FROM NEW.reverses_transaction_id
    AND OLD.is_reversed = false
    AND NEW.is_reversed = true;

  IF v_only_flag_change THEN
    INSERT INTO public.bank_ledger_tamper_log
      (attempted_by, attempted_role, operation, target_tx_id, old_payload, new_payload, blocked, reason)
    VALUES (v_actor, v_role, 'ALLOWED_FLAG_UPDATE', NEW.id, to_jsonb(OLD), to_jsonb(NEW),
            false, 'is_reversed flag flipped by reversal');
    RETURN NEW;
  END IF;

  v_only_meta_change :=
        OLD.id IS NOT DISTINCT FROM NEW.id
    AND OLD.bank_account_id IS NOT DISTINCT FROM NEW.bank_account_id
    AND OLD.transaction_type IS NOT DISTINCT FROM NEW.transaction_type
    AND OLD.amount IS NOT DISTINCT FROM NEW.amount
    AND OLD.transaction_date IS NOT DISTINCT FROM NEW.transaction_date
    AND OLD.reference_number IS NOT DISTINCT FROM NEW.reference_number
    AND OLD.balance_before IS NOT DISTINCT FROM NEW.balance_before
    AND OLD.balance_after IS NOT DISTINCT FROM NEW.balance_after
    AND OLD.sequence_no IS NOT DISTINCT FROM NEW.sequence_no
    AND OLD.prev_hash IS NOT DISTINCT FROM NEW.prev_hash
    AND OLD.row_hash IS NOT DISTINCT FROM NEW.row_hash
    AND OLD.created_at IS NOT DISTINCT FROM NEW.created_at
    AND OLD.created_by IS NOT DISTINCT FROM NEW.created_by
    AND OLD.is_reversed IS NOT DISTINCT FROM NEW.is_reversed
    AND OLD.reverses_transaction_id IS NOT DISTINCT FROM NEW.reverses_transaction_id
    AND OLD.related_transaction_id IS NOT DISTINCT FROM NEW.related_transaction_id;

  IF v_only_meta_change THEN
    INSERT INTO public.bank_ledger_tamper_log
      (attempted_by, attempted_role, operation, target_tx_id, old_payload, new_payload, blocked, reason)
    VALUES (v_actor, v_role, 'ALLOWED_META_UPDATE', NEW.id, to_jsonb(OLD), to_jsonb(NEW),
            false, 'metadata-only update (bill_url/category/description/related_account_name)');
    RETURN NEW;
  END IF;

  INSERT INTO public.bank_ledger_tamper_log
    (attempted_by, attempted_role, operation, target_tx_id, old_payload, new_payload, blocked, reason)
  VALUES (v_actor, v_role, 'UPDATE', OLD.id, to_jsonb(OLD), to_jsonb(NEW),
          v_allowed IS DISTINCT FROM 'on',
          CASE WHEN v_allowed = 'on' THEN 'maintenance escape hatch active' ELSE 'blocked by trigger' END);

  IF v_allowed = 'on' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'bank_transactions is append-only. UPDATE restricted to is_reversed flag and metadata fields (bill_url/category/description/related_account_name).';
END;
$$;

-- Part 6: Backfill (BEFORE attaching block trigger)
DO $backfill$
DECLARE
  r record;
  v_prev_after numeric;
  v_prev_hash text;
  v_signed numeric;
  v_payload text;
  v_account uuid := NULL;
BEGIN
  WITH seq AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY bank_account_id
             ORDER BY transaction_date ASC, created_at ASC, id ASC
           ) AS sn
      FROM public.bank_transactions
  )
  UPDATE public.bank_transactions bt
     SET sequence_no = seq.sn
    FROM seq
   WHERE bt.id = seq.id
     AND bt.sequence_no IS DISTINCT FROM seq.sn;

  FOR r IN
    SELECT * FROM public.bank_transactions
     ORDER BY bank_account_id, sequence_no
  LOOP
    IF v_account IS DISTINCT FROM r.bank_account_id THEN
      v_account := r.bank_account_id;
      v_prev_after := 0;
      v_prev_hash := NULL;
    END IF;

    IF r.transaction_type IN ('INCOME','TRANSFER_IN') THEN v_signed := r.amount;
    ELSIF r.transaction_type IN ('EXPENSE','TRANSFER_OUT') THEN v_signed := -1 * r.amount;
    ELSE v_signed := 0;
    END IF;

    v_payload := public.bank_tx_canonical_payload(
      r.id, r.bank_account_id, r.transaction_type, r.amount,
      v_prev_after, v_prev_after + v_signed, r.sequence_no,
      r.transaction_date, r.reference_number, r.category,
      r.description, r.created_at, r.created_by,
      r.reverses_transaction_id
    );

    UPDATE public.bank_transactions
       SET balance_before = v_prev_after,
           balance_after  = v_prev_after + v_signed,
           prev_hash      = v_prev_hash,
           row_hash       = public.bank_tx_compute_hash(v_payload, v_prev_hash)
     WHERE id = r.id;

    v_prev_after := v_prev_after + v_signed;
    SELECT row_hash INTO v_prev_hash FROM public.bank_transactions WHERE id = r.id;
  END LOOP;
END
$backfill$;

-- Part 7: Attach triggers
DROP TRIGGER IF EXISTS trg_bank_tx_stamp_and_chain ON public.bank_transactions;
CREATE TRIGGER trg_bank_tx_stamp_and_chain
  BEFORE INSERT ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_bank_tx_stamp_and_chain();

DROP TRIGGER IF EXISTS trg_bank_tx_block_mutation ON public.bank_transactions;
CREATE TRIGGER trg_bank_tx_block_mutation
  BEFORE UPDATE OR DELETE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_bank_tx_block_mutation();

-- Part 8: Reversal RPC
CREATE OR REPLACE FUNCTION public.reverse_bank_transaction(
  p_original_id uuid,
  p_reason text,
  p_reversed_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
    created_by, reverses_transaction_id, reversal_reason
  ) VALUES (
    v_new_id, v_orig.bank_account_id, v_new_type, v_orig.amount,
    CURRENT_DATE,
    'Reversal of ' || v_orig.id::text || ' — ' || p_reason || ' [REV:' || v_short_orig || ']',
    'REV-' || COALESCE(v_orig.reference_number, v_short_orig),
    COALESCE(v_orig.category, 'Reversal'),
    v_orig.related_account_name, v_orig.id, v_orig.client_id,
    v_actor, p_original_id, p_reason
  );

  UPDATE public.bank_transactions SET is_reversed = true WHERE id = p_original_id;

  RETURN v_new_id;
END;
$$;

-- Part 9: Verifier RPCs
CREATE OR REPLACE FUNCTION public.verify_bank_chain(p_bank_account_id uuid DEFAULT NULL)
RETURNS TABLE(
  out_bank_account_id uuid, out_total_rows bigint,
  out_first_break_id uuid, out_first_break_seq bigint,
  out_expected_hash text, out_actual_hash text, out_is_intact boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  a record; r record;
  v_prev_hash text; v_payload text; v_expected text;
  v_break_id uuid; v_break_seq bigint;
  v_break_expected text; v_break_actual text; v_count bigint;
BEGIN
  FOR a IN
    SELECT DISTINCT bt.bank_account_id AS bid FROM public.bank_transactions bt
     WHERE p_bank_account_id IS NULL OR bt.bank_account_id = p_bank_account_id
  LOOP
    v_prev_hash := NULL; v_break_id := NULL; v_break_seq := NULL;
    v_break_expected := NULL; v_break_actual := NULL; v_count := 0;
    FOR r IN
      SELECT * FROM public.bank_transactions bt2
       WHERE bt2.bank_account_id = a.bid ORDER BY bt2.sequence_no
    LOOP
      v_count := v_count + 1;
      v_payload := public.bank_tx_canonical_payload(
        r.id, r.bank_account_id, r.transaction_type, r.amount,
        r.balance_before, r.balance_after, r.sequence_no,
        r.transaction_date, r.reference_number, r.category,
        r.description, r.created_at, r.created_by,
        r.reverses_transaction_id);
      v_expected := public.bank_tx_compute_hash(v_payload, v_prev_hash);
      IF r.prev_hash IS DISTINCT FROM v_prev_hash OR r.row_hash IS DISTINCT FROM v_expected THEN
        v_break_id := r.id; v_break_seq := r.sequence_no;
        v_break_expected := v_expected; v_break_actual := r.row_hash;
        EXIT;
      END IF;
      v_prev_hash := r.row_hash;
    END LOOP;
    out_bank_account_id := a.bid; out_total_rows := v_count;
    out_first_break_id := v_break_id; out_first_break_seq := v_break_seq;
    out_expected_hash := v_break_expected; out_actual_hash := v_break_actual;
    out_is_intact := v_break_id IS NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_bank_running_balance(p_bank_account_id uuid)
RETURNS TABLE(
  intact boolean, rows_checked integer,
  break_transaction_id uuid, break_sequence_no bigint,
  break_reason text, expected_balance numeric, stored_balance numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_prev_after numeric := NULL;
  v_signed numeric;
  v_expected_after numeric;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id, sequence_no, transaction_type, amount, balance_before, balance_after
      FROM public.bank_transactions
     WHERE bank_account_id = p_bank_account_id
     ORDER BY sequence_no ASC
  LOOP
    v_count := v_count + 1;
    IF v_prev_after IS NOT NULL AND r.balance_before IS DISTINCT FROM v_prev_after THEN
      intact := false; rows_checked := v_count;
      break_transaction_id := r.id; break_sequence_no := r.sequence_no;
      break_reason := 'balance_before does not match previous row balance_after';
      expected_balance := v_prev_after; stored_balance := r.balance_before;
      RETURN NEXT; RETURN;
    END IF;
    IF r.transaction_type IN ('INCOME','TRANSFER_IN') THEN v_signed := r.amount;
    ELSIF r.transaction_type IN ('EXPENSE','TRANSFER_OUT') THEN v_signed := -1 * r.amount;
    ELSE v_signed := 0;
    END IF;
    v_expected_after := COALESCE(r.balance_before, 0) + v_signed;
    IF r.balance_after IS DISTINCT FROM v_expected_after THEN
      intact := false; rows_checked := v_count;
      break_transaction_id := r.id; break_sequence_no := r.sequence_no;
      break_reason := 'balance_after != balance_before + signed_amount';
      expected_balance := v_expected_after; stored_balance := r.balance_after;
      RETURN NEXT; RETURN;
    END IF;
    v_prev_after := r.balance_after;
  END LOOP;
  intact := true; rows_checked := v_count;
  break_transaction_id := NULL; break_sequence_no := NULL;
  break_reason := NULL; expected_balance := NULL; stored_balance := NULL;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_all_bank_running_balances()
RETURNS TABLE(
  bank_account_id uuid, account_name text, intact boolean, rows_checked integer,
  break_transaction_id uuid, break_sequence_no bigint, break_reason text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE a record; v record;
BEGIN
  FOR a IN
    SELECT ba.id, ba.account_name FROM public.bank_accounts ba
     WHERE EXISTS (SELECT 1 FROM public.bank_transactions bt WHERE bt.bank_account_id = ba.id)
  LOOP
    SELECT * INTO v FROM public.verify_bank_running_balance(a.id) LIMIT 1;
    bank_account_id := a.id; account_name := a.account_name;
    intact := v.intact; rows_checked := v.rows_checked;
    break_transaction_id := v.break_transaction_id;
    break_sequence_no := v.break_sequence_no;
    break_reason := v.break_reason;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Part 10: Refactor reverse_payment_gateway_settlement (no more DELETE)
CREATE OR REPLACE FUNCTION public.reverse_payment_gateway_settlement(p_settlement_id uuid, p_reversed_by uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement record;
  v_item record;
  v_guard_inserted boolean;
  v_restored_count int := 0;
  v_bt record;
BEGIN
  INSERT INTO reversal_guards (entity_type, entity_id, action)
  VALUES ('payment_gateway_settlement', p_settlement_id, 'reverse')
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_guard_inserted;

  IF v_guard_inserted IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'This settlement has already been reversed or is currently being reversed.');
  END IF;

  SELECT * INTO v_settlement FROM payment_gateway_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF v_settlement IS NULL THEN
    DELETE FROM reversal_guards WHERE entity_type='payment_gateway_settlement' AND entity_id=p_settlement_id AND action='reverse';
    RETURN jsonb_build_object('success', false, 'error', 'Settlement not found.');
  END IF;
  IF v_settlement.status = 'REVERSED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Settlement is already reversed.');
  END IF;

  FOR v_item IN
    SELECT si.sales_order_id, si.amount,
           so.order_number, so.client_name, so.order_date, so.sales_payment_method_id
      FROM payment_gateway_settlement_items si
      JOIN sales_orders so ON so.id = si.sales_order_id
     WHERE si.settlement_id = p_settlement_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM payment_gateway_settlement_items other_si
       JOIN payment_gateway_settlements other_pgs ON other_pgs.id = other_si.settlement_id
       WHERE other_si.sales_order_id = v_item.sales_order_id
         AND other_pgs.id != p_settlement_id
         AND other_pgs.status = 'COMPLETED'
    ) THEN
      INSERT INTO pending_settlements (
        sales_order_id, order_number, client_name, total_amount, settlement_amount,
        order_date, payment_method_id, bank_account_id, status
      ) VALUES (
        v_item.sales_order_id, v_item.order_number, v_item.client_name,
        v_item.amount, v_item.amount, v_item.order_date,
        v_item.sales_payment_method_id, v_settlement.bank_account_id, 'PENDING'
      )
      ON CONFLICT (sales_order_id, payment_method_id) DO UPDATE SET
        total_amount = EXCLUDED.total_amount,
        settlement_amount = EXCLUDED.settlement_amount,
        bank_account_id = EXCLUDED.bank_account_id,
        status = 'PENDING',
        updated_at = now();
      UPDATE sales_orders SET settlement_status = 'PENDING'
       WHERE id = v_item.sales_order_id AND settlement_status = 'SETTLED';
    END IF;
    v_restored_count := v_restored_count + 1;
  END LOOP;

  -- IMMUTABLE LEDGER: reverse via RPC instead of DELETE
  FOR v_bt IN
    SELECT id FROM bank_transactions
     WHERE reference_number = v_settlement.settlement_batch_id
       AND transaction_type = 'INCOME'
       AND is_reversed = false
       AND reverses_transaction_id IS NULL
  LOOP
    PERFORM public.reverse_bank_transaction(v_bt.id,
      'Settlement reversal: ' || v_settlement.settlement_batch_id, p_reversed_by);
  END LOOP;

  FOR v_bt IN
    SELECT id FROM bank_transactions
     WHERE reference_number = 'MDR-' || v_settlement.settlement_batch_id
       AND transaction_type = 'EXPENSE'
       AND is_reversed = false
       AND reverses_transaction_id IS NULL
  LOOP
    PERFORM public.reverse_bank_transaction(v_bt.id,
      'MDR reversal: ' || v_settlement.settlement_batch_id, p_reversed_by);
  END LOOP;

  UPDATE payment_gateway_settlement_items SET reversed_at = now() WHERE settlement_id = p_settlement_id;

  UPDATE payment_gateway_settlements
     SET status = 'REVERSED', updated_at = now(), reversed_by = p_reversed_by
   WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_batch_id', v_settlement.settlement_batch_id,
    'reversed_amount', v_settlement.net_amount,
    'restored_count', v_restored_count
  );
END;
$$;

-- Part 11: Grants
GRANT EXECUTE ON FUNCTION public.reverse_bank_transaction(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_bank_chain(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_bank_running_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_all_bank_running_balances() TO authenticated;