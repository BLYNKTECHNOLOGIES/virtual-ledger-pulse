
-- 1) reverse_wallet_transaction with real balance snapshot
CREATE OR REPLACE FUNCTION public.reverse_wallet_transaction(
  p_tx_id uuid, p_reason text, p_reversed_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_orig public.wallet_transactions%ROWTYPE;
  v_new_id uuid := gen_random_uuid();
  v_new_amount numeric; v_existing uuid; v_actor uuid;
  v_current_bal numeric := 0; v_balance_after numeric := 0; v_signed_delta numeric := 0;
BEGIN
  IF p_tx_id IS NULL THEN RAISE EXCEPTION 'reverse_wallet_transaction: p_tx_id is required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason))=0 THEN RAISE EXCEPTION 'reverse_wallet_transaction: a reason is required'; END IF;

  v_actor := COALESCE(p_reversed_by, auth.uid());

  SELECT * INTO v_orig FROM public.wallet_transactions WHERE id = p_tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reverse_wallet_transaction: transaction % not found', p_tx_id; END IF;
  IF v_orig.reverses_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'reverse_wallet_transaction: cannot reverse a reversal entry (%)', p_tx_id;
  END IF;

  SELECT id INTO v_existing FROM public.wallet_transactions WHERE reverses_transaction_id = p_tx_id;
  IF FOUND THEN RETURN v_existing; END IF;

  v_new_amount := -1 * v_orig.amount;

  SELECT COALESCE(balance,0) INTO v_current_bal
    FROM public.wallet_asset_balances
   WHERE wallet_id = v_orig.wallet_id
     AND asset_code = COALESCE(v_orig.asset_code,'USDT');

  IF v_orig.transaction_type IN ('CREDIT','TRANSFER_IN') THEN
    v_signed_delta := v_new_amount;
  ELSIF v_orig.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN
    v_signed_delta := -1 * v_new_amount;
  END IF;
  v_balance_after := v_current_bal + v_signed_delta;

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
    v_current_bal, v_balance_after, v_actor,
    v_orig.asset_code, v_orig.id,
    v_orig.market_rate_usdt,
    CASE WHEN v_orig.effective_usdt_qty IS NULL THEN NULL ELSE -1 * v_orig.effective_usdt_qty END,
    v_orig.effective_usdt_rate,
    v_orig.price_snapshot_id,
    p_tx_id
  );

  UPDATE public.wallet_transactions SET is_reversed = true WHERE id = p_tx_id;
  RETURN v_new_id;
END;
$$;

-- 2) Tighten wallet_transactions RLS
DROP POLICY IF EXISTS authenticated_all_wallet_transactions ON public.wallet_transactions;
DROP POLICY IF EXISTS service_all_wallet_transactions ON public.wallet_transactions;
DROP POLICY IF EXISTS wallet_tx_select ON public.wallet_transactions;
DROP POLICY IF EXISTS wallet_tx_insert ON public.wallet_transactions;
DROP POLICY IF EXISTS wallet_tx_no_update ON public.wallet_transactions;
DROP POLICY IF EXISTS wallet_tx_no_delete ON public.wallet_transactions;

CREATE POLICY wallet_tx_select ON public.wallet_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY wallet_tx_insert ON public.wallet_transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY wallet_tx_no_update ON public.wallet_transactions FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY wallet_tx_no_delete ON public.wallet_transactions FOR DELETE TO authenticated USING (false);

-- 3) Senior auditor helper (uses users.role_id -> roles.name)
CREATE OR REPLACE FUNCTION public.is_ledger_auditor(_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    LEFT JOIN public.roles r ON r.id = u.role_id
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id
    LEFT JOIN public.roles r2 ON r2.id = ur.role_id
    WHERE u.id = _uid
      AND (
        LOWER(COALESCE(r.name,''))  IN ('super admin','admin','auditor','coo')
        OR LOWER(COALESCE(r2.name,'')) IN ('super admin','admin','auditor','coo')
      )
  );
$$;

DROP POLICY IF EXISTS ledger_anchors_select ON public.ledger_anchors;
DROP POLICY IF EXISTS ledger_anchors_select_admin ON public.ledger_anchors;
CREATE POLICY ledger_anchors_select_admin
  ON public.ledger_anchors FOR SELECT TO authenticated
  USING (public.is_ledger_auditor(auth.uid()));

