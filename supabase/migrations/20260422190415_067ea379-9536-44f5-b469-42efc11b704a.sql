-- Migration C: Per-asset running balance verifier, trigger cleanup,
-- reversal description machine-tag, and missing-asset-row guard.

-- =========================================================================
-- G1. Recreate update_wallet_balance_trigger as AFTER INSERT only
-- (function body already early-returns on non-INSERT; this aligns the schema)
-- =========================================================================
DROP TRIGGER IF EXISTS update_wallet_balance_trigger ON public.wallet_transactions;
CREATE TRIGGER update_wallet_balance_trigger
AFTER INSERT ON public.wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_wallet_balance();

-- =========================================================================
-- G5 + G7. Update reverse_wallet_transaction:
--   - Embed [REV:<short_uuid>] tag in description for parsing
--   - Raise exception when no live wallet_asset_balances row exists
--     (instead of silently writing balance_before = 0)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reverse_wallet_transaction(
  p_tx_id uuid,
  p_reason text,
  p_reversed_by uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_orig public.wallet_transactions%ROWTYPE;
  v_new_id uuid := gen_random_uuid();
  v_new_amount numeric;
  v_existing uuid;
  v_actor uuid;
  v_current_bal numeric;
  v_balance_after numeric := 0;
  v_signed_delta numeric := 0;
  v_short_orig text;
  v_short_new text;
  v_has_bal boolean;
BEGIN
  IF p_tx_id IS NULL THEN
    RAISE EXCEPTION 'reverse_wallet_transaction: p_tx_id is required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason))=0 THEN
    RAISE EXCEPTION 'reverse_wallet_transaction: a reason is required';
  END IF;

  v_actor := COALESCE(p_reversed_by, auth.uid());

  SELECT * INTO v_orig
    FROM public.wallet_transactions
   WHERE id = p_tx_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reverse_wallet_transaction: transaction % not found', p_tx_id;
  END IF;
  IF v_orig.reverses_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'reverse_wallet_transaction: cannot reverse a reversal entry (%)', p_tx_id;
  END IF;

  -- Idempotent: return existing reversal id if already reversed
  SELECT id INTO v_existing
    FROM public.wallet_transactions
   WHERE reverses_transaction_id = p_tx_id;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  v_new_amount := -1 * v_orig.amount;

  -- G7 guard: require a live asset-balance row so balance_before is real
  SELECT balance INTO v_current_bal
    FROM public.wallet_asset_balances
   WHERE wallet_id = v_orig.wallet_id
     AND asset_code = COALESCE(v_orig.asset_code, 'USDT');
  v_has_bal := FOUND;
  IF NOT v_has_bal OR v_current_bal IS NULL THEN
    RAISE EXCEPTION
      'reverse_wallet_transaction: no live wallet_asset_balances row for wallet % asset % — refusing to write a misleading balance_before',
      v_orig.wallet_id,
      COALESCE(v_orig.asset_code, 'USDT');
  END IF;

  IF v_orig.transaction_type IN ('CREDIT','TRANSFER_IN') THEN
    v_signed_delta := v_new_amount;
  ELSIF v_orig.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN
    v_signed_delta := -1 * v_new_amount;
  END IF;
  v_balance_after := v_current_bal + v_signed_delta;

  -- G5: machine-readable tag for UI badges + CSV exports
  v_short_orig := substr(v_orig.id::text, 1, 8);
  v_short_new  := substr(v_new_id::text, 1, 8);

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
    'Reversal of ' || v_orig.id::text || ' — ' || p_reason || ' [REV:' || v_short_orig || ']',
    v_current_bal, v_balance_after, v_actor,
    v_orig.asset_code, v_orig.id,
    v_orig.market_rate_usdt,
    CASE WHEN v_orig.effective_usdt_qty IS NULL THEN NULL
         ELSE -1 * v_orig.effective_usdt_qty END,
    v_orig.effective_usdt_rate,
    v_orig.price_snapshot_id,
    p_tx_id
  );

  UPDATE public.wallet_transactions
     SET is_reversed = true
   WHERE id = p_tx_id;

  RETURN v_new_id;
