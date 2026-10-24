-- SP-FIX round 2 (24 Oct 2026) — Sales & Purchase source fixes, database part.
-- Forward-only: creates or replaces functions, adds one trigger and restates grants. It inserts, updates or
-- deletes no existing row (positions, orders and ledgers keep their values; the new rules apply from their
-- next movement). Safe while the current front-end is live: old calls keep working (the new parameter has
-- a default; the new function is only called by the new front-end). One transaction (BEGIN/COMMIT below,
-- lock_timeout 5 s: if a lock is not free it fails and changes nothing); idempotent: running it again
-- changes nothing.
--
-- Part A (SP-F2, SP-F12) public.create_sales_order_with_postings(p_order, p_steps, p_source): one call writes
--   a sales order with its wallet debit, fee, split/bank/settlement rows and (for Terminal / Small-sales
--   approval) the approval mark — all or nothing, with the caller's rights (SECURITY INVOKER, so RLS and all
--   existing triggers apply exactly as for the browser's own inserts). Used by Terminal sale approval,
--   Small-sales approval and the New order flow.
-- Part B (SP-F6) non-USDT cost pool (wallet_asset_positions): purchases add their cost once, at the USDT rate
--   locked by the caller (p_market_rate_usdt), inside the create function, which also stores that rate on
--   the order; a new trigger on wallet movements moves the cost with each movement (out at unit cost,
--   transfers carry it, purchase edits and deletes at the purchase's own rate without re-adding the cost of
--   coins already sold, cleared when the position empties); conversion approval no longer writes a leftover
--   pool back or counts a coin twice. USDT positions and the balance trigger keep today's behaviour.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ============================================================================================
-- Part A · SP-F2 / SP-F12: create_sales_order_with_postings
-- ============================================================================================
CREATE OR REPLACE FUNCTION public.create_sales_order_with_postings(
  p_order jsonb,
  p_steps jsonb DEFAULT '[]'::jsonb,
  p_source jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_step jsonb;
  v_n int := 0;
  v_op text;
  v_table text;
  v_row jsonb;
  v_cols text;
  v_bad text;
  v_allowed text[];
  v_src_table text;
  v_src_id uuid;
  v_src_status text;
  v_existing_number text;
  v_result jsonb;
  v_count int;
BEGIN
  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' OR p_order = '{}'::jsonb THEN
    RAISE EXCEPTION 'Order details are missing, so nothing was saved.';
  END IF;
  IF p_steps IS NOT NULL AND jsonb_typeof(p_steps) <> 'array' THEN
    RAISE EXCEPTION 'Order steps must be a list, so nothing was saved.';
  END IF;

  -- 1. Lock the Terminal sale / Small-sales batch being approved and check it is still open.
  IF p_source IS NOT NULL THEN
    v_src_table := p_source->>'table';
    IF v_src_table = 'terminal_sales_sync' THEN
      v_allowed := ARRAY['synced_pending_approval', 'client_mapping_pending'];
    ELSIF v_src_table = 'small_sales_sync' THEN
      v_allowed := ARRAY['pending_approval'];
    ELSE
      RAISE EXCEPTION 'Approval source % is not supported, so nothing was saved.', coalesce(v_src_table, '(none)');
    END IF;
    v_src_id := nullif(p_source->>'id', '')::uuid;
    IF v_src_id IS NULL THEN
      RAISE EXCEPTION 'The entry to approve is missing, so nothing was saved.';
    END IF;

    EXECUTE format('SELECT sync_status FROM public.%I WHERE id = $1 FOR UPDATE', v_src_table)
      INTO v_src_status USING v_src_id;
    IF v_src_status IS NULL THEN
      RAISE EXCEPTION 'This entry is no longer available to approve. Refresh the list.';
    END IF;
    IF NOT (v_src_status = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'This entry is already %, so nothing was saved. Refresh the list.',
        CASE v_src_status
          WHEN 'processing' THEN 'being approved'
          WHEN 'cancelled_on_binance' THEN 'cancelled on Binance'
          ELSE replace(v_src_status, '_', ' ')
        END;
    END IF;

    IF v_src_table = 'terminal_sales_sync' THEN
      SELECT so.order_number INTO v_existing_number
        FROM public.sales_orders so
       WHERE so.terminal_sync_id = v_src_id
       LIMIT 1;
      IF v_existing_number IS NOT NULL THEN
        RAISE EXCEPTION 'Sales order % was already created for this Terminal sale by an earlier attempt, so nothing was saved. Ask a manager to check that order before approving again.', v_existing_number;
      END IF;
    END IF;
  END IF;

  -- 2. The order.
  SELECT string_agg(format('%I', k.key), ', ' ORDER BY k.key) FILTER (WHERE a.attname IS NOT NULL),
         string_agg(k.key, ', ' ORDER BY k.key) FILTER (WHERE a.attname IS NULL)
    INTO v_cols, v_bad
    FROM jsonb_object_keys(p_order) AS k(key)
    LEFT JOIN pg_attribute a
      ON a.attrelid = 'public.sales_orders'::regclass AND a.attname = k.key AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Sales orders have no field(s) %, so nothing was saved.', v_bad;
  END IF;
  EXECUTE format(
    'INSERT INTO public.sales_orders (%s) SELECT %s FROM jsonb_populate_record(NULL::public.sales_orders, $1) RETURNING id, order_number',
    v_cols, v_cols)
    INTO v_order_id, v_order_number USING p_order;

  -- 3. Everything that belongs to the order, in the order given.
  FOR v_step IN SELECT e.value FROM jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) AS e(value) LOOP
    v_n := v_n + 1;
    v_op := v_step->>'op';

    IF v_op = 'insert' THEN
      v_table := v_step->>'table';
      IF v_table IS NULL OR v_table NOT IN ('bank_transactions', 'pending_settlements', 'sales_order_payment_splits', 'wallet_fee_deductions') THEN
        RAISE EXCEPTION 'Step %: rows cannot be added to %, so nothing was saved.', v_n, coalesce(v_table, '(no table)');
      END IF;
      v_row := v_step->'row';
      IF v_row IS NULL OR jsonb_typeof(v_row) <> 'object' THEN
        RAISE EXCEPTION 'Step %: the % row is missing, so nothing was saved.', v_n, v_table;
      END IF;
      IF nullif(v_step->>'order_id_column', '') IS NOT NULL THEN
        v_row := v_row || jsonb_build_object(v_step->>'order_id_column', v_order_id);
      END IF;
      v_cols := NULL; v_bad := NULL;
      SELECT string_agg(format('%I', k.key), ', ' ORDER BY k.key) FILTER (WHERE a.attname IS NOT NULL),
             string_agg(k.key, ', ' ORDER BY k.key) FILTER (WHERE a.attname IS NULL)
        INTO v_cols, v_bad
        FROM jsonb_object_keys(v_row) AS k(key)
        LEFT JOIN pg_attribute a
          ON a.attrelid = format('public.%I', v_table)::regclass AND a.attname = k.key AND a.attnum > 0 AND NOT a.attisdropped;
      IF v_bad IS NOT NULL OR v_cols IS NULL THEN
        RAISE EXCEPTION 'Step %: % has no field(s) %, so nothing was saved.', v_n, v_table, coalesce(v_bad, '(none given)');
      END IF;
      EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
                     v_table, v_cols, v_cols, v_table)
        USING v_row;

    ELSIF v_op = 'wallet_deduction' THEN
      PERFORM public.process_sales_order_wallet_deduction(
        wallet_id      := (v_step->>'wallet_id')::uuid,
        usdt_amount    := (v_step->>'amount')::numeric,
        sales_order_id := v_order_id,
        p_asset_code   := coalesce(nullif(v_step->>'asset_code', ''), 'USDT'));

    ELSIF v_op = 'platform_fee' THEN
      v_result := public.process_platform_fee_deduction(
        p_order_id     := v_order_id,
        p_order_type   := 'SALES_ORDER',
        p_wallet_id    := (v_step->>'wallet_id')::uuid,
        p_fee_amount   := (v_step->>'fee_amount')::numeric,
        p_order_number := v_order_number);
      IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'The platform fee could not be recorded (%), so nothing was saved.',
          coalesce(v_result->>'error', v_result->>'message', 'no reason given');
      END IF;

    ELSIF v_op = 'update_order' THEN
      v_row := v_step->'set';
      IF v_row IS NULL OR jsonb_typeof(v_row) <> 'object' OR v_row = '{}'::jsonb THEN
        RAISE EXCEPTION 'Step %: nothing to change on the order, so nothing was saved.', v_n;
      END IF;
      SELECT string_agg(k.key, ', ' ORDER BY k.key) INTO v_bad
        FROM jsonb_object_keys(v_row) AS k(key)
       WHERE k.key NOT IN ('settlement_status', 'fee_amount', 'fee_percentage');
      IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'Step %: % cannot be changed here, so nothing was saved.', v_n, v_bad;
      END IF;
      SELECT string_agg(format('%I', k.key), ', ' ORDER BY k.key) INTO v_cols FROM jsonb_object_keys(v_row) AS k(key);
      EXECUTE format('UPDATE public.sales_orders SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.sales_orders, $1)) WHERE id = $2',
                     v_cols, v_cols)
        USING v_row, v_order_id;

    ELSIF v_op = 'sync_split_settlements' THEN
      v_result := public.sync_split_payment_settlements(p_order_id := v_order_id);
      IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Gateway settlements could not be set up (%), so nothing was saved.',
          coalesce(v_result->>'error', 'no reason given');
      END IF;

    ELSE
      RAISE EXCEPTION 'Step %: unknown action %, so nothing was saved.', v_n, coalesce(v_op, '(none)');
    END IF;
  END LOOP;

  -- 4. Mark the Terminal sale / Small-sales batch approved and link it to the order.
  IF p_source IS NOT NULL THEN
    v_row := coalesce(p_source->'set', '{}'::jsonb);
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'Approval details must be an object, so nothing was saved.';
    END IF;
    v_row := v_row || jsonb_build_object('sync_status', 'approved', 'sales_order_id', v_order_id);
    v_allowed := CASE WHEN v_src_table = 'terminal_sales_sync'
                      THEN ARRAY['sync_status', 'sales_order_id', 'client_id', 'contact_number', 'state', 'reviewed_by', 'reviewed_at']
                      ELSE ARRAY['sync_status', 'sales_order_id', 'reviewed_by', 'reviewed_at'] END;
    SELECT string_agg(k.key, ', ' ORDER BY k.key) INTO v_bad
      FROM jsonb_object_keys(v_row) AS k(key)
     WHERE NOT (k.key = ANY (v_allowed));
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION '% cannot be set on the approved entry, so nothing was saved.', v_bad;
    END IF;
    SELECT string_agg(format('%I', k.key), ', ' ORDER BY k.key) INTO v_cols FROM jsonb_object_keys(v_row) AS k(key);
    EXECUTE format('UPDATE public.%I SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)) WHERE id = $2',
                   v_src_table, v_cols, v_cols, v_src_table)
      USING v_row, v_src_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'The entry could not be marked approved, so nothing was saved. Refresh the list and try again.';
    END IF;
  END IF;

  RETURN jsonb_build_object('sales_order_id', v_order_id, 'order_number', v_order_number);
