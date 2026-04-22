
-- ============================================================
-- 1. BEFORE INSERT trigger: assign sequence_no, prev_hash, row_hash
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_wallet_tx_hash_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_head_seq  bigint;
  v_head_hash text;
  v_payload   text;
BEGIN
  -- Per-wallet serialization: prevents two concurrent inserts from
  -- racing on sequence_no. Hash compute is sub-millisecond.
  PERFORM pg_advisory_xact_lock(hashtext('wallet_tx_chain:' || NEW.wallet_id::text));

  SELECT sequence_no, row_hash
    INTO v_head_seq, v_head_hash
    FROM public.wallet_transactions
   WHERE wallet_id = NEW.wallet_id
   ORDER BY sequence_no DESC NULLS LAST
   LIMIT 1;

  NEW.sequence_no := COALESCE(v_head_seq, 0) + 1;
  NEW.prev_hash   := v_head_hash;  -- NULL for the very first row in a wallet

  v_payload := public.wallet_tx_canonical_payload(
    NEW.id, NEW.wallet_id, NEW.transaction_type, NEW.amount,
    NEW.reference_type, NEW.reference_id, NEW.description,
    NEW.balance_before, NEW.balance_after, NEW.created_at, NEW.created_by,
    NEW.asset_code, NEW.related_transaction_id,
    NEW.market_rate_usdt, NEW.effective_usdt_qty, NEW.effective_usdt_rate,
    NEW.price_snapshot_id, NEW.sequence_no, NEW.reverses_transaction_id
  );
  NEW.row_hash := public.wallet_tx_compute_hash(v_payload, NEW.prev_hash);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_tx_hash_chain ON public.wallet_transactions;
CREATE TRIGGER trg_wallet_tx_hash_chain
  BEFORE INSERT ON public.wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_wallet_tx_hash_chain();

-- ============================================================
-- 2. BEFORE UPDATE/DELETE trigger: block + log every mutation
--    Allowed exception: flipping is_reversed false->true (and nothing else).
--    Maintenance escape hatch: SET LOCAL app.allow_ledger_mutation = 'on';
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_wallet_tx_block_mutation()
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
BEGIN
  v_allowed := current_setting('app.allow_ledger_mutation', true);
  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;
  v_role := current_user;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.ledger_tamper_log
      (attempted_by, attempted_role, operation, target_tx_id, old_payload, new_payload, blocked, reason)
    VALUES
      (v_actor, v_role, 'DELETE', OLD.id, to_jsonb(OLD), NULL,
       v_allowed IS DISTINCT FROM 'on',
       CASE WHEN v_allowed = 'on' THEN 'maintenance escape hatch active' ELSE 'blocked by trigger' END);

    IF v_allowed = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'wallet_transactions is append-only. DELETE is forbidden. Use reverse_wallet_transaction() instead.';
  END IF;

  -- TG_OP = 'UPDATE'
  v_only_flag_change :=
        OLD.id                       IS NOT DISTINCT FROM NEW.id
    AND OLD.wallet_id                IS NOT DISTINCT FROM NEW.wallet_id
    AND OLD.transaction_type         IS NOT DISTINCT FROM NEW.transaction_type
    AND OLD.amount                   IS NOT DISTINCT FROM NEW.amount
    AND OLD.reference_type           IS NOT DISTINCT FROM NEW.reference_type
    AND OLD.reference_id             IS NOT DISTINCT FROM NEW.reference_id
    AND OLD.description              IS NOT DISTINCT FROM NEW.description
    AND OLD.balance_before           IS NOT DISTINCT FROM NEW.balance_before
    AND OLD.balance_after            IS NOT DISTINCT FROM NEW.balance_after
    AND OLD.created_at               IS NOT DISTINCT FROM NEW.created_at
    AND OLD.created_by               IS NOT DISTINCT FROM NEW.created_by
    AND OLD.asset_code               IS NOT DISTINCT FROM NEW.asset_code
    AND OLD.related_transaction_id   IS NOT DISTINCT FROM NEW.related_transaction_id
    AND OLD.market_rate_usdt         IS NOT DISTINCT FROM NEW.market_rate_usdt
    AND OLD.effective_usdt_qty       IS NOT DISTINCT FROM NEW.effective_usdt_qty
    AND OLD.effective_usdt_rate      IS NOT DISTINCT FROM NEW.effective_usdt_rate
    AND OLD.price_snapshot_id        IS NOT DISTINCT FROM NEW.price_snapshot_id
    AND OLD.sequence_no              IS NOT DISTINCT FROM NEW.sequence_no
    AND OLD.prev_hash                IS NOT DISTINCT FROM NEW.prev_hash
    AND OLD.row_hash                 IS NOT DISTINCT FROM NEW.row_hash
    AND OLD.reverses_transaction_id  IS NOT DISTINCT FROM NEW.reverses_transaction_id
    AND OLD.is_reversed = false
    AND NEW.is_reversed = true;

  IF v_only_flag_change THEN
    INSERT INTO public.ledger_tamper_log
      (attempted_by, attempted_role, operation, target_tx_id, old_payload, new_payload, blocked, reason)
    VALUES
      (v_actor, v_role, 'ALLOWED_FLAG_UPDATE', NEW.id, to_jsonb(OLD), to_jsonb(NEW),
       false, 'is_reversed flag flipped by reversal');
    RETURN NEW;
  END IF;

  INSERT INTO public.ledger_tamper_log
    (attempted_by, attempted_role, operation, target_tx_id, old_payload, new_payload, blocked, reason)
  VALUES
    (v_actor, v_role, 'UPDATE', OLD.id, to_jsonb(OLD), to_jsonb(NEW),
     v_allowed IS DISTINCT FROM 'on',
     CASE WHEN v_allowed = 'on' THEN 'maintenance escape hatch active' ELSE 'blocked by trigger' END);

  IF v_allowed = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'wallet_transactions is append-only. UPDATE is forbidden (only is_reversed flag may flip via reverse_wallet_transaction()).';
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_tx_block_mutation ON public.wallet_transactions;
CREATE TRIGGER trg_wallet_tx_block_mutation
  BEFORE UPDATE OR DELETE ON public.wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_wallet_tx_block_mutation();