DROP POLICY IF EXISTS ledger_tamper_log_select ON public.ledger_tamper_log;
DROP POLICY IF EXISTS ledger_tamper_log_select_admin ON public.ledger_tamper_log;
CREATE POLICY ledger_tamper_log_select_admin
  ON public.ledger_tamper_log FOR SELECT TO authenticated
  USING (public.is_ledger_auditor(auth.uid()));

-- 4) verify_wallet_chain — short-circuit on first break
CREATE OR REPLACE FUNCTION public.verify_wallet_chain(p_wallet_id uuid DEFAULT NULL)
RETURNS TABLE(out_wallet_id uuid, out_total_rows bigint, out_first_break_id uuid,
              out_first_break_seq bigint, out_expected_hash text, out_actual_hash text,
              out_is_intact boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  w record; r record;
  v_prev_hash text; v_payload text; v_expected text;
  v_break_id uuid; v_break_seq bigint;
  v_break_expected text; v_break_actual text; v_count bigint;
BEGIN
  FOR w IN
    SELECT DISTINCT wt.wallet_id AS wid FROM public.wallet_transactions wt
    WHERE p_wallet_id IS NULL OR wt.wallet_id = p_wallet_id
  LOOP
    v_prev_hash := NULL; v_break_id := NULL; v_break_seq := NULL;
    v_break_expected := NULL; v_break_actual := NULL; v_count := 0;

    FOR r IN
      SELECT * FROM public.wallet_transactions wt2
       WHERE wt2.wallet_id = w.wid ORDER BY wt2.sequence_no
    LOOP
      v_count := v_count + 1;
      v_payload := public.wallet_tx_canonical_payload(
        r.id, r.wallet_id, r.transaction_type, r.amount,
        r.reference_type, r.reference_id, r.description,
        r.balance_before, r.balance_after, r.created_at, r.created_by,
        r.asset_code, r.related_transaction_id,
        r.market_rate_usdt, r.effective_usdt_qty, r.effective_usdt_rate,
        r.price_snapshot_id, r.sequence_no, r.reverses_transaction_id);
      v_expected := public.wallet_tx_compute_hash(v_payload, v_prev_hash);

      IF r.prev_hash IS DISTINCT FROM v_prev_hash
         OR r.row_hash  IS DISTINCT FROM v_expected THEN
        v_break_id := r.id; v_break_seq := r.sequence_no;
        v_break_expected := v_expected; v_break_actual := r.row_hash;
        EXIT;
      END IF;
      v_prev_hash := r.row_hash;
    END LOOP;

    out_wallet_id := w.wid; out_total_rows := v_count;
    out_first_break_id := v_break_id; out_first_break_seq := v_break_seq;
    out_expected_hash := v_break_expected; out_actual_hash := v_break_actual;
    out_is_intact := v_break_id IS NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 5) Best-effort backfill of is_reversed for legacy reversal pairs
WITH candidates AS (
  SELECT id, wallet_id, asset_code, amount, sequence_no, reference_id
  FROM public.wallet_transactions
  WHERE reverses_transaction_id IS NULL
    AND (description ILIKE '%reversal%' OR description ILIKE '%reverse%')
    AND amount < 0
    AND created_at < '2026-04-22'::date
), matched AS (
  SELECT (
    SELECT o.id FROM public.wallet_transactions o
    WHERE o.wallet_id = c.wallet_id
      AND COALESCE(o.asset_code,'USDT') = COALESCE(c.asset_code,'USDT')
      AND o.amount = -1 * c.amount
      AND o.sequence_no < c.sequence_no
      AND o.reverses_transaction_id IS NULL
      AND COALESCE(o.is_reversed,false) = false
      AND (c.reference_id IS NULL OR o.reference_id = c.reference_id)
    ORDER BY o.sequence_no DESC LIMIT 1
  ) AS orig_id
  FROM candidates c
)
UPDATE public.wallet_transactions w
SET is_reversed = true
WHERE w.id IN (SELECT orig_id FROM matched WHERE orig_id IS NOT NULL);