END;
$function$;

COMMENT ON FUNCTION public.create_sales_order_with_postings(jsonb, jsonb, jsonb) IS
  'Creates one sales order with its wallet debit, fee, split, bank and settlement rows and (optionally) marks the Terminal sale or Small-sales batch approved, all in one transaction with the caller''s rights. Used by Terminal sale approval, Small sales approval and the New order flow.';

REVOKE ALL ON FUNCTION public.create_sales_order_with_postings(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_order_with_postings(jsonb, jsonb, jsonb) TO authenticated, service_role;

-- ============================================================================================
-- Part B · SP-F6: non-USDT cost pool
-- ============================================================================================
-- --------------------------------------------------------------------------------------------
-- 1. Cost pool (non-USDT): the cost moves with the wallet movement that changed the quantity
--    sync_asset_position_on_balance_change is NOT changed: it keeps qty_on_hand equal to the ledger
--    balance and never touches the pool, so cache heals and balance rewrites leave pools as they are.
--    apply_wallet_movement_to_cost_pool runs right after it for every wallet_transactions row (the trigger
--    is created at the end of this file) and moves the cost by what the movement is:
--      out (sale, conversion, fee, transfer out, adjustment): leaves at the unit cost (pool / qty before);
--        an emptied position ends with pool 0 and average 0;
--      reversal of a purchase credit (purchase edit or delete): leaves at that purchase's USDT rate; cost the
--        position cannot cover (part of the lot was already sold) is kept for this purchase's re-post in the
--        same transaction, so an edit never brings back the cost of coins already sold;
--      in to an empty position: no earlier cost carries over (a leftover pool is cleared first);
--      transfer in: arrives at the sending wallet's unit cost (same transaction, same reference_id);
--      purchase credit re-posted by an edit: at the purchase's USDT rate, less the kept shortfall;
--      reversal of an outgoing movement: comes back at the average cost;
--      first purchase credit and conversion credit: the purchase / conversion function adds the cost
--        itself right after; other credits (adjustment, opening balance): no known cost.
--    After every movement in, the average is pool / quantity.
--    A purchase's USDT rate (purchase_orders.market_rate_usdt) is used only for the coin it was bought as
--    (its first credit) and only when plausible (unit price / rate between 50 and 200 INR per USDT). For a
--    coin the purchase was changed to, the newest price snapshot recorded for that purchase and coin is used
--    (the edit screen records one before saving a product change; a reversal uses the newest one recorded no
--    later than the credit it reverses); otherwise the average cost.
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_wallet_movement_to_cost_pool()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset text := COALESCE(NEW.asset_code, 'USDT');   -- as update_wallet_balance keys the balance
  v_delta numeric;
  v_pos record;
  v_before numeric;
  v_after numeric;
  v_pool numeric;
  v_avg numeric;
  v_unit numeric;
  v_cost numeric := 0;
  v_orig_type text;
  v_orig_ref_type text;
  v_orig_ref uuid;
  v_orig_created timestamptz;
  v_order uuid;
  v_first_asset text;
  v_rate numeric;
  v_key text;
  v_skey text;
  v_short numeric;
BEGIN
  IF v_asset = 'USDT' THEN
    RETURN NULL;
  END IF;

  v_delta := CASE
    WHEN NEW.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN NEW.amount
    WHEN NEW.transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -NEW.amount
    ELSE 0 END;
  IF COALESCE(v_delta, 0) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_pos FROM wallet_asset_positions
   WHERE wallet_id = NEW.wallet_id AND asset_code = v_asset FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- This row's own ledger balance before and after it (set per row by set_wallet_transaction_balances,
  -- which also sees earlier rows of the same INSERT; qty_on_hand can already include later rows).
  v_after := COALESCE(NEW.balance_after, v_pos.qty_on_hand, 0);
  v_before := COALESCE(NEW.balance_before, v_after - v_delta);
  v_pool := GREATEST(COALESCE(v_pos.cost_pool_usdt, 0), 0);
  v_avg := GREATEST(COALESCE(v_pos.avg_cost_usdt, 0), 0);

  IF NEW.reverses_transaction_id IS NOT NULL THEN
    SELECT w.transaction_type, w.reference_type, w.reference_id, w.created_at
      INTO v_orig_type, v_orig_ref_type, v_orig_ref, v_orig_created
      FROM wallet_transactions w WHERE w.id = NEW.reverses_transaction_id;
    IF v_orig_type = 'CREDIT' AND v_orig_ref_type IN ('PURCHASE', 'PURCHASE_ORDER') THEN
      v_order := v_orig_ref;                       -- reversal of a purchase credit
    END IF;
  ELSIF NEW.reference_type IN ('WALLET_TRANSFER', 'MANUAL_TRANSFER') AND NEW.reference_id IS NOT NULL THEN
    v_key := 'app.cost_pool_transfer_' || md5(NEW.reference_id::text || '|' || v_asset);
  ELSIF NEW.transaction_type = 'CREDIT' AND NEW.reference_type IN ('PURCHASE', 'PURCHASE_ORDER')
        AND EXISTS (SELECT 1 FROM wallet_transactions w
                      WHERE w.reference_type IN ('PURCHASE', 'PURCHASE_ORDER') AND w.reference_id = NEW.reference_id
                       AND w.transaction_type = 'CREDIT' AND w.id <> NEW.id AND COALESCE(w.is_reversed, false)) THEN
    v_order := NEW.reference_id;                   -- a purchase edit re-posting the purchase's credit
  END IF;

  IF v_order IS NOT NULL THEN
    SELECT COALESCE(w.asset_code, 'USDT') INTO v_first_asset
      FROM wallet_transactions w
     WHERE w.reference_type IN ('PURCHASE', 'PURCHASE_ORDER') AND w.reference_id = v_order
       AND w.transaction_type = 'CREDIT' AND w.reverses_transaction_id IS NULL
     ORDER BY w.created_at, w.id
     LIMIT 1;
    IF v_first_asset = v_asset THEN
      SELECT po.market_rate_usdt INTO v_rate FROM purchase_orders po
       WHERE po.id = v_order AND po.market_rate_usdt > 0 AND po.price_per_unit > 0
         AND po.price_per_unit / NULLIF(po.market_rate_usdt, 0) BETWEEN 50 AND 200;
    ELSE
      -- A reversal takes the rate its credit was posted with: the newest snapshot recorded no later than
      -- that credit (a snapshot added afterwards cannot change what leaves).
      SELECT ps.usdt_price INTO v_rate FROM price_snapshots ps
        WHERE ps.reference_id = v_order AND ps.asset_code = v_asset AND ps.usdt_price > 0
         AND (v_orig_created IS NULL OR ps.created_at <= v_orig_created)
       ORDER BY ps.created_at DESC
       LIMIT 1;
    END IF;
    v_skey := 'app.cost_pool_shortfall_' || md5(v_order::text || '|' || v_asset);
  END IF;

  IF v_delta < 0 THEN
    v_unit := CASE WHEN v_before > 0 THEN v_pool / v_before ELSE 0 END;
    IF v_key IS NOT NULL THEN
      PERFORM set_config(v_key, v_unit::text, true);   -- read by the receiving wallet's row
    END IF;
    IF v_rate IS NOT NULL THEN
      -- Reversal of a purchase credit: those coins leave at the purchase's own rate.
      v_pool := v_pool + v_delta * v_rate;
      IF v_pool < 0 THEN
        v_short := COALESCE(NULLIF(current_setting(v_skey, true), '')::numeric, 0) - v_pool;
        PERFORM set_config(v_skey, v_short::text, true);
        v_pool := 0;
      END IF;
      UPDATE wallet_asset_positions
         SET cost_pool_usdt = CASE WHEN v_after > 0 THEN v_pool ELSE 0 END,
             avg_cost_usdt = CASE WHEN v_after > 0 THEN v_pool / v_after ELSE 0 END,
             updated_at = now()
       WHERE id = v_pos.id;
      RETURN NULL;
    END IF;
    IF v_after <= 0 THEN
      UPDATE wallet_asset_positions SET cost_pool_usdt = 0, avg_cost_usdt = 0, updated_at = now() WHERE id = v_pos.id;
      RETURN NULL;
    END IF;
    IF v_before > 0 THEN
      UPDATE wallet_asset_positions SET cost_pool_usdt = v_pool * (v_after / v_before), updated_at = now() WHERE id = v_pos.id;
    END IF;
    RETURN NULL;
  END IF;

  -- In. From an empty position no earlier cost carries over.
  IF v_before <= 0 THEN
    v_pool := 0;
    v_avg := 0;
  END IF;

  IF v_key IS NOT NULL THEN
    v_unit := NULLIF(current_setting(v_key, true), '')::numeric;
    IF v_unit IS NULL THEN
      -- The sending row is not posted yet: the sending wallet's unit cost is still the one before it.
      SELECT CASE WHEN p.qty_on_hand > 0 THEN GREATEST(p.cost_pool_usdt, 0) / p.qty_on_hand ELSE 0 END INTO v_unit
        FROM wallet_transactions w
        JOIN wallet_asset_positions p ON p.wallet_id = w.wallet_id AND p.asset_code = v_asset
       WHERE w.reference_id = NEW.reference_id AND w.reference_type = NEW.reference_type
         AND w.wallet_id <> NEW.wallet_id AND COALESCE(w.asset_code, 'USDT') = v_asset
         AND w.transaction_type IN ('DEBIT', 'TRANSFER_OUT') AND w.reverses_transaction_id IS NULL
       LIMIT 1;
    END IF;
    v_cost := v_delta * COALESCE(v_unit, 0);
  ELSIF v_order IS NOT NULL THEN
    -- A purchase edit re-posting the credit: at the purchase's rate for this coin (else the average), less
    -- the cost the reversal could not take out because part of the lot had been sold.
    v_cost := v_delta * COALESCE(v_rate, v_avg);
    v_short := NULLIF(current_setting(v_skey, true), '')::numeric;
    IF v_short IS NOT NULL THEN
      v_cost := v_cost - v_short;
      PERFORM set_config(v_skey, '', true);
    END IF;
  ELSIF v_orig_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
    v_cost := v_delta * v_avg;
  END IF;

  v_cost := GREATEST(COALESCE(v_cost, 0), 0);
  v_pool := v_pool + v_cost;
  UPDATE wallet_asset_positions
     SET cost_pool_usdt = v_pool,
         avg_cost_usdt = CASE WHEN v_after > 0 THEN v_pool / v_after ELSE v_avg END,
         updated_at = now()
   WHERE id = v_pos.id;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_wallet_movement_to_cost_pool() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_wallet_movement_to_cost_pool() TO service_role;