-- ============================================================
-- 3. reverse_wallet_transaction(p_tx_id, p_reason, p_reversed_by)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reverse_wallet_transaction(
  p_tx_id       uuid,
  p_reason      text,
  p_reversed_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_orig public.wallet_transactions%ROWTYPE;
  v_new_id uuid := gen_random_uuid();
  v_new_amount numeric;
  v_existing uuid;
  v_actor uuid;
BEGIN
  IF p_tx_id IS NULL THEN
    RAISE EXCEPTION 'reverse_wallet_transaction: p_tx_id is required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reverse_wallet_transaction: a reason is required';
  END IF;

  v_actor := COALESCE(p_reversed_by, auth.uid());

  SELECT * INTO v_orig
    FROM public.wallet_transactions
   WHERE id = p_tx_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reverse_wallet_transaction: transaction % not found', p_tx_id;
  END IF;

  IF v_orig.reverses_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'reverse_wallet_transaction: cannot reverse a reversal entry (%)', p_tx_id;
  END IF;

  -- Idempotency: if a reversal already exists for this original, return its id.
  SELECT id INTO v_existing
    FROM public.wallet_transactions
   WHERE reverses_transaction_id = p_tx_id;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  v_new_amount := -1 * v_orig.amount;

  -- Insert reversal row (BEFORE INSERT trigger fills sequence_no/prev_hash/row_hash)
  INSERT INTO public.wallet_transactions (
    id, wallet_id, transaction_type, amount,
    reference_type, reference_id, description,
    balance_before, balance_after, created_by,
    asset_code, related_transaction_id,
    market_rate_usdt, effective_usdt_qty, effective_usdt_rate,
    price_snapshot_id, reverses_transaction_id
  ) VALUES (
    v_new_id, v_orig.wallet_id, v_orig.transaction_type, v_new_amount,
    'REVERSAL', p_tx_id,
    'Reversal of ' || v_orig.id::text || ' — ' || p_reason,
    0, 0, v_actor,
    v_orig.asset_code, v_orig.id,
    v_orig.market_rate_usdt,
    CASE WHEN v_orig.effective_usdt_qty IS NULL THEN NULL ELSE -1 * v_orig.effective_usdt_qty END,
    v_orig.effective_usdt_rate,
    v_orig.price_snapshot_id,
    p_tx_id
  );

  -- Mark original as reversed (only is_reversed is allowed to change)
  UPDATE public.wallet_transactions
     SET is_reversed = true
   WHERE id = p_tx_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_wallet_transaction(uuid, text, uuid) TO authenticated;

-- ============================================================
-- 4. verify_wallet_chain(p_wallet_id) — walks the chain
-- ============================================================
CREATE OR REPLACE FUNCTION public.verify_wallet_chain(
  p_wallet_id uuid DEFAULT NULL
) RETURNS TABLE (
  wallet_id        uuid,
  total_rows       bigint,
  first_break_id   uuid,
  first_break_seq  bigint,
  expected_hash    text,
  actual_hash      text,
  is_intact        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  w record;
  r record;
  v_prev_hash text;
  v_payload text;
  v_expected text;
  v_break_id uuid;
  v_break_seq bigint;
  v_break_expected text;
  v_break_actual text;
  v_count bigint;
BEGIN
  FOR w IN
    SELECT DISTINCT wt.wallet_id AS wid
    FROM public.wallet_transactions wt
    WHERE p_wallet_id IS NULL OR wt.wallet_id = p_wallet_id
  LOOP
    v_prev_hash := NULL;
    v_break_id := NULL;
    v_break_seq := NULL;
    v_break_expected := NULL;
    v_break_actual := NULL;
    v_count := 0;

    FOR r IN
      SELECT * FROM public.wallet_transactions
       WHERE wallet_id = w.wid
       ORDER BY sequence_no
    LOOP
      v_count := v_count + 1;
      v_payload := public.wallet_tx_canonical_payload(
        r.id, r.wallet_id, r.transaction_type, r.amount,
        r.reference_type, r.reference_id, r.description,
        r.balance_before, r.balance_after, r.created_at, r.created_by,
        r.asset_code, r.related_transaction_id,
        r.market_rate_usdt, r.effective_usdt_qty, r.effective_usdt_rate,
        r.price_snapshot_id, r.sequence_no, r.reverses_transaction_id
      );
      v_expected := public.wallet_tx_compute_hash(v_payload, v_prev_hash);

      IF v_break_id IS NULL AND (
           r.prev_hash IS DISTINCT FROM v_prev_hash
        OR r.row_hash  IS DISTINCT FROM v_expected
      ) THEN
        v_break_id := r.id;
        v_break_seq := r.sequence_no;
        v_break_expected := v_expected;
        v_break_actual := r.row_hash;
      END IF;

      v_prev_hash := r.row_hash;
    END LOOP;

    wallet_id := w.wid;
    total_rows := v_count;
    first_break_id := v_break_id;
    first_break_seq := v_break_seq;
    expected_hash := v_break_expected;
    actual_hash := v_break_actual;
    is_intact := v_break_id IS NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_wallet_chain(uuid) TO authenticated;

-- ============================================================
-- 5. snapshot_ledger_anchor() — daily checkpoint per wallet
-- ============================================================
CREATE OR REPLACE FUNCTION public.snapshot_ledger_anchor()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_inserted integer := 0;
  v_actor    uuid;
BEGIN
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;

  WITH heads AS (
    SELECT DISTINCT ON (wallet_id)
      wallet_id, sequence_no, row_hash
    FROM public.wallet_transactions
    ORDER BY wallet_id, sequence_no DESC
  ), counts AS (
    SELECT wallet_id, count(*)::bigint AS c
    FROM public.wallet_transactions
    GROUP BY wallet_id
  )
  INSERT INTO public.ledger_anchors
    (wallet_id, head_sequence_no, head_row_hash, tx_count, anchored_by)
  SELECT h.wallet_id, h.sequence_no, h.row_hash, c.c, v_actor
  FROM heads h JOIN counts c ON c.wallet_id = h.wallet_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snapshot_ledger_anchor() TO authenticated;

-- Take an immediate baseline anchor so Phase 4 UI has data to show
SELECT public.snapshot_ledger_anchor();

-- ============================================================
-- 6. Daily cron at 00:05 UTC
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $cron$
BEGIN
  PERFORM cron.unschedule('ledger-anchor-daily')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ledger-anchor-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END
$cron$;

SELECT cron.schedule(
  'ledger-anchor-daily',
  '5 0 * * *',
  $$ SELECT public.snapshot_ledger_anchor(); $$
);