END;
$function$;

-- =========================================================================
-- Part 1. Per-(wallet, asset) running-balance audit RPC.
-- Walks rows in sequence_no order, returns first row where the stored
-- balance_after diverges from balance_before + signed_amount,
-- or where balance_before != previous row's balance_after.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.verify_wallet_asset_running_balance(
  p_wallet_id uuid,
  p_asset_code text DEFAULT 'USDT'
)
RETURNS TABLE (
  intact boolean,
  rows_checked integer,
  break_transaction_id uuid,
  break_sequence_no bigint,
  break_reason text,
  expected_balance numeric,
  stored_balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_prev_after numeric := NULL;
  v_signed numeric;
  v_expected_after numeric;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id, sequence_no, transaction_type, amount,
           balance_before, balance_after, asset_code
      FROM public.wallet_transactions
     WHERE wallet_id = p_wallet_id
       AND COALESCE(asset_code, 'USDT') = COALESCE(p_asset_code, 'USDT')
     ORDER BY sequence_no ASC
  LOOP
    v_count := v_count + 1;

    -- Check continuity with previous row
    IF v_prev_after IS NOT NULL AND r.balance_before IS DISTINCT FROM v_prev_after THEN
      intact := false;
      rows_checked := v_count;
      break_transaction_id := r.id;
      break_sequence_no := r.sequence_no;
      break_reason := 'balance_before does not match previous row balance_after';
      expected_balance := v_prev_after;
      stored_balance := r.balance_before;
      RETURN NEXT;
      RETURN;
    END IF;

    -- Compute expected balance_after from signed amount
    IF r.transaction_type IN ('CREDIT','TRANSFER_IN') THEN
      v_signed := r.amount;
    ELSIF r.transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN
      v_signed := -1 * r.amount;
    ELSE
      v_signed := r.amount; -- fall back to raw amount
    END IF;

    v_expected_after := COALESCE(r.balance_before, 0) + v_signed;

    IF r.balance_after IS DISTINCT FROM v_expected_after THEN
      intact := false;
      rows_checked := v_count;
      break_transaction_id := r.id;
      break_sequence_no := r.sequence_no;
      break_reason := 'balance_after != balance_before + signed_amount';
      expected_balance := v_expected_after;
      stored_balance := r.balance_after;
      RETURN NEXT;
      RETURN;
    END IF;

    v_prev_after := r.balance_after;
  END LOOP;

  intact := true;
  rows_checked := v_count;
  break_transaction_id := NULL;
  break_sequence_no := NULL;
  break_reason := NULL;
  expected_balance := NULL;
  stored_balance := NULL;
  RETURN NEXT;
END;
$function$;

-- Convenience wrapper: enumerate every (wallet,asset) pair and verify each.
CREATE OR REPLACE FUNCTION public.verify_all_wallet_asset_running_balances()
RETURNS TABLE (
  wallet_id uuid,
  wallet_name text,
  asset_code text,
  intact boolean,
  rows_checked integer,
  break_transaction_id uuid,
  break_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pair record;
  res record;
BEGIN
  FOR pair IN
    SELECT DISTINCT wt.wallet_id, w.wallet_name,
           COALESCE(wt.asset_code, 'USDT') AS asset_code
      FROM public.wallet_transactions wt
      JOIN public.wallets w ON w.id = wt.wallet_id
  LOOP
    SELECT * INTO res
      FROM public.verify_wallet_asset_running_balance(pair.wallet_id, pair.asset_code);

    wallet_id := pair.wallet_id;
    wallet_name := pair.wallet_name;
    asset_code := pair.asset_code;
    intact := res.intact;
    rows_checked := res.rows_checked;
    break_transaction_id := res.break_transaction_id;
    break_reason := res.break_reason;
    RETURN NEXT;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verify_wallet_asset_running_balance(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_all_wallet_asset_running_balances() TO authenticated;