-- (The trigger itself is created at the end of this file, just before COMMIT, so wallet_transactions is
--  locked for the shortest time.)

-- --------------------------------------------------------------------------------------------
-- 2. Purchase functions: + p_market_rate_usdt. Drop the 16-argument versions first so PostgREST
--    never sees two overloads (no other database function calls these; the wrappers below are
--    the only callers and use named arguments).
-- --------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_manual_purchase_complete_v2_rpc(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, text, text, numeric, boolean, uuid);
DROP FUNCTION IF EXISTS public.create_manual_purchase_complete_rpc(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, text, text, numeric, boolean, uuid);
DROP FUNCTION IF EXISTS public.create_manual_purchase_with_split_payments_rpc(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, text, text, numeric, boolean, uuid, jsonb);
DROP FUNCTION IF EXISTS public.create_manual_purchase_complete_v2(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, text, text, numeric, boolean, uuid);
DROP FUNCTION IF EXISTS public.create_manual_purchase_with_split_payments(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, text, text, numeric, boolean, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_v2(
  p_order_number TEXT,
  p_supplier_name TEXT,
  p_order_date DATE,
  p_total_amount NUMERIC,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_contact_number TEXT DEFAULT NULL,
  p_bank_account_id UUID DEFAULT NULL,
  p_credit_wallet_id UUID DEFAULT NULL,
  p_tds_option TEXT DEFAULT 'none',
  p_pan_number TEXT DEFAULT NULL,
  p_fee_percentage NUMERIC DEFAULT 0,
  p_is_off_market BOOLEAN DEFAULT FALSE,
  p_created_by UUID DEFAULT NULL,
  p_market_rate_usdt NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_purchase_order_id UUID;
  v_bank_balance NUMERIC;
  v_tds_rate NUMERIC := 0;
  v_tds_amount NUMERIC := 0;
  v_net_payable_amount NUMERIC;
  v_fee_amount NUMERIC := 0;
  v_net_credit_quantity NUMERIC;
  v_financial_year TEXT;
  v_client_id UUID;
  v_product_code TEXT;
  v_acct_type TEXT;
  v_existing_po_id UUID;
  v_market_rate NUMERIC;
  v_pos RECORD;
  v_new_qty NUMERIC;
  v_new_pool NUMERIC;
BEGIN
  -- Idempotency
  SELECT id INTO v_existing_po_id FROM public.purchase_orders WHERE order_number = p_order_number LIMIT 1;
  IF v_existing_po_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A purchase order with number ' || p_order_number || ' already exists', 'purchase_order_id', v_existing_po_id);
  END IF;

  SELECT code INTO v_product_code FROM public.products WHERE id = p_product_id;
  IF v_product_code IS NULL THEN v_product_code := 'USDT'; END IF;

  IF p_tds_option = '1%' THEN
    v_tds_rate := 1;
    IF p_pan_number IS NULL OR p_pan_number = '' THEN RAISE EXCEPTION 'PAN number is required for 1%% TDS'; END IF;
  ELSIF p_tds_option = '20%' THEN
    v_tds_rate := 20;
  END IF;

  v_tds_amount := p_total_amount * (v_tds_rate / 100);
  v_net_payable_amount := p_total_amount - v_tds_amount;

  IF NOT p_is_off_market AND p_fee_percentage IS NOT NULL AND p_fee_percentage > 0 THEN
    v_fee_amount := p_quantity * (p_fee_percentage / 100);
  END IF;
  v_net_credit_quantity := p_quantity - v_fee_amount;

  SELECT ba.balance, ba.account_type INTO v_bank_balance, v_acct_type FROM public.bank_accounts ba WHERE ba.id = p_bank_account_id AND ba.status = 'ACTIVE';
  IF v_bank_balance IS NULL THEN RAISE EXCEPTION 'Bank account not found or inactive'; END IF;
  IF COALESCE(v_acct_type, '') <> 'CREDIT' AND v_bank_balance < v_net_payable_amount THEN
    RAISE EXCEPTION 'Insufficient bank balance. Available: %, Required: %', v_bank_balance, v_net_payable_amount;
  END IF;

  SELECT CASE WHEN EXTRACT(MONTH FROM p_order_date) >= 4 THEN EXTRACT(YEAR FROM p_order_date)::TEXT || '-' || (EXTRACT(YEAR FROM p_order_date) + 1)::TEXT ELSE (EXTRACT(YEAR FROM p_order_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM p_order_date)::TEXT END INTO v_financial_year;

  IF p_pan_number IS NOT NULL AND p_pan_number != '' THEN
    SELECT id INTO v_client_id FROM public.clients WHERE LOWER(name) = LOWER(p_supplier_name) OR (p_contact_number IS NOT NULL AND phone = p_contact_number) LIMIT 1;
    IF v_client_id IS NOT NULL THEN
      UPDATE public.clients SET pan_card_number = p_pan_number, updated_at = NOW() WHERE id = v_client_id AND (pan_card_number IS NULL OR pan_card_number = '');
    END IF;
  END IF;

  v_market_rate := CASE WHEN p_quantity > 0 THEN p_unit_price ELSE 0 END;

  -- market_rate_usdt: the USDT rate the caller locked (p_market_rate_usdt); without one, the unit price as before.
  INSERT INTO public.purchase_orders (order_number, supplier_name, order_date, description, total_amount, contact_number, status, total_paid, bank_account_id, tds_applied, pan_number, tds_amount, net_payable_amount, quantity, price_per_unit, is_off_market, fee_percentage, fee_amount, net_amount, wallet_id, created_by, market_rate_usdt)
  VALUES (p_order_number, p_supplier_name, p_order_date, p_description, p_total_amount, p_contact_number, 'COMPLETED', v_net_payable_amount, p_bank_account_id, v_tds_rate > 0, CASE WHEN v_tds_rate > 0 THEN p_pan_number ELSE NULL END, v_tds_amount, v_net_payable_amount, p_quantity, p_unit_price, p_is_off_market, COALESCE(p_fee_percentage, 0), v_fee_amount, v_net_credit_quantity, p_credit_wallet_id, p_created_by, CASE WHEN COALESCE(p_market_rate_usdt, 0) > 0 THEN p_market_rate_usdt ELSE v_market_rate END)
  RETURNING id INTO v_purchase_order_id;

  INSERT INTO public.purchase_order_items (purchase_order_id, product_id, quantity, unit_price, total_price, warehouse_id)
  VALUES (v_purchase_order_id, p_product_id, p_quantity, p_unit_price, p_total_amount, p_credit_wallet_id);

  INSERT INTO public.bank_transactions (bank_account_id, transaction_type, amount, description, reference_number, transaction_date, category, related_account_name, created_by)
  VALUES (p_bank_account_id, 'EXPENSE', v_net_payable_amount, 'Manual Purchase - ' || p_order_number || ' - ' || p_supplier_name || CASE WHEN v_tds_rate > 0 THEN ' (TDS: ' || v_tds_rate || '%)' ELSE '' END, p_order_number, p_order_date, 'Purchase', p_supplier_name, p_created_by);

  IF v_tds_rate > 0 THEN
    INSERT INTO public.tds_records (purchase_order_id, pan_number, total_amount, tds_rate, tds_amount, net_payable_amount, deduction_date, financial_year)
    VALUES (v_purchase_order_id, p_pan_number, p_total_amount, v_tds_rate, v_tds_amount, v_net_payable_amount, p_order_date, v_financial_year);
  END IF;

  INSERT INTO public.stock_transactions (product_id, transaction_type, quantity, unit_price, total_amount, reference_number, supplier_customer_name, transaction_date, reason, created_by)
  VALUES (p_product_id, 'IN', v_net_credit_quantity, p_unit_price, v_net_credit_quantity * p_unit_price, p_order_number, p_supplier_name, p_order_date, 'Manual Purchase - ' || p_supplier_name, p_created_by);

  IF p_credit_wallet_id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (wallet_id, transaction_type, amount, description, reference_id, reference_type, asset_code, balance_before, balance_after, created_by)
    VALUES (p_credit_wallet_id, 'CREDIT', v_net_credit_quantity, 'Manual Purchase - ' || p_order_number || ' (' || p_supplier_name || ')', v_purchase_order_id, 'PURCHASE_ORDER', v_product_code, 0, 0, p_created_by);

    IF v_fee_amount > 0 THEN
      INSERT INTO public.wallet_transactions (wallet_id, transaction_type, amount, description, reference_id, reference_type, asset_code, balance_before, balance_after, created_by)
      VALUES (p_credit_wallet_id, 'FEE', v_fee_amount, 'Platform fee for purchase ' || p_order_number, v_purchase_order_id, 'PURCHASE_ORDER', v_product_code, 0, 0, p_created_by);
    END IF;

    IF v_product_code = 'USDT' AND v_market_rate > 0 AND v_net_credit_quantity > 0 THEN
      SELECT * INTO v_pos FROM public.wallet_asset_positions WHERE wallet_id = p_credit_wallet_id AND asset_code = v_product_code FOR UPDATE;
      IF v_pos IS NULL THEN
        INSERT INTO public.wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt) VALUES (p_credit_wallet_id, v_product_code, v_net_credit_quantity, v_net_credit_quantity * v_market_rate, v_market_rate);
      ELSE
        v_new_qty := GREATEST(v_pos.qty_on_hand, 0) + v_net_credit_quantity;
        v_new_pool := GREATEST(v_pos.cost_pool_usdt, 0) + (v_net_credit_quantity * v_market_rate);
        UPDATE public.wallet_asset_positions SET qty_on_hand = v_new_qty, cost_pool_usdt = v_new_pool, avg_cost_usdt = CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END, updated_at = NOW() WHERE wallet_id = p_credit_wallet_id AND asset_code = v_product_code;
      END IF;
    END IF;

    -- Non-USDT: qty_on_hand is kept by sync_asset_position_on_balance_change and already includes
    -- this credit; add this purchase's cost at the USDT market rate the caller locked.
    IF v_product_code <> 'USDT' AND v_net_credit_quantity > 0 THEN
      IF COALESCE(p_market_rate_usdt, 0) <= 0 THEN
        RAISE NOTICE 'Purchase %: no USDT market rate for %, cost pool not updated', p_order_number, v_product_code;
      ELSE
        SELECT * INTO v_pos FROM public.wallet_asset_positions WHERE wallet_id = p_credit_wallet_id AND asset_code = v_product_code FOR UPDATE;
        IF FOUND AND v_pos.qty_on_hand > 0 THEN
          v_new_pool := GREATEST(v_pos.cost_pool_usdt, 0) + (v_net_credit_quantity * p_market_rate_usdt);
          UPDATE public.wallet_asset_positions SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_pool / v_pos.qty_on_hand, updated_at = NOW() WHERE id = v_pos.id;
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.purchase_order_payment_splits (purchase_order_id, bank_account_id, amount, created_by)
  VALUES (v_purchase_order_id, p_bank_account_id, v_net_payable_amount, p_created_by);

  RETURN jsonb_build_object('success', true, 'purchase_order_id', v_purchase_order_id, 'tds_amount', v_tds_amount, 'net_payable_amount', v_net_payable_amount, 'fee_amount', v_fee_amount, 'net_credit_quantity', v_net_credit_quantity);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_purchase_with_split_payments(
  p_order_number TEXT, p_supplier_name TEXT, p_order_date DATE, p_total_amount NUMERIC,
  p_product_id UUID, p_quantity NUMERIC, p_unit_price NUMERIC,
  p_description TEXT DEFAULT NULL, p_contact_number TEXT DEFAULT NULL,
  p_credit_wallet_id UUID DEFAULT NULL, p_tds_option TEXT DEFAULT 'none',
  p_pan_number TEXT DEFAULT NULL, p_fee_percentage NUMERIC DEFAULT 0,
  p_is_off_market BOOLEAN DEFAULT FALSE, p_created_by UUID DEFAULT NULL,
  p_payment_splits JSONB DEFAULT '[]'::jsonb, p_market_rate_usdt NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_purchase_order_id UUID; v_tds_rate NUMERIC := 0; v_tds_amount NUMERIC := 0;
  v_net_payable_amount NUMERIC; v_fee_amount NUMERIC := 0; v_net_credit_quantity NUMERIC;
  v_financial_year TEXT; v_client_id UUID; v_split JSONB; v_bank_id UUID;
  v_split_amount NUMERIC; v_bank_balance NUMERIC; v_total_splits NUMERIC := 0;
  v_bank_name TEXT; v_product_code TEXT; v_acct_type TEXT; v_market_rate NUMERIC;
  v_pos RECORD; v_new_qty NUMERIC; v_new_pool NUMERIC;
BEGIN
  SELECT code INTO v_product_code FROM public.products WHERE id = p_product_id;
  IF v_product_code IS NULL THEN v_product_code := 'USDT'; END IF;

  IF p_tds_option = '1%' THEN
    v_tds_rate := 1;
    IF p_pan_number IS NULL OR p_pan_number = '' THEN RAISE EXCEPTION 'PAN number is required for 1%% TDS'; END IF;
  ELSIF p_tds_option = '20%' THEN v_tds_rate := 20; END IF;

  v_tds_amount := p_total_amount * (v_tds_rate / 100);
  v_net_payable_amount := p_total_amount - v_tds_amount;

  IF NOT p_is_off_market AND p_fee_percentage IS NOT NULL AND p_fee_percentage > 0 THEN
    v_fee_amount := p_quantity * (p_fee_percentage / 100);
  END IF;
  v_net_credit_quantity := p_quantity - v_fee_amount;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
    v_total_splits := v_total_splits + (v_split->>'amount')::NUMERIC;
  END LOOP;
  IF ABS(v_total_splits - v_net_payable_amount) > 0.01 THEN
    RAISE EXCEPTION 'Split payment total (%) does not match net payable (%)', v_total_splits, v_net_payable_amount;
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
    v_bank_id := (v_split->>'bank_account_id')::UUID;
    v_split_amount := (v_split->>'amount')::NUMERIC;
    SELECT ba.balance, ba.account_name, ba.account_type INTO v_bank_balance, v_bank_name, v_acct_type FROM public.bank_accounts ba WHERE ba.id = v_bank_id AND ba.status = 'ACTIVE';
    IF v_bank_balance IS NULL THEN RAISE EXCEPTION 'Bank account not found or inactive'; END IF;
    IF COALESCE(v_acct_type, '') <> 'CREDIT' AND v_bank_balance < v_split_amount THEN
      RAISE EXCEPTION 'Insufficient balance in %. Available: %, Required: %', v_bank_name, v_bank_balance, v_split_amount;
    END IF;
  END LOOP;

  SELECT CASE WHEN EXTRACT(MONTH FROM p_order_date) >= 4 THEN EXTRACT(YEAR FROM p_order_date)::TEXT || '-' || (EXTRACT(YEAR FROM p_order_date) + 1)::TEXT ELSE (EXTRACT(YEAR FROM p_order_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM p_order_date)::TEXT END INTO v_financial_year;

  IF p_pan_number IS NOT NULL AND p_pan_number != '' THEN
    SELECT id INTO v_client_id FROM public.clients WHERE LOWER(name) = LOWER(p_supplier_name) OR (p_contact_number IS NOT NULL AND phone = p_contact_number) LIMIT 1;
    IF v_client_id IS NOT NULL THEN
      UPDATE public.clients SET pan_card_number = p_pan_number, updated_at = NOW() WHERE id = v_client_id AND (pan_card_number IS NULL OR pan_card_number = '');
    END IF;
  END IF;

  v_market_rate := CASE WHEN p_quantity > 0 THEN p_unit_price ELSE 0 END;

  -- market_rate_usdt: the USDT rate the caller locked (p_market_rate_usdt); without one, the unit price as before.
  INSERT INTO public.purchase_orders (order_number, supplier_name, order_date, description, total_amount, contact_number, status, total_paid, bank_account_id, tds_applied, pan_number, tds_amount, net_payable_amount, quantity, price_per_unit, is_off_market, fee_percentage, fee_amount, net_amount, wallet_id, created_by, market_rate_usdt)
  VALUES (p_order_number, p_supplier_name, p_order_date, p_description, p_total_amount, p_contact_number, 'COMPLETED', v_net_payable_amount, NULL, v_tds_rate > 0, CASE WHEN v_tds_rate > 0 THEN p_pan_number ELSE NULL END, v_tds_amount, v_net_payable_amount, p_quantity, p_unit_price, p_is_off_market, COALESCE(p_fee_percentage, 0), v_fee_amount, v_net_credit_quantity, p_credit_wallet_id, p_created_by, CASE WHEN COALESCE(p_market_rate_usdt, 0) > 0 THEN p_market_rate_usdt ELSE v_market_rate END)
  RETURNING id INTO v_purchase_order_id;

  INSERT INTO public.purchase_order_items (purchase_order_id, product_id, quantity, unit_price, total_price, warehouse_id)
  VALUES (v_purchase_order_id, p_product_id, p_quantity, p_unit_price, p_total_amount, p_credit_wallet_id);

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
    v_bank_id := (v_split->>'bank_account_id')::UUID;
    v_split_amount := (v_split->>'amount')::NUMERIC;
    SELECT ba.account_name INTO v_bank_name FROM public.bank_accounts ba WHERE ba.id = v_bank_id;
    INSERT INTO public.bank_transactions (bank_account_id, transaction_type, amount, description, reference_number, transaction_date, category, related_account_name, created_by)
    VALUES (v_bank_id, 'EXPENSE', v_split_amount, 'Manual Purchase - ' || p_order_number || ' - ' || p_supplier_name || CASE WHEN v_tds_rate > 0 THEN ' (TDS: ' || v_tds_rate || '%)' ELSE '' END || ' [Split Payment]', p_order_number, p_order_date, 'Purchase', p_supplier_name, p_created_by);
    INSERT INTO public.purchase_order_payment_splits (purchase_order_id, bank_account_id, amount, created_by)
    VALUES (v_purchase_order_id, v_bank_id, v_split_amount, p_created_by);
  END LOOP;

  IF v_tds_rate > 0 THEN
    INSERT INTO public.tds_records (purchase_order_id, pan_number, total_amount, tds_rate, tds_amount, net_payable_amount, deduction_date, financial_year)
    VALUES (v_purchase_order_id, p_pan_number, p_total_amount, v_tds_rate, v_tds_amount, v_net_payable_amount, p_order_date, v_financial_year);
  END IF;

  INSERT INTO public.stock_transactions (product_id, transaction_type, quantity, unit_price, total_amount, reference_number, supplier_customer_name, transaction_date, reason, created_by)
  VALUES (p_product_id, 'IN', v_net_credit_quantity, p_unit_price, v_net_credit_quantity * p_unit_price, p_order_number, p_supplier_name, p_order_date, 'Manual Purchase [Split Payment] - ' || p_supplier_name, p_created_by);

  IF p_credit_wallet_id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (wallet_id, transaction_type, amount, description, reference_id, reference_type, asset_code, balance_before, balance_after, created_by)
    VALUES (p_credit_wallet_id, 'CREDIT', v_net_credit_quantity, 'Manual Purchase credit - ' || p_order_number || ' - ' || p_supplier_name || CASE WHEN v_fee_amount > 0 THEN ' (Fee: ' || ROUND(v_fee_amount, 4) || ')' ELSE '' END || ' [Split Payment]', v_purchase_order_id, 'PURCHASE_ORDER', v_product_code, 0, 0, p_created_by);
    IF v_fee_amount > 0 THEN
      INSERT INTO public.wallet_transactions (wallet_id, transaction_type, amount, description, reference_id, reference_type, asset_code, balance_before, balance_after, created_by)
      VALUES (p_credit_wallet_id, 'FEE', v_fee_amount, 'Platform fee for purchase ' || p_order_number, v_purchase_order_id, 'PURCHASE_ORDER', v_product_code, 0, 0, p_created_by);
    END IF;
    IF v_product_code = 'USDT' AND v_market_rate > 0 AND v_net_credit_quantity > 0 THEN
      SELECT * INTO v_pos FROM public.wallet_asset_positions WHERE wallet_id = p_credit_wallet_id AND asset_code = v_product_code FOR UPDATE;
      IF v_pos IS NULL THEN
        INSERT INTO public.wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt) VALUES (p_credit_wallet_id, v_product_code, v_net_credit_quantity, v_net_credit_quantity * v_market_rate, v_market_rate);
      ELSE
        v_new_qty := GREATEST(v_pos.qty_on_hand, 0) + v_net_credit_quantity;
        v_new_pool := GREATEST(v_pos.cost_pool_usdt, 0) + (v_net_credit_quantity * v_market_rate);
        UPDATE public.wallet_asset_positions SET qty_on_hand = v_new_qty, cost_pool_usdt = v_new_pool, avg_cost_usdt = CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END, updated_at = NOW() WHERE wallet_id = p_credit_wallet_id AND asset_code = v_product_code;
      END IF;
    END IF;
    -- Non-USDT: qty_on_hand is kept by sync_asset_position_on_balance_change and already includes
    -- this credit; add this purchase's cost at the USDT market rate the caller locked.
    IF v_product_code <> 'USDT' AND v_net_credit_quantity > 0 THEN
      IF COALESCE(p_market_rate_usdt, 0) <= 0 THEN
        RAISE NOTICE 'Purchase %: no USDT market rate for %, cost pool not updated', p_order_number, v_product_code;
      ELSE
        SELECT * INTO v_pos FROM public.wallet_asset_positions WHERE wallet_id = p_credit_wallet_id AND asset_code = v_product_code FOR UPDATE;
        IF FOUND AND v_pos.qty_on_hand > 0 THEN
          v_new_pool := GREATEST(v_pos.cost_pool_usdt, 0) + (v_net_credit_quantity * p_market_rate_usdt);
          UPDATE public.wallet_asset_positions SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_pool / v_pos.qty_on_hand, updated_at = NOW() WHERE id = v_pos.id;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'purchase_order_id', v_purchase_order_id, 'message', 'Manual purchase entry with split payments completed successfully', 'tds_amount', v_tds_amount, 'net_payable_amount', v_net_payable_amount, 'fee_amount', v_fee_amount, 'net_credit_quantity', v_net_credit_quantity, 'asset_code', v_product_code, 'client_pan_updated', v_client_id IS NOT NULL, 'payment_splits_count', jsonb_array_length(p_payment_splits));
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- --------------------------------------------------------------------------------------------
-- 3. Permission wrappers (called by the browser): same check, + p_market_rate_usdt passed through
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_v2_rpc(
  p_order_number TEXT, p_supplier_name TEXT, p_order_date DATE, p_total_amount NUMERIC,
  p_product_id UUID, p_quantity NUMERIC, p_unit_price NUMERIC,
  p_description TEXT DEFAULT NULL, p_contact_number TEXT DEFAULT NULL,
  p_bank_account_id UUID DEFAULT NULL, p_credit_wallet_id UUID DEFAULT NULL,
  p_tds_option TEXT DEFAULT 'none', p_pan_number TEXT DEFAULT NULL,
  p_fee_percentage NUMERIC DEFAULT 0, p_is_off_market BOOLEAN DEFAULT FALSE,
  p_created_by UUID DEFAULT NULL, p_market_rate_usdt NUMERIC DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_result JSONB;
BEGIN
  PERFORM public.require_permission(auth.uid(), 'purchase_manage', 'create_purchase_order');
  SELECT public.create_manual_purchase_complete_v2(p_order_number := p_order_number, p_supplier_name := p_supplier_name, p_order_date := p_order_date, p_total_amount := p_total_amount, p_product_id := p_product_id, p_quantity := p_quantity, p_unit_price := p_unit_price, p_description := p_description, p_contact_number := p_contact_number, p_bank_account_id := p_bank_account_id, p_credit_wallet_id := p_credit_wallet_id, p_tds_option := p_tds_option, p_pan_number := p_pan_number, p_fee_percentage := p_fee_percentage, p_is_off_market := p_is_off_market, p_created_by := p_created_by, p_market_rate_usdt := p_market_rate_usdt) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_rpc(
  p_order_number TEXT, p_supplier_name TEXT, p_order_date DATE, p_total_amount NUMERIC,
  p_product_id UUID, p_quantity NUMERIC, p_unit_price NUMERIC,
  p_description TEXT DEFAULT NULL, p_contact_number TEXT DEFAULT NULL,
  p_bank_account_id UUID DEFAULT NULL, p_credit_wallet_id UUID DEFAULT NULL,
  p_tds_option TEXT DEFAULT 'none', p_pan_number TEXT DEFAULT NULL,
  p_fee_percentage NUMERIC DEFAULT 0, p_is_off_market BOOLEAN DEFAULT FALSE,
  p_created_by UUID DEFAULT NULL, p_market_rate_usdt NUMERIC DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_result JSONB;
BEGIN
  PERFORM public.require_permission(auth.uid(), 'purchase_manage', 'create_purchase_order');
  SELECT public.create_manual_purchase_complete_v2(p_order_number := p_order_number, p_supplier_name := p_supplier_name, p_order_date := p_order_date, p_total_amount := p_total_amount, p_product_id := p_product_id, p_quantity := p_quantity, p_unit_price := p_unit_price, p_description := p_description, p_contact_number := p_contact_number, p_bank_account_id := p_bank_account_id, p_credit_wallet_id := p_credit_wallet_id, p_tds_option := p_tds_option, p_pan_number := p_pan_number, p_fee_percentage := p_fee_percentage, p_is_off_market := p_is_off_market, p_created_by := p_created_by, p_market_rate_usdt := p_market_rate_usdt) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_purchase_with_split_payments_rpc(
  p_order_number TEXT, p_supplier_name TEXT, p_order_date DATE, p_total_amount NUMERIC,
  p_product_id UUID, p_quantity NUMERIC, p_unit_price NUMERIC,
  p_description TEXT DEFAULT NULL, p_contact_number TEXT DEFAULT NULL,
  p_credit_wallet_id UUID DEFAULT NULL, p_tds_option TEXT DEFAULT 'none',
  p_pan_number TEXT DEFAULT NULL, p_fee_percentage NUMERIC DEFAULT 0,
  p_is_off_market BOOLEAN DEFAULT FALSE, p_created_by UUID DEFAULT NULL,
  p_payment_splits JSONB DEFAULT '[]'::jsonb, p_market_rate_usdt NUMERIC DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_result JSONB;
BEGIN
  PERFORM public.require_permission(auth.uid(), 'purchase_manage', 'create_purchase_order');
  SELECT public.create_manual_purchase_with_split_payments(p_order_number := p_order_number, p_supplier_name := p_supplier_name, p_order_date := p_order_date, p_total_amount := p_total_amount, p_product_id := p_product_id, p_quantity := p_quantity, p_unit_price := p_unit_price, p_description := p_description, p_contact_number := p_contact_number, p_credit_wallet_id := p_credit_wallet_id, p_tds_option := p_tds_option, p_pan_number := p_pan_number, p_fee_percentage := p_fee_percentage, p_is_off_market := p_is_off_market, p_created_by := p_created_by, p_payment_splits := p_payment_splits, p_market_rate_usdt := p_market_rate_usdt) INTO v_result;
  RETURN v_result;
END;
$$;

-- Grants exactly as today: base functions for service_role only; wrappers for authenticated and
-- service_role (never PUBLIC or anon). The owner keeps EXECUTE.
REVOKE ALL ON FUNCTION public.create_manual_purchase_complete_v2(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, text, text, numeric, boolean, uuid, numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_purchase_complete_v2(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, text, text, numeric, boolean, uuid, numeric) TO service_role;
REVOKE ALL ON FUNCTION public.create_manual_purchase_with_split_payments(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, text, text, numeric, boolean, uuid, jsonb, numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_purchase_with_split_payments(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, text, text, numeric, boolean, uuid, jsonb, numeric) TO service_role;
REVOKE ALL ON FUNCTION public.create_manual_purchase_complete_v2_rpc(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, text, text, numeric, boolean, uuid, numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_purchase_complete_v2_rpc(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, text, text, numeric, boolean, uuid, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_manual_purchase_complete_rpc(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, text, text, numeric, boolean, uuid, numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_purchase_complete_rpc(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, text, text, numeric, boolean, uuid, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_manual_purchase_with_split_payments_rpc(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, text, text, numeric, boolean, uuid, jsonb, numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_purchase_with_split_payments_rpc(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, text, text, numeric, boolean, uuid, jsonb, numeric) TO authenticated, service_role;

-- --------------------------------------------------------------------------------------------
-- 4. approve_product_conversion: asserted text replacements on the live definition, one per change
--    (a, b, c are independent rows; c can be dropped on its own). A change already applied is
--    skipped; if the live text differs from the expected text the migration fails (rolls back).
-- --------------------------------------------------------------------------------------------
DO $m$
DECLARE
  d text;
  d0 text;
  r record;
BEGIN
  d := pg_get_functiondef('public.approve_product_conversion(uuid,uuid)'::regprocedure);
  d0 := d;
  FOR r IN SELECT * FROM (VALUES
    -- a. empty position (balance <= 0): no leftover pool is carried into the conversion
    ('a', $a_old$    SELECT * INTO v_pos FROM wallet_asset_positions WHERE id = v_pos.id;
  END IF;

  IF v_conv.side = 'BUY' THEN$a_old$,
          $a_new$    SELECT * INTO v_pos FROM wallet_asset_positions WHERE id = v_pos.id;
  END IF;

  -- An empty position has no cost basis (the cost-pool trigger clears it when the quantity rises from
  -- zero), so a leftover pool must not be written back below.
  IF v_conv.asset_code <> 'USDT' AND COALESCE((SELECT b.balance FROM wallet_asset_balances b
       WHERE b.wallet_id = v_conv.wallet_id AND b.asset_code = v_conv.asset_code), 0) <= 0 THEN
    v_pos.qty_on_hand := 0; v_pos.cost_pool_usdt := 0; v_pos.avg_cost_usdt := 0;
  END IF;

  IF v_conv.side = 'BUY' THEN$a_new$),
    -- b. cross-pair BUY: the cost-pool trigger already took the paying coin out of its pool
    ('b', $b_old$    -- Cross pair: the paying coin leaves its cost pool at its own average cost.
    IF v_quote <> 'USDT' THEN
      SELECT * INTO v_qpos FROM wallet_asset_positions WHERE wallet_id = v_conv.wallet_id AND asset_code = v_quote FOR UPDATE;
      IF FOUND THEN
        v_new_qty := v_qpos.qty_on_hand - v_gross_quote;
        v_new_pool := CASE WHEN v_new_qty > 0 THEN GREATEST(v_qpos.cost_pool_usdt - v_gross_quote * GREATEST(v_qpos.avg_cost_usdt, 0), 0) ELSE 0 END;
        UPDATE wallet_asset_positions SET cost_pool_usdt = v_new_pool,
          avg_cost_usdt = CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END, updated_at = now() WHERE id = v_qpos.id;
      END IF;
    END IF;
$b_old$,
          $b_new$    -- Cross pair: the paying coin leaves its cost pool at its own average cost. The cost-pool
    -- trigger on wallet_transactions does this when the DEBIT above is posted (pool scaled, average kept).
$b_new$),
    -- c. cross-pair SELL: qty_on_hand already includes the CREDIT above (was counted twice)
    ('c', $c_old$      v_new_qty := v_qpos.qty_on_hand + v_gross_quote;$c_old$,
          $c_new$      v_new_qty := v_qpos.qty_on_hand;  -- already includes the CREDIT above$c_new$)
  ) AS v(k, old_text, new_text) LOOP
    IF position(r.new_text IN d) > 0 THEN
      RAISE NOTICE 'approve_product_conversion: SP-F6 change % already applied', r.k;
    ELSIF (length(d) - length(replace(d, r.old_text, ''))) / length(r.old_text) = 1 THEN
      d := replace(d, r.old_text, r.new_text);
    ELSE
      RAISE EXCEPTION 'approve_product_conversion differs from the expected definition (SP-F6 change %); nothing applied', r.k;
    END IF;
  END LOOP;
  IF d <> d0 THEN
    EXECUTE d;
  END IF;
END
$m$;
-- (CREATE OR REPLACE through pg_get_functiondef keeps the existing grants: postgres, authenticated,
--  service_role.)

-- --------------------------------------------------------------------------------------------
-- 5. The cost-pool trigger. Created last because CREATE TRIGGER blocks writes to wallet_transactions until
--    COMMIT; created only when missing, so a second run takes no lock on the table.
-- --------------------------------------------------------------------------------------------
DO $t$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'wallet_tx_cost_pool_trigger'
                 AND tgrelid = 'public.wallet_transactions'::regclass) THEN
    CREATE TRIGGER wallet_tx_cost_pool_trigger
      AFTER INSERT ON public.wallet_transactions
      FOR EACH ROW EXECUTE FUNCTION public.apply_wallet_movement_to_cost_pool();
  END IF;
END
$t$;

-- Make PostgREST see the new function and signatures at once.
NOTIFY pgrst, 'reload schema';

COMMIT;
