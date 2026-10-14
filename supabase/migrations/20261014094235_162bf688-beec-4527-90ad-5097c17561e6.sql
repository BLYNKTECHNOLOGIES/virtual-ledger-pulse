
CREATE TABLE IF NOT EXISTS public.binance_symbol_map (
  symbol text PRIMARY KEY,
  base_asset text NOT NULL,
  quote_asset text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.binance_symbol_map TO authenticated;
GRANT ALL ON public.binance_symbol_map TO service_role;
ALTER TABLE public.binance_symbol_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read symbol map" ON public.binance_symbol_map FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.binance_quote_usdt_rates (
  asset text NOT NULL,
  minute_ms bigint NOT NULL,
  rate numeric NOT NULL,
  source_symbol text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset, minute_ms)
);
GRANT SELECT ON public.binance_quote_usdt_rates TO authenticated;
GRANT ALL ON public.binance_quote_usdt_rates TO service_role;
ALTER TABLE public.binance_quote_usdt_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read quote rates" ON public.binance_quote_usdt_rates FOR SELECT TO authenticated USING (true);

ALTER TABLE public.spot_trade_history ADD COLUMN IF NOT EXISTS base_asset text, ADD COLUMN IF NOT EXISTS quote_asset text;
ALTER TABLE public.erp_product_conversions
  ADD COLUMN IF NOT EXISTS quote_asset text NOT NULL DEFAULT 'USDT',
  ADD COLUMN IF NOT EXISTS quote_quantity numeric,
  ADD COLUMN IF NOT EXISTS quote_usdt_rate numeric;

-- Split a symbol into base/quote: Binance map first, else longest known quote suffix.
CREATE OR REPLACE FUNCTION public.fn_split_binance_symbol(p_symbol text, OUT base text, OUT quote text)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE q text;
BEGIN
  SELECT m.base_asset, m.quote_asset INTO base, quote FROM binance_symbol_map m WHERE m.symbol = p_symbol;
  IF base IS NOT NULL THEN RETURN; END IF;
  FOREACH q IN ARRAY ARRAY['FDUSD','USDT','USDC','TUSD','BUSD','BTC','ETH','BNB','TRY','EUR','BRL'] LOOP
    IF p_symbol LIKE '%' || q AND length(p_symbol) > length(q) THEN
      base := left(p_symbol, length(p_symbol) - length(q)); quote := q; RETURN;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fn_spot_trade_fill_assets()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s record;
BEGIN
  IF NEW.base_asset IS NULL OR NEW.quote_asset IS NULL THEN
    s := public.fn_split_binance_symbol(NEW.symbol);
    NEW.base_asset := COALESCE(NEW.base_asset, s.base);
    NEW.quote_asset := COALESCE(NEW.quote_asset, s.quote);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_spot_trade_fill_assets ON public.spot_trade_history;
CREATE TRIGGER trg_spot_trade_fill_assets BEFORE INSERT OR UPDATE OF symbol ON public.spot_trade_history
FOR EACH ROW EXECUTE FUNCTION public.fn_spot_trade_fill_assets();
UPDATE public.spot_trade_history SET base_asset = (public.fn_split_binance_symbol(symbol)).base,
  quote_asset = (public.fn_split_binance_symbol(symbol)).quote WHERE base_asset IS NULL;

CREATE OR REPLACE FUNCTION public.fn_quote_usdt_rate(p_asset text, p_trade_time bigint)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN p_asset = 'USDT' THEN 1::numeric ELSE
    (SELECT rate FROM binance_quote_usdt_rates WHERE asset = p_asset AND minute_ms = (p_trade_time / 60000) * 60000) END
$$;

