
CREATE OR REPLACE FUNCTION public.approve_product_conversion(p_conversion_id uuid, p_approved_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conv RECORD; v_pos RECORD;
  v_qty_net NUMERIC; v_gross_usdt NUMERIC; v_exec_rate NUMERIC;
  v_new_qty NUMERIC; v_new_pool NUMERIC; v_new_avg NUMERIC;
  v_actual_balance NUMERIC; v_original_qty NUMERIC; v_adjusted BOOLEAN := false;
  v_dust_swept BOOLEAN := false; v_dust_amount NUMERIC := 0;
  v_remaining_balance NUMERIC; v_dust_threshold NUMERIC;
  v_original_gross_usdt NUMERIC; v_cost_out NUMERIC;
  v_anchor_order_id TEXT; v_anchor_spot RECORD;
  v_actual_qty NUMERIC; v_actual_usdt NUMERIC;
  v_actual_fee_usdt NUMERIC := 0;
  v_actual_fee_bnb  NUMERIC := 0;
  v_actual_fee_other_asset TEXT;
  v_actual_fee_other NUMERIC := 0;
  v_variance NUMERIC := 0;
  v_override_user TEXT;
  v_reconciled BOOLEAN := false;
  v_scale NUMERIC;
BEGIN
  PERFORM public.require_permission(p_approved_by, 'stock_manage', 'approve_product_conversion');
  PERFORM public.require_permission(p_approved_by, 'stock_conversion_approve', 'approve_product_conversion');

  SELECT * INTO v_conv FROM erp_product_conversions WHERE id = p_conversion_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Conversion not found.'); END IF;
  IF v_conv.status <> 'PENDING_APPROVAL' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not pending approval. Status: ' || v_conv.status);
  END IF;

  BEGIN
    INSERT INTO reversal_guards (entity_type, entity_id, action)
    VALUES ('erp_conversion', p_conversion_id, 'approve');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed (idempotency guard).');
  END;

  IF v_conv.spot_trade_id IS NOT NULL THEN
    SELECT binance_order_id INTO v_anchor_order_id
    FROM spot_trade_history WHERE id = v_conv.spot_trade_id;

    IF v_anchor_order_id IS NOT NULL THEN
      WITH order_fills AS (
        SELECT * FROM spot_trade_history
        WHERE binance_order_id = v_anchor_order_id
      ),
      has_synced AS (
        SELECT EXISTS (
          SELECT 1 FROM order_fills
          WHERE binance_trade_id IS NOT NULL
            AND binance_trade_id NOT LIKE 'pending_%'
        ) AS yes
      ),
      effective AS (
        SELECT f.* FROM order_fills f, has_synced h
        WHERE (h.yes IS TRUE AND f.binance_trade_id IS NOT NULL AND f.binance_trade_id NOT LIKE 'pending_%')
           OR (h.yes IS FALSE)
      )
      SELECT
        SUM(quantity)                                              AS qty_total,
        SUM(quote_quantity)                                        AS quote_total,
        SUM(commission) FILTER (WHERE commission_asset = 'USDT')  AS fee_usdt,
        SUM(commission) FILTER (WHERE commission_asset = 'BNB')   AS fee_bnb,
        (ARRAY_AGG(commission_asset) FILTER (
            WHERE commission_asset NOT IN ('USDT','BNB')
              AND commission IS NOT NULL AND commission > 0))[1]   AS fee_other_asset,
        SUM(commission) FILTER (
            WHERE commission_asset NOT IN ('USDT','BNB'))          AS fee_other
      INTO v_anchor_spot
      FROM effective;

      IF v_anchor_spot.quote_total IS NOT NULL THEN
        v_actual_qty             := v_anchor_spot.qty_total;
        v_actual_usdt            := v_anchor_spot.quote_total;
        v_actual_fee_usdt        := COALESCE(v_anchor_spot.fee_usdt, 0);
        v_actual_fee_bnb         := COALESCE(v_anchor_spot.fee_bnb, 0);
        v_actual_fee_other_asset := v_anchor_spot.fee_other_asset;
        v_actual_fee_other       := COALESCE(v_anchor_spot.fee_other, 0);
        v_variance               := COALESCE(v_conv.gross_usd_value, 0) - v_actual_usdt;
        v_reconciled             := true;

        v_override_user := v_conv.metadata->>'variance_override_by';
        IF ABS(v_variance) > 1 AND v_override_user IS NULL THEN
          DELETE FROM reversal_guards
            WHERE entity_type='erp_conversion' AND entity_id=p_conversion_id AND action='approve';
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Variance too high vs Binance fill (aggregated). Expected '
                     || v_conv.gross_usd_value || ' USDT, actual ' || v_actual_usdt
                     || ' USDT (variance ' || round(v_variance::numeric, 4)
                     || '). Requires variance_override_by in metadata (Super Admin).',
            'expected_usdt', v_conv.gross_usd_value,
            'actual_usdt', v_actual_usdt,
            'variance_usdt', v_variance,
            'binance_order_id', v_anchor_order_id
          );
        END IF;
      END IF;
    END IF;
  END IF;

  v_exec_rate           := COALESCE(v_conv.execution_rate_usdt, v_conv.price_usd);
  v_gross_usdt          := COALESCE(v_actual_usdt, v_conv.gross_usd_value);
  v_original_gross_usdt := v_conv.gross_usd_value;

  IF v_conv.side = 'BUY' THEN
    IF v_conv.fee_asset = v_conv.asset_code AND COALESCE(v_conv.fee_amount, 0) > 0 THEN
      v_qty_net := COALESCE(v_actual_qty, v_conv.quantity) - COALESCE(v_conv.fee_amount, 0);
    ELSE
      v_qty_net := COALESCE(v_actual_qty, v_conv.quantity);
    END IF;
  ELSE
    v_qty_net := COALESCE(v_actual_qty, v_conv.quantity);
  END IF;

  v_original_qty := v_qty_net;
  v_dust_threshold := CASE
    WHEN v_conv.asset_code IN ('BTC') THEN 0.0001
    WHEN v_conv.asset_code IN ('ETH', 'BNB') THEN 0.001
    WHEN v_conv.asset_code IN ('SHIB', 'PEPE', 'DOGE') THEN 1000
    ELSE 0.01 END;

  INSERT INTO wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt)
  VALUES (v_conv.wallet_id, v_conv.asset_code, 0, 0, 0)
  ON CONFLICT (wallet_id, asset_code) DO NOTHING;

  SELECT * INTO v_pos FROM wallet_asset_positions
   WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code FOR UPDATE;

  IF v_pos.avg_cost_usdt < 0 OR v_pos.avg_cost_usdt > 999999 OR v_pos.cost_pool_usdt < -1 THEN
    UPDATE wallet_asset_positions
       SET avg_cost_usdt  = GREATEST(v_exec_rate, 0),
           cost_pool_usdt = GREATEST(v_pos.qty_on_hand * v_exec_rate, 0),
           updated_at     = now()
     WHERE id = v_pos.id;
    SELECT * INTO v_pos FROM wallet_asset_positions WHERE id = v_pos.id;
  END IF;

  IF v_conv.side = 'BUY' THEN
    INSERT INTO wallet_transactions
      (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'DEBIT', v_gross_usdt, 'ERP_CONVERSION', p_conversion_id,
            'Conversion BUY: spent USDT', p_approved_by);

    INSERT INTO wallet_transactions
      (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'CREDIT', COALESCE(v_actual_qty, v_conv.quantity),
            'ERP_CONVERSION', p_conversion_id,
            'Conversion BUY: received ' || v_conv.asset_code, p_approved_by);

    IF v_actual_fee_bnb > 0 THEN
      INSERT INTO wallet_transactions
        (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, 'BNB', 'DEBIT', v_actual_fee_bnb, 'ERP_CONVERSION', p_conversion_id,
              'Binance commission (BNB)', p_approved_by);
    END IF;
    IF v_actual_fee_other > 0 AND v_actual_fee_other_asset IS NOT NULL
       AND v_actual_fee_other_asset NOT IN (v_conv.asset_code, 'USDT') THEN
      INSERT INTO wallet_transactions
        (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_actual_fee_other_asset, 'DEBIT', v_actual_fee_other,
              'ERP_CONVERSION', p_conversion_id,
              'Binance commission (' || v_actual_fee_other_asset || ')', p_approved_by);
    END IF;
    IF NOT v_reconciled AND COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions
        (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount,
              'ERP_CONVERSION', p_conversion_id, 'Conversion BUY fee (operator-entered)', p_approved_by);
    END IF;

    v_new_qty  := v_pos.qty_on_hand + v_qty_net;
    v_new_pool := v_pos.cost_pool_usdt + v_gross_usdt;
    v_new_avg  := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;
    UPDATE wallet_asset_positions
       SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now()
     WHERE id = v_pos.id;

    UPDATE erp_product_conversions
       SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(),
           execution_rate_usdt   = v_exec_rate,
           quantity_gross        = v_conv.quantity,
           quantity_net          = v_qty_net,
           expected_usdt_value   = v_conv.gross_usd_value,
           actual_quantity_filled= v_actual_qty,
           actual_usdt_received  = v_actual_usdt,
           actual_fee_amount     = v_actual_fee_usdt + v_actual_fee_bnb + v_actual_fee_other,
           actual_fee_asset      = COALESCE(
             CASE WHEN v_actual_fee_bnb > 0 THEN 'BNB'
                  WHEN v_actual_fee_other > 0 THEN v_actual_fee_other_asset
                  WHEN v_actual_fee_usdt  > 0 THEN 'USDT'
                  ELSE NULL END,
             v_conv.fee_asset),
           rate_reconciled_at    = CASE WHEN v_reconciled THEN now() ELSE rate_reconciled_at END,
           rate_reconciled_by    = CASE WHEN v_reconciled THEN 'approve_rpc:agg(binance_order_id)' ELSE rate_reconciled_by END
     WHERE id = p_conversion_id;

  ELSIF v_conv.side = 'SELL' THEN
    SELECT COALESCE(SUM(
      CASE WHEN transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN amount
           WHEN transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -amount
           ELSE 0 END
    ), 0) INTO v_actual_balance
     FROM wallet_transactions
     WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code;

    IF COALESCE(v_actual_balance, 0) < v_qty_net THEN
      IF COALESCE(v_actual_balance, 0) >= v_qty_net * 0.98 AND COALESCE(v_actual_balance, 0) > 0 THEN
        v_qty_net := v_actual_balance; v_adjusted := true;
      ELSE
        DELETE FROM reversal_guards WHERE entity_type='erp_conversion' AND entity_id=p_conversion_id AND action='approve';
        RETURN jsonb_build_object('success', false,
          'error', 'Insufficient balance. Available (ledger): ' || COALESCE(v_actual_balance, 0)
                || ', Required: ' || v_qty_net);
      END IF;
    ELSIF COALESCE(v_actual_balance, 0) > v_qty_net
          AND (COALESCE(v_actual_balance, 0) - v_qty_net) <= v_dust_threshold THEN
      v_dust_amount := v_actual_balance - v_qty_net;
      v_qty_net := v_actual_balance; v_adjusted := true; v_dust_swept := true;
    END IF;

    IF v_actual_balance - v_qty_net < -0.000000001 THEN
      DELETE FROM reversal_guards WHERE entity_type='erp_conversion' AND entity_id=p_conversion_id AND action='approve';
      RETURN jsonb_build_object('success', false,
        'error', 'Safety check failed: negative balance. Available: ' || v_actual_balance || ', Selling: ' || v_qty_net);
    END IF;

    IF v_adjusted AND v_original_qty > 0 AND v_qty_net <> v_original_qty THEN
      v_scale      := v_qty_net / v_original_qty;
      v_gross_usdt := v_gross_usdt * v_scale;
    END IF;

    v_cost_out := v_qty_net * GREATEST(v_pos.avg_cost_usdt, 0);

    INSERT INTO wallet_transactions
      (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, v_conv.asset_code, 'DEBIT', v_qty_net, 'ERP_CONVERSION', p_conversion_id,
      CASE WHEN v_dust_swept THEN 'Conversion SELL: sold ' || v_conv.asset_code || ' (incl. dust ' || v_dust_amount || ')'
           WHEN v_adjusted   THEN 'Conversion SELL: sold ' || v_conv.asset_code || ' (capped from ' || v_original_qty || ')'
           ELSE 'Conversion SELL: sold ' || v_conv.asset_code END,
      p_approved_by);

    INSERT INTO wallet_transactions
      (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
    VALUES (v_conv.wallet_id, 'USDT', 'CREDIT', v_gross_usdt, 'ERP_CONVERSION', p_conversion_id,
            CASE WHEN v_reconciled THEN 'Conversion SELL: received USDT (reconciled vs Binance fill, agg by binance_order_id)'
                 ELSE 'Conversion SELL: received USDT (legacy: no spot_trade_id)' END,
            p_approved_by);

    IF v_actual_fee_bnb > 0 THEN
      INSERT INTO wallet_transactions
        (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, 'BNB', 'DEBIT', v_actual_fee_bnb, 'ERP_CONVERSION', p_conversion_id,
              'Binance commission (BNB)', p_approved_by);
    END IF;
    IF v_actual_fee_other > 0 AND v_actual_fee_other_asset IS NOT NULL
       AND v_actual_fee_other_asset NOT IN (v_conv.asset_code, 'USDT') THEN
      INSERT INTO wallet_transactions
        (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_actual_fee_other_asset, 'DEBIT', v_actual_fee_other,
              'ERP_CONVERSION', p_conversion_id,
              'Binance commission (' || v_actual_fee_other_asset || ')', p_approved_by);
    END IF;
    IF NOT v_reconciled AND COALESCE(v_conv.fee_amount, 0) > 0 THEN
      INSERT INTO wallet_transactions
        (wallet_id, asset_code, transaction_type, amount, reference_type, reference_id, description, created_by)
      VALUES (v_conv.wallet_id, v_conv.fee_asset, 'DEBIT', v_conv.fee_amount,
              'ERP_CONVERSION', p_conversion_id, 'Conversion SELL fee (operator-entered)', p_approved_by);
    END IF;

    v_new_qty := v_pos.qty_on_hand - v_qty_net;
    IF ABS(v_new_qty) < 0.000001 THEN v_new_qty := 0; END IF;
    v_new_pool := CASE WHEN v_new_qty > 0 THEN GREATEST(v_pos.cost_pool_usdt - v_cost_out, 0) ELSE 0 END;
    v_new_avg  := CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END;
    UPDATE wallet_asset_positions
       SET cost_pool_usdt = v_new_pool, avg_cost_usdt = v_new_avg, updated_at = now()
     WHERE id = v_pos.id;

    UPDATE erp_product_conversions
       SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(),
           execution_rate_usdt    = v_exec_rate,
           quantity_gross         = v_conv.quantity,
           quantity_net           = v_qty_net,
           cost_out_usdt          = NULL,
           realized_pnl_usdt      = NULL,
           expected_usdt_value    = v_conv.gross_usd_value,
           actual_quantity_filled = v_actual_qty,
           actual_usdt_received   = v_actual_usdt,
           actual_fee_amount      = v_actual_fee_usdt + v_actual_fee_bnb + v_actual_fee_other,
           actual_fee_asset       = COALESCE(
             CASE WHEN v_actual_fee_bnb > 0 THEN 'BNB'
                  WHEN v_actual_fee_other > 0 THEN v_actual_fee_other_asset
                  WHEN v_actual_fee_usdt  > 0 THEN 'USDT'
                  ELSE NULL END,
             v_conv.fee_asset),
           rate_reconciled_at     = CASE WHEN v_reconciled THEN now() ELSE rate_reconciled_at END,
           rate_reconciled_by     = CASE WHEN v_reconciled THEN 'approve_rpc:agg(binance_order_id)' ELSE rate_reconciled_by END
     WHERE id = p_conversion_id;
  END IF;

  INSERT INTO system_action_logs (user_id, action_type, entity_type, entity_id, module, metadata)
  VALUES (p_approved_by, 'stock.conversion_approved', 'erp_conversion', p_conversion_id, 'stock',
    jsonb_build_object(
      'reference_no', v_conv.reference_no, 'side', v_conv.side, 'asset_code', v_conv.asset_code,
      'qty_net', v_qty_net, 'exec_rate', v_exec_rate, 'auto_capped', v_adjusted,
      'dust_swept', v_dust_swept, 'dust_amount', v_dust_amount, 'original_qty', v_original_qty,
      'reconciled_with_binance', v_reconciled,
      'binance_order_id', v_anchor_order_id,
      'expected_usdt', v_conv.gross_usd_value,
      'actual_usdt', v_actual_usdt,
      'variance_usdt', v_variance,
      'gross_usdt_credited', v_gross_usdt));

  RETURN jsonb_build_object('success', true,
    'auto_capped', v_adjusted, 'dust_swept', v_dust_swept, 'dust_amount', v_dust_amount,
    'quantity_net', v_qty_net, 'original_qty', v_original_qty,
    'reconciled', v_reconciled,
    'binance_order_id', v_anchor_order_id,
    'expected_usdt', v_conv.gross_usd_value,
    'actual_usdt', v_actual_usdt,
    'variance_usdt', v_variance,
    'gross_usdt_credited', v_gross_usdt);
END;
$function$;
