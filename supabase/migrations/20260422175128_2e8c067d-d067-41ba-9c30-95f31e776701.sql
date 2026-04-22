
DROP FUNCTION IF EXISTS public.verify_wallet_chain(uuid);

CREATE OR REPLACE FUNCTION public.verify_wallet_chain(
  p_wallet_id uuid DEFAULT NULL
) RETURNS TABLE (
  out_wallet_id        uuid,
  out_total_rows       bigint,
  out_first_break_id   uuid,
  out_first_break_seq  bigint,
  out_expected_hash    text,
  out_actual_hash      text,
  out_is_intact        boolean
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
      SELECT * FROM public.wallet_transactions wt2
       WHERE wt2.wallet_id = w.wid
       ORDER BY wt2.sequence_no
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

    out_wallet_id := w.wid;
    out_total_rows := v_count;
    out_first_break_id := v_break_id;
    out_first_break_seq := v_break_seq;
    out_expected_hash := v_break_expected;
    out_actual_hash := v_break_actual;
    out_is_intact := v_break_id IS NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_wallet_chain(uuid) TO authenticated;