-- Normalize cross-pair conversions created by any sync path (browser or cron).
CREATE OR REPLACE FUNCTION public.fn_conversion_cross_pair()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE t record; v_qq numeric; v_rate numeric; v_fee_asset text; v_fee numeric; v_gross numeric; v_tt bigint;
BEGIN
  IF NEW.spot_trade_id IS NULL THEN RETURN NEW; END IF;
  SELECT base_asset, quote_asset, commission_asset, trade_time INTO t FROM spot_trade_history WHERE id = NEW.spot_trade_id;
  IF t.quote_asset IS NULL OR t.quote_asset = 'USDT' THEN RETURN NEW; END IF;
  v_tt := COALESCE((NEW.metadata->>'trade_time')::bigint, t.trade_time);
  v_qq := NEW.gross_usd_value;  -- sync paths pass the summed quote quantity here
  v_rate := public.fn_quote_usdt_rate(t.quote_asset, v_tt);
  v_fee := COALESCE(NEW.fee_amount, 0);
  v_fee_asset := COALESCE(t.commission_asset, CASE WHEN NEW.side = 'BUY' THEN t.base_asset ELSE t.quote_asset END);
  v_gross := COALESCE(v_qq * v_rate, 0);
  NEW.asset_code := t.base_asset;
  NEW.quote_asset := t.quote_asset;
  NEW.quote_quantity := v_qq;
  NEW.quote_usdt_rate := v_rate;
  NEW.gross_usd_value := v_gross;
  NEW.price_usd := CASE WHEN NEW.quantity > 0 THEN v_gross / NEW.quantity ELSE 0 END;
  NEW.execution_rate_usdt := NEW.price_usd;
  NEW.fee_asset := v_fee_asset;
  NEW.fee_percentage := CASE WHEN v_fee_asset = t.base_asset AND NEW.quantity > 0 THEN v_fee / NEW.quantity * 100
                             WHEN v_fee_asset = t.quote_asset AND v_qq > 0 THEN v_fee / v_qq * 100 ELSE 0 END;
  NEW.net_asset_change := CASE WHEN NEW.side = 'BUY' AND v_fee_asset = t.base_asset THEN NEW.quantity - v_fee ELSE NEW.quantity END;
  NEW.net_usdt_change := COALESCE(CASE WHEN NEW.side = 'SELL' AND v_fee_asset = t.quote_asset THEN (v_qq - v_fee) ELSE v_qq END * v_rate, 0);
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('quote_asset', t.quote_asset, 'quote_quantity', v_qq,
                    'quote_usdt_rate', v_rate, 'valuation_missing', v_rate IS NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_conversion_cross_pair ON public.erp_product_conversions;
CREATE TRIGGER trg_conversion_cross_pair BEFORE INSERT ON public.erp_product_conversions
FOR EACH ROW EXECUTE FUNCTION public.fn_conversion_cross_pair();

-- Per-symbol exact cursor for the trade fetch.
CREATE OR REPLACE FUNCTION public.spot_trade_cursors(p_account uuid)
RETURNS TABLE(symbol text, max_trade_id bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT symbol, max(binance_trade_id::bigint) FROM spot_trade_history
  WHERE exchange_account_id = p_account AND binance_trade_id ~ '^[0-9]+$' GROUP BY symbol
$$;
REVOKE EXECUTE ON FUNCTION public.spot_trade_cursors(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spot_trade_cursors(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.approve_product_conversion(p_conversion_id uuid, p_approved_by uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_conv RECORD; v_pos RECORD; v_qpos RECORD;
  v_qty_net NUMERIC; v_gross_usdt NUMERIC; v_exec_rate NUMERIC;
  v_new_qty NUMERIC; v_new_pool NUMERIC; v_new_avg NUMERIC;
  v_actual_balance NUMERIC; v_original_qty NUMERIC; v_adjusted BOOLEAN := false;
  v_dust_swept BOOLEAN := false; v_dust_amount NUMERIC := 0;
  v_dust_threshold NUMERIC;
  v_cost_out NUMERIC;
  v_anchor_order_id TEXT; v_anchor_spot RECORD;
  v_actual_qty NUMERIC; v_actual_usdt NUMERIC; v_actual_quote NUMERIC;
  v_actual_fee_usdt NUMERIC := 0; v_actual_fee_bnb NUMERIC := 0;
  v_actual_fee_other_asset TEXT; v_actual_fee_other NUMERIC := 0;
  v_variance NUMERIC := 0; v_override_user TEXT; v_reconciled BOOLEAN := false;
  v_scale NUMERIC; v_same_asset_fee NUMERIC := 0; v_required NUMERIC;
  v_quote TEXT; v_rate NUMERIC; v_gross_quote NUMERIC;
BEGIN
  PERFORM public.require_permission(p_approved_by, 'stock_manage', 'approve_product_conversion');
  PERFORM public.require_permission(p_approved_by, 'stock_conversion_approve', 'approve_product_conversion');

  SELECT * INTO v_conv FROM erp_product_conversions WHERE id = p_conversion_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Conversion not found.'); END IF;
  IF v_conv.status <> 'PENDING_APPROVAL' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not pending approval. Status: ' || v_conv.status);
  END IF;

  v_quote := COALESCE(v_conv.quote_asset, 'USDT');
  IF v_quote = 'USDT' THEN v_rate := 1;
  ELSE
    v_rate := COALESCE(v_conv.quote_usdt_rate, public.fn_quote_usdt_rate(v_quote, (v_conv.metadata->>'trade_time')::bigint));
    IF v_rate IS NULL OR v_rate <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'No Binance USDT rate for ' || v_quote || ' at the trade time. Run Sync again; approval stays blocked until Binance returns a rate.');
    END IF;
  END IF;

  BEGIN
    INSERT INTO reversal_guards (entity_type, entity_id, action) VALUES ('erp_conversion', p_conversion_id, 'approve');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed (idempotency guard).');
  END;

  IF v_conv.spot_trade_id IS NOT NULL THEN
    SELECT binance_order_id INTO v_anchor_order_id FROM spot_trade_history WHERE id = v_conv.spot_trade_id;
    IF v_anchor_order_id IS NOT NULL THEN
      WITH order_fills AS (SELECT * FROM spot_trade_history WHERE binance_order_id = v_anchor_order_id),
      has_synced AS (SELECT EXISTS (SELECT 1 FROM order_fills WHERE binance_trade_id IS NOT NULL AND binance_trade_id NOT LIKE 'pending_%') AS yes),
      effective AS (
        SELECT f.* FROM order_fills f, has_synced h
        WHERE (h.yes IS TRUE AND f.binance_trade_id IS NOT NULL AND f.binance_trade_id NOT LIKE 'pending_%') OR (h.yes IS FALSE))
      SELECT SUM(quantity) AS qty_total, SUM(quote_quantity) AS quote_total,
        SUM(commission) FILTER (WHERE commission_asset = 'USDT') AS fee_usdt,
        SUM(commission) FILTER (WHERE commission_asset = 'BNB') AS fee_bnb,
        (ARRAY_AGG(commission_asset) FILTER (WHERE commission_asset NOT IN ('USDT','BNB') AND commission IS NOT NULL AND commission > 0))[1] AS fee_other_asset,
        SUM(commission) FILTER (WHERE commission_asset NOT IN ('USDT','BNB')) AS fee_other
      INTO v_anchor_spot FROM effective;

      IF v_anchor_spot.quote_total IS NOT NULL THEN
        v_actual_qty := v_anchor_spot.qty_total;
        v_actual_quote := v_anchor_spot.quote_total;
        v_actual_usdt := v_anchor_spot.quote_total * v_rate;
        v_actual_fee_usdt := COALESCE(v_anchor_spot.fee_usdt, 0);
        v_actual_fee_bnb := COALESCE(v_anchor_spot.fee_bnb, 0);
        v_actual_fee_other_asset := v_anchor_spot.fee_other_asset;
        v_actual_fee_other := COALESCE(v_anchor_spot.fee_other, 0);
        v_variance := COALESCE(v_conv.gross_usd_value, 0) - v_actual_usdt;
        v_reconciled := true;
        v_override_user := v_conv.metadata->>'variance_override_by';
        IF ABS(v_variance) > 1 AND v_override_user IS NULL THEN
          DELETE FROM reversal_guards WHERE entity_type='erp_conversion' AND entity_id=p_conversion_id AND action='approve';
          RETURN jsonb_build_object('success', false,
            'error', 'Variance too high vs Binance fill (aggregated). Expected ' || v_conv.gross_usd_value || ' USDT, actual ' || v_actual_usdt
                     || ' USDT (variance ' || round(v_variance::numeric, 4) || '). Requires variance_override_by in metadata (Super Admin).',
            'expected_usdt', v_conv.gross_usd_value, 'actual_usdt', v_actual_usdt, 'variance_usdt', v_variance, 'binance_order_id', v_anchor_order_id);
        END IF;
      END IF;
    END IF;
  END IF;

  v_exec_rate := COALESCE(v_conv.execution_rate_usdt, v_conv.price_usd);
  v_gross_usdt := COALESCE(v_actual_usdt, v_conv.gross_usd_value);
  v_gross_quote := COALESCE(v_actual_quote, v_conv.quote_quantity, v_conv.gross_usd_value / v_rate);

  IF v_conv.side = 'BUY' AND v_conv.fee_asset = v_conv.asset_code AND COALESCE(v_conv.fee_amount, 0) > 0 THEN
    v_qty_net := COALESCE(v_actual_qty, v_conv.quantity) - COALESCE(v_conv.fee_amount, 0);
  ELSE
    v_qty_net := COALESCE(v_actual_qty, v_conv.quantity);
  END IF;

  v_original_qty := v_qty_net;
  v_dust_threshold := CASE WHEN v_conv.asset_code IN ('BTC') THEN 0.0001 WHEN v_conv.asset_code IN ('ETH', 'BNB') THEN 0.001
    WHEN v_conv.asset_code IN ('SHIB', 'PEPE', 'DOGE') THEN 1000 ELSE 0.01 END;

  INSERT INTO wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt)
  VALUES (v_conv.wallet_id, v_conv.asset_code, 0, 0, 0) ON CONFLICT (wallet_id, asset_code) DO NOTHING;
  SELECT * INTO v_pos FROM wallet_asset_positions WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code FOR UPDATE;

  IF v_pos.avg_cost_usdt < 0 OR v_pos.avg_cost_usdt > 999999 OR v_pos.cost_pool_usdt < -1 THEN
    UPDATE wallet_asset_positions SET avg_cost_usdt = GREATEST(v_exec_rate, 0), cost_pool_usdt = GREATEST(v_pos.qty_on_hand * v_exec_rate, 0), updated_at = now()
     WHERE id = v_pos.id;
    SELECT * INTO v_pos FROM wallet_asset_positions WHERE id = v_pos.id;
  END IF;

  IF v_conv.side = 'BUY' THEN
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_quote, 'DEBIT', v_gross_quote, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY: spent ' || v_quote, p_approved_by);
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'CREDIT', COALESCE(v_actual_qty, v_conv.quantity), 'ERP_CONVERSION', p_conversion_id,
            'Conversion BUY: received ' || v_conv.asset_code, p_approved_by);
    IF v_actual_fee_bnb > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, 'BNB', 'DEBIT', v_actual_fee_bnb, 'ERP_CONVERSION', p_conversion_id, 'Binance commission (BNB)', p_approved_by);
    END IF;
    IF v_actual_fee_other > 0 AND v_actual_fee_other_asset IS NOT NULL AND v_actual_fee_other_asset NOT IN (v_conv.asset_code, 'USDT') THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_actual_fee_other_asset, 'DEBIT', v_actual_fee_other, 'ERP_CONVERSION', p_conversion_id,
              'Binance commission (' || v_actual_fee_other_asset || ')', p_approved_by);
    END IF;
    IF NOT v_reconciled AND COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion BUY fee (operator-entered)', p_approved_by);
    END IF;

    v_new_qty := v_pos.qty_on_hand + v_qty_net;
    v_new_pool := v_pos.cost_pool_usdt + v_gross_usdt;
    v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;
    UPDATE wallet_asset_positions SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now() WHERE id = v_pos.id;

    -- Cross pair: the paying coin leaves its cost pool at its own average cost.
    IF v_quote <> 'USDT' THEN
      SELECT * INTO v_qpos FROM wallet_asset_positions WHERE wallet_id = v_conv.wallet_id AND asset_code = v_quote FOR UPDATE;
      IF FOUND THEN
        v_new_qty := v_qpos.qty_on_hand - v_gross_quote;
        v_new_pool := CASE WHEN v_new_qty > 0 THEN GREATEST(v_qpos.cost_pool_usdt - v_gross_quote * GREATEST(v_qpos.avg_cost_usdt, 0), 0) ELSE 0 END;
        UPDATE wallet_asset_positions SET cost_pool_usdt = v_new_pool,
          avg_cost_usdt = CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END, updated_at = now() WHERE id = v_qpos.id;
      END IF;
    END IF;

    UPDATE erp_product_conversions
       SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(), execution_rate_usdt = v_exec_rate,
           quantity_gross = v_conv.quantity, quantity_net = v_qty_net, expected_usdt_value = v_conv.gross_usd_value,
           actual_quantity_filled = v_actual_qty, actual_usdt_received = v_actual_usdt, quote_usdt_rate = v_rate,
           actual_fee_amount = v_actual_fee_usdt + v_actual_fee_bnb + v_actual_fee_other,
           actual_fee_asset = COALESCE(CASE WHEN v_actual_fee_bnb > 0 THEN 'BNB' WHEN v_actual_fee_other > 0 THEN v_actual_fee_other_asset
                  WHEN v_actual_fee_usdt > 0 THEN 'USDT' ELSE NULL END, v_conv.fee_asset),
           rate_reconciled_at = CASE WHEN v_reconciled THEN now() ELSE rate_reconciled_at END,
           rate_reconciled_by = CASE WHEN v_reconciled THEN 'approve_rpc:agg(binance_order_id)' ELSE rate_reconciled_by END
     WHERE id = p_conversion_id;

  ELSIF v_conv.side = 'SELL' THEN
    v_same_asset_fee := 0;
    IF v_conv.asset_code = 'BNB' THEN v_same_asset_fee := v_same_asset_fee + COALESCE(v_actual_fee_bnb, 0); END IF;
    IF NOT v_reconciled AND COALESCE(v_conv.fee_amount, 0) > 0 AND v_conv.fee_asset = v_conv.asset_code THEN
      v_same_asset_fee := v_same_asset_fee + v_conv.fee_amount;
    END IF;

    SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount
           WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -amount ELSE 0 END), 0) INTO v_actual_balance
     FROM wallet_transactions WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code;

    v_required := v_qty_net + v_same_asset_fee;
    IF COALESCE(v_actual_balance, 0) < v_required THEN
      IF COALESCE(v_actual_balance, 0) >= v_required * 0.98 AND COALESCE(v_actual_balance, 0) > v_same_asset_fee THEN
        v_qty_net := v_actual_balance - v_same_asset_fee; v_adjusted := true;
      ELSE
        DELETE FROM reversal_guards WHERE entity_type='erp_conversion' AND entity_id=p_conversion_id AND action='approve';
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance. Available (ledger): ' || COALESCE(v_actual_balance, 0)
                || ', Required (incl. same-asset fee): ' || v_required);
      END IF;
    ELSIF COALESCE(v_actual_balance, 0) > v_required AND (COALESCE(v_actual_balance, 0) - v_required) <= v_dust_threshold THEN
      v_dust_amount := v_actual_balance - v_required;
      v_qty_net := v_actual_balance - v_same_asset_fee; v_adjusted := true; v_dust_swept := true;
    END IF;

    IF v_actual_balance - v_qty_net - v_same_asset_fee < -0.000000001 THEN
      DELETE FROM reversal_guards WHERE entity_type='erp_conversion' AND entity_id=p_conversion_id AND action='approve';
      RETURN jsonb_build_object('success', false, 'error', 'Safety check failed: negative balance. Available: ' || v_actual_balance
              || ', Selling: ' || v_qty_net || ', Same-asset fee: ' || v_same_asset_fee);
    END IF;

    IF v_adjusted AND v_original_qty > 0 AND v_qty_net <> v_original_qty THEN
      v_scale := v_qty_net / v_original_qty;
      v_gross_usdt := v_gross_usdt * v_scale;
      v_gross_quote := v_gross_quote * v_scale;
    END IF;

    v_cost_out := v_qty_net * GREATEST(v_pos.avg_cost_usdt, 0);

    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'DEBIT', v_qty_net, 'ERP_CONVERSION', p_conversion_id,
      CASE WHEN v_dust_swept THEN 'Conversion SELL: sold ' || v_conv.asset_code || ' (incl. dust ' || v_dust_amount || ')'
           WHEN v_adjusted THEN 'Conversion SELL: sold ' || v_conv.asset_code || ' (capped from ' || v_original_qty || ')'
           ELSE 'Conversion SELL: sold ' || v_conv.asset_code END, p_approved_by);
    INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_quote, 'CREDIT', v_gross_quote, 'ERP_CONVERSION', p_conversion_id,
            CASE WHEN v_reconciled THEN 'Conversion SELL: received ' || v_quote || ' (reconciled vs Binance fill, agg by binance_order_id)'
                 ELSE 'Conversion SELL: received ' || v_quote || ' (legacy: no spot_trade_id)' END, p_approved_by);
    IF v_actual_fee_bnb > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, 'BNB', 'DEBIT', v_actual_fee_bnb, 'ERP_CONVERSION', p_conversion_id, 'Binance commission (BNB)', p_approved_by);
    END IF;
    IF v_actual_fee_other > 0 AND v_actual_fee_other_asset IS NOT NULL AND v_actual_fee_other_asset NOT IN (v_conv.asset_code, 'USDT') THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_actual_fee_other_asset, 'DEBIT', v_actual_fee_other, 'ERP_CONVERSION', p_conversion_id,
              'Binance commission (' || v_actual_fee_other_asset || ')', p_approved_by);
    END IF;
    IF NOT v_reconciled AND COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount, 'ERP_CONVERSION', p_conversion_id, 'Conversion SELL fee (operator-entered)', p_approved_by);
    END IF;

    v_new_qty := v_pos.qty_on_hand - v_qty_net;
    IF ABS(v_new_qty) < 0.000001 THEN v_new_qty := 0; END IF;
    v_new_pool := CASE WHEN v_new_qty > 0 THEN GREATEST(v_pos.cost_pool_usdt - v_cost_out, 0) ELSE 0 END;
    v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;
    UPDATE wallet_asset_positions SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now() WHERE id = v_pos.id;

    -- Cross pair: the received coin enters its cost pool at the trade-time USDT value.
    IF v_quote <> 'USDT' THEN
      INSERT INTO wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt)
      VALUES (v_conv.wallet_id, v_quote, 0, 0, 0) ON CONFLICT (wallet_id, asset_code) DO NOTHING;
      SELECT * INTO v_qpos FROM wallet_asset_positions WHERE wallet_id = v_conv.wallet_id AND asset_code = v_quote FOR UPDATE;
      v_new_qty := v_qpos.qty_on_hand + v_gross_quote;
      v_new_pool := GREATEST(v_qpos.cost_pool_usdt, 0) + v_gross_usdt;
      UPDATE wallet_asset_positions SET cost_pool_usdt = v_new_pool,
        avg_cost_usdt = CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END, updated_at = now() WHERE id = v_qpos.id;
    END IF;

    UPDATE erp_product_conversions
       SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(), execution_rate_usdt = v_exec_rate,
           quantity_gross = v_conv.quantity, quantity_net = v_qty_net, cost_out_usdt = NULL, realized_pnl_usdt = NULL,
           expected_usdt_value = v_conv.gross_usd_value, actual_quantity_filled = v_actual_qty, actual_usdt_received = v_actual_usdt,
           quote_usdt_rate = v_rate,
           actual_fee_amount = v_actual_fee_usdt + v_actual_fee_bnb + v_actual_fee_other,
           actual_fee_asset = COALESCE(CASE WHEN v_actual_fee_bnb > 0 THEN 'BNB' WHEN v_actual_fee_other > 0 THEN v_actual_fee_other_asset
                  WHEN v_actual_fee_usdt > 0 THEN 'USDT' ELSE NULL END, v_conv.fee_asset),
           rate_reconciled_at = CASE WHEN v_reconciled THEN now() ELSE rate_reconciled_at END,
           rate_reconciled_by = CASE WHEN v_reconciled THEN 'approve_rpc:agg(binance_order_id)' ELSE rate_reconciled_by END
     WHERE id = p_conversion_id;
  END IF;

  INSERT INTO system_action_logs (user_id, action_type, entity_type, entity_id, module, metadata)
  VALUES (p_approved_by, 'stock.conversion_approved', 'erp_conversion', p_conversion_id, 'stock',
    jsonb_build_object('reference_no', v_conv.reference_no, 'side', v_conv.side, 'asset_code', v_conv.asset_code,
      'quote_asset', v_quote, 'quote_amount', v_gross_quote, 'quote_usdt_rate', v_rate,
      'qty_net', v_qty_net, 'exec_rate', v_exec_rate, 'auto_capped', v_adjusted, 'dust_swept', v_dust_swept, 'dust_amount', v_dust_amount,
      'original_qty', v_original_qty, 'same_asset_fee', v_same_asset_fee, 'reconciled_with_binance', v_reconciled,
      'binance_order_id', v_anchor_order_id, 'expected_usdt', v_conv.gross_usd_value, 'actual_usdt', v_actual_usdt,
      'variance_usdt', v_variance, 'gross_usdt_credited', v_gross_usdt));

  RETURN jsonb_build_object('success', true, 'auto_capped', v_adjusted, 'dust_swept', v_dust_swept, 'dust_amount', v_dust_amount,
    'quantity_net', v_qty_net, 'original_qty', v_original_qty, 'same_asset_fee', v_same_asset_fee, 'reconciled', v_reconciled,
    'binance_order_id', v_anchor_order_id, 'expected_usdt', v_conv.gross_usd_value, 'actual_usdt', v_actual_usdt,
    'variance_usdt', v_variance, 'gross_usdt_credited', v_gross_usdt, 'quote_asset', v_quote, 'quote_amount', v_gross_quote);
END;
$function$;